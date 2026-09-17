type Section = {
  text: string
  pcm: Int16Array
  sampleRate: number
  /** Position of this section on the overall timeline, in seconds. */
  start: number
  duration: number
}

type Scheduled = {
  index: number
  source: AudioBufferSourceNode
  /** AudioContext time at which this source starts and ends. */
  startAt: number
  endAt: number
  /** Timeline position when the source starts playing. */
  positionAtStart: number
}

export type PlayerState = {
  /** True while the user wants audio playing (even if waiting for more). */
  playing: boolean
  /** True when playback has caught up with generation. */
  waiting: boolean
  position: number
  duration: number
  complete: boolean
  sectionIndex: number
  sectionCount: number
  sectionText: string
}

/** Seconds of lead time when starting a source, so it starts cleanly. */
const START_DELAY = 0.05
/** How many upcoming sections to keep queued in the AudioContext. */
const QUEUE_AHEAD = 2
const RESTART_SECTION_AFTER = 2

/**
 * Plays audio that is still being generated. Sections are appended as they
 * arrive and queued back to back on a Web Audio timeline. Scheduling is driven
 * by `onended` events rather than timers, so it keeps going in background tabs.
 */
export class StreamingPlayer {
  private ctx: AudioContext | null = null
  private sections: Section[] = []
  private duration = 0
  private complete = false

  private playing = false
  private scheduled: Scheduled[] = []
  private nextIndex = 0
  private nextStartAt = 0
  private firstOffset = 0
  /** Position to use when nothing is playing (paused, waiting, or ended). */
  private restPosition = 0

  private listeners = new Set<() => void>()
  private snapshot: PlayerState = this.buildState()
  private uiTimer: ReturnType<typeof setInterval> | undefined

  // --- Store interface for useSyncExternalStore

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  private emit() {
    this.snapshot = this.buildState()
    for (const listener of this.listeners) listener()
  }

  private buildState(): PlayerState {
    const index = this.currentIndex()
    return {
      playing: this.playing,
      waiting: this.playing && this.scheduled.length === 0 && this.nextIndex >= this.sections.length,
      position: this.getPosition(),
      duration: this.duration,
      complete: this.complete,
      sectionIndex: index,
      sectionCount: this.sections.length,
      sectionText: this.sections[index]?.text ?? '',
    }
  }

  // --- Feeding audio

  reset() {
    this.stopScheduled()
    this.sections = []
    this.duration = 0
    this.complete = false
    this.playing = false
    this.nextIndex = 0
    this.restPosition = 0
    this.stopUiTimer()
    this.emit()
  }

  append(pcm: Int16Array, sampleRate: number, text: string) {
    const duration = pcm.length / sampleRate
    this.sections.push({ text, pcm, sampleRate, start: this.duration, duration })
    this.duration += duration
    this.pump()
    this.emit()
  }

  markComplete() {
    this.complete = true
    this.pump()
    this.emit()
  }

  // --- Transport controls

  /** Call from a click handler: browsers only allow audio to start from a user gesture. */
  play() {
    this.ctx ??= new AudioContext()
    const ctx = this.ctx
    if (this.complete && this.restPosition >= this.duration) this.restPosition = 0
    this.playing = true
    void ctx.resume()
    if (this.scheduled.length === 0) this.startFrom(this.restPosition)
    this.startUiTimer()
    this.emit()
  }

  pause() {
    if (!this.playing) return
    this.restPosition = this.getPosition()
    this.playing = false
    // Suspending freezes the timeline, so queued sources resume seamlessly.
    void this.ctx?.suspend()
    this.stopUiTimer()
    this.emit()
  }

  seek(position: number) {
    const target = Math.max(0, Math.min(position, this.duration))
    this.stopScheduled()
    this.restPosition = target
    if (this.playing) this.startFrom(target)
    this.emit()
  }

  prevSection() {
    const index = this.currentIndex()
    const section = this.sections[index]
    if (!section) return
    const intoSection = this.getPosition() - section.start
    const target = intoSection > RESTART_SECTION_AFTER || index === 0 ? section : this.sections[index - 1]
    this.seek(target.start)
  }

  nextSection() {
    this.seekSection(this.currentIndex() + 1)
  }

  seekSection(index: number) {
    const section = this.sections[index]
    if (section) this.seek(section.start)
  }

  // --- Timeline

  getPosition(): number {
    if (!this.playing || !this.ctx) return this.restPosition
    const now = this.ctx.currentTime
    let position = this.restPosition
    for (const item of this.scheduled) {
      if (now < item.startAt) return item.positionAtStart
      if (now < item.endAt) return item.positionAtStart + (now - item.startAt)
      // Finished, but its `ended` event hasn't been delivered yet.
      position = item.positionAtStart + (item.endAt - item.startAt)
    }
    return position
  }

  private currentIndex(): number {
    if (this.sections.length === 0) return 0
    return this.sectionAt(Math.min(this.getPosition(), this.duration - 1e-6))
  }

  private sectionAt(position: number): number {
    // Binary search for the last section starting at or before `position`.
    let lo = 0
    let hi = this.sections.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.sections[mid].start <= position) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  private startFrom(position: number) {
    if (!this.ctx) return
    if (position >= this.duration) {
      // Nothing generated past this point yet; wait for the next section.
      this.nextIndex = this.sections.length
      this.firstOffset = 0
    } else {
      this.nextIndex = this.sectionAt(position)
      this.firstOffset = position - this.sections[this.nextIndex].start
    }
    this.nextStartAt = this.ctx.currentTime + START_DELAY
    this.pump()
  }

  /** Queues upcoming sections and detects the end of playback. */
  private pump() {
    const ctx = this.ctx
    if (!this.playing || !ctx) return

    while (this.nextIndex < this.sections.length && this.scheduled.length < QUEUE_AHEAD) {
      const startAt = Math.max(this.nextStartAt, ctx.currentTime + START_DELAY)
      this.schedule(this.nextIndex, startAt, this.firstOffset)
      this.firstOffset = 0
      this.nextIndex++
    }

    if (this.complete && this.scheduled.length === 0 && this.nextIndex >= this.sections.length) {
      this.playing = false
      this.restPosition = this.duration
      this.stopUiTimer()
      this.emit()
    }
  }

  private schedule(index: number, startAt: number, offset: number) {
    const ctx = this.ctx!
    const section = this.sections[index]
    const buffer = ctx.createBuffer(1, section.pcm.length, section.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < section.pcm.length; i++) channel[i] = section.pcm[i] / 0x8000

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(startAt, offset)

    const item: Scheduled = {
      index,
      source,
      startAt,
      endAt: startAt + section.duration - offset,
      positionAtStart: section.start + offset,
    }
    source.onended = () => {
      this.scheduled = this.scheduled.filter((s) => s !== item)
      this.restPosition = section.start + section.duration
      this.pump()
      this.emit()
    }
    this.scheduled.push(item)
    this.nextStartAt = item.endAt
  }

  private stopScheduled() {
    for (const { source } of this.scheduled) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    this.scheduled = []
  }

  private startUiTimer() {
    this.uiTimer ??= setInterval(() => this.emit(), 250)
  }

  private stopUiTimer() {
    clearInterval(this.uiTimer)
    this.uiTimer = undefined
  }
}
