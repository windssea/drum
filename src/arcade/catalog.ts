import type { Lane } from '../game.ts'

export type ArcadeRule = 'pulse' | 'echo' | 'rest' | 'chord' | 'accent'
export type ArcadeScene = 'rail' | 'kitchen' | 'space' | 'garden' | 'factory'
export type ArcadeNote = { step: number; lane: Lane; accent?: true }
export type ArcadeCue = { step: number; lane: Lane; note?: number }
export type ArcadeGame = {
  id: string
  name: string
  world: string
  scene: ArcadeScene
  rule: ArcadeRule
  level: 1 | 2 | 3 | 4
  bpm: number
  bars: number
  guide: string
  result: string
  palette: readonly [string, string, string]
  notes: readonly ArcadeNote[]
  cues: readonly ArcadeCue[]
  music: readonly number[]
}

export const ruleNames: Record<ArcadeRule, string> = {
  pulse: '踩住拍点',
  echo: '听音复奏',
  rest: '辨音留白',
  chord: '同拍合击',
  accent: '轻重控制',
}

const worlds = {
  rail: '轨道邮局',
  kitchen: '节拍厨房',
  space: '低轨飞行社',
  garden: '拍点花园',
  factory: '声响制造厂',
} satisfies Record<ArcadeScene, string>

type Bars<T extends { step: number }> = readonly (readonly T[])[]

// A local step is one sixteenth note. Twenty rounds use explicit bar-by-bar arrangements.
function taps(lane: Lane, ...steps: number[]): ArcadeNote[] {
  return steps.map((step) => ({ step, lane }))
}

function accents(lane: Lane, light: number[], strong: number[]): ArcadeNote[] {
  return [...taps(lane, ...light), ...strong.map((step) => ({ step, lane, accent: true as const }))]
}

function signals(lane: Lane, note: number, ...steps: number[]): ArcadeCue[] {
  return steps.map((step) => ({ step, lane, note }))
}

function sequence<T extends { step: number }>(bars: Bars<T>): T[] {
  return bars
    .flatMap((bar, i) => bar.map((event) => ({ ...event, step: event.step + i * 16 })))
    .sort((a, b) => a.step - b.step)
}

function game(
  tags: [
    id: string,
    name: string,
    scene: ArcadeScene,
    rule: ArcadeRule,
    level: ArcadeGame['level'],
    bpm: number,
  ],
  guide: string,
  result: string,
  palette: ArcadeGame['palette'],
  music: readonly number[],
  notes: Bars<ArcadeNote>,
  cues: Bars<ArcadeCue> = [],
): ArcadeGame {
  const [id, name, scene, rule, level, bpm] = tags
  return {
    id,
    name,
    scene,
    rule,
    level,
    bpm,
    guide,
    result,
    palette,
    music,
    world: worlds[scene],
    bars: notes.length,
    notes: sequence(notes),
    cues: sequence(cues),
  }
}

const q = [0, 4, 8, 12]
const e = [0, 2, 4, 6, 8, 10, 12, 14]
const kick = (...steps: number[]) => taps('kick', ...steps)
const snare = (...steps: number[]) => taps('snare', ...steps)
const hat = (...steps: number[]) => taps('hat', ...steps)
const high = (...steps: number[]) => taps('highTom', ...steps)
const floor = (...steps: number[]) => taps('floorTom', ...steps)
const bell = (...steps: number[]) => taps('bell', ...steps)
const crash = (...steps: number[]) => taps('crash', ...steps)
const green = (...steps: number[]) => signals('kick', 81, ...steps)
const red = (...steps: number[]) => signals('kick', 45, ...steps)

