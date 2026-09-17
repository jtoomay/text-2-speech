export type Chunk = {
  text: string
  /** Silence to insert after this chunk's audio. */
  pauseAfterMs: number
}

/**
 * Kokoro truncates input beyond 510 phoneme tokens. English phonemes run about
 * one per character, so 250 characters leaves room for numbers and
 * abbreviations that expand when spoken.
 */
export const MAX_CHUNK_CHARS = 250

const SENTENCE_PAUSE_MS = 100
export const LINE_PAUSE_MS = 250
export const PARAGRAPH_PAUSE_MS = 500

// A segment ending in one of these is not really the end of a sentence.
const ABBREVIATION_END =
  /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|No|Nos|vs|v|Hon|Rev|Gen|Sgt|Lt|Capt|Det|Inc|Co|Corp|Ltd|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|U\.S|e\.g|i\.e|[A-Z])\.$/

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

export function chunkText(text: string): Chunk[] {
  const chunks: Chunk[] = []
  for (const paragraph of text.split(/\r?\n\s*\n/)) {
    const paragraphStart = chunks.length
    for (const line of paragraph.split(/\r?\n/)) {
      const lineStart = chunks.length
      const normalized = line.replace(/\s+/g, ' ').trim()
      for (const piece of packPieces(splitSentences(normalized).flatMap(splitLong))) {
        chunks.push({ text: piece, pauseAfterMs: SENTENCE_PAUSE_MS })
      }
      if (chunks.length > lineStart) chunks[chunks.length - 1].pauseAfterMs = LINE_PAUSE_MS
    }
    if (chunks.length > paragraphStart) chunks[chunks.length - 1].pauseAfterMs = PARAGRAPH_PAUSE_MS
  }
  return chunks
}

function splitSentences(text: string): string[] {
  const sentences: string[] = []
  for (const { segment } of segmenter.segment(text)) {
    const sentence = segment.trim()
    if (!sentence) continue
    const last = sentences.length - 1
    if (last >= 0 && ABBREVIATION_END.test(sentences[last])) {
      sentences[last] += ` ${sentence}`
    } else {
      sentences.push(sentence)
    }
  }
  return sentences
}

/** Splits a sentence that is too long at clause boundaries, then at spaces. */
function splitLong(sentence: string): string[] {
  if (sentence.length <= MAX_CHUNK_CHARS) return [sentence]
  const clauses = sentence.split(/(?<=[,;:—])\s+/)
  const words = clauses.flatMap((clause) =>
    clause.length <= MAX_CHUNK_CHARS ? [clause] : clause.split(' ').flatMap(splitWord),
  )
  return packPieces(words)
}

function splitWord(word: string): string[] {
  const parts: string[] = []
  for (let i = 0; i < word.length; i += MAX_CHUNK_CHARS) {
    parts.push(word.slice(i, i + MAX_CHUNK_CHARS))
  }
  return parts
}

/** Joins consecutive pieces while they fit within the chunk limit. */
function packPieces(pieces: string[]): string[] {
  const packed: string[] = []
  let current = ''
  for (const piece of pieces) {
    if (!piece) continue
    if (!current) {
      current = piece
    } else if (current.length + 1 + piece.length <= MAX_CHUNK_CHARS) {
      current += ` ${piece}`
    } else {
      packed.push(current)
      current = piece
    }
  }
  if (current) packed.push(current)
  return packed
}
