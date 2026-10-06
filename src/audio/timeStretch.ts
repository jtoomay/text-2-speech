/**
 * Pitch-preserving time stretch for mono speech.
 *
 * Web Audio's only built-in rate control is `AudioBufferSourceNode.playbackRate`,
 * which resamples: it changes duration and pitch together, so voices go thin and
 * high when sped up. WSOLA instead overlap-adds the signal onto a new timeline at
 * its original sample rate. Every output frame is read from a position chosen to
 * match the waveform the previous frame was about to run into, so pitch periods
 * stay aligned across the splice and the voice keeps its pitch.
 */

/** ~43 ms at 24 kHz: long enough to span a pitch period, short enough to track speech. */
const FRAME = 1024
/** 50% overlap, where a periodic Hann window sums to exactly 1. */
const SYNTHESIS_HOP = FRAME / 2
/** Search radius for the best splice point, a little over one pitch period. */
const SEARCH = 128
/** Samples compared when scoring a splice point. */
const CORRELATION = 256
/** Below this frame energy there is no periodicity worth aligning to. */
const SILENCE = CORRELATION * 100 * 100

function hann(size: number): Float32Array {
  const window = new Float32Array(size)
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
  return window
}

const WINDOW = hann(FRAME)

/**
 * Picks where to read the next frame from: a position near `guess` whose opening
 * samples best match `pcm[reference..]`, the waveform that would have followed
 * the frame just written.
 */
function bestSplice(pcm: Int16Array, reference: number, guess: number, maxStart: number): number {
  const ideal = Math.max(0, Math.min(guess, maxStart))
  const from = Math.max(0, Math.min(guess - SEARCH, maxStart))
  const to = Math.max(0, Math.min(guess + SEARCH, maxStart))
  if (from >= to) return ideal

  const ref = Math.max(0, Math.min(reference, maxStart))
  let refEnergy = 0
  for (let i = 0; i < CORRELATION; i++) refEnergy += pcm[ref + i] * pcm[ref + i]
  // Speech is full of silence, and searching it just burns time.
  if (refEnergy < SILENCE) return ideal

  let best = ideal
  let bestScore = -Infinity
  for (let cand = from; cand <= to; cand++) {
    let dot = 0
    let energy = 0
    for (let i = 0; i < CORRELATION; i++) {
      const sample = pcm[cand + i]
      dot += pcm[ref + i] * sample
      energy += sample * sample
    }
    // Normalized, so a loud stretch of audio can't outscore a better-aligned quiet one.
    const score = dot / Math.sqrt(energy + 1)
    if (score > bestScore) {
      bestScore = score
      best = cand
    }
  }
  return best
}

/**
 * Rewrites `pcm` to play `rate` times faster without shifting pitch, returning
 * the [-1, 1] floats Web Audio wants. The output is `pcm.length / rate` samples
 * long and still plays at the original sample rate.
 */
export function timeStretch(pcm: Int16Array, rate: number): Float32Array {
  const out = new Float32Array(Math.max(0, Math.floor(pcm.length / rate)))
  if (out.length === 0) return out

  if (rate === 1) {
    for (let i = 0; i < out.length; i++) out[i] = pcm[i] / 0x8000
    return out
  }

  if (pcm.length < FRAME * 2) {
    // Under ~85 ms, which in practice means an inter-sentence pause. There is no
    // room for two windows, and a pitch shift this short is inaudible.
    const ratio = pcm.length / out.length
    for (let i = 0; i < out.length; i++) out[i] = pcm[Math.floor(i * ratio)] / 0x8000
    return out
  }

  const maxStart = pcm.length - FRAME
  const analysisHop = SYNTHESIS_HOP * rate
  let analysis = 0
  let ideal = 0

  for (let outPos = 0; outPos < out.length; outPos += SYNTHESIS_HOP) {
    const length = Math.min(FRAME, out.length - outPos)
    // True when no further frame will overlap this one's tail.
    const last = outPos + SYNTHESIS_HOP >= out.length
    for (let i = 0; i < length; i++) {
      const head = i < SYNTHESIS_HOP
      // The first frame has nothing fading in under it and the last nothing
      // fading out, so those halves go in at full amplitude. Everywhere else the
      // two overlapping windows sum to 1.
      const gain = (outPos === 0 && head) || (last && !head) ? 1 : WINDOW[i]
      out[outPos + i] += (pcm[analysis + i] / 0x8000) * gain
    }

    ideal += analysisHop
    analysis = bestSplice(pcm, analysis + SYNTHESIS_HOP, Math.round(ideal), maxStart)
  }

  return out
}
