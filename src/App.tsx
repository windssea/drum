import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { DrumStage } from './DrumStage'
import { enableAudio, playDrum, startBacking, stopBacking } from './audio'
import {
  BEAT, BPM, COUNT_IN, DURATION, HIT_WINDOW, LANES, STORAGE_KEY, applyJudgment, blankScore, chart,
  defaults, judgeHit, readBindings, type Hit, type Judgment, type Lane, type Mode, type Session,
} from './game'
import { useMidi, type MidiHit } from './useMidi'

type IconName = 'midi' | 'volume' | 'muted' | 'play' | 'stop' | 'tune' | 'close' | 'keyboard' | 'arrow' | 'bolt'
const iconPaths: Record<IconName, string> = {
  midi: 'M9 3v5m6-5v5M8 8h8v3a4 4 0 0 1-4 4v6m-4-10v1a4 4 0 0 0 4 3',
  volume: 'M4 10h4l4-4v12l-4-4H4zM16 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',
  muted: 'M4 10h4l4-4v12l-4-4H4zM16 10l4 4m0-4-4 4',
  play: 'm9 5 11 7-11 7z',
  stop: 'M6 6h12v12H6z',
  tune: 'M3 6h18M3 12h18M3 18h18M8 3v6m8 0v6m-6 0v6',
  close: 'm6 6 12 12M18 6 6 18',
  keyboard: 'M3 6h18v12H3zM7 10h.01M10 10h.01m4 0h.01m3 0h.01M7 14h.01m3 0h4m3 0h.01',
  arrow: 'm9 6 6 6-6 6',
  bolt: 'm13 2-8 12h6l-1 8 9-12h-6z',
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>
}

const feedbackText: Record<Judgment, string> = { perfect: '精准', good: '命中', miss: '漏击', free: '击中' }
const colors = Object.fromEntries(LANES.map(lane => [lane.id, lane.color]))
const laneStyle = (id: Lane) => ({ '--lane': colors[id] } as CSSProperties)
const secondsLabel = (seconds: number) => `00:${String(Math.max(0, Math.floor(seconds))).padStart(2, '0')}`

