import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadRate, PLAYBACK_RATES, saveRate, stepRate } from './rateSetting'

function stubStorage(stored?: string) {
  const store = new Map<string, string>()
  if (stored !== undefined) store.set('readback:rate', stored)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  })
  return store
}

afterEach(() => vi.unstubAllGlobals())

describe('loadRate', () => {
  it.each(PLAYBACK_RATES)('restores %sx', (rate) => {
    stubStorage(String(rate))
    expect(loadRate()).toBe(rate)
  })

  it.each([undefined, '', 'fast', 'NaN', '0', '-1', '1.1', '3', '999'])('falls back to 1x for %o', (stored) => {
    stubStorage(stored)
    expect(loadRate()).toBe(1)
  })

  it('falls back to 1x when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadRate()).toBe(1)
  })
})

describe('saveRate', () => {
  it('round-trips through storage', () => {
    stubStorage()
    saveRate(1.5)
    expect(loadRate()).toBe(1.5)
  })

  it('stays silent when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(() => saveRate(1.5)).not.toThrow()
  })
})

describe('stepRate', () => {
  it('walks the presets', () => {
    expect(stepRate(1, 1)).toBe(1.25)
    expect(stepRate(1, -1)).toBe(0.75)
    expect(stepRate(1.25, -1)).toBe(1)
  })

  it('stops at both ends', () => {
    expect(stepRate(0.75, -1)).toBe(0.75)
    expect(stepRate(2, 1)).toBe(2)
  })

  it('treats an unknown rate as 1x', () => {
    expect(stepRate(1.1, 1)).toBe(1.25)
  })
})
