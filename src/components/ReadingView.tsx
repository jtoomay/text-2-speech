import { Fragment, memo, useEffect, useMemo, useRef, useSyncExternalStore, type MouseEvent } from 'react'
import type { StreamingPlayer } from '../audio/StreamingPlayer'
import { LINE_PAUSE_MS, PARAGRAPH_PAUSE_MS, type Chunk } from '../text/chunk'

export type Script = {
  chunks: Chunk[]
  /** The text was cleaned up as a court transcript, so paragraphs start with a speaker. */
  transcript: boolean
}

type Paragraph = {
  speaker?: string
  /** Chunk indexes, grouped into the lines of the paragraph. */
  lines: number[][]
}

type Layout = { paragraphs: Paragraph[]; texts: string[] }

type SentenceState = 'pending' | 'ready' | 'current'

// Matches the "Question: " and "The Court: " prefixes written by cleanText.
const SPEAKER_PREFIX = /^([A-Z][A-Za-z.'’ -]{0,40}):\s+/

function layOut({ chunks, transcript }: Script): Layout {
  const paragraphs: Paragraph[] = []
  const texts = chunks.map((chunk) => chunk.text)
  let paragraph: Paragraph | null = null

  chunks.forEach((chunk, index) => {
    if (!paragraph) {
      paragraph = { lines: [[]] }
      const speaker = transcript ? chunk.text.match(SPEAKER_PREFIX) : null
      if (speaker) {
        paragraph.speaker = speaker[1]
        texts[index] = chunk.text.slice(speaker[0].length)
      }
      paragraphs.push(paragraph)
    }
    paragraph.lines[paragraph.lines.length - 1].push(index)
    if (chunk.pauseAfterMs >= PARAGRAPH_PAUSE_MS) paragraph = null
    else if (chunk.pauseAfterMs >= LINE_PAUSE_MS) paragraph.lines.push([])
  })
  return { paragraphs, texts }
}

const Sentence = memo(function Sentence(props: { index: number; text: string; state: SentenceState }) {
  return (
    <>
      <span data-index={props.index} data-state={props.state} className="sentence">
        {props.text}
      </span>{' '}
    </>
  )
})

type PagesProps = { layout: Layout; transcript: boolean; ready: number; current: number }

// Memoized so the player's frequent position updates only re-render when the sentence changes.
const Pages = memo(function Pages({ layout, transcript, ready, current }: PagesProps) {
  const stateOf = (i: number): SentenceState => (i === current ? 'current' : i < ready ? 'ready' : 'pending')
  return (
    <div className="flex flex-col gap-[1.1em]">
      {layout.paragraphs.map((paragraph, p) => (
        <div key={p} className={transcript ? 'sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-7' : undefined}>
          {paragraph.speaker && (
            <p className="font-sans text-[13px] leading-[1.125rem] font-semibold text-pencil sm:pt-[0.7rem] sm:text-right">
              {paragraph.speaker}
            </p>
          )}
          <p className={transcript ? 'sm:col-start-2' : undefined}>
            {paragraph.lines.map((line, l) => (
              <Fragment key={l}>
                {l > 0 && line.length > 0 && <br />}
                {line.map((i) => (
                  <Sentence key={i} index={i} text={layout.texts[i]} state={stateOf(i)} />
                ))}
              </Fragment>
            ))}
          </p>
        </div>
      ))}
    </div>
  )
})

type Props = { script: Script; player: StreamingPlayer }

export function ReadingView({ script, player }: Props) {
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot)
  const layout = useMemo(() => layOut(script), [script])
  const articleRef = useRef<HTMLElement>(null)
  const ready = state.sectionCount
  const current = ready > 0 ? state.sectionIndex : -1

  // Keep the sentence being read in view, turning the page only when it nears an edge.
  useEffect(() => {
    if (current < 0 || !state.playing) return
    const sentence = articleRef.current?.querySelector(`[data-index="${current}"]`)
    if (!sentence) return
    const rect = sentence.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.12 || rect.bottom > window.innerHeight * 0.66) {
      const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
      sentence.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    }
  }, [current, state.playing])

  function handleClick(event: MouseEvent) {
    const target = (event.target as Element).closest<HTMLElement>('[data-index]')
    if (!target || window.getSelection()?.toString()) return
    const index = Number(target.dataset.index)
    if (index >= ready) return
    player.seekSection(index)
    if (!player.getSnapshot().playing) player.play()
  }

  return (
    <article ref={articleRef} aria-label="Text being read" className="sheet sheet-ruled" onClick={handleClick}>
      <div className="sheet-text min-h-72 text-[1.1875rem] leading-[1.8] sm:text-[1.3125rem]">
        <Pages layout={layout} transcript={script.transcript} ready={ready} current={current} />
      </div>
    </article>
  )
}
