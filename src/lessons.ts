import { kit, type ChartNote, type Lane, type Lesson } from './game'

type Pattern = Partial<Record<Lane, number[]>>
const quarters = [0, 4, 8, 12],
  eighths = [0, 2, 4, 6, 8, 10, 12, 14]
const backbeat: Pattern = { snare: [4, 12], kick: [0, 8] }
function exercise(
  id: string,
  name: string,
  category: string,
  bpm: number,
  division: Lesson['division'],
  guide: string,
  pattern: (bar: number) => Pattern,
  bars = 4,
): Lesson {
  const notes: ChartNote[] = []
  for (let bar = 0; bar < bars; bar++) {
    for (const [lane, steps] of Object.entries(pattern(bar))) {
      for (const step of steps)
        notes.push({ lane: lane as Lane, step: bar * 16 + step, velocity: step % 4 === 0 ? 104 : 76 })
    }
  }
  return { id, name, category, bpm, division, bars, guide, notes: notes.sort((a, b) => a.step - b.step) }
}
export const lessons: Lesson[] = [
  exercise(
    'pulse',
    '底鼓与军鼓',
    '入门',
    65,
    4,
    '数「一、二、三、四」。第一、三拍踩底鼓，第二、四拍敲军鼓。',
    () => backbeat,
  ),
  exercise(
    'quarter',
    '四分踩镲',
    '入门',
    72,
    4,
    '右手每拍敲一次闭镲。第一、三拍和底鼓一起，第二、四拍和军鼓一起。',
    () => ({ ...backbeat, hat: quarters }),
  ),
  exercise(
    'eighth',
    '八分摇滚',
    '基础',
    80,
    8,
    '数「1 & 2 & 3 & 4 &」。右手保持八分闭镲，脚和军鼓沿用上一课的落点。',
    () => ({ ...backbeat, hat: eighths }),
  ),
  exercise(
    'syncopation',
    '反拍底鼓',
    '基础',
    86,
    8,
    '闭镲保持八分。在第三拍的「&」补一脚底鼓，接着在第四拍敲军鼓。',
    () => ({ ...backbeat, kick: [0, 8, 10], hat: eighths }),
  ),
  exercise(
    'open-hat',
    '开镲与脚合',
    '进阶',
    88,
    8,
    '第 2、4 小节在「4 &」松脚击开镲，下一小节第一拍用左脚合镲，同时踩底鼓。',
    (bar) => {
      const opens = bar === 1 || bar === 3
      const closes = bar === 2 || bar === 4
      return {
        ...backbeat,
        hat: eighths.filter((step) => !(opens && step === 14) && !(closes && step === 0)),
        openHat: opens ? [14] : [],
        pedalHat: closes ? [0] : [],
      }
    },
    6,
  ),
  exercise(
    'ride',
    '叮叮镲与镲帽',
    '进阶',
    92,
    8,
    '右手在镲面打八分，第二、四拍换到镲帽做重音。左手的军鼓与镲帽同拍。',
    () => ({
      ...backbeat,
      ride: [0, 2, 6, 8, 10, 14],
      bell: [4, 12],
    }),
  ),
  exercise(
    'fill',
    '通鼓过门',
    '提高',
    96,
    16,
    '第四小节前两拍保持律动。第三拍起依次扫过军鼓、高通、中通、落地通鼓，下一小节第一拍用强音镲落地。',
    (bar) => {
      if (bar === 3 || bar === 7)
        return {
          hat: [0, 2, 4, 6],
          snare: [4, 8, 9],
          highTom: [10, 11],
          midTom: [12, 13],
          floorTom: [14, 15],
          kick: [0],
        }
      return { ...backbeat, hat: bar === 4 ? eighths.slice(1) : eighths, crash: bar === 4 ? [0] : [] }
    },
    8,
  ),
  exercise(
    'paradiddle',
    '双音色复合跳',
    '提高',
    100,
    16,
    '右手打高通鼓，左手打军鼓。每两拍一组：右左右右、左右左左；第 1、3 拍同时踩底鼓。',
    () => ({
      highTom: [0, 2, 3, 5, 8, 10, 11, 13],
      snare: [1, 4, 6, 7, 9, 12, 14, 15],
      kick: [0, 8],
    }),
  ),
]
const base = (import.meta.env.VITE_SONG_BASE_URL || '/songs').replace(/\/+$/, '')
const songDir = base + '/frere-jacques'
export const songInfo = {
  id: 'frere-jacques',
  name: '两只老虎',
  category: '歌曲',
  bpm: 80,
  bars: 8,
  division: 8,
  guide: '先听四小节主题，再跟着旋律把踩镲加密。最后一小节第三拍，底鼓和强音镲一起收尾。',
} as const
export const demoMidiUrl = songDir + '/arrangement.mid'
export async function loadSong(signal: AbortSignal): Promise<Lesson> {
  const response = await fetch(songDir + '/chart.json', { signal })
  if (!response.ok) throw Error('谱面加载失败')
  const chart = await response.json()
  if (
    chart.version !== 1 ||
    !Number.isInteger(chart.bars) ||
    chart.bars < 1 ||
    chart.bars > 256 ||
    !Number.isFinite(chart.bpm) ||
    chart.bpm < 30 ||
    chart.bpm > 300 ||
    chart.meter?.[0] !== 4 ||
    chart.meter?.[1] !== 4 ||
    !Number.isFinite(chart.offsetMs) ||
    chart.offsetMs < 0 ||
    !Array.isArray(chart.notes) ||
    !chart.notes.length ||
    !chart.notes.every(
      (n: ChartNote) =>
        n &&
        Object.hasOwn(kit, n.lane) &&
        Number.isInteger(n.step) &&
        n.step >= 0 &&
        n.step < chart.bars * 16 &&
        (n.velocity === undefined || (Number.isInteger(n.velocity) && n.velocity > 0 && n.velocity <= 127)),
    )
  )
    throw Error('歌曲谱面格式有误')
  return {
    ...songInfo,
    bpm: chart.bpm,
    bars: chart.bars,
    notes: chart.notes.sort((a: ChartNote, b: ChartNote) => a.step - b.step),
    sections: Array.isArray(chart.sections)
      ? chart.sections.filter(
          (s: { bar: number; name: string }) =>
            s && Number.isInteger(s.bar) && s.bar >= 1 && s.bar <= chart.bars && typeof s.name === 'string',
        )
      : undefined,
    song: { audio: songDir + '/backing.flac', offsetMs: chart.offsetMs },
  }
}
