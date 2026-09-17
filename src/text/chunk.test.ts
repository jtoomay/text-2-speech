import { describe, expect, it } from 'vitest'
import { MAX_CHUNK_CHARS, chunkText } from './chunk'

const stripSpace = (s: string) => s.replace(/\s+/g, '')

describe('chunkText', () => {
  it('returns nothing for blank input', () => {
    expect(chunkText('   \n\n  \n')).toEqual([])
  })

  it('keeps short text in one chunk with a paragraph pause', () => {
    expect(chunkText('Hello there. How are you?')).toEqual([
      { text: 'Hello there. How are you?', pauseAfterMs: 500 },
    ])
  })

  it('never exceeds the chunk limit and never drops text', () => {
    const sentence = 'The witness testified that she saw the defendant leave the building shortly after midnight. '
    const text = Array.from({ length: 12 }, (_, i) => `${sentence.repeat(i + 1)}\n\n`).join('')
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(10)
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
    expect(stripSpace(chunks.map((c) => c.text).join(''))).toBe(stripSpace(text))
  })

  it('splits a long run-on sentence without losing words', () => {
    const clauses = Array.from({ length: 40 }, (_, i) => `and then clause number ${i} happened`)
    const withCommas = clauses.join(', ') + '.'
    const withoutPunctuation = clauses.join(' ') + '.'
    for (const text of [withCommas, withoutPunctuation]) {
      const chunks = chunkText(text)
      expect(chunks.length).toBeGreaterThan(1)
      for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
      expect(stripSpace(chunks.map((c) => c.text).join(''))).toBe(stripSpace(text))
    }
  })

  it('splits a single enormous word', () => {
    const word = 'x'.repeat(600)
    const chunks = chunkText(word)
    expect(chunks.map((c) => c.text.length)).toEqual([250, 250, 100])
  })

  it('does not end a chunk on an abbreviation', () => {
    const filler = 'This sentence is filler text that takes up space in the chunk. '
    const text = `${filler.repeat(3)}The next witness was Mr. Smith, who lived nearby. ${filler.repeat(3)}`
    for (const chunk of chunkText(text)) {
      expect(chunk.text).not.toMatch(/\bMr\.$/)
    }
  })

  it('uses longer pauses at line and paragraph breaks', () => {
    const chunks = chunkText('First line.\nSecond line.\n\nNew paragraph.')
    expect(chunks).toEqual([
      { text: 'First line.', pauseAfterMs: 250 },
      { text: 'Second line.', pauseAfterMs: 500 },
      { text: 'New paragraph.', pauseAfterMs: 500 },
    ])
  })
})
