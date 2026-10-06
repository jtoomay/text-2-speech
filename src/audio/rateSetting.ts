/** Playback speeds offered in the player, slowest first. */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const

export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

const STORAGE_KEY = 'readback:rate'

function isRate(value: number): value is PlaybackRate {
  return (PLAYBACK_RATES as readonly number[]).includes(value)
}

export function loadRate(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return isRate(stored) ? stored : 1
  } catch {
    return 1
  }
}

export function saveRate(rate: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(rate))
  } catch {
    // Unlike history, a lost speed preference isn't worth interrupting anyone over.
  }
}

/** Moves `rate` one preset up (`direction` 1) or down (-1). */
export function stepRate(rate: number, direction: number): PlaybackRate {
  const from = isRate(rate) ? PLAYBACK_RATES.indexOf(rate) : PLAYBACK_RATES.indexOf(1)
  return PLAYBACK_RATES[Math.max(0, Math.min(PLAYBACK_RATES.length - 1, from + direction))]
}