export const arcadeGames: readonly ArcadeGame[] = [
  game(
    ['parcel-express', '邮包列车', 'rail', 'pulse', 1, 72],
    '底鼓踩第一、三拍，军鼓装第二、四拍的邮包。尾站只有三件，第四拍让它滑过去。',
    '最后一件邮包搭上了末班车。',
    ['#243b68', '#e6b872', '#f48e73'],
    [45, 45, 50, 45],
    [
      [...kick(0, 8), ...snare(4, 12)],
      [...kick(0, 8), ...snare(4, 12)],
      [...kick(0, 8), ...snare(4, 12)],
      [...kick(0, 8), ...snare(4)],
    ],
  ),
  game(
    ['pancake-turn', '煎饼翻面', 'kitchen', 'echo', 1, 74],
    '锅先敲半小节。到第三拍，拿军鼓原样回敲。听见两下贴得很近，就把间隔也学回来。',
    '煎饼翻了个面，落回锅里。',
    ['#713b3d', '#f4ce78', '#fff1af'],
    [48, 43, 45, 48],
    [snare(8), snare(8, 12), snare(8, 10, 12), snare(10, 12)],
    [
      signals('snare', 74, 0),
      signals('snare', 74, 0, 4),
      signals('snare', 74, 0, 2, 4),
      signals('snare', 74, 2, 4),
    ],
  ),
  game(
    ['signal-box', '月台红绿灯', 'rail', 'rest', 1, 76],
    '信号在第一、三拍响。高音是绿灯，下一拍踩底鼓。低音是红灯，把下一拍留空。',
    '该停的车停下了，该开的车开走了。',
    ['#233e4d', '#bde37a', '#f28779'],
    [43, 43, 46, 41, 43],
    [kick(4, 12), kick(12), kick(4), [], kick(4)],
    [green(0, 8), [...red(0), ...green(8)], [...green(0), ...red(8)], red(0, 8), [...green(0), ...red(8)]],
  ),
  game(
    ['duet-blooms', '合拍花圃', 'garden', 'chord', 1, 70],
    '左手军鼓、右手高通鼓。落在同一个拍点时两手一起敲。第三小节两朵花会轮流开。',
    '两朵花一起开过了。',
    ['#234943', '#efb8c5', '#e6d679'],
    [48, 45, 41, 43],
    [
      [...snare(0, 8), ...high(0, 8)],
      [...snare(4, 12), ...high(4, 12)],
      [...snare(0, 8), ...high(4, 12)],
      [...snare(0, 4, 8), ...high(0, 4, 8)],
    ],
  ),
  game(
    ['print-shop', '力度印刷厂', 'factory', 'accent', 1, 78],
    '每拍敲一次军鼓。有重音标记的拍子敲实，像盖清晰的邮戳。',
    '邮戳印得清清楚楚。',
    ['#3d3b61', '#f6b77e', '#f2ede1'],
    [46, 46, 51, 46],
    [
      accents('snare', [4, 8, 12], [0]),
      accents('snare', [0, 4, 8], [12]),
      accents('snare', [4, 12], [0, 8]),
      accents('snare', [0, 4], [8]),
    ],
  ),
  game(
    ['dough-dance', '面团舞步', 'kitchen', 'pulse', 2, 84],
    '军鼓维持第二、四拍，底鼓有时在第三拍后半拍加一下。最后一小节在第三拍做通鼓滚落。',
    '面团沾满了面粉，等着进炉。',
    ['#67434b', '#e6c87c', '#ffa497'],
    [50, 45, 48, 43, 46, 45],
    [
      [...kick(0, 8), ...snare(4, 12)],
      [...kick(0, 8, 10), ...snare(4, 12)],
      [...kick(0, 6, 8), ...snare(4, 12)],
      [...kick(0, 8, 14), ...snare(4, 12)],
      [...kick(0, 8, 10), ...snare(4, 12)],
      [...kick(0), ...snare(4), ...high(8, 10), ...floor(12)],
    ],
  ),
  game(
    ['satellite-echo', '卫星回声', 'space', 'echo', 2, 86],
    '高音是高通鼓，低音是底鼓。听完半小节的信号，从第三拍开始照原样发回去。',
    '信号跨过黑夜，抵达下一座卫星。',
    ['#25264d', '#96b9ff', '#e3d4fa'],
    [45, 48, 50, 52, 45],
    [
      [...high(8), ...kick(12)],
      [...kick(8), ...high(10, 12)],
      [...high(8, 12), ...kick(14)],
      [...kick(10, 14), ...high(12)],
      [...high(8, 10), ...kick(12)],
    ],
    [
      [...signals('highTom', 79, 0), ...signals('kick', 52, 4)],
      [...signals('kick', 52, 0), ...signals('highTom', 79, 2, 4)],
      [...signals('highTom', 79, 0, 4), ...signals('kick', 52, 6)],
      [...signals('kick', 52, 2, 6), ...signals('highTom', 79, 4)],
      [...signals('highTom', 79, 0, 2), ...signals('kick', 52, 4)],
    ],
  ),
  game(
    ['still-wind', '风停再种', 'garden', 'rest', 2, 84],
    '听到高音，等半拍敲一下高通鼓。低音是大风，原地等过去。信号开始挪到反拍了。',
    '种子落进了土里。',
    ['#30473c', '#ddcf8d', '#9edcca'],
    [48, 53, 41, 43, 48, 48],
    [high(2, 10), high(12), high(4, 8), high(6), [], high(2, 12)],
    [
      signals('highTom', 79, 0, 8),
      [...signals('highTom', 79, 10), ...signals('highTom', 43, 2)],
      [...signals('highTom', 79, 2, 6), ...signals('highTom', 43, 10)],
      [...signals('highTom', 79, 4), ...signals('highTom', 43, 0, 8)],
      signals('highTom', 43, 0, 4, 10),
      [...signals('highTom', 79, 0, 10), ...signals('highTom', 43, 4)],
    ],
  ),
  game(
    ['transfer-train', '接驳列车', 'rail', 'chord', 2, 90],
    '军鼓和底鼓像车厢轮流进站。遇到镲声落点，就用闭镲跟其中一边扣在同一拍。',
    '所有车厢都接上了。',
    ['#314361', '#cad2a4', '#f6a569'],
    [40, 45, 43, 47, 45, 40],
    [
      [...kick(0, 8), ...snare(4, 12), ...hat(0, 4, 12)],
      [...kick(0, 6, 8), ...snare(4, 12), ...hat(4, 6, 12)],
      [...kick(0, 8), ...snare(4, 12), ...hat(0, 8, 12)],
      [...kick(0, 10), ...snare(4, 12), ...hat(4, 10, 12)],
      [...kick(0, 8), ...snare(4, 12), ...hat(...q)],
      [...kick(0, 8, 12), ...snare(4, 12), ...hat(0, 4, 8)],
    ],
  ),
  game(
    ['watering-can', '浇壶轻重', 'garden', 'accent', 2, 87],
    '高通鼓的八分音符像小水滴。大水花会落在反拍，把标了重音的那滴敲响。',
    '水浇到花根，叶子甩出一圈小水珠。',
    ['#244f53', '#a4dd90', '#8ce0e7'],
    [48, 50, 45, 43, 48],
    [
      accents('highTom', [0, 4, 8, 10, 12], [2, 6]),
      accents('highTom', [0, 2, 4, 8, 12, 14], [6, 10]),
      accents('highTom', [0, 2, 6, 8, 10, 12], [4, 14]),
      accents('highTom', [2, 4, 6, 8, 10, 12], [0, 14]),
      accents('highTom', [0, 2, 4, 8, 10], [6, 12]),
    ],
  ),
  game(
    ['meteor-relay', '流星接力', 'space', 'pulse', 3, 98],
    '闭镲走八分，底鼓追流星，在第三拍后半拍插一脚。第五小节会换成镲帽接力。',
    '最后一颗流星擦过了接力标记。',
    ['#352956', '#9db4fb', '#ff9eb2'],
    [45, 45, 48, 46, 43, 43, 40, 45],
    [
      [...hat(...e), ...kick(0, 8, 10)],
      [...hat(...e), ...kick(0, 6, 10, 14)],
      [...hat(...e), ...kick(0, 8, 10)],
      [...hat(0, 2, 4, 6), ...kick(0, 8, 12), ...bell(8, 14)],
      [...bell(0, 4, 8, 12), ...kick(0, 6, 10)],
      [...bell(0, 4, 8, 12), ...kick(0, 8, 10, 14)],
      [...hat(...e), ...kick(0, 8, 10)],
      [...hat(0, 2, 4, 6), ...bell(8, 10, 12), ...kick(0, 8, 12)],
    ],
  ),
  game(
    ['oven-timer', '烤箱报时', 'kitchen', 'rest', 3, 96],
    '高铃响后等两拍，再敲军鼓开烤箱。听到低铃就继续等，别被两种铃混在一起骗到。',
    '烤箱开门的时机刚刚好。',
    ['#593335', '#ffb877', '#ffd98b'],
    [48, 48, 43, 46, 53, 41, 43, 48],
    [snare(8, 12), snare(10), snare(12), snare(14), snare(8, 10), [], snare(8, 14), snare(10, 12)],
    [
      [...signals('snare', 84, 0, 4), ...signals('snare', 47, 2)],
      [...signals('snare', 84, 2), ...signals('snare', 47, 0, 6)],
      [...signals('snare', 84, 4), ...signals('snare', 47, 2, 6)],
      [...signals('snare', 84, 6), ...signals('snare', 47, 0, 4)],
      [...signals('snare', 84, 0, 2), ...signals('snare', 47, 6)],
      signals('snare', 47, 0, 2, 4, 6),
      [...signals('snare', 84, 0, 6), ...signals('snare', 47, 4)],
      [...signals('snare', 84, 2, 4), ...signals('snare', 47, 0, 6)],
    ],
  ),
  game(
    ['robot-echo', '机械问答', 'factory', 'echo', 3, 100],
    '高低机器人要等到下一小节才收到回信。用高通鼓和落地通鼓回声，记住两下之间的空档。',
    '机器人听懂了你的回信。',
    ['#354755', '#8de0d0', '#c1e78b'],
    [45, 45, 48, 48, 40, 40, 43, 45],
    [
      [],
      [...high(0), ...floor(3), ...high(8, 10)],
      [],
      [...floor(2), ...high(4, 6), ...floor(12)],
      [],
      [...high(0, 2), ...floor(4), ...high(7), ...floor(12)],
      [],
      [...floor(0, 3), ...high(6), ...floor(8), ...high(12)],
    ],
    [
      [...signals('highTom', 78, 0, 8, 10), ...signals('floorTom', 54, 3)],
      [],
      [...signals('highTom', 78, 4, 6), ...signals('floorTom', 54, 2, 12)],
      [],
      [...signals('highTom', 78, 0, 2, 7), ...signals('floorTom', 54, 4, 12)],
      [],
      [...signals('highTom', 78, 6, 12), ...signals('floorTom', 54, 0, 3, 8)],
      [],
    ],
  ),
  game(
    ['garden-feet', '花园两脚', 'garden', 'chord', 3, 94],
    '底鼓和踩镲踏板合脚，军鼓和闭镲合手。打完开镲，下一小节第一拍同时踩合和踩底鼓。',
    '双脚把小花园的节奏踩稳了。',
    ['#344b3d', '#f0a9bc', '#d8e58f'],
    [53, 48, 50, 43, 41, 48],
    [
      [...kick(0, 8), ...snare(4, 12), ...taps('pedalHat', 0, 8), ...hat(4, 12)],
      [...kick(0, 8), ...snare(4, 12), ...taps('pedalHat', 0, 8), ...hat(4), ...taps('openHat', 12)],
      [...kick(0, 6, 8), ...taps('pedalHat', 0, 8), ...snare(4, 12), ...hat(4, 6, 12)],
      [...kick(0, 8), ...taps('pedalHat', 0, 8), ...snare(4, 12), ...hat(4, 12), ...taps('openHat', 14)],
      [...kick(0, 8), ...snare(4, 12), ...taps('pedalHat', 0, 8), ...hat(2, 4, 6, 10, 12, 14)],
      [...kick(0, 4, 8), ...taps('pedalHat', 0, 4, 8), ...snare(12), ...hat(12)],
    ],
  ),
  game(
    ['rain-press', '雨点压花', 'garden', 'accent', 3, 98],
    '底鼓守住第一、三拍。让军鼓的轻击垫在重音周围，尤其听第二小节第一拍后三下的位置。',
    '雨停时，花瓣上的水还亮着。',
    ['#324b61', '#d29df4', '#abdef3'],
    [41, 46, 45, 48, 43, 41],
    [
      [...kick(0, 8), ...accents('snare', [2, 6, 10, 14], [4, 12])],
      [...kick(0, 8), ...accents('snare', [1, 3, 10, 14], [2, 12])],
      [...kick(0, 8), ...accents('snare', [2, 6, 11, 14], [4, 12])],
      [...kick(0, 8), ...accents('snare', [2, 6, 7, 10, 12], [4, 14])],
      [...kick(0, 8), ...accents('snare', [2, 6, 10, 14], [4, 12])],
      [...kick(0, 8), ...accents('snare', [2, 6, 9, 10], [4, 12])],
    ],
  ),
  game(
    ['midnight-line', '午夜快线', 'rail', 'pulse', 4, 112],
    '叮叮镲保持八分，底鼓会抢在拍点前一格。听军鼓落回第二、四拍，第八小节用三只通鼓进站。',
    '午夜快线准时滑进了站台。',
    ['#272e55', '#b8c3fc', '#ff955f'],
    [45, 43, 48, 46, 41, 45, 40, 45],
    [
      [...taps('ride', ...e), ...kick(0, 7, 10), ...snare(4, 12)],
      [...taps('ride', ...e), ...kick(0, 3, 8, 11), ...snare(4, 12)],
      [...taps('ride', ...e), ...kick(0, 6, 7, 10), ...snare(4, 12)],
      [...taps('ride', ...e), ...kick(0, 7, 11, 14), ...snare(4, 12)],
      [...taps('ride', ...e), ...kick(0, 7, 10), ...snare(4, 12)],
      [...taps('ride', ...e), ...kick(0, 3, 8, 11), ...snare(4, 12)],
      [...taps('ride', ...e), ...kick(0, 5, 7, 10, 14), ...snare(4, 12)],
      [
        ...taps('ride', 0, 2, 4, 6),
        ...kick(0, 7),
        ...snare(4, 8),
        ...high(9, 10),
        ...taps('midTom', 11),
        ...floor(12, 13),
      ],
    ],
  ),
  game(
    ['kitchen-echo', '听锅识菜', 'kitchen', 'echo', 4, 108],
    '听三口锅的音高。低音用落地通鼓，中音用军鼓，高音用镲帽。每次听完一小节，下小节照原样回敲。',
    '三口锅都答上了。',
    ['#663c43', '#efa17e', '#f9d893'],
    [48, 48, 51, 51, 46, 46, 43, 48],
    [
      [],
      [...floor(0, 7), ...snare(2, 12), ...bell(4, 10)],
      [],
      [...bell(0, 6), ...floor(3, 12), ...snare(8, 10, 14)],
      [],
      [...snare(1, 8, 12), ...bell(4, 5), ...floor(7, 14)],
      [],
      [...floor(0, 5, 11), ...bell(2, 8, 12), ...snare(3, 9, 13)],
    ],
    [
      [...signals('floorTom', 52, 0, 7), ...signals('snare', 66, 2, 12), ...signals('bell', 84, 4, 10)],
      [],
      [...signals('bell', 84, 0, 6), ...signals('floorTom', 52, 3, 12), ...signals('snare', 66, 8, 10, 14)],
      [],
      [...signals('snare', 66, 1, 8, 12), ...signals('bell', 84, 4, 5), ...signals('floorTom', 52, 7, 14)],
      [],
      [
        ...signals('floorTom', 52, 0, 5, 11),
        ...signals('bell', 84, 2, 8, 12),
        ...signals('snare', 66, 3, 9, 13),
      ],
      [],
    ],
  ),
  game(
    ['mars-traffic', '火星着陆灯', 'space', 'rest', 4, 106],
    '右手闭镲守住每拍。低音只作警告，高音过半拍才踩底鼓。信号有时踩在自己的镲拍上。',
    '引擎减速，着陆支架接触了地面。',
    ['#653b4e', '#ffa88d', '#efdb94'],
    [50, 46, 45, 40, 50, 43, 45, 50],
    [
      [...hat(...q), ...kick(2, 10)],
      [...hat(...q), ...kick(4, 14)],
      [...hat(...q), ...kick(8, 10, 12)],
      [...hat(...q), ...kick(6)],
      hat(...q),
      [...hat(...q), ...kick(2, 4, 14)],
      [...hat(...q), ...kick(6, 12)],
      [...hat(...q), ...kick(8, 12)],
    ],
    [
      [...green(0, 8), ...red(4, 12)],
      [...green(2, 12), ...red(0, 8)],
      [...green(6, 8, 10), ...red(2, 12)],
      [...green(4), ...red(0, 8, 12)],
      red(0, 2, 6, 8, 12),
      [...green(0, 2, 12), ...red(6, 10)],
      [...green(4, 10), ...red(0, 8, 12)],
      [...green(6, 10), ...red(0, 4, 12)],
    ],
  ),
  game(
    ['power-grid', '合闸调频', 'factory', 'chord', 4, 108],
    '看清每次合闸需要的鼓。先练脚手双击，反拍会换到两个鼓一起，最后用底鼓加两只手合闸。',
    '灯从最后一个开关亮进了控制室。',
    ['#304151', '#b5ec93', '#ffdd85'],
    [48, 43, 46, 41, 50, 45, 43, 48],
    [
      [...kick(0, 6, 8), ...hat(0, 6, 8), ...snare(4, 12), ...high(4, 12)],
      [...kick(0, 8, 10), ...hat(0, 8), ...snare(4, 10, 12), ...high(4, 12)],
      [...kick(0, 2, 8), ...hat(0, 8), ...snare(4, 12), ...high(2, 4, 12)],
      [...kick(0, 7, 14), ...hat(0, 14), ...snare(4, 7, 12), ...high(4, 12)],
      [...kick(0, 8), ...hat(0, 8), ...snare(4, 10, 12), ...high(4, 10, 12)],
      [...kick(0, 6, 8), ...hat(0, 6), ...snare(4, 8, 12), ...high(4, 12)],
      [...kick(0, 8, 12), ...hat(0, 8), ...snare(4, 12), ...high(4, 12)],
      [...kick(0, 8, 12), ...hat(0, 8), ...snare(4, 12), ...high(4), ...crash(12)],
    ],
  ),
  game(
    ['zero-g-wave', '失重音浪', 'space', 'accent', 4, 108],
    '军鼓和高通鼓在十六分音符间交替，重音随小节挪动。底鼓踩稳第一、三拍，让重音浮出来。',
    '最后一记重音在舷窗外回荡。',
    ['#37264e', '#f7b2d5', '#a8c9ff'],
    [45, 48, 43, 40, 50, 46, 43, 45],
    [
      [...kick(0, 8), ...accents('snare', [0, 2, 8, 10, 12, 14], [4, 6]), ...high(1, 3, 5, 7, 11, 13)],
      [...kick(0, 8), ...snare(0, 2, 4, 6, 8, 10, 12, 14), ...accents('highTom', [1, 3, 5, 9, 13], [7, 11])],
      [...kick(0, 8), ...accents('snare', [2, 4, 6, 8, 10, 14], [0, 12]), ...high(1, 3, 5, 7, 11, 13)],
      [...kick(0, 8), ...snare(0, 2, 4, 6, 8, 10, 12, 14), ...accents('highTom', [1, 5, 7, 11, 13], [3, 9])],
      [...kick(0, 8), ...accents('snare', [0, 4, 6, 8, 12, 14], [2, 10]), ...high(1, 5, 7, 9, 13)],
      [...kick(0, 8), ...snare(0, 2, 4, 6, 8, 12, 14), ...accents('highTom', [1, 3, 7, 9, 11], [5, 13])],
      [...kick(0, 8), ...accents('snare', [0, 2, 4, 8, 10, 12], [6, 14]), ...high(1, 3, 5, 7, 11, 13)],
      [...kick(0, 8, 12), ...accents('snare', [0, 2, 4, 6, 8, 10], [12]), ...high(1, 3, 5, 7, 9, 11)],
    ],
  ),
]
