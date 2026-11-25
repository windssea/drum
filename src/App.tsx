import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { enableAudio } from './audio'
import { kit, lanes, defaults, readBindings, STORAGE_KEY, makeRound, type Lane, type Lesson } from './game'
import { lessons, songInfo, loadSong, demoMidiUrl } from './lessons'
import { PadBank, ScoreGrid, SongPhrases, laneStyle, lessonLanes } from './PracticeBoard'
import { useMidi, type MidiHit } from './useMidi'
import { usePractice } from './usePractice'

const DrumStage = lazy(() => import('./DrumStage').then((m) => ({ default: m.DrumStage })))
const Arcade = lazy(() => import('./arcade/Arcade'))
const icons = {
  play: 'm8 5 11 7-11 7Z',
  stop: 'M6 6h12v12H6Z',
  listen: 'M4 15v-3a8 8 0 0 1 16 0v3M4 13h4v7H5q-1 0-1-2Zm16 0h-4v7h3q1 0 1-2Z',
  usb: 'M12 21V4m-3 3 3-4 3 4M12 15l-6-4V8m6 10 6-6V9',
  volume: 'M3 10h4l5-5v14l-5-5H3ZM16 9q3 3 0 6m3-9q5 6 0 12',
  mute: 'M3 10h4l5-5v14l-5-5H3Zm13 0 5 5m0-5-5 5',
  right: 'm9 5 7 7-7 7',
  left: 'm15 5-7 7 7 7',
  layers: 'M4 6h3m3 0h10M4 12h3m3 0h10M4 18h3m3 0h10',
  close: 'm6 6 12 12m0-12L6 18',
  map: 'M3 6h18M3 12h18M3 18h18M8 3v6m8 0v6m-6 0v6',
  beat: 'm3 17 5-12h8l5 14H3Zm9-4 6-8',
  disc: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0Zm-7 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
}
function Icon({ name, size = 19 }: { name: keyof typeof icons; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icons[name]} />
    </svg>
  )
}
type Mode = 'lessons' | 'arcade' | 'song' | 'free'
const labels = { lessons: '训练课程', arcade: '小游戏', song: '歌曲练习', free: '自由打击' }
const judgeNames = { perfect: '精准', good: '命中', miss: '漏击', extra: '多击', free: '击中' }
function CourseList({ index, choose }: { index: number; choose: (n: number) => void }) {
  return (
    <div className="course-list">
      {lessons.map((l, i) => (
        <button
          key={l.id}
          type="button"
          aria-current={index === i ? 'step' : undefined}
          onClick={() => choose(i)}
        >
          <span className="course-index">{String(i + 1).padStart(2, '0')}</span>
          <span className="course-name">
            <b>{l.name}</b>
            <small>
              {l.category} · {l.bpm} BPM
            </small>
          </span>
          <Icon name="right" size={15} />
        </button>
      ))}
    </div>
  )
}
export default function App() {
  const [mode, setMode] = useState<Mode>(() => (location.hash === '#arcade' ? 'arcade' : 'lessons')),
    [index, setIndex] = useState(0)
  const [sound, setSound] = useState(true),
    [speed, setSpeed] = useState(1),
    [view, setView] = useState<'grid' | 'stage'>('grid')
  const [preview, setPreview] = useState(0),
    [extended, setExtended] = useState(false)
  const [song, setSong] = useState<Lesson | null>(null),
    [songError, setSongError] = useState(false),
    [retry, setRetry] = useState(0)
  const [bindings, setBindings] = useState(readBindings),
    [learning, setLearning] = useState<Lane | null>(null)
  const [manual, setManual] = useState(''),
    [message, setMessage] = useState(''),
    [lastMidi, setMidi] = useState<MidiHit | null>(null)
  const mostRecentMidi = useRef<MidiHit | null>(null)
  const mapping = useRef<HTMLDialogElement>(null),
    library = useRef<HTMLDialogElement>(null)
  const reduced = Boolean(useReducedMotion())
  const p = usePractice(sound, mode === 'free')
  const { score, lastHit, phase, time, session, reset, strike } = p
  const running = phase === 'running',
    busy = running || phase === 'loading'
  const lesson = mode === 'song' ? song : lessons[index],
    info = mode === 'song' ? (song ?? songInfo) : lessons[index]
  const bpm = Math.round(info.bpm * (mode === 'song' ? 1 : speed))
  const ids = useMemo(() => (lesson ? lessonLanes(lesson) : []), [lesson])
  const stageChart = useMemo(() => (lesson ? makeRound(lesson, bpm, 0, false).targets : []), [lesson, bpm])
  const round = session.current.round
  const bar =
    running || phase === 'finished'
      ? Math.min(info.bars - 1, Math.max(0, Math.floor(time / (240000 / bpm))))
      : preview
  const count = running && time < 0 ? Math.min(4, Math.ceil(-time / (60000 / bpm))) : 0
  const total = score.hits + score.misses + score.extra,
    accuracy = total ? Math.round((score.hits / total) * 100) : 0
  const activeBar = lesson?.sections?.filter((s) => s.bar <= bar + 1).at(-1)
  const hitLabel = lastHit && kit[lastHit.lane].name
  const freeIds = extended ? lanes.slice(12) : lanes.slice(0, 12)
  useEffect(() => {
    if (mode !== 'song' || song) return
    const controller = new AbortController()
    setSongError(false)
    loadSong(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSong(data)
      })
      .catch(() => {
        if (!controller.signal.aborted) setSongError(true)
      })
    return () => controller.abort()
  }, [mode, song, retry])
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
    } catch {
      /* Storage is optional. */
    }
  }, [bindings])
  function assign(note: number, id: Lane) {
    setBindings((old) => ({ ...old, [note]: id }))
    setLearning(null)
    setManual('')
    setMessage('音符 ' + note + ' 已绑定到' + kit[id].name)
  }
  const midi = useMidi((e) => {
    mostRecentMidi.current = e
    if (mode === 'free' || mapping.current?.open) setMidi(e)
    if (mapping.current?.open) {
      if (learning) assign(e.note, learning)
      return
    }
    if (library.current?.open) return
    const id = bindings[e.note] ?? defaults[e.note]
    if (id) strike(id, e.velocity, e.at, true)
  })
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.repeat ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        mapping.current?.open ||
        library.current?.open ||
        (e.target instanceof HTMLElement && e.target.closest('input,select,textarea,[contenteditable]'))
      )
        return
      const id = lanes.find((l) => kit[l].key && e.code === 'Key' + kit[l].key)
      if (id) {
        e.preventDefault()
        strike(id, mode === 'arcade' ? (e.shiftKey ? 121 : 78) : 102, e.timeStamp)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [strike, mode])
  function changeMode(next: Mode) {
    if (next !== mode) {
      reset()
      setMode(next)
      setPreview(0)
      if (next === 'free') setMidi(mostRecentMidi.current)
      if (location.hash === '#arcade' || next === 'arcade') {
        history.replaceState(
          null,
          '',
          location.pathname + location.search + (next === 'arcade' ? '#arcade' : ''),
        )
      }
    }
  }
  function choose(n: number) {
    reset()
    setMode('lessons')
    setIndex(n)
    setPreview(0)
    setSpeed(1)
    library.current?.close()
  }
  function openMap() {
    if (busy) reset()
    setMidi(mostRecentMidi.current)
    setLearning(null)
    setMessage('')
    setManual('')
    mapping.current?.showModal()
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    if (learning && /^\d{1,3}$/.test(manual) && Number(manual) <= 127) assign(Number(manual), learning)
  }
  function begin(demo: boolean) {
    if (lesson) {
      setPreview(0)
      window.scrollTo(0, 0)
      void p.begin(lesson, bpm, demo)
    }
  }
  function connect() {
    void enableAudio(!sound).catch(() => {})
    void midi.connect()
  }
  const feedback = lastHit
    ? mode === 'free'
      ? hitLabel + ' · 力度 ' + lastHit.velocity
      : lastHit.judgment === 'free'
        ? hitLabel
        : judgeNames[lastHit.judgment] +
          ' · ' +
          hitLabel +
          (lastHit.offset === undefined
            ? ''
            : ' · ' + (lastHit.offset < 0 ? '提前 ' : '延后 ') + Math.round(Math.abs(lastHit.offset)) + ' ms')
    : ''
  return (
    <div className={busy ? 'shell is-playing' : 'shell'}>
      <header className="mast">
        <div className="mast-inner">
          <div className="brand">
            <span className="brand-sign" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            DRUM<span>LAB</span>
          </div>
          <nav aria-label="练习模式">
            {(Object.keys(labels) as Mode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => changeMode(m)}>
                {labels[m]}
              </button>
            ))}
          </nav>
          <div className="device-actions">
            <button
              className="iconbtn"
              aria-label={sound ? '关闭声音' : '开启声音'}
              aria-pressed={sound}
              onClick={() => {
                setSound(!sound)
                void enableAudio(sound).catch(() => {})
              }}
            >
              <Icon name={sound ? 'volume' : 'mute'} />
            </button>
            <button className="connect" disabled={midi.requesting} onClick={connect}>
              <Icon name="usb" />
              {midi.requesting ? '正在连接' : midi.input ? '已连接电子鼓' : '连接电子鼓'}
            </button>
          </div>
        </div>
      </header>
      <main className="workspace">
        {midi.error && (
          <p role="alert" className="notice">
            {midi.error}
          </p>
        )}
        {mode === 'arcade' ? (
          <Suspense fallback={<p role="status">正在打开小游戏…</p>}>
            <Arcade practice={p} reduced={reduced} onMap={openMap} />
          </Suspense>
        ) : (
          <div className="layout">
            <aside className="sidebar" aria-label={mode === 'song' ? '歌曲资料' : '课程导航'}>
              {mode === 'song' ? (
                <>
                  <div className="side-heading">
                    <Icon name="disc" />
                    <h2>歌曲资料</h2>
                  </div>
                  <div className="record">
                    <div className="vinyl" aria-hidden="true">
                      <i />
                    </div>
                    <h3>两只老虎</h3>
                    <p>Frère Jacques</p>
                  </div>
                  {song && (
                    <>
                      <h3 className="side-label">段落与鼓点</h3>
                      <SongPhrases lesson={song} />
                      <a className="download" href={demoMidiUrl} download>
                        下载编曲 MIDI ↗
                      </a>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="side-heading">
                    <Icon name="layers" />
                    <h2>课程目录</h2>
                    <small>08</small>
                  </div>
                  <CourseList index={mode === 'lessons' ? index : -1} choose={choose} />
                </>
              )}
              <button className="map-link" onClick={openMap}>
                <Icon name="map" />
                鼓位映射
                <Icon name="right" size={15} />
              </button>
            </aside>
            <article className="studio">
              <div className="heading">
                <div>
                  <div className="eyebrow">
                    <span className="live-dot" />
                    {mode === 'lessons'
                      ? '课程 ' + String(index + 1).padStart(2, '0') + ' / 08 · ' + info.category
                      : mode === 'song'
                        ? '歌曲练习 · 传统旋律'
                        : '电子鼓 · 自由打击'}
                  </div>
                  <h1>{mode === 'free' ? '自由打击' : info.name}</h1>
                </div>
                {mode !== 'free' ? (
                  <div className="tempo">
                    <Icon name="beat" size={25} />
                    <strong>{bpm}</strong>
                    <small>BPM</small>
                  </div>
                ) : (
                  <div className="tempo">
                    <strong>{score.hits}</strong>
                    <small>次击打</small>
                  </div>
                )}
              </div>
              <p className="guide">
                {mode === 'free' ? '敲击电子鼓或触摸鼓垫，可查看鼓位和力度。' : info.guide}
              </p>
              <div className="compact-tools">
                {mode === 'lessons' && (
                  <button onClick={() => library.current?.showModal()}>
                    <Icon name="layers" />
                    选课
                  </button>
                )}
                <button onClick={openMap}>
                  <Icon name="map" />
                  鼓位映射
                </button>
              </div>
              {mode === 'free' ? (
                <section className="panel free-panel">
                  <div className="panel-top">
                    <h2>触屏鼓组</h2>
                    <div className="switch">
                      <button aria-pressed={!extended} onClick={() => setExtended(false)}>
                        常用鼓位
                      </button>
                      <button aria-pressed={extended} onClick={() => setExtended(true)}>
                        边击与扩展
                      </button>
                    </div>
                  </div>
                  <PadBank ids={freeIds} hit={lastHit} strike={(l, t) => strike(l, 102, t)} />
                  <div className="monitor">
                    <span className="live-dot" />
                    {feedback || '等待击打'}
                    {lastMidi && (
                      <small>
                        MIDI {lastMidi.note} · 力度 {lastMidi.velocity}
                      </small>
                    )}
                  </div>
                </section>
              ) : (
                <>
                  {!lesson ? (
                    <div className="panel loading" role="status">
                      {songError ? '歌曲谱面未能加载' : '正在读取谱面…'}
                      {songError && <button onClick={() => setRetry((n) => n + 1)}>重新加载</button>}
                    </div>
                  ) : (
                    <>
                      <section className="panel score-panel" aria-label="训练谱面">
                        <div className="panel-top">
                          <div className="score-title">
                            <h2>练习谱</h2>
                            <span>4/4</span>
                          </div>
                          <div className="switch">
                            <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
                              节奏格
                            </button>
                            <button aria-pressed={view === 'stage'} onClick={() => setView('stage')}>
                              落点
                            </button>
                          </div>
                        </div>
                        <div className="bar-info">
                          <div>
                            <b>第 {bar + 1} 小节</b>
                            <small> / {info.bars} 小节</small>
                          </div>
                          {busy ? (
                            <span className="play-state" role="status">
                              {count
                                ? '预备 · ' + count
                                : phase === 'loading'
                                  ? '音频准备中'
                                  : round?.demo
                                    ? '示范播放中'
                                    : '正在跟练'}
                            </span>
                          ) : (
                            <div className="bar-nav">
                              <button
                                aria-label="上一小节"
                                disabled={bar === 0}
                                onClick={() => {
                                  reset()
                                  setPreview(bar - 1)
                                }}
                              >
                                <Icon name="left" size={16} />
                              </button>
                              <button
                                aria-label="下一小节"
                                disabled={bar === info.bars - 1}
                                onClick={() => {
                                  reset()
                                  setPreview(bar + 1)
                                }}
                              >
                                <Icon name="right" size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                        {view === 'grid' ? (
                          <ScoreGrid
                            lesson={lesson}
                            ids={ids}
                            bar={bar}
                            time={time}
                            round={round}
                            running={running}
                          />
                        ) : (
                          <div className="stage">
                            <Suspense fallback={<span>载入鼓轨…</span>}>
                              <DrumStage session={session} ids={ids} chart={stageChart} reduced={reduced} />
                            </Suspense>
                            {count > 0 && <b className="stage-count">{count}</b>}
                          </div>
                        )}
                        <div className="legend">
                          {activeBar ? (
                            <b>{activeBar.name}</b>
                          ) : (
                            <span>
                              {lesson.division === 4
                                ? '四分音符'
                                : lesson.division === 8
                                  ? '八分音符'
                                  : '十六分音符'}
                            </span>
                          )}
                          <span>● 鼓面　× 镲　· 空拍</span>
                        </div>
                        <div className="transport">
                          <div className="actions">
                            {busy ? (
                              <button className="action primary" onClick={reset}>
                                <Icon name="stop" />
                                停止{round?.demo ? '示范' : '练习'}
                              </button>
                            ) : (
                              <>
                                <button className="action primary" onClick={() => begin(false)}>
                                  <Icon name="play" />
                                  {phase === 'finished' ? '再练一次' : '开始跟练'}
                                </button>
                                <button className="action secondary" onClick={() => begin(true)}>
                                  <Icon name="listen" />
                                  听示范
                                </button>
                              </>
                            )}
                          </div>
                          {mode === 'lessons' && (
                            <div className="speed">
                              <small>速度</small>
                              {[0.75, 1].map((x) => (
                                <button
                                  key={x}
                                  aria-pressed={speed === x}
                                  disabled={busy}
                                  onClick={() => {
                                    reset()
                                    setSpeed(x)
                                  }}
                                >
                                  {x === 1 ? '原速' : '慢练'}
                                </button>
                              ))}
                            </div>
                          )}
                          {mode === 'song' && (
                            <span className="song-length">
                              {Math.floor((info.bars * 240) / info.bpm / 60)}:
                              {String(Math.round((info.bars * 240) / info.bpm) % 60).padStart(2, '0')} ·
                              伴奏跟练
                            </span>
                          )}
                        </div>
                      </section>
                      {p.error && (
                        <p role="alert" className="notice">
                          {p.error}
                        </p>
                      )}
                      <section className="touch-section">
                        <div className="touch-header">
                          <h2>触屏鼓垫</h2>
                          <span className={'feedback ' + (lastHit?.judgment ?? '')}>
                            {count ? '预备 ' + count : feedback || '支持同时敲击'}
                          </span>
                        </div>
                        <PadBank ids={ids} hit={lastHit} strike={(l, t) => strike(l, 102, t)} />
                      </section>
                      {phase === 'finished' && (
                        <div className="result" role="status">
                          <b>{round?.demo ? '示范结束' : '练习完成'}</b>
                          <span>
                            {round?.demo
                              ? '跟着四拍预备，自己打一遍。'
                              : score.hits +
                                ' 次命中 · ' +
                                score.misses +
                                ' 次漏击 · ' +
                                score.extra +
                                ' 次多击'}
                          </span>
                          {mode === 'lessons' && !round?.demo && index < lessons.length - 1 && (
                            <button onClick={() => choose(index + 1)}>下一课 →</button>
                          )}
                        </div>
                      )}
                      <div className="stats" aria-label="练习表现">
                        {[
                          ['得分', score.points],
                          ['命中率', total ? accuracy + '%' : '—'],
                          ['最佳连击', score.best],
                          ['精准击打', score.perfect],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <span>{k}</span>
                            <b>{v}</b>
                          </div>
                        ))}
                      </div>
                      {mode === 'song' && (
                        <details className="mobile-song">
                          <summary>歌曲段落与 MIDI</summary>
                          <SongPhrases lesson={lesson} />
                          <a href={demoMidiUrl} download>
                            下载编曲 MIDI ↗
                          </a>
                        </details>
                      )}
                    </>
                  )}
                </>
              )}
            </article>
          </div>
        )}
      </main>
      <dialog ref={library} className="dialog">
        <header>
          <h2>课程目录</h2>
          <button className="iconbtn" aria-label="关闭目录" onClick={() => library.current?.close()}>
            <Icon name="close" />
          </button>
        </header>
        <CourseList index={index} choose={choose} />
      </dialog>
      <dialog ref={mapping} className="dialog" aria-label="鼓位映射">
        <header>
          <h2>鼓位映射</h2>
          <button className="iconbtn" aria-label="关闭鼓位映射" onClick={() => mapping.current?.close()}>
            <Icon name="close" />
          </button>
        </header>
        <p>默认使用 TD-17 音符表。点选鼓位，再敲实体鼓学习编号。</p>
        <div className="device-status">
          <b>{midi.input?.name || '触屏与键盘'}</b>
          <button onClick={connect}>连接电子鼓</button>
        </div>
        {midi.error && <p role="alert">{midi.error}</p>}
        {midi.inputs.length > 1 && (
          <select
            aria-label="选择 MIDI 输入"
            value={midi.preferred}
            onChange={(e) => midi.setPreferred(e.target.value)}
          >
            {midi.inputs.map((port) => (
              <option key={port.id} value={port.id}>
                {port.name || 'MIDI 输入'}
              </option>
            ))}
          </select>
        )}
        <p className="midi-log">
          最近 MIDI　
          {lastMidi
            ? lastMidi.note +
              ' · 力度 ' +
              lastMidi.velocity +
              ' · ' +
              (kit[(bindings[lastMidi.note] ?? defaults[lastMidi.note]) as Lane]?.name ?? '未绑定')
            : '等待输入'}
        </p>
        <div className="mapping-list">
          {lanes.map((id) => (
            <button
              style={laneStyle(id)}
              className="mapping-row"
              aria-pressed={learning === id}
              key={id}
              onClick={() => {
                setLearning(id)
                setMessage('')
                setManual('')
              }}
            >
              <b>{kit[id].name}</b>
              <small>
                {Object.entries({ ...defaults, ...bindings })
                  .filter(([, v]) => v === id)
                  .map(([key]) => key)
                  .join(' / ') || '—'}
              </small>
            </button>
          ))}
        </div>
        <div className="mapping-foot">
          {learning && (
            <form onSubmit={submit}>
              <label htmlFor="note">{kit[learning].name} · 敲鼓或输入编号</label>
              <input
                id="note"
                type="number"
                min="0"
                max="127"
                required
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <button>绑定</button>
            </form>
          )}
          <footer>
            <span role="status">{message}</span>
            <button
              onClick={() => {
                setBindings({})
                setLearning(null)
                setMessage('已恢复 TD-17 映射')
              }}
            >
              恢复默认
            </button>
          </footer>
        </div>
      </dialog>
    </div>
  )
}
