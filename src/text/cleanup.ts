export type Formatting = {
  /** Court-transcript style line numbers (1–25) down the left margin. */
  lineNumbers: boolean
  /** Speaker turns such as `Q.`, `A.`, `THE COURT:` at the start of lines. */
  speakerLabels: boolean
  /** Lines broken at a fixed width in the middle of sentences. */
  hardWrapped: boolean
}

const LINE_NUMBER = /^\s*(\d{1,2})(?:\s+|$)/
const PAGE_MARKER = /^\s*(?:(?:page\s+)?\d{1,4}(?:\s+of\s+\d{1,4})?|-\s*\d{1,4}\s*-)\s*$/i
const LIST_ITEM = /^\s*(?:\d+[.)]|[-*•])\s+/
const TERMINAL_PUNCTUATION = /[.!?:"”'’)\]]$/
const QA_TURN = /^(Q|A)\s*[.:]\s*/
const SPEAKER_LABEL = /^([A-Z][A-Z.'’ -]{0,40}[A-Z.]):(?:\s+|$)/
const ALL_CAPS_LINE = /^[^a-z]*[A-Z]{2}[^a-z]*$/

export function detectFormatting(text: string): Formatting {
  const lines = text.split(/\r?\n/)
  const nonBlank = lines.filter((line) => line.trim())
  return {
    lineNumbers: hasLineNumbers(nonBlank),
    speakerLabels: hasSpeakerLabels(nonBlank),
    hardWrapped: isHardWrapped(lines, nonBlank.length),
  }
}

export function needsCleanup(f: Formatting): boolean {
  return f.lineNumbers || f.speakerLabels || f.hardWrapped
}

function hasLineNumbers(nonBlank: string[]): boolean {
  if (nonBlank.length < 5) return false
  const numbers: number[] = []
  for (const line of nonBlank) {
    const match = line.match(LINE_NUMBER)
    if (match && Number(match[1]) <= 30) numbers.push(Number(match[1]))
  }
  if (numbers.length < nonBlank.length * 0.5) return false

  let sequential = 0
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === numbers[i - 1] + 1 || numbers[i] === 1) sequential++
  }
  return sequential >= (numbers.length - 1) * 0.7
}

function hasSpeakerLabels(nonBlank: string[]): boolean {
  let turns = 0
  for (const line of nonBlank) {
    const content = line.replace(LINE_NUMBER, '').trim()
    if (QA_TURN.test(content) || isSpeakerLabel(content)) turns++
  }
  return turns >= 3 && turns >= nonBlank.length * 0.1
}

function isHardWrapped(lines: string[], nonBlankCount: number): boolean {
  if (nonBlankCount < 6) return false
  let candidates = 0
  let unterminated = 0
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim()
    const next = lines[i + 1]
    // Only lines that run straight into another line of prose can be wrapped.
    if (!line || !next.trim() || LIST_ITEM.test(next)) continue
    candidates++
    if (!TERMINAL_PUNCTUATION.test(line)) unterminated++
  }
  return candidates > 0 && unterminated / candidates >= 0.5
}

function isSpeakerLabel(content: string): boolean {
  const match = content.match(SPEAKER_LABEL)
  return match !== null && /[A-Z]{2}/.test(match[1])
}

function titleCase(words: string): string {
  return words
    .split(' ')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Rewrites a speaker turn at the start of a transcript line so it reads well
 * aloud, or returns null if the line doesn't start a new turn.
 */
function rewriteTurn(content: string): string | null {
  const qa = content.match(QA_TURN)
  if (qa) {
    return `${qa[1] === 'Q' ? 'Question' : 'Answer'}: ${content.slice(qa[0].length)}`.trim()
  }
  if (isSpeakerLabel(content)) {
    const label = content.match(SPEAKER_LABEL)!
    return `${titleCase(label[1])}: ${content.slice(label[0].length)}`.trim()
  }
  return null
}

/**
 * Turns pasted text into the text that should be spoken. Only the fixes for
 * the formatting that was detected are applied, so plain prose passes through.
 */
export function cleanText(text: string, f: Formatting): string {
  if (!needsCleanup(f)) return text
  const transcript = f.lineNumbers || f.speakerLabels
  // Some transcripts are typed entirely in capitals; then no line is a heading.
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0
  const upper = text.match(/[A-Z]/g)?.length ?? 0
  const detectHeadings = transcript && upper < letters * 0.7

  const paragraphs: string[] = []
  let current = ''
  const flush = () => {
    if (current) paragraphs.push(current.replace(/\s+/g, ' ').trim())
    current = ''
  }

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine
    if (f.lineNumbers) {
      if (PAGE_MARKER.test(line)) continue
      line = line.replace(LINE_NUMBER, '')
      // An empty numbered line is transcript layout, not a paragraph break.
      if (!line.trim()) continue
    }
    const content = line.trim()

    if (!content) {
      // In transcripts, blank lines are page layout; speaker turns mark paragraphs.
      if (!transcript) flush()
      continue
    }

    if (transcript) {
      const turn = rewriteTurn(content)
      if (turn !== null) {
        flush()
        current = turn
        continue
      }
      if (detectHeadings && content.length <= 60 && ALL_CAPS_LINE.test(content)) {
        // Headings like "DIRECT EXAMINATION" stand on their own.
        flush()
        current = titleCase(content) + (TERMINAL_PUNCTUATION.test(content) ? '' : '.')
        flush()
        continue
      }
    }

    if (LIST_ITEM.test(content)) {
      flush()
      current = content
    } else if (/[a-z]-$/.test(current) && /^[a-z]/.test(content)) {
      // Rejoin a word hyphenated across the line break.
      current = current.slice(0, -1) + content
    } else {
      current = current ? `${current} ${content}` : content
    }
  }
  flush()

  return paragraphs.join('\n\n')
}
