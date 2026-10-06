import { describe, expect, it } from 'vitest'
import { timeStretch } from './timeStretch'

const SAMPLE_RATE = 24000

function sine(hz: number, seconds: number): Int16Array {
  const pcm = new Int16Array(Math.round(SAMPLE_RATE * seconds))
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(0x7fff * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE))
  return pcm
}

/** Zero crossings per second, which for a tone is twice its frequency. */
function crossingsPerSecond(samples: ArrayLike<number>, length = samples.length): number {
  let crossings = 0
  for (let i = 1; i < length; i++) {
    if (samples[i - 1] < 0 !== samples[i] < 0) crossings++
  }
  return crossings / (length / SAMPLE_RATE)
}

describe('timeStretch', () => {
  it('converts to floats without changing length at 1x', () => {
    const pcm = Int16Array.from([0, 0x4000, -0x4000, -0x8000])
    expect([...timeStretch(pcm, 1)]).toEqual([0, 0.5, -0.5, -1])
  })

  it.each([0.75, 1, 1.25, 1.5, 1.75, 2])('shortens a 2s tone by %sx', (rate) => {
    const pcm = sine(220, 2)
    expect(timeStretch(pcm, rate).length).toBe(Math.floor(pcm.length / rate))
  })

  // The point of WSOLA over playbackRate: this is the assertion that would fail
  // if anyone swapped it back out for resampling.
  it.each([0.75, 1.25, 1.5, 1.75, 2])('keeps a 220Hz tone at 220Hz at %sx', (rate) => {
    const pcm = sine(220, 2)
    const stretched = timeStretch(pcm, rate)
    // Ignore the last frame, where the window tapers with nothing under it.
    const measured = crossingsPerSecond(stretched, stretched.length - 1024)
    expect(measured).toBeCloseTo(crossingsPerSecond(pcm), -1)
    expect(measured / 440).toBeGreaterThan(0.97)
    expect(measured / 440).toBeLessThan(1.03)
  })

  it.each([0.75, 1.5, 2])('stays finite and unclipped at %sx', (rate) => {
    for (const sample of timeStretch(sine(180, 1.5), rate)) {
      expect(Number.isFinite(sample)).toBe(true)
      expect(Math.abs(sample)).toBeLessThanOrEqual(1)
    }
  })

  it('still retimes input too short to window', () => {
    const pcm = sine(220, 0.05)
    expect(timeStretch(pcm, 2).length).toBe(Math.floor(pcm.length / 2))
  })

  it('handles empty input', () => {
    expect(timeStretch(new Int16Array(0), 1.5).length).toBe(0)
  })
})
