// TD-17 note assignments. Keep the played articulation even when a lesson accepts two zones.
type Voice =
  | 'kick'
  | 'snare'
  | 'rim'
  | 'stick'
  | 'hat'
  | 'open'
  | 'pedal'
  | 'tom'
  | 'crash'
  | 'ride'
  | 'bell'
  | 'aux'
function pad(
  name: string,
  label: string,
  key: string,
  notes: number[],
  voice: Voice,
  color: string,
  pitch = 0,
) {
  return { name, label, key, notes, voice, color, pitch }
}
const lime = '#dcfa79',
  blue = '#81d6ed',
  lilac = '#c1b0ff',
  coral = '#ffab86',
  gold = '#f1cf83'
export const kit = {
  hat: pad('闭镲', 'HI-HAT', 'J', [42], 'hat', lime),
  openHat: pad('开镲', 'OPEN HAT', 'U', [46], 'open', lime),
  pedalHat: pad('踩镲踏板', 'PEDAL', 'H', [44], 'pedal', lime),
  crash: pad('强音镲 1', 'CRASH 1', 'Q', [49], 'crash', gold),
  crash2: pad('强音镲 2', 'CRASH 2', 'W', [57], 'crash', gold, 1),
  ride: pad('叮叮镲', 'RIDE', 'I', [51], 'ride', gold),
  bell: pad('叮叮镲帽', 'BELL', 'O', [53], 'bell', gold),
  highTom: pad('高通鼓', 'TOM 1', 'Y', [48], 'tom', coral, 190),
  midTom: pad('中通鼓', 'TOM 2', 'G', [45], 'tom', coral, 148),
  floorTom: pad('落地通鼓', 'TOM 3', 'K', [43, 41], 'tom', coral, 106),
  snare: pad('军鼓', 'SNARE', 'F', [38], 'snare', lilac),
  kick: pad('底鼓', 'KICK', 'D', [36, 35], 'kick', blue),
  snareRim: pad('军鼓鼓边', 'RIMSHOT', 'R', [40], 'rim', lilac),
  crossStick: pad('横击鼓边', 'X-STICK', 'T', [37], 'stick', lilac),
  hatEdge: pad('闭镲镲边', 'HH EDGE', '', [22], 'hat', lime),
  openEdge: pad('开镲镲边', 'OPEN EDGE', '', [26], 'open', lime),
  highRim: pad('高通鼓边', 'T1 RIM', '', [50], 'rim', coral, 255),
  midRim: pad('中通鼓边', 'T2 RIM', '', [47], 'rim', coral, 205),
  floorRim: pad('落地鼓边', 'T3 RIM', '', [58], 'rim', coral, 155),
  crashEdge: pad('强音镲 1 边', 'C1 EDGE', '', [55], 'crash', gold),
  crash2Edge: pad('强音镲 2 边', 'C2 EDGE', '', [52], 'crash', gold, 1),
  rideEdge: pad('叮叮镲边', 'RIDE EDGE', '', [59], 'crash', gold),
  aux: pad('扩展鼓面', 'AUX HEAD', '', [27], 'aux', blue, 290),
  auxRim: pad('扩展鼓边', 'AUX RIM', '', [28], 'stick', blue, 640),
} as const
export type Lane = keyof typeof kit
export const lanes = Object.keys(kit) as Lane[]
export type Bindings = Partial<Record<number, Lane>>
export const defaults: Bindings = Object.fromEntries(
  lanes.flatMap((id) => kit[id].notes.map((note) => [note, id])),
)
export const STORAGE_KEY = 'drum-lab-midi-bindings-v2'
export function readBindings(): Bindings {
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    const saved = JSON.parse(current ?? localStorage.getItem('drum-lab-midi-bindings-v1') ?? '{}')
    const result: Bindings = {}
    for (const [key, value] of Object.entries(saved)) {
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) > 127 || typeof value !== 'string') continue
      const preset = defaults[Number(key)]
      let id = value
      if (!current && value === 'tom')
        id = preset && ['tom', 'rim'].includes(kit[preset].voice) ? preset : 'floorTom'
      if (!current && value === 'hat' && preset && ['hat', 'open', 'pedal'].includes(kit[preset].voice))
        id = preset
      if (!current && value === 'snare' && (preset === 'crossStick' || preset === 'snareRim')) id = preset
      if (Object.hasOwn(kit, id)) result[Number(key)] = id as Lane
    }
    return result
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
export type ChartNote = { lane: Lane; step: number; velocity?: number; dynamics?: 'soft' | 'strong' }
export const ACCENT_VELOCITY = 96
export type ArcadeTrack = {
  style: 'rail' | 'kitchen' | 'space' | 'garden' | 'factory'
  roots: readonly number[]
  cues: readonly { step: number; lane: Lane; note?: number }[]
  together: boolean
  inputOffset: number
}
export type Lesson = {
  id: string
  name: string
  category: string
  bpm: number
  bars: number
  division: 4 | 8 | 16
  guide: string
  notes: ChartNote[]
  sections?: { bar: number; name: string }[]
  song?: { audio: string; offsetMs: number }
  arcade?: ArcadeTrack
}
export type Target = ChartNote & { at: number }
export type Round = {
  startAt: number
  targets: Target[]
  resolved: Set<number>
  nextMiss: number
  finished: boolean
  window: number
  beat: number
  duration: number
  demo: boolean
  inputOffset: number
  chord?: { step: number; at: number }
  together: boolean
}
export function makeRound(lesson: Lesson, bpm: number, startAt: number, demo: boolean): Round {
  const beat = 60000 / bpm
  return {
    startAt,
    beat,
    duration: lesson.bars * 4 * beat,
    demo,
    finished: false,
    targets: lesson.notes.map((n) => ({ ...n, at: (n.step * beat) / 4 })),
    window: lesson.arcade ? Math.min(78, beat * 0.12) : Math.min(150, ((beat * 4) / lesson.division) * 0.48),
    inputOffset: lesson.arcade?.inputOffset ?? 0,
    together: lesson.arcade?.together ?? false,
    resolved: new Set(),
    nextMiss: 0,
  }
}
// Basic cymbal patterns allow bow or edge. Bell, hi-hat openness and all drum heads stay distinct.
const alternate: Partial<Record<Lane, Lane>> = {
  hatEdge: 'hat',
  openEdge: 'openHat',
  crashEdge: 'crash',
  crash2Edge: 'crash2',
}
export type Judgment = 'perfect' | 'good' | 'miss' | 'extra' | 'free'
export type Mistake = 'soft' | 'strong' | 'together'
export type Hit = {
  id: number
  lane: Lane
  at: number
  velocity: number
  judgment: Judgment
  offset?: number
  mistake?: Mistake
}
export type Session = { round: Round | null; impacts: Partial<Record<Lane, Hit>> }
export type Score = {
  points: number
  combo: number
  best: number
  hits: number
  misses: number
  extra: number
  perfect: number
}
export const blankScore: Score = { points: 0, combo: 0, best: 0, hits: 0, misses: 0, extra: 0, perfect: 0 }
export function applyJudgment(score: Score, judgment: Judgment): Score {
  if (judgment === 'free') return { ...score, hits: score.hits + 1 }
  if (judgment === 'miss') return { ...score, combo: 0, misses: score.misses + 1 }
  if (judgment === 'extra') return { ...score, combo: 0, extra: score.extra + 1 }
  const combo = score.combo + 1
  return {
    ...score,
    combo,
    hits: score.hits + 1,
    best: Math.max(combo, score.best),
    perfect: score.perfect + Number(judgment === 'perfect'),
    points: score.points + (judgment === 'perfect' ? 100 : 60) + Math.min(combo - 1, 30) * 2,
  }
}
export function judgeHit(round: Round, lane: Lane, at: number, velocity = 102) {
  const elapsed = at - round.startAt - round.inputOffset
  let closest = -1,
    offset = Infinity
  for (let i = round.nextMiss; i < round.targets.length; i++) {
    const target = round.targets[i]
    if (target.at > elapsed + round.window) break
    const difference = elapsed - target.at
    if (target.lane !== lane && target.lane !== alternate[lane]) continue
    if (
      !round.resolved.has(i) &&
      Math.abs(difference) <= round.window &&
      Math.abs(difference) < Math.abs(offset)
    ) {
      closest = i
      offset = difference
    }
  }
  if (closest < 0) return null
  const target = round.targets[closest]
  if (target.dynamics === 'strong' && velocity < ACCENT_VELOCITY)
    return { judgment: 'extra', mistake: 'strong' } as const
  if (target.dynamics === 'soft' && velocity >= ACCENT_VELOCITY)
    return { judgment: 'extra', mistake: 'soft' } as const
  if (round.together) {
    if (round.chord?.step === target.step && Math.abs(elapsed - round.chord.at) > 55)
      return { judgment: 'extra', mistake: 'together' } as const
    round.chord = { step: target.step, at: round.chord?.step === target.step ? round.chord.at : elapsed }
  }
  round.resolved.add(closest)
  return {
    offset,
    judgment: (Math.abs(offset) <= Math.min(55, round.window / 2) ? 'perfect' : 'good') as Judgment,
  }
}