function App() {
  const reduced = Boolean(useReducedMotion())
  const session = useRef<Session>({ round: null, impacts: {} })
  const counter = useRef(0)
  const [mode, setMode] = useState<Mode>('free')
  const [phase, setPhase] = useState<'idle' | 'running' | 'finished'>('idle')
  const [sound, setSound] = useState(true)
  const [score, setScore] = useState(blankScore)
  const [time, setTime] = useState(0)
  const [lastHit, setLastHit] = useState<Hit | null>(null)
  const [lastMidi, setLastMidi] = useState<MidiHit | null>(null)
  const [bindings, setBindings] = useState(readBindings)
  const [bindingLane, setBindingLane] = useState<Lane | null>(null)
  const [mappingMessage, setMappingMessage] = useState('')
  const [manual, setManual] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings)) } catch { /* Storage can be unavailable in private browsing. */ }
  }, [bindings])

  const strikeLane = useCallback((lane: Lane, velocity: number, at: number, fromMidi = false) => {
    const round = session.current.round
    const result = round && !round.finished ? judgeHit(round, lane, at) : null
    const impact: Hit = { id: ++counter.current, lane, velocity, at: performance.now(), judgment: result?.judgment ?? 'free', offset: result?.offset }
    session.current.impacts[lane] = impact
    setLastHit(impact)
    if (result) setScore(current => applyJudgment(current, result.judgment))
    if (mode === 'free') setScore(current => applyJudgment(current, 'free'))
    if (!fromMidi) {
      enableAudio(!sound)
      playDrum(lane, velocity)
    }
  }, [mode, sound])

  function assign(note: number, lane: Lane) {
    setBindings(previous => ({ ...previous, [note]: lane }))
    setMappingMessage(`已把 ${note} 绑定到${LANES.find(item => item.id === lane)!.name}。`)
    setBindingLane(null)
    setManual('')
  }

  const midi = useMidi(event => {
    setLastMidi(event)
    if (dialog.current?.open) {
      if (bindingLane) assign(event.note, bindingLane)
      return
    }
    const lane = bindings[event.note] ?? defaults[event.note]
    if (lane) strikeLane(lane, event.velocity, event.at, true)
  })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || dialog.current?.open) return
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable]')) return
      const lane = LANES.find(item => `Key${item.key}` === event.code)
      if (!lane) return
      event.preventDefault()
      strikeLane(lane.id, 105, performance.now())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [strikeLane])

  useEffect(() => {
    if (!lastHit) return
    const handle = window.setTimeout(() => setLastHit(null), 720)
    return () => window.clearTimeout(handle)
  }, [lastHit])

  useEffect(() => {
    if (phase !== 'running') return
    let frame = 0
    let lastUpdate = -Infinity
    function tick(now: number) {
      const round = session.current.round
      if (!round) return
      const elapsed = now - round.startAt
      let misses = 0
      while (round.nextMiss < chart.length && chart[round.nextMiss].at + HIT_WINDOW + 24 < elapsed) {
        const index = round.nextMiss++
        if (!round.resolved.has(index)) misses++
      }
      if (misses) {
        setScore(current => ({ ...current, combo: 0, misses: current.misses + misses }))
        const lane = chart[round.nextMiss - 1].lane
        setLastHit({ id: ++counter.current, lane, at: now, velocity: 0, judgment: 'miss' })
      }
      if (now - lastUpdate >= 50) {
        setTime(elapsed)
        lastUpdate = now
      }
      if (elapsed >= DURATION + HIT_WINDOW + 25) {
        round.finished = true
        setTime(DURATION)
        setPhase('finished')
        stopBacking()
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [phase])

  useEffect(() => stopBacking, [])

  function reset(next: Mode) {
    stopBacking()
    session.current = { round: null, impacts: {} }
    setMode(next)
    setScore(blankScore)
    setLastHit(null)
    setTime(0)
    setPhase('idle')
  }

  function begin() {
    enableAudio(!sound)
    const startAt = performance.now() + COUNT_IN
    session.current = { round: { startAt, resolved: new Set(), nextMiss: 0, finished: false }, impacts: {} }
    setScore(blankScore)
    setTime(-COUNT_IN)
    setLastHit(null)
    setPhase('running')
    startBacking(startAt)
  }

  function openMapping() {
    setMappingMessage('')
    setBindingLane(null)
    setManual('')
    dialog.current?.showModal()
  }

  function submitMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!bindingLane || !/^\d{1,3}$/.test(manual)) return
    const note = Number(manual)
    if (note >= 0 && note <= 127) assign(note, bindingLane)
  }

  const running = phase === 'running'
  const countdown = running && time < 0 ? Math.min(4, Math.ceil(-time / BEAT)) : 0
  const progress = Math.min(1, Math.max(0, time / DURATION))
  const accuracy = score.hits + score.misses ? Math.round(score.hits / (score.hits + score.misses) * 100) : null
  const unbound = lastMidi && !(bindings[lastMidi.note] ?? defaults[lastMidi.note])

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <header className="topbar">
          <div className="brand" aria-label="Drum Lab">
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
            <span>DRUM<span className="brand-light"> LAB</span></span>
          </div>
          <div className="top-actions">
            <button className="icon-button sound-button" type="button" aria-label={sound ? '关闭声音' : '开启声音'} aria-pressed={sound} onClick={() => {
              setSound(!sound)
              enableAudio(sound)
            }}><Icon name={sound ? 'volume' : 'muted'} size={19} /></button>
            <motion.button className={`button connect ${midi.input ? 'is-connected' : ''}`} type="button" whileTap={{ scale: 0.96 }} onClick={() => { enableAudio(!sound); void midi.connect() }} disabled={midi.requesting}>
              <Icon name="midi" size={17} />
              <span>{midi.requesting ? '正在连接' : midi.input ? '电子鼓已连接' : '连接电子鼓'}</span>
            </motion.button>
          </div>
        </header>

        <main className="main-content">
          <div className="intro">
            <div>
              <h1>鼓点练习场<span className="title-period">.</span></h1>
              <p>用电子鼓、键盘或触屏一起打节奏。</p>
            </div>
            <div className="mode-switch" aria-label="游戏模式">
              {([{ id: 'free', title: '自由打击' }, { id: 'challenge', title: '节奏挑战' }] as const).map(item => (
                <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => { if (mode !== item.id) reset(item.id) }}>
                  {mode === item.id && <motion.span className="mode-highlight" layoutId="selected-mode" transition={{ type: 'spring', stiffness: 410, damping: 32 }} />}
                  <span className="mode-title">{item.title}</span>
                </button>
              ))}
            </div>
          </div>

          {midi.error && <div className="midi-notice" role="alert"><Icon name="midi" />{midi.error}</div>}
          <div className="play-layout">
            <section className="game-board" aria-label="节奏鼓轨">
              <div className="arena">
                <div className="arena-grid" aria-hidden="true" />
                <div className="arena-halo" aria-hidden="true" />
                <DrumStage session={session} reduced={reduced} />
                <div className="arena-toolbar">
                  <div className="arena-status"><span className={`status-light ${running ? 'live' : ''}`} /><span>{mode === 'free' ? '自由打击' : running ? '挑战进行中' : '节奏挑战'}</span></div>
                  {mode === 'challenge' && <span className="bpm"><span>{BPM}</span> BPM</span>}
                </div>
                <AnimatePresence mode="wait">
                  {mode === 'free' && !lastHit && (
                    <motion.div key="free-instruction" className="arena-prompt quiet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <span>敲一下，开始练习</span>
                    </motion.div>
                  )}
                  {mode === 'challenge' && phase !== 'running' && (
                    <motion.div key={phase} className="arena-prompt challenge-prompt" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                      <strong>{phase === 'finished' ? '挑战完成' : '30 秒节奏挑战'}</strong>
                      <span>{phase === 'finished' ? `${score.hits} 次命中 · 命中率 ${accuracy ?? 0}%` : '音符到达击打线时，敲对应的鼓。'}</span>
                      <motion.button type="button" className="button primary" onClick={begin} whileTap={{ scale: 0.95 }}><Icon name="play" size={17} />{phase === 'finished' ? '再来一次' : '开始挑战'}</motion.button>
                    </motion.div>
                  )}
                  {countdown > 0 && <motion.div key={`count-${countdown}`} className="countdown" initial={{ opacity: 0, scale: 1.22 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.93 }} aria-live="polite">{countdown}</motion.div>}
                  {countdown === 0 && lastHit && (mode === 'free' || running) && (
                    <motion.div key={lastHit.id} className={`hit-feedback feedback-${lastHit.judgment}`} style={laneStyle(lastHit.lane)} initial={{ opacity: 0, y: 12, scale: 0.91 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.16 }}>
                      <b>{mode === 'free' ? LANES.find(lane => lane.id === lastHit.lane)?.name : feedbackText[lastHit.judgment]}</b>
                      <span>{lastHit.offset !== undefined ? `${lastHit.offset >= 0 ? '+' : '−'}${Math.round(Math.abs(lastHit.offset))} ms` : mode === 'free' ? `力度 ${lastHit.velocity}` : lastHit.judgment === 'free' ? '未对准音符' : ''}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                {running && <button type="button" className="icon-button stop-button" aria-label="结束当前挑战" onClick={() => reset('challenge')}><Icon name="stop" size={14} /></button>}
                <div className="arena-foot" aria-hidden="true"><span>└</span><span>┘</span></div>
              </div>
              {mode === 'challenge' && (
                <div className="timeline">
                  <span>{secondsLabel(Math.max(0, time) / 1000)}</span>
                  <div className="progress-track" role="progressbar" aria-label="挑战进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><motion.div style={{ scaleX: progress }} /></div>
                  <span>00:30</span>
                </div>
              )}
              <div className="pads" aria-label="触屏鼓垫">
                {LANES.map(lane => (
                  <motion.button key={lane.id} type="button" className={`pad-button ${lastHit?.lane === lane.id && lastHit.judgment !== 'miss' ? 'pad-active' : ''}`} style={laneStyle(lane.id)} onPointerDown={event => {
                    if (event.button === 0) strikeLane(lane.id, 99, event.timeStamp)
                  }} onClick={event => {
                    if (event.detail === 0) strikeLane(lane.id, 99, performance.now())
                  }} whileTap={{ scale: 0.965 }} aria-label={`打击${lane.name}，键盘 ${lane.key}`}>
                    <span className="pad-text"><span className="pad-color" aria-hidden="true" /><span><strong>{lane.name}</strong><small>{lane.label}</small></span></span>
                    <kbd>{lane.key}</kbd>
                  </motion.button>
                ))}
              </div>
            </section>

            <aside className="side-panel" aria-label="表现和设备">
              <section className="score-card">
                <div className="panel-title"><h2>练习表现</h2><Icon name="bolt" size={17} /></div>
                <div className="score-feature">
                  <div>
                    <span className="metric-label">{mode === 'free' ? '击打次数' : '得分'}</span>
                    <motion.strong key={`${mode}-${mode === 'free' ? score.hits : score.points}`} initial={{ opacity: 0.73, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.13 }} data-testid="primary-score">{String(mode === 'free' ? score.hits : score.points).padStart(4, '0')}</motion.strong>
                  </div>
                  <div key={lastHit?.id ?? 0} className="meter" aria-hidden="true">{[6, 4, 7, 11, 6, 15, 19, 10, 15, 8, 13, 5, 9].map((height, index) => <i key={index} style={{ '--bar-height': `${height * 2}px`, '--bar-delay': `${index * 22}ms` } as CSSProperties} className={lastHit && lastHit.judgment !== 'miss' ? 'meter-moving' : ''} />)}</div>
                </div>
                <div className="score-meta">
                  <div><span>当前连击</span><strong>{mode === 'free' ? '—' : score.combo}</strong></div>
                  <div><span>命中率</span><strong>{mode === 'free' || accuracy === null ? '—' : `${accuracy}%`}</strong></div>
                </div>
              </section>

              <section className="input-card">
                <div className="panel-title"><h2>输入设备</h2><button className="icon-button mapping-button" aria-label="编辑鼓位映射" type="button" onClick={openMapping}><Icon name="tune" size={17} /></button></div>
                <div className="input-status"><Icon name={midi.input ? 'midi' : 'keyboard'} size={18} /><div><strong>{midi.input?.name || (midi.input ? 'MIDI 输入' : '键盘与触屏')}</strong><span>{midi.input ? 'MIDI · 已连接' : midi.access ? '正在等待 USB MIDI 设备' : '可直接开始练习'}</span></div></div>
                {midi.inputs.length > 1 && <select aria-label="选择 MIDI 输入" value={midi.preferred} onChange={event => midi.setPreferred(event.target.value)}>{midi.inputs.map(port => <option key={port.id} value={port.id}>{port.name || 'MIDI 输入'}</option>)}</select>}
                <div className="midi-readout">
                  <span>最近 MIDI</span>
                  <output>{lastMidi ? `${lastMidi.note} / ${lastMidi.velocity}` : '—'}</output>
                </div>
                {unbound && <button className="unbound" type="button" onClick={openMapping}>音符 {lastMidi.note} 尚未绑定 <Icon name="arrow" size={14} /></button>}
                <button type="button" className="mapping-link" onClick={openMapping}>鼓位映射 <Icon name="arrow" size={15} /></button>
              </section>
            </aside>
          </div>
        </main>
      </div>

      <dialog ref={dialog} className="mapping-dialog" aria-labelledby="mapping-title">
        <header className="dialog-header"><h2 id="mapping-title">鼓位映射</h2><button className="icon-button" type="button" aria-label="关闭鼓位映射" onClick={() => dialog.current?.close()}><Icon name="close" /></button></header>
        <p>选择鼓位，再敲对应的鼓，或手动输入 MIDI 编号。</p>
        <div className="mapping-list">
          {LANES.map(lane => {
            const mapped = Object.entries({ ...defaults, ...bindings }).filter(([, target]) => target === lane.id).map(([note]) => note)
            return <button key={lane.id} type="button" className="mapping-row" style={laneStyle(lane.id)} aria-pressed={bindingLane === lane.id} onClick={() => { setBindingLane(lane.id); setMappingMessage(''); setManual('') }}><span className="pad-color" /><strong>{lane.name}</strong><small>{mapped.join(' · ') || '未绑定'}</small><Icon name="arrow" size={15} /></button>
          })}
        </div>
        {bindingLane && <form className="mapping-form" onSubmit={submitMapping}><label htmlFor="note-number">MIDI 编号</label><input id="note-number" type="number" min="0" max="127" step="1" placeholder="0–127" required value={manual} onChange={event => setManual(event.target.value)} /><button className="button primary" type="submit">绑定</button></form>}
        <footer className="dialog-footer"><span role="status">{mappingMessage}</span><button type="button" className="quiet-button" onClick={() => { setBindings({}); setBindingLane(null); setMappingMessage('已恢复罗兰默认映射。') }}>恢复默认</button></footer>
      </dialog>
    </MotionConfig>
  )
}

export default App
