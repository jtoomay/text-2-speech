import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamingPlayer } from './StreamingPlayer'

const SAMPLE_RATE = 24000
/** Lead time StreamingPlayer leaves before starting a source. */
const START_DELAY = 0.05

/**
 * The slice of AudioContext StreamingPlayer actually touches, with a clock we
 * advance by hand so the timeline math can be checked exactly.
 */
class FakeContext {
  currentTime = 0
  destination = {}
  resume() {}
  suspend() {}
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length)
    return { length, sampleRate, duration: length / sampleRate, getChannelData: () => data }
  }
  createBufferSource() {
    return { buffer: null, onended: null, connect() {}, disconnect() {}, start() {}, stop() {} }
  }
}

let ctx: FakeContext

/** Lets the player's UI timer fire, which is what refreshes the snapshot. */
function tick() {
  vi.advanceTimersByTime(250)
}

function playerWithSections(count: number): StreamingPlayer {
  const player = new StreamingPlayer()
  // One second of silence per section, so timeline positions read as seconds.
  for (let i = 0; i < count; i++) player.append(new Int16Array(SAMPLE_RATE), SAMPLE_RATE, `Sentence ${i}.`)
  return player
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        ctx = new FakeContext()
        return ctx as unknown as AudioContext
      }
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('timeline', () => {
  it.each([0.75, 1, 1.5, 2])('advances the position at %sx', (rate) => {
    const player = playerWithSections(3)
    player.setRate(rate)
    player.play()

    // Wall-clock seconds since the first source began.
    for (const elapsed of [0.1, 0.25, 0.4]) {
      ctx.currentTime = START_DELAY + elapsed
      expect(player.getPosition()).toBeCloseTo(elapsed * rate, 5)
    }
  })

  it.each([0.75, 1, 1.5, 2])('reports the section being spoken at %sx', (rate) => {
    const player = playerWithSections(3)
    player.setRate(rate)
    player.play()

    // Each section is 1s of audio, so it ends after 1/rate seconds of wall clock.
    ctx.currentTime = START_DELAY + 0.5 / rate
    tick()
    expect(player.getSnapshot().sectionIndex).toBe(0)
    expect(player.getSnapshot().sectionText).toBe('Sentence 0.')

    ctx.currentTime = START_DELAY + 1.5 / rate
    tick()
    expect(player.getSnapshot().sectionIndex).toBe(1)
    expect(player.getSnapshot().sectionText).toBe('Sentence 1.')
  })

  it('keeps the duration in the audio’s own seconds, not wall clock', () => {
    const player = playerWithSections(3)
    player.setRate(2)
    expect(player.getSnapshot().duration).toBe(3)
  })
})

describe('setRate', () => {
  it('does not move the position', () => {
    const player = playerWithSections(3)
    player.play()
    ctx.currentTime = START_DELAY + 0.5
    expect(player.getPosition()).toBeCloseTo(0.5, 5)

    player.setRate(1.5)
    expect(player.getPosition()).toBeCloseTo(0.5, 5)
    // And carries on from there at the new rate.
    ctx.currentTime += START_DELAY + 0.2
    expect(player.getPosition()).toBeCloseTo(0.5 + 0.2 * 1.5, 5)
  })

  it('resumes from the same place after a change while paused', () => {
    const player = playerWithSections(3)
    player.play()
    ctx.currentTime = START_DELAY + 0.5
    player.pause()
    player.setRate(0.75)
    expect(player.getPosition()).toBeCloseTo(0.5, 5)

    player.play()
    ctx.currentTime += START_DELAY + 0.4
    expect(player.getPosition()).toBeCloseTo(0.5 + 0.4 * 0.75, 5)
  })

  it('survives a change before anything has played', () => {
    const player = playerWithSections(3)
    expect(() => player.setRate(2)).not.toThrow()
    expect(player.getSnapshot().rate).toBe(2)
    expect(player.getPosition()).toBe(0)
  })

  it('notifies subscribers', () => {
    const player = playerWithSections(1)
    const listener = vi.fn()
    player.subscribe(listener)
    player.setRate(1.5)
    expect(listener).toHaveBeenCalled()
    expect(player.getSnapshot().rate).toBe(1.5)
  })

  it('ignores a change to the rate already set', () => {
    const player = playerWithSections(1)
    const listener = vi.fn()
    player.subscribe(listener)
    player.setRate(1)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('seeking at a non-default rate', () => {
  it('starts the new position where it was asked to', () => {
    const player = playerWithSections(3)
    player.setRate(1.5)
    player.play()
    player.seek(2.25)
    expect(player.getPosition()).toBeCloseTo(2.25, 5)

    ctx.currentTime += START_DELAY + 0.2
    expect(player.getPosition()).toBeCloseTo(2.25 + 0.2 * 1.5, 5)
  })

  it('restarts the current section after two seconds of audio, not of wall clock', () => {
    const player = playerWithSections(3)
    player.setRate(2)
    player.play()
    player.seek(1.5)
    // 1.5s into section 1 is under the 2s restart threshold, so this steps back.
    player.prevSection()
    expect(player.getPosition()).toBeCloseTo(0, 5)
  })
})
