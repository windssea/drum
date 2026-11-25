import { useCallback, useEffect, useRef, useState } from 'react'
import { enableAudio, loadBacking, playDrum, prepareDrums, startBacking, stopBacking } from './audio'
import {
  applyJudgment,
  blankScore,
  judgeHit,
  inputTimestamp,
  makeRound,
  type Hit,
  type Judgment,
  type Lane,
  type Lesson,
  type Mistake,
  type Session,
} from './game'

export type Phase = 'idle' | 'loading' | 'running' | 'finished'
export function usePractice(sound: boolean, free: boolean) {
  const session = useRef<Session>({ round: null, impacts: {} })
  const pending = useRef<AbortController | null>(null)
  const serial = useRef(0)
  const [phase, setPhase] = useState<Phase>('idle'),
    [time, setTime] = useState(0)
  const [score, setScore] = useState(blankScore),
    [lastHit, setHit] = useState<Hit | null>(null)
  const [error, setError] = useState('')
  const reset = useCallback(() => {
    pending.current?.abort()
    pending.current = null
    stopBacking()
    session.current = { round: null, impacts: {} }
    setPhase('idle')
    setTime(0)
    setHit(null)
    setScore(blankScore)
    setError('')
  }, [])
  useEffect(() => {
    function hidden() {
      if (document.hidden && (pending.current || (session.current.round && !session.current.round.finished)))
        reset()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      pending.current?.abort()
      stopBacking()
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [reset])
  async function begin(lesson: Lesson, bpm: number, demo: boolean) {
    reset()
    const controller = new AbortController()
    pending.current = controller
    setPhase('loading')
    try {
      await enableAudio(!sound)
      const buffer = lesson.song ? await loadBacking(lesson.song.audio, controller.signal) : undefined
      if (controller.signal.aborted) return
      const round = makeRound(lesson, bpm, performance.now() + 120 + 240000 / bpm, demo)
      startBacking(round, lesson, buffer)
      session.current = { round, impacts: {} }
      prepareDrums(new Set(lesson.notes.map((note) => note.lane)))
      setTime(performance.now() - round.startAt)
      setPhase('running')
    } catch {
      if (!controller.signal.aborted) {
        reset()
        setError('音频未能加载。检查网络或浏览器声音权限后可重试。')
      }
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }
  const strike = useCallback(
    (lane: Lane, velocity: number, timestamp: number, fromMidi = false) => {
      const now = performance.now()
      const at = inputTimestamp(timestamp, now)
      if (!fromMidi) playDrum(lane, velocity, !sound)
      const round = session.current.round
      let judgment: Judgment = 'free'
      let offset: number | undefined
      let mistake: Mistake | undefined
      if (free) setScore((s) => applyJudgment(s, 'free'))
      else if (
        round &&
        !round.finished &&
        !round.demo &&
        at - round.inputOffset >= round.startAt - round.window &&
        at <= round.startAt + round.duration
      ) {
        const result = judgeHit(round, lane, at, velocity)
        judgment = result?.judgment ?? 'extra'
        offset = result?.offset
        mistake = result?.mistake
        setScore((s) => applyJudgment(s, judgment))
      }
      const hit = { id: ++serial.current, lane, at: now, velocity, judgment, offset, mistake }
      session.current.impacts[lane] = hit
      setHit(hit)
    },
    [free, sound],
  )
  useEffect(() => {
    if (!lastHit) return
    const task = setTimeout(() => setHit(null), 430)
    return () => clearTimeout(task)
  }, [lastHit])
  useEffect(() => {
    if (phase !== 'running') return
    let frame = 0,
      last = -Infinity
    const tick = (now: number) => {
      const round = session.current.round
      if (!round || round.finished) return
      const elapsed = now - round.startAt
      let missed = 0,
        lastMiss: Lane | undefined
      while (
        round.nextMiss < round.targets.length &&
        round.targets[round.nextMiss].at + round.window + 32 + round.inputOffset < elapsed
      ) {
        const i = round.nextMiss++
        if (!round.demo && !round.resolved.has(i)) {
          missed++
          lastMiss = round.targets[i].lane
        }
      }
      if (missed && lastMiss) {
        setScore((s) => ({ ...s, combo: 0, misses: s.misses + missed }))
        setHit({ id: ++serial.current, lane: lastMiss, at: now, velocity: 0, judgment: 'miss' })
      }
      if (elapsed >= round.duration) {
        round.finished = true
        setTime(round.duration)
        setPhase('finished')
        stopBacking()
        return
      }
      if (now - last >= 30) {
        last = now
        setTime(elapsed)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase])
  return { session, phase, time, score, lastHit, error, begin, reset, strike }
}
