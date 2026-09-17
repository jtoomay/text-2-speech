import { describe, expect, it } from 'vitest'
import { cleanText, detectFormatting, needsCleanup } from './cleanup'

const TRANSCRIPT = `
                                                              12
 1        Q.   And where were you on the
 2   night of March 3rd?
 3        A.   I was at home with my
 4   family.
 5        MR. SMITH:  Objection, Your Honor.
 6        THE COURT:  Overruled.
 7                  CROSS-EXAMINATION
 8        Q.   What time did you get
 9   home?
10
11        A.   Around nine.

                                                              13
 1        Q.   Was anyone with you?
 2        A.   My sister was there
 3   the entire evening.
`

describe('detectFormatting', () => {
  it('detects a line-numbered transcript', () => {
    const f = detectFormatting(TRANSCRIPT)
    expect(f.lineNumbers).toBe(true)
    expect(f.speakerLabels).toBe(true)
    expect(needsCleanup(f)).toBe(true)
  })

  it('leaves normal prose alone', () => {
    const prose = `The quick brown fox jumps over the lazy dog. It was a sunny day.

Another paragraph follows here. It has two sentences as well.

A third paragraph closes the text.`
    const f = detectFormatting(prose)
    expect(needsCleanup(f)).toBe(false)
    expect(cleanText(prose, f)).toBe(prose)
  })

  it('leaves a numbered list alone', () => {
    const list = `Shopping list:
1. Buy milk
2. Walk the dog
3. Call the office
4. Pick up dry cleaning
5. Pay rent
6. Water plants`
    expect(needsCleanup(detectFormatting(list))).toBe(false)
  })

  it('leaves short text alone', () => {
    expect(needsCleanup(detectFormatting('Hello there.\nHow are you?'))).toBe(false)
  })

  it('detects hard-wrapped prose', () => {
    const wrapped = `This is a long paragraph that was copied from a PDF document and
so every line ends at a fixed width even though the sentence has
not ended yet, which makes the speech engine pause in the wrong
places when it reads the text aloud to the listener who wants to
hear it flow naturally from one line to the next without any
strange breaks.`
    const f = detectFormatting(wrapped)
    expect(f).toEqual({ lineNumbers: false, speakerLabels: false, hardWrapped: true })
  })
})

describe('cleanText', () => {
  it('turns a transcript into flowing speaker turns', () => {
    const cleaned = cleanText(TRANSCRIPT, detectFormatting(TRANSCRIPT))
    expect(cleaned.split('\n\n')).toEqual([
      'Question: And where were you on the night of March 3rd?',
      'Answer: I was at home with my family.',
      'Mr. Smith: Objection, Your Honor.',
      'The Court: Overruled.',
      'Cross-examination.',
      'Question: What time did you get home?',
      'Answer: Around nine.',
      'Question: Was anyone with you?',
      'Answer: My sister was there the entire evening.',
    ])
  })

  it('joins hard-wrapped paragraphs and keeps paragraph breaks', () => {
    const text = `Second paragraph starts here and it also wraps across more
than one line because the document was formatted for print and
the lines were broken at a fixed width by the original author of
the text.

A new paragraph begins after the blank line and it continues on
the following line of the document, with a hyphen-
ated word split across the break.`
    const cleaned = cleanText(text, detectFormatting(text))
    expect(cleaned).toBe(
      'Second paragraph starts here and it also wraps across more than one line because the document was formatted for print and the lines were broken at a fixed width by the original author of the text.' +
        '\n\n' +
        'A new paragraph begins after the blank line and it continues on the following line of the document, with a hyphenated word split across the break.',
    )
  })

  it('handles an all-caps transcript without treating lines as headings', () => {
    const text = ` 1   Q.   WHERE DID YOU GO
 2   AFTER THAT?
 3   A.   I WENT
 4   STRAIGHT HOME.
 5   Q.   OKAY.`
    expect(cleanText(text, detectFormatting(text)).split('\n\n')).toEqual([
      'Question: WHERE DID YOU GO AFTER THAT?',
      'Answer: I WENT STRAIGHT HOME.',
      'Question: OKAY.',
    ])
  })
})
