import { Fragment, useMemo, type CSSProperties } from 'react'
import { kit, lanes, type Hit, type Lane, type Lesson, type Round } from './game'

export const laneStyle = (lane: Lane) => ({ '--ink': kit[lane].color }) as CSSProperties
export function KitIcon({ lane, size = 32 }: { lane: Lane; size?: number }) {
  const voice = kit[lane].voice
  const cymbal = ['hat', 'pedal', 'open', 'ride', 'bell', 'crash'].includes(voice)
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {cymbal ? (
        <>
          <path d="M5 18q10-1 13-6 2-3 4 0 4 4 13 5-13 7-30 1Z" />
          <path d="M20 10V6m0 16v10m-6 2 6-3 6 3" />
          {['hat', 'open', 'pedal'].includes(voice) && (
            <path d={voice === 'open' ? 'M5 24q14 5 30-1' : 'M6 21q13 5 27-1'} />
          )}
          {voice === 'bell' && <path d="M15 16q5-9 10 0" />}
        </>
      ) : voice === 'kick' ? (
        <>
          <ellipse cx="20" cy="20" rx="12" ry="13" />
          <ellipse cx="20" cy="20" rx="8.5" ry="9.5" />
          <path d="m10 28-3 5m23-5 3 5M18 34h5m-3-2v-8" />
          <circle cx="20" cy="22" r="2" />
        </>
      ) : (
        <>
          <ellipse cx="20" cy="13" rx="14" ry="5" />
          <path d="M6 13v13c2 7 26 7 28-1V13m-24 6v6m6-4v6m9-7v7m5-9v6" />
          {['snare', 'rim', 'stick'].includes(voice) && <path d="m13 11 15-7" />}
        </>
      )}
    </svg>
  )
}
export function PadBank({
  ids,
  hit,
  strike,
}: {
  ids: Lane[]
  hit: Hit | null
  strike: (id: Lane, at: number) => void
}) {
  return (
    <div
      className="pad-bank"
      aria-label="触屏鼓垫"
      style={{ '--n': Math.min(4, ids.length) } as CSSProperties}
    >
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className={
            'drum-pad ' + (hit?.lane === id && !['miss', 'extra'].includes(hit.judgment) ? 'lit' : '')
          }
          style={laneStyle(id)}
          aria-label={'打击' + kit[id].name}
          onPointerDown={(e) => {
            if (e.button === 0) strike(id, e.timeStamp)
          }}
          onClick={(e) => {
            if (e.detail === 0) strike(id, performance.now())
          }}
        >
          <KitIcon lane={id} />
          <span>
            <b>{kit[id].name}</b>
            <small>{kit[id].label}</small>
          </span>
          {kit[id].key && <kbd>{kit[id].key}</kbd>}
        </button>
      ))}
    </div>
  )
}
export function lessonLanes(lesson: Lesson) {
  const used = new Set(lesson.notes.map((n) => n.lane))
  return lanes.filter((id) => used.has(id))
}
export function ScoreGrid({
  lesson,
  bar,
  ids,
  time,
  round,
  running,
}: {
  lesson: Lesson
  bar: number
  ids: Lane[]
  time: number
  round: Round | null
  running: boolean
}) {
  const columns = lesson.division
  const events = useMemo(() => {
    const cells = new Map<string, number>()
    lesson.notes.forEach((n, index) => {
      if (Math.floor(n.step / 16) === bar) cells.set(n.lane + '-' + (n.step % 16), index)
    })
    return cells
  }, [lesson, bar])
  const pos = round && running && time >= 0 ? ((time / round.beat) * columns) / 4 - bar * columns : -1
  const column = Math.floor(pos)
  const label = (col: number) =>
    col % (columns / 4) === 0
      ? String(1 + Math.floor(col / (columns / 4)))
      : columns === 16
        ? ['', 'e', '&', 'a'][col % 4]
        : '&'
  return (
    <div className="score-scroll">
      <div
        className="score-grid"
        role="table"
        aria-label={lesson.name + ' 第 ' + (bar + 1) + ' 小节鼓谱'}
        style={{ '--cols': columns } as CSSProperties}
      >
        <div className="grid-head" role="row">
          <span className="grid-key" role="columnheader">
            鼓位
          </span>
          <div className="beat-cells">
            {Array.from({ length: columns }, (_, i) => (
              <b
                role="columnheader"
                key={i}
                className={
                  (label(i).length && Number(label(i)) ? 'down ' : '') + (column === i ? ' now' : '')
                }
              >
                {label(i)}
              </b>
            ))}
          </div>
        </div>
        {ids.map((id) => (
          <div className="grid-row" role="row" key={id} style={laneStyle(id)}>
            <span className="row-name" role="rowheader">
              <i />
              {kit[id].name}
            </span>
            <div className="beat-cells">
              {Array.from({ length: columns }, (_, i) => {
                const event = events.get(id + '-' + (i * 16) / columns)
                const done = event !== undefined && round?.resolved.has(event)
                const late =
                  event !== undefined && running && round && !round.demo && event < round.nextMiss && !done
                return (
                  <span
                    role="cell"
                    aria-label={label(i) + (event === undefined ? ' 空拍' : ' 击打')}
                    key={i}
                    className={
                      'cell ' +
                      (i % (columns / 4) === 0 ? 'down ' : '') +
                      (column === i ? 'now ' : '') +
                      (done ? 'done ' : late ? 'late' : '')
                    }
                  >
                    {event !== undefined ? (
                      <i
                        className={
                          ['hat', 'open', 'pedal', 'ride', 'crash', 'bell'].includes(kit[id].voice)
                            ? 'cross'
                            : 'note'
                        }
                      />
                    ) : (
                      <i className="rest" />
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
export function SongPhrases({ lesson }: { lesson: Lesson }) {
  return (
    <div className="phrases">
      {lesson.sections?.map((section) => (
        <Fragment key={section.bar}>
          <span>{String(section.bar).padStart(2, '0')} 小节</span>
          <b>{section.name}</b>
        </Fragment>
      ))}
    </div>
  )
}
