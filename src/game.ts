export const LANES = [
  { id: 'kick', name: '底鼓', label: 'KICK', key: 'D', color: '#66e1ff', notes: [35, 36] },
  { id: 'snare', name: '军鼓', label: 'SNARE', key: 'F', color: '#b69aff', notes: [37, 38, 40] },
  { id: 'hat', name: '踩镲', label: 'HI-HAT', key: 'J', color: '#e0fb6a', notes: [22, 26, 42, 44, 46] },
  { id: 'tom', name: '通鼓', label: 'TOMS', key: 'K', color: '#ff8d79', notes: [41, 43, 45, 47, 48, 50, 58] },
] as const

export type Lane = typeof LANES[number]['id']
export type Bindings = Partial<Record<number, Lane>>
export type Mode = 'free' | 'challenge'
export type Judgment = 'perfect' | 'good' | 'miss' | 'free'
export const BPM = 112
export const BEAT = 60_000 / BPM
export const DURATION = 30_000
export const COUNT_IN = 2_400
export const APPROACH = 2_120
export const HIT_WINDOW = 165
export const STORAGE_KEY = 'drum-lab-midi-bindings-v1'

export const defaults: Bindings = Object.fromEntries(
  LANES.flatMap(lane => lane.notes.map(note => [note, lane.id])),
)

export function readBindings(): Bindings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Bindings
    return Object.fromEntries(Object.entries(stored).filter(([key, lane]) => {
      const note = Number(key)
      return /^(0|[1-9]\d*)$/.test(key) && note <= 127 && LANES.some(item => item.id === lane)
    }))
  } catch {
    return {}
  }
}

export function decodeNote(data: Uint8Array | null) {
  if (!data || data.length !== 3) return null
  const [status, note, velocity] = data
  if ((status & 0xf0) !== 0x90 || velocity === 0) return null
  return { note, velocity, channel: (status & 15) + 1 }
}

const groove: readonly (readonly Lane[])[] = [
  ['kick', 'hat'], [], ['hat'], [], ['snare', 'hat'], [], ['hat'], [],
  ['kick', 'hat'], [], ['hat'], ['kick'], ['snare', 'hat'], [], ['hat'], [],
]
const fill: readonly (readonly Lane[])[] = [
  ['kick', 'hat'], [], ['hat'], [], ['snare', 'hat'], [], ['hat'], [],
  ['kick', 'hat'], [], ['hat'], [], ['snare'], ['tom'], ['tom'], ['tom'],
]

export const chart = Array.from({ length: 7 }, (_, phrase) => phrase % 2 === 0 ? groove : fill)
  .flatMap((pattern, phrase) => pattern.flatMap((lanes, step) => lanes.map(lane => ({
    lane, at: (phrase * 8 + step / 2) * BEAT,
  }))))

export type Hit = { id: number; lane: Lane; at: number; velocity: number; judgment: Judgment; offset?: number }
export type Round = { startAt: number; resolved: Set<number>; nextMiss: number; finished: boolean }
export type Score = { points: number; combo: number; best: number; hits: number; misses: number }
export type Session = { round: Round | null; impacts: Partial<Record<Lane, Hit>> }

export const blankScore: Score = { points: 0, combo: 0, best: 0, hits: 0, misses: 0 }

export function applyJudgment(score: Score, judgment: Judgment): Score {
  if (judgment === 'free') return { ...score, hits: score.hits + 1 }
  if (judgment === 'miss') return { ...score, combo: 0, misses: score.misses + 1 }
  const combo = score.combo + 1
  return {
    points: score.points + (judgment === 'perfect' ? 100 : 60) + Math.min(combo - 1, 30) * 2,
    hits: score.hits + 1,
    misses: score.misses,
    combo,
    best: Math.max(combo, score.best),
  }
}

export function judgeHit(round: Round, lane: Lane, at: number) {
  const elapsed = at - round.startAt
  let closest = -1
  let offset = HIT_WINDOW + 1
  for (let index = round.nextMiss; index < chart.length; index++) {
    const target = chart[index]
    if (target.at > elapsed + HIT_WINDOW) break
    const difference = elapsed - target.at
    if (target.lane === lane && !round.resolved.has(index) && Math.abs(difference) < Math.abs(offset)) {
      closest = index
      offset = difference
    }
  }
  if (closest === -1 || Math.abs(offset) > HIT_WINDOW) return null
  round.resolved.add(closest)
  return { offset, judgment: (Math.abs(offset) <= 65 ? 'perfect' : 'good') as Judgment }
}
