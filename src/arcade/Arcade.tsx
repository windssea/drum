import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { KitIcon, laneStyle } from '../PracticeBoard'
import { ACCENT_VELOCITY, kit, type Lesson, type Score } from '../game'
import type { usePractice } from '../usePractice'
import { arcadeGames, ruleNames, type ArcadeGame, type ArcadeRule } from './catalog'
import ArcadeStage from './ArcadeStage'
import './arcade.css'

const grades = { clear: '完成', bronze: '铜牌', silver: '银牌', gold: '金牌' } as const
type Grade = keyof typeof grades
const medals: Grade[] = ['clear', 'bronze', 'silver', 'gold']
type RecordEntry = { grade: Grade; points: number }
const scoresKey = 'drum-lab-arcade-records-v1'
const offsetKey = 'drum-lab-arcade-offset-v1'
const sceneMark = { rail: '◈', kitchen: '◒', space: '✦', garden: '✿', factory: '▰' }
const difficulty = ['入门', '基础', '进阶', '高手']
const judgments = { perfect: '精准', good: '命中', miss: '漏击', extra: '多击', free: '击打' }
const mistakes = { soft: '这拍轻一点', strong: '这拍需要重击', together: '两鼓要同时打' }

function readRecords(): Partial<Record<string, RecordEntry>> {
  try {
    const saved = JSON.parse(localStorage.getItem(scoresKey) ?? '{}')
    return Object.fromEntries(
      arcadeGames.flatMap(({ id }) => {
        const entry = saved?.[id]
        return entry && Object.hasOwn(grades, entry.grade) && Number.isFinite(entry.points)
          ? [[id, entry]]
          : []
      }),
    )
  } catch {
    return {}
  }
}
function getGrade(score: Score, count: number): Grade {
  const accuracy = score.hits / (count + score.extra)
  if (accuracy >= 0.96 && score.perfect / count >= 0.8) return 'gold'
  if (accuracy >= 0.85) return 'silver'
  return accuracy >= 0.65 ? 'bronze' : 'clear'
}
function sceneStyle(game: ArcadeGame) {
  return {
    '--game-bg': game.palette[0],
    '--game-ink': game.palette[1],
    '--game-pop': game.palette[2],
  } as CSSProperties
}
function toLesson(game: ArcadeGame, inputOffset: number): Lesson {
  const accentedLanes = new Set(game.notes.filter((note) => note.accent).map((note) => note.lane))
  return {
    id: game.id,
    name: game.name,
    category: game.world,
    bpm: game.bpm,
    bars: game.bars,
    division: 16,
    guide: game.guide,
    notes: game.notes.map((note) => ({
      ...note,
      velocity: note.accent ? 121 : 79,
      dynamics: note.accent ? 'strong' : accentedLanes.has(note.lane) ? 'soft' : undefined,
    })),
    arcade: {
      style: game.scene,
      roots: game.music,
      cues: game.cues,
      together: game.rule === 'chord',
      inputOffset,
    },
  }
}
function ArcadePads({ game, practice }: { game: ArcadeGame; practice: ReturnType<typeof usePractice> }) {
  const padLanes = useMemo(() => [...new Set(game.notes.map((n) => n.lane))], [game])
  const accentLanes = useMemo(() => new Set(game.notes.filter((n) => n.accent).map((n) => n.lane)), [game])
  return (
    <div className="arcade-pads" aria-label="游戏触屏鼓垫">
      {padLanes.map((id) => {
        const accent = accentLanes.has(id)
        const drum = kit[id]
        const play = (at: number, strong: boolean) =>
          practice.strike(id, strong ? 121 : accent ? 72 : 102, at)
        const pad = (strong: boolean) => (
          <button
            type="button"
            data-lane={id}
            data-accent={strong || undefined}
            aria-label={(strong ? '重击' : accent ? '轻击' : '打击') + drum.name}
            className={
              practice.lastHit?.lane === id &&
              practice.lastHit.velocity > 0 &&
              (!accent || strong === (practice.lastHit.velocity >= ACCENT_VELOCITY))
                ? 'arcade-pad lit'
                : 'arcade-pad'
            }
            onPointerDown={(event) => {
              if (event.button === 0) play(event.timeStamp, strong)
            }}
            onClick={(event) => {
              if (event.detail === 0) play(event.timeStamp, strong)
            }}
          >
            <KitIcon lane={id} size={28} />
            <span>
              <b>{strong ? '重击' : drum.name}</b>
              <small>{strong ? drum.name : accent ? '轻击' : drum.label}</small>
            </span>
            <kbd>
              {strong ? '⇧' : ''}
              {drum.key}
            </kbd>
          </button>
        )
        return (
          <div
            className={accent ? 'arcade-pad-pair paired' : 'arcade-pad-pair'}
            style={laneStyle(id)}
            key={id}
          >
            {pad(false)}
            {accent && pad(true)}
          </div>
        )
      })}
    </div>
  )
}
export default function Arcade({
  practice,
  reduced,
  onMap,
}: {
  practice: ReturnType<typeof usePractice>
  reduced: boolean
  onMap: () => void
}) {
  const [selected, setSelected] = useState<ArcadeGame | null>(null)
  const [filter, setFilter] = useState<ArcadeRule | null>(null)
  const [records, setRecords] = useState(readRecords)
  const [slow, setSlow] = useState(false)
  const [offset, setOffset] = useState(() => {
    try {
      return Math.max(-120, Math.min(120, Number(localStorage.getItem(offsetKey)) || 0))
    } catch {
      return 0
    }
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const gallery = useRef<HTMLElement>(null)
  const returnFocus = useRef('')
  const { phase, session, begin, reset, score, time, lastHit } = practice
  const round = session.current.round
  const live = phase === 'running'
  const busy = live || phase === 'loading'
  const bpm = selected ? Math.round(selected.bpm * (slow ? 0.75 : 1)) : 0
  const count = live && time < 0 ? Math.min(4, Math.ceil(-time / (60000 / bpm))) : 0
  const progress = round ? Math.min(1, Math.max(0, time / round.duration)) : 0
  const grade = selected ? getGrade(score, selected.notes.length) : 'clear'
  const rhythmCompleted = phase === 'finished' && round && !round.demo
  const currentBar = selected
    ? Math.min(selected.bars, Math.max(1, Math.floor(time / (240000 / bpm)) + 1))
    : 1
  useEffect(() => {
    if (selected) heading.current?.focus({ preventScroll: true })
    else if (returnFocus.current) {
      gallery.current?.querySelector<HTMLElement>('[data-game="' + returnFocus.current + '"]')?.focus()
      returnFocus.current = ''
    }
  }, [selected])
  useEffect(() => {
    if (!rhythmCompleted || !selected || slow) return
    setRecords((old) => {
      const previous = old[selected.id]
      if (
        previous &&
        (medals.indexOf(grade) < medals.indexOf(previous.grade) ||
          (grade === previous.grade && score.points <= previous.points))
      )
        return old
      const next = { ...old, [selected.id]: { grade, points: score.points } }
      try {
        localStorage.setItem(scoresKey, JSON.stringify(next))
      } catch {
        /* Private browsing. */
      }
      return next
    })
  }, [rhythmCompleted, selected, grade, score.points, slow])
  function choose(game: ArcadeGame | null) {
    reset()
    if (selected) returnFocus.current = selected.id
    setSelected(game)
    setSlow(false)
    if (game) window.scrollTo(0, 0)
  }
  function play(demo: boolean) {
    if (!selected) return
    window.scrollTo(0, 0)
    void begin(toLesson(selected, offset), bpm, demo)
  }
  function changeOffset(value: number) {
    setOffset(value)
    try {
      localStorage.setItem(offsetKey, String(value))
    } catch {
      /* Private browsing. */
    }
  }
  if (!selected) {
    const visible = filter ? arcadeGames.filter((game) => game.rule === filter) : arcadeGames
    return (
      <section className="arcade-browser" ref={gallery}>
        <header className="arcade-cover">
          <div>
            <p className="arcade-overline">DRUM LAB ARCADE</p>
            <h1>鼓点游乐场</h1>
            <p>听到暗号，踩准那一拍。</p>
          </div>
          <span>{arcadeGames.length} 个原创关卡</span>
        </header>
        <div className="arcade-library-head">
          <div className="arcade-filters" aria-label="筛选玩法">
            <button aria-pressed={!filter} onClick={() => setFilter(null)}>
              全部
            </button>
            {(Object.keys(ruleNames) as ArcadeRule[]).map((rule) => (
              <button key={rule} aria-pressed={filter === rule} onClick={() => setFilter(rule)}>
                {ruleNames[rule]}
              </button>
            ))}
          </div>
          <button className="arcade-quiet" onClick={onMap}>
            鼓位映射
          </button>
        </div>
        <div className="arcade-library" aria-label="小游戏列表">
          {visible.map((game) => (
            <button
              key={game.id}
              className={'game-ticket ' + (records[game.id] ? 'played' : '')}
              style={sceneStyle(game)}
              data-game={game.id}
              onClick={() => choose(game)}
            >
              <span className="ticket-mark" aria-hidden="true">
                {sceneMark[game.scene]}
              </span>
              <span className="ticket-copy">
                <b>{game.name}</b>
                <small>
                  {game.world} · {ruleNames[game.rule]}
                </small>
              </span>
              <span className="ticket-tier">
                {difficulty[game.level - 1]}
                {records[game.id] && (
                  <i data-grade={records[game.id]?.grade}>{grades[records[game.id]!.grade]}</i>
                )}
              </span>
            </button>
          ))}
        </div>
      </section>
    )
  }
  const feedback =
    lastHit && lastHit.judgment !== 'free'
      ? lastHit.mistake
        ? mistakes[lastHit.mistake]
        : judgments[lastHit.judgment]
      : ''
  const next = arcadeGames[arcadeGames.indexOf(selected) + 1]
  const accuracy = Math.round((score.hits * 100) / (selected.notes.length + score.extra))
  return (
    <section className={'arcade-game' + (busy ? ' in-round' : '')} style={sceneStyle(selected)}>
      <header className="arcade-game-heading">
        <div>
          <button className="arcade-quiet back" onClick={() => choose(null)}>
            ← 游戏列表
          </button>
          <h1 tabIndex={-1} ref={heading}>
            {selected.name}
          </h1>
          <p>
            {selected.world} · {ruleNames[selected.rule]} · {difficulty[selected.level - 1]}
          </p>
        </div>
        <div className="arcade-game-status">
          <strong>
            {bpm} <small>BPM</small>
          </strong>
          {busy ? (
            <button className="arcade-quiet" onClick={reset}>
              结束回合
            </button>
          ) : (
            records[selected.id] && (
              <span data-grade={records[selected.id]?.grade}>{grades[records[selected.id]!.grade]}</span>
            )
          )}
        </div>
      </header>
      {!busy && <p className="arcade-guide">{selected.guide}</p>}
      {!busy && (
        <div className="arcade-actions">
          <button className="arcade-start" onClick={() => play(false)}>
            {phase === 'finished' ? '再来一次' : '开始游戏'}
          </button>
          <button className="arcade-quiet" onClick={() => play(true)}>
            听示范
          </button>
          <button
            className="arcade-quiet"
            aria-pressed={slow}
            onClick={() => {
              reset()
              setSlow(!slow)
            }}
          >
            慢练
          </button>
          {selected.rule === 'accent' && <span className="accent-help">触屏轻／重分区 · 键盘 ⇧ 重击</span>}
        </div>
      )}
      {practice.error && (
        <p className="notice" role="alert">
          {practice.error}
        </p>
      )}
      {phase === 'finished' && (
        <section className="arcade-result" role="status">
          <div>
            <b data-grade={rhythmCompleted ? grade : undefined}>
              {rhythmCompleted ? grades[grade] : '示范结束'}
            </b>
            <p>
              {rhythmCompleted
                ? grade === 'clear'
                  ? '先听一遍暗号，再试一次。'
                  : selected.result
                : '现在可以自己打一遍。'}
            </p>
          </div>
          {rhythmCompleted && (
            <div className="arcade-result-stats">
              <span>
                <b>{accuracy}%</b>命中率
              </span>
              <span>
                <b>{score.perfect}</b>精准
              </span>
              <span>
                <b>{score.best}</b>最长连击
              </span>
              <span>
                <b>
                  {score.misses} / {score.extra}
                </b>
                漏击 / 多击
              </span>
            </div>
          )}
          {rhythmCompleted && next && (
            <button className="arcade-quiet" onClick={() => choose(next)}>
              下一关 →
            </button>
          )}
        </section>
      )}
      <div className="arcade-play">
        <div className="arcade-viewport">
          <ArcadeStage key={selected.id} game={selected} session={session} reduced={reduced} active={live} />
          {(count > 0 || phase === 'loading') && (
            <strong className="arcade-count" aria-label={count ? '预备 ' + count : '准备中'}>
              {count || '…'}
            </strong>
          )}
          {live && !count && (
            <span className="arcade-bar">
              第 {currentBar} / {selected.bars} 小节
            </span>
          )}
          <progress aria-label="游戏进度" value={progress} max={1} />
        </div>
        <div className="arcade-deck">
          <div className="arcade-deck-top">
            <b>鼓垫</b>
            <span className={'arcade-feedback ' + (lastHit?.judgment ?? '')}>
              {feedback || (round?.demo && live ? '听示范' : score.combo > 1 ? score.combo + ' 连击' : ' ')}
              {feedback && lastHit?.offset !== undefined && (
                <small>
                  {lastHit.offset < -0.5 ? '早 ' : lastHit.offset > 0.5 ? '晚 ' : ''}
                  {Math.round(Math.abs(lastHit.offset))} ms
                </small>
              )}
            </span>
          </div>
          <ArcadePads game={selected} practice={practice} />
        </div>
      </div>
      {!busy && (
        <details className="arcade-calibration">
          <summary>输入延迟校准</summary>
          <label htmlFor="arcade-offset">若每次都提示“晚”，向右增加补偿。音频和动画继续按原拍播放。</label>
          <div>
            <button
              className="arcade-quiet"
              onClick={() => changeOffset(Math.max(-120, offset - 5))}
              aria-label="减少补偿 5 毫秒"
            >
              −5
            </button>
            <input
              id="arcade-offset"
              type="range"
              min="-120"
              max="120"
              step="5"
              value={offset}
              onChange={(e) => changeOffset(Number(e.target.value))}
            />
            <output htmlFor="arcade-offset">
              {offset > 0 ? '+' : ''}
              {offset} ms
            </output>
            <button
              className="arcade-quiet"
              onClick={() => changeOffset(Math.min(120, offset + 5))}
              aria-label="增加补偿 5 毫秒"
            >
              +5
            </button>
            <button className="arcade-quiet" onClick={() => changeOffset(0)}>
              归零
            </button>
          </div>
        </details>
      )}
    </section>
  )
}
