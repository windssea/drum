import { useEffect, useRef, type RefObject } from 'react'
import { kit, type Lane, type Session } from '../game'
import type { ArcadeCue, ArcadeGame, ArcadeScene } from './catalog'

type Ink = CanvasRenderingContext2D
type Paint = string | CanvasGradient
const HEIGHT = 440
const FLOOR = 358
const OUTLINE = '#171c26'
const CREAM = '#fff7e3'
const TAU = Math.PI * 2
const scenery: Record<ArcadeScene, [sky: string, horizon: string, floor: string]> = {
  rail: ['#f0b89e', '#ffdab3', '#886c82'],
  kitchen: ['#79cabc', '#deddb1', '#437a75'],
  space: ['#272746', '#7867a7', '#434575'],
  garden: ['#add6da', '#edefc7', '#6e976c'],
  factory: ['#8e9caf', '#c6d2cf', '#647084'],
}

function roundRect(
  c: Ink,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: Paint,
  stroke?: string,
) {
  c.beginPath()
  if (typeof c.roundRect === 'function') c.roundRect(x, y, w, h, r)
  else c.rect(x, y, w, h)
  c.fillStyle = fill
  c.fill()
  if (stroke) {
    c.strokeStyle = stroke
    c.lineWidth = 4
    c.stroke()
  }
}

function oval(c: Ink, x: number, y: number, rx: number, ry: number, fill: Paint, stroke?: string) {
  c.beginPath()
  c.ellipse(x, y, rx, ry, 0, 0, TAU)
  c.fillStyle = fill
  c.fill()
  if (stroke) {
    c.strokeStyle = stroke
    c.lineWidth = 4
    c.stroke()
  }
}

function stroke(c: Ink, points: number[], color: string, width: number) {
  c.beginPath()
  c.moveTo(points[0], points[1])
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1])
  c.strokeStyle = color
  c.lineWidth = width
  c.lineJoin = 'round'
  c.lineCap = 'round'
  c.stroke()
}

function polygon(c: Ink, points: number[], fill: Paint, border?: string) {
  c.beginPath()
  c.moveTo(points[0], points[1])
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1])
  c.closePath()
  c.fillStyle = fill
  c.fill()
  if (border) {
    c.strokeStyle = border
    c.lineWidth = 4
    c.lineJoin = 'round'
    c.stroke()
  }
}

function backdrop(c: Ink, width: number, game: ArcadeGame) {
  const [sky, horizon, floor] = scenery[game.scene]
  const night = game.id === 'midnight-line'
  const glow = c.createLinearGradient(0, 0, 0, HEIGHT)
  glow.addColorStop(0, night ? '#20293f' : sky)
  glow.addColorStop(0.8, night ? '#7a6277' : horizon)
  c.fillStyle = glow
  c.fillRect(-width / 2, 0, width, HEIGHT)
  const space = game.scene === 'space'

  if (space || night) {
    for (let i = 0; i < 106; i++) {
      const x = (((i * 0.6180339) % 1) - 0.5) * width
      const y = ((i * 0.271828) % 1) * 325 + 12
      c.globalAlpha = 0.28 + (i % 5) * 0.14
      oval(c, x, y, i % 7 === 0 ? 3 : 1.5, i % 7 === 0 ? 3 : 1.5, CREAM)
    }
    c.globalAlpha = 1
  }

  if (game.scene === 'rail') {
    oval(c, width * 0.28, 113, 53, 53, night ? '#ffe7bf' : '#f7e986')
    polygon(
      c,
      [
        -width / 2,
        290,
        -333,
        158,
        -142,
        291,
        -26,
        213,
        155,
        308,
        342,
        164,
        width / 2,
        297,
        width / 2,
        383,
        -width / 2,
        383,
      ],
      '#867988',
    )
    polygon(
      c,
      [
        -width / 2,
        326,
        -310,
        246,
        -122,
        326,
        58,
        263,
        228,
        330,
        440,
        246,
        width / 2,
        301,
        width / 2,
        378,
        -width / 2,
        378,
      ],
      '#a78b93',
    )
    for (let x = -Math.ceil(width / 180) * 90; x < width / 2; x += 90) {
      roundRect(c, x, 265, 67, 91, 2, '#685a6d')
      polygon(c, [x - 8, 267, x + 32, 230, x + 75, 267], '#705d75')
      roundRect(c, x + 13, 283, 17, 21, 3, '#ffe5a1')
      roundRect(c, x + 38, 283, 17, 21, 3, '#d1af8f')
    }
  } else if (game.scene === 'kitchen') {
    for (let x = -Math.ceil(width / 130) * 65; x < width / 2; x += 65) {
      for (let y = 24; y <= FLOOR; y += 45) roundRect(c, x, y, 63, 43, 6, '#b8dbbd')
    }
    const windowX = Math.min(330, width * 0.3)
    roundRect(c, windowX - 75, 83, 150, 153, 20, '#e5c19a', OUTLINE)
    roundRect(c, windowX - 64, 95, 128, 130, 12, '#88cdd4', OUTLINE)
    oval(c, windowX + 24, 127, 14, 14, '#ffef9f')
    polygon(
      c,
      [windowX - 62, 183, windowX - 9, 154, windowX + 63, 187, windowX + 63, 221, windowX - 62, 221],
      '#8c9c70',
    )
    stroke(c, [windowX, 98, windowX, 222], '#e5c19a', 8)
    stroke(c, [windowX - 62, 161, windowX + 62, 161], '#e5c19a', 8)
    const shelf = -Math.min(330, width * 0.28)
    stroke(c, [shelf - 96, 231, shelf + 95, 231], '#674e43', 14)
    for (let i = 0; i < 3; i++) {
      roundRect(
        c,
        shelf - 73 + i * 55,
        174 + i * 8,
        36,
        50 - i * 8,
        8,
        ['#dd9f81', '#eadf98', '#83b9ba'][i],
        OUTLINE,
      )
      roundRect(c, shelf - 69 + i * 55, 177 + i * 8, 28, 8, 3, CREAM)
    }
  } else if (space) {
    oval(c, width * 0.24, 158, 67, 67, game.id === 'mars-traffic' ? '#df9a7c' : '#aaa2db')
    c.save()
    c.translate(width * 0.24, 167)
    c.rotate(-0.2)
    c.beginPath()
    c.ellipse(0, 0, 107, 27, 0, 0, TAU)
    c.strokeStyle = '#ebc3c6'
    c.lineWidth = 8
    c.stroke()
    c.restore()
    oval(c, -width * 0.33, 105, 17, 17, '#e2d6dd')
    polygon(
      c,
      [
        -width / 2,
        306,
        -321,
        265,
        -179,
        307,
        22,
        274,
        236,
        323,
        width / 2,
        267,
        width / 2,
        399,
        -width / 2,
        399,
      ],
      '#716e9e',
    )
  } else if (game.scene === 'garden') {
    oval(c, width * 0.24, 109, 51, 51, '#fbeb9c')
    for (let i = 0; i < 4; i++) {
      const x = (i % 2 ? 1 : -1) * (width * 0.33 + i * 16)
      const y = 109 + i * 22
      oval(c, x, y, 55, 17, '#ebefd8')
      oval(c, x - 20, y - 10, 18, 15, '#ebefd8')
      oval(c, x + 9, y - 14, 23, 18, '#ebefd8')
    }
    oval(c, width * 0.3, 343, width * 0.38, 87, '#a7b986')
    oval(c, -width * 0.33, 369, width * 0.46, 111, '#88ae82')
    for (let i = 0; i < 19; i++) {
      const x = (((i * 0.618033) % 1) - 0.5) * width
      if (Math.abs(x) < 175) continue
      const y = 315 + (i % 8) * 7
      stroke(c, [x - 6, y - 10, x, y, x + 4, y - 16], '#567f63', 3)
    }
  } else {
    for (let x = -Math.ceil(width / 225) * 112; x < width / 2; x += 112) {
      roundRect(c, x, 77, 99, 133, 10, '#596d7e', '#4e6172')
      roundRect(c, x + 7, 84, 85, 113, 5, '#b9c9bd')
      stroke(c, [x + 49, 86, x + 49, 196], '#758a92', 4)
      stroke(c, [x + 7, 137, x + 92, 137], '#758a92', 4)
    }
    stroke(c, [-width / 2, 254, width / 2, 254], '#4d5e72', 23)
    stroke(c, [-width / 2, 249, width / 2, 249], '#899ba3', 9)
    for (let x = -320; x <= 330; x += 107) {
      roundRect(c, x, 240, 14, 28, 4, '#c3c2a9')
    }
  }

  roundRect(c, -width / 2, FLOOR, width, 84, 0, floor)
  stroke(c, [-width / 2, FLOOR, width / 2, FLOOR], '#292b3b', 5)
  if (game.scene === 'rail' || game.scene === 'factory') {
    for (let x = -Math.ceil(width / 52) * 26; x < width / 2; x += 52)
      stroke(c, [x, 381, x + 18, 413], '#494254', 11)
    stroke(c, [-width / 2, 383, width / 2, 383], '#d1b7ac', 8)
    stroke(c, [-width / 2, 407, width / 2, 407], '#d1b7ac', 7)
  }

  // Fixed stipple is drawn into an opaque backdrop once per resize.
  c.fillStyle = '#292436'
  c.globalAlpha = 0.08
  for (let i = 0; i < 1850; i++) {
    const x = (((i * 0.618034) % 1) - 0.5) * width
    const y = ((i * 0.4142136) % 1) * HEIGHT
    c.fillRect(x, y, 1.8, 1.4)
  }
  c.globalAlpha = 1
  const vignette = c.createLinearGradient(0, 0, 0, HEIGHT)
  vignette.addColorStop(0, '#181e3650')
  vignette.addColorStop(0.28, '#181e3600')
  vignette.addColorStop(0.73, '#181e3600')
  vignette.addColorStop(1, '#181e3660')
  c.fillStyle = vignette
  c.fillRect(-width / 2, 0, width, HEIGHT)
}

type Moment = {
  beat: number
  lift: number
  hit: number
  charge: number
  success: number
  color: string
  lane?: Lane
  pads: readonly Lane[]
  blocked: boolean
}

function eyes(c: Ink, x: number, y: number, spread: number, hit: number) {
  for (const side of [-1, 1]) {
    oval(c, x + side * spread, y, 4, hit > 0.5 ? 3 : 7, OUTLINE)
    oval(c, x + side * spread + 1, y - 2, 1.4, 1.4, CREAM)
  }
  if (hit > 0.27) oval(c, x, y + 10, 5, 5, OUTLINE)
  else stroke(c, [x - 5, y + 11, x, y + 13, x + 5, y + 11], OUTLINE, 3)
}

function wheel(c: Ink, x: number, y: number, radius: number, beat: number) {
  oval(c, x, y, radius, radius, '#2d2d3d', OUTLINE)
  oval(c, x, y, radius * 0.66, radius * 0.66, '#e2bfa0')
  for (let i = 0; i < 3; i++) {
    const a = (TAU * i) / 3 + beat
    stroke(c, [x, y, x + Math.cos(a) * radius * 0.61, y + Math.sin(a) * radius * 0.61], OUTLINE, 4)
  }
  oval(c, x, y, radius * 0.24, radius * 0.24, '#e88066', OUTLINE)
}

function drawRail(c: Ink, game: ArcadeGame, m: Moment) {
  const courier = game.id === 'parcel-express'
  const transfer = game.id === 'transfer-train'
  const switchTracks = game.id === 'midnight-line'
  const [paint, detail] = game.palette
  const thrust = m.lift * 22 + Math.sin(m.beat * TAU) * 3
  oval(c, 0, 365, 197, 19, '#32283977')

  c.save()
  c.translate(37 + thrust, 302)
  const engine = game.id === 'midnight-line' ? '#494f88' : paint
  wheel(c, -62, 51, 23, m.beat + m.hit)
  wheel(c, 12, 51, 23, m.beat + m.hit)
  wheel(c, 77, 51, 17, m.beat + m.hit)
  roundRect(c, -86, -34, 116, 74, 11, engine, OUTLINE)
  oval(c, 66, 3, 47, 34, detail, OUTLINE)
  roundRect(c, 2, -27, 62, 59, 11, detail, OUTLINE)
  roundRect(c, -78, -88, 68, 68, 12, engine, OUTLINE)
  roundRect(c, -67, -73, 45, 31, 6, '#faeaca', OUTLINE)
  eyes(c, -44, -58, 9, m.hit)
  roundRect(c, -88, -95, 86, 13, 6, '#242a39', OUTLINE)
  roundRect(c, 65, -54, 20, 28, 3, '#323749', OUTLINE)
  roundRect(c, 59, -61, 32, 10, 4, '#3b4352', OUTLINE)
  polygon(c, [84, 18, 125, 44, 84, 44], '#edc178', OUTLINE)
  roundRect(c, -92, 25, 179, 12, 4, '#e9c27c', OUTLINE)
  oval(c, 106, 1, 9 + m.hit * 7, 9 + m.hit * 7, '#fff0a6', OUTLINE)
  for (let i = 0; i < 3; i++) {
    const f = (Math.max(m.beat, 0) * 0.38 + i / 3) % 1
    c.globalAlpha = (0.58 + m.hit * 0.32) * (1 - f)
    oval(c, 77 - f * 58, -64 - f * 58, 9 + f * 18, 7 + f * 13, CREAM)
  }
  c.globalAlpha = 1
  c.restore()

  c.save()
  c.translate(-140 + (transfer ? thrust * 2.5 : thrust), 325)
  wheel(c, -33, 29, 16, m.beat)
  wheel(c, 31, 29, 16, m.beat)
  stroke(c, [47, 11, transfer ? 96 : 86, 11], OUTLINE, 8)
  roundRect(c, -58, -16, 112, 32, 6, '#f1b97d', OUTLINE)
  if (courier) {
    for (let i = 0; i < 3; i++) {
      const y = i === (m.success + 2) % 3 ? m.lift * 62 : m.charge * 8
      roundRect(c, i * 34 - 50, -45 - y, 31, 30, 4, ['#ce8064', CREAM, '#a8afbb'][i], OUTLINE)
      stroke(c, [i * 34 - 36, -43 - y, i * 34 - 36, -17 - y], '#996f54', 4)
    }
  } else if (transfer) {
    roundRect(c, -51, -49, 98, 37, 8, paint, OUTLINE)
    roundRect(c, -40, -41, 77, 17, 5, '#f9e7b8', OUTLINE)
  } else {
    const point = switchTracks ? (m.success % 2 === 0 ? -10 : 17) : m.hit * 20
    stroke(c, [-38, -29, -2, -48, 28, -29], '#313749', 6)
    stroke(c, [-12, -40, point, -64 - m.lift * 12], '#ffe4a6', 6)
  }
  c.restore()

  c.save()
  c.translate(-195, 259)
  stroke(c, [0, 90, 0, -3], '#34394a', 12)
  roundRect(c, -17, -41, 34, 63, 12, '#34394a', OUTLINE)
  oval(c, 0, -25, 9, 9, m.blocked ? '#ff7a72' : '#624d5b')
  oval(c, 0, 5, 9, 9, m.blocked ? '#405553' : '#a2eb9f')
  c.restore()
}

function oven(c: Ink, m: Moment, paint: string) {
  roundRect(c, -102, 133, 204, 184, 21, '#e5a06f', OUTLINE)
  roundRect(c, -87, 145, 174, 36, 7, '#815a63', OUTLINE)
  for (const x of [-61, -29, 29, 61]) {
    oval(c, x, 163, 10, 10, CREAM, OUTLINE)
    stroke(c, [x, 163, x + 4, 158], OUTLINE, 2)
  }
  roundRect(c, -86, 194, 172, 105, 11, '#493941', OUTLINE)
  oval(c, 0, 248, 48, 15, '#dc9961', OUTLINE)
  stroke(c, [-50, 247, 50, 247], CREAM, 4)
  const door = m.lift * 67
  polygon(c, [-81, 200 + door, 81, 200 + door, 93, 296 + door * 0.15, -93, 296 + door * 0.15], paint, OUTLINE)
  stroke(c, [-54, 221 + door * 0.85, 54, 221 + door * 0.85], '#fbe9ac', 11)
  eyes(c, 0, 261 + door * 0.44, 20, m.hit)
}

function pan(c: Ink, x: number, y: number, paint: string) {
  stroke(c, [x + 55, y + 5, x + 97, y - 12], OUTLINE, 15)
  stroke(c, [x + 62, y + 2, x + 91, y - 9], '#7e6474', 7)
  oval(c, x, y + 9, 65, 21, paint, OUTLINE)
  oval(c, x, y, 65, 20, '#3c4956', OUTLINE)
  oval(c, x - 5, y - 2, 50, 12, '#62545b')
}

function drawKitchen(c: Ink, game: ArcadeGame, m: Moment) {
  const [paint, detail] = game.palette
  roundRect(c, -240, 310, 480, 32, 14, '#a36554', OUTLINE)
  roundRect(c, -240, 302, 480, 13, 7, '#f5cf98', OUTLINE)
  roundRect(c, -214, 341, 428, 57, 9, '#ad7564', OUTLINE)
  stroke(c, [-174, 361, 173, 361], '#df9d77', 6)
  if (game.id === 'oven-timer') {
    oven(c, m, paint)
    return
  }
  if (game.id === 'kitchen-echo') {
    for (let i = 0; i < 3; i++) {
      const x = i * 113 - 113
      const index =
        m.lane === 'kick' || m.lane === 'floorTom' ? 0 : m.lane === 'hat' || m.lane === 'highTom' ? 2 : 1
      const lift = i === index ? 49 * m.lift + 12 * m.charge : 0
      stroke(c, [x - 47, 263, x - 60, 251], OUTLINE, 9)
      stroke(c, [x + 47, 263, x + 60, 251], OUTLINE, 9)
      roundRect(c, x - 47, 244, 94, 56, 14, [paint, detail, '#f7c67c'][i], OUTLINE)
      oval(c, x, 245, 46, 15, '#754c5d', OUTLINE)
      oval(c, x, 236 - lift, 49, 13, '#e2aa81', OUTLINE)
      oval(c, x, 226 - lift, 11, 6, '#ae7d77', OUTLINE)
      eyes(c, x, 271, 12, lift > 16 ? m.hit : 0)
    }
    return
  }
  if (game.id === 'dough-dance') {
    const press = m.hit * 19
    const stretch = m.lift * 28
    oval(c, 0, 298, 115, 12, '#93716b', OUTLINE)
    oval(c, 0, 294 - (48 - press) / 2, 88 + press, 40 - press * 0.76 + stretch * 0.45, '#f8d786', OUTLINE)
    eyes(c, 0, 270 + press * 0.55, 20 + press * 0.3, m.hit)
    c.save()
    c.translate(0, 225 - m.charge * 56 + press * 2)
    c.rotate(0.1 + Math.sin(m.beat * Math.PI) * 0.07)
    stroke(c, [-109, 0, 109, 0], '#87636b', 14)
    roundRect(c, -79, -16, 158, 32, 12, paint, OUTLINE)
    roundRect(c, -70, -12, 137, 6, 3, '#fff3b89c')
    c.restore()
    return
  }
  c.save()
  c.translate(0, m.hit * 9)
  pan(c, -5, 281, detail)
  c.restore()
  c.save()
  c.translate(-8 - m.lift * 20, 266 - m.lift * 112 - m.charge * 9)
  c.rotate(m.lift * 0.35 - m.hit * 0.25)
  const height = 21 - m.lift * 9
  oval(c, 0, 7, 51, height, '#a66e56', OUTLINE)
  oval(c, 0, 0, 52, height, '#e9a15f', OUTLINE)
  oval(c, 0, -3, 42, height * 0.65, '#f9c67d')
  roundRect(c, -11, -12, 23, 13, 5, '#ffe9ac')
  eyes(c, 0, 4, 17, m.hit)
  c.restore()
}

function asteroid(c: Ink, x: number, y: number, size: number, angle: number, fill: string) {
  c.save()
  c.translate(x, y)
  c.rotate(angle)
  c.scale(size, size)
  polygon(c, [-29, -16, -12, -27, 17, -25, 32, -4, 20, 22, -7, 28, -30, 12], fill, OUTLINE)
  oval(c, -9, -7, 10, 7, '#59506e', OUTLINE)
  oval(c, 17, 8, 5, 4, '#716482')
  c.restore()
}

function drawSpace(c: Ink, game: ArcadeGame, m: Moment) {
  const [paint, detail] = game.palette
  const moon = '#efbbc4'
  const drift = Math.sin((m.beat * Math.PI) / 2)
  if (game.id === 'meteor-relay') {
    for (let i = 0; i < 3; i++) {
      const x = -151 + i * 147
      const p = ((((m.beat + i * 1.5) % 4) + 4) % 4) / 4
      const uplift = m.lift * (m.success % 3 === i ? 82 : 17)
      stroke(c, [x - 42, 197 - 101 * p - uplift, x - 19, 225 - 101 * p - uplift], '#ebacb79e', 7)
      asteroid(c, x - 22 + p * 33, 269 - 101 * p - uplift, 1 + 0.17 * i, drift + i, [paint, detail, moon][i])
      roundRect(c, x - 42, 324, 83, 13, 5, m.charge > 0.55 ? m.color : '#8fabc1', OUTLINE)
    }
    return
  }
  if (game.id === 'satellite-echo') {
    c.save()
    c.translate(0, 242 - drift * 8 - m.lift * 31)
    c.rotate(-0.13 + drift * 0.11)
    stroke(c, [-143, 16, 142, 16], OUTLINE, 10)
    for (const x of [-150, 67]) {
      roundRect(c, x, -18, 85, 67, 5, '#6879c4', OUTLINE)
      for (let i = 1; i < 4; i++) stroke(c, [x + 20 * i, -15, x + 20 * i, 45], '#8ca9db', 3)
      stroke(c, [x + 2, 16, x + 82, 16], '#8ca9db', 3)
    }
    roundRect(c, -47, -51, 94, 107, 17, paint, OUTLINE)
    roundRect(c, -29, -35, 58, 46, 9, '#f2d6cb', OUTLINE)
    eyes(c, 0, -15, 12, m.hit)
    oval(c, 0, 32, 12, 9, detail, OUTLINE)
    stroke(c, [10, -50, 21, -78], OUTLINE, 7)
    oval(c, 22, -79, 9, 9, m.color, OUTLINE)
    for (let i = 0; i < 3; i++) {
      const p = m.hit * 22 + i * 13 + 11
      c.beginPath()
      c.arc(22, -79, p, -0.9 * Math.PI, -0.1 * Math.PI)
      c.strokeStyle = m.color
      c.lineWidth = 2.5
      c.globalAlpha = (0.19 + m.hit * 0.67 + m.charge * 0.3) / (1 + i * 0.28)
      c.stroke()
    }
    c.restore()
    return
  }
  if (game.id === 'mars-traffic') {
    oval(c, 0, 351, 125, 15, '#2b2747af')
    roundRect(c, -103, 329, 206, 21, 7, '#8796b4', OUTLINE)
    for (let i = -2; i <= 2; i++) oval(c, i * 34, 338, 5, 4, m.blocked ? '#ff8c87' : '#b9f1b5')
    const y = 271 + drift * 11 - m.lift * 38
    polygon(c, [-71, y + 6, -24, y - 14, 21, y - 14, 71, y + 6, 55, y + 42, -54, y + 42], paint, OUTLINE)
    oval(c, 0, y, 49, 35, '#adbfe4', OUTLINE)
    eyes(c, 0, y - 6, 12, m.hit)
    oval(c, 0, y + 18, 71, 13, detail, OUTLINE)
    for (const x of [-40, 40]) {
      polygon(c, [x - 11, y + 41, x + 12, y + 41, x, y + 51 + m.hit * 15], '#ffc474', OUTLINE)
    }
    return
  }
  const y = 273 - drift * 16 - m.lift * 99
  oval(c, 0, 348, 103 - m.lift * 31, 10, '#322b50ac')
  c.save()
  c.translate(0, y)
  c.rotate(drift * 0.18 + m.lift * 0.42)
  c.scale(1 + m.hit * 0.17, 1 - m.hit * 0.18)
  roundRect(c, -83, 30, 47, 19, 9, detail, OUTLINE)
  roundRect(c, 37, 30, 47, 19, 9, detail, OUTLINE)
  oval(c, 0, 0, 69, 59, paint, OUTLINE)
  oval(c, 0, -5, 48, 41, '#cad8e5', OUTLINE)
  oval(c, -5, 2, 33, 24, '#d9b49f')
  eyes(c, -5, 0, 13, m.hit)
  roundRect(c, -18, 47, 37, 11, 4, detail, OUTLINE)
  c.restore()
}

function flower(c: Ink, x: number, y: number, size: number, open: number, petal: string, beat: number) {
  const swell = size * (0.6 + open * 0.38)
  const wiggle = Math.sin(beat * TAU * 0.26) * 8
  stroke(c, [x, y, x + wiggle * 0.46, y - size * 0.55, x + wiggle, y - size], '#42674d', 6)
  oval(c, x + 12, y - size * 0.4, 14, 5, '#7dad68', '#42674d')
  const top = y - size
  for (let i = 0; i < 5; i++) {
    const angle = (TAU * i) / 5
    oval(
      c,
      x + wiggle + Math.cos(angle) * swell * 0.22,
      top + Math.sin(angle) * swell * 0.22,
      swell * 0.21,
      swell * 0.21,
      petal,
      OUTLINE,
    )
  }
  oval(c, x + wiggle, top, 9, 9, '#f3bd63', OUTLINE)
}

function drawGarden(c: Ink, game: ArcadeGame, m: Moment) {
  const [paint, detail] = game.palette
  const y = 327
  const wind = game.id === 'still-wind'
  const pair = game.id === 'duet-blooms'
  const press = game.id === 'rain-press'
  const pedal = game.id === 'garden-feet'
  oval(c, 0, 365, 193, 23, '#374c41a6')
  roundRect(c, -172, y - 3, 344, 38, 16, '#ba8564', OUTLINE)
  oval(c, 0, y - 3, 171, 23, '#5f594f', OUTLINE)
  oval(c, 0, y - 7, 148, 13, '#887356')
  for (const x of [-116, -47, 47, 116]) {
    const left = pair ? m.pads.includes('snare') : m.pads.includes('kick')
    const right = pair ? m.pads.includes('highTom') : m.pads.some((pad) => pad !== 'kick')
    const active = x < 0 ? left : right
    const growth = (m.success % 12) * 0.6 + m.lift * (active ? 28 : 3)
    flower(
      c,
      x,
      y - 7,
      55 + Math.abs(x) * 0.1 + growth,
      pair && m.hit > 0.5 ? 1 : m.lift,
      x > 0 ? paint : detail,
      m.beat + x * 0.003,
    )
  }
  if (press || wind) {
    const clouds = m.blocked ? '#677781' : '#e4eae1'
    const cloudX = wind ? Math.sin(m.beat * 0.75) * 40 : 0
    oval(c, cloudX, 151, 99, 28, clouds, OUTLINE)
    oval(c, cloudX - 28, 136, 48, 27, clouds)
    oval(c, cloudX + 18, 130, 42, 36, clouds)
    eyes(c, cloudX, 148, 15, m.hit)
    if (press || m.blocked) {
      for (let i = 0; i < 7; i++) {
        const phase = (((m.beat * 0.39 + i / 7) % 1) + 1) % 1
        const x = cloudX - 82 + i * 27
        const y = 177 + phase * 128
        const slant = wind ? phase * 66 : 0
        stroke(
          c,
          [x + slant, y, x + slant + (wind ? 15 : 3), y + 15],
          press ? '#8295ca' : '#e4eee8',
          press ? 5 : 3,
        )
      }
    }
  } else if (pedal) {
    for (const x of [-111, 111]) {
      const down = m.pads.includes(x < 0 ? 'kick' : 'pedalHat') ? 10 * m.hit : 0
      polygon(
        c,
        [x - 29, 370, x + 29, 370, x + 21, 353 + down, x - 21, 353 + down],
        x < 0 ? '#90d5e8' : '#d8eb99',
        OUTLINE,
      )
      stroke(c, [x, 358 + down, x, 365], OUTLINE, 4)
    }
  } else if (game.id === 'watering-can') {
    c.save()
    c.translate(-39, 208 - m.lift * 15)
    c.rotate(m.lift * 0.37)
    oval(c, -44, -8, 33, 29, detail, OUTLINE)
    oval(c, -43, -8, 20, 16, '#bcdcce', OUTLINE)
    roundRect(c, -44, -39, 91, 71, 17, paint, OUTLINE)
    polygon(c, [40, 7, 94, -30, 105, -13, 42, 26], paint, OUTLINE)
    roundRect(c, 93, -34, 14, 27, 5, detail, OUTLINE)
    eyes(c, -6, -7, 12, m.hit)
    c.restore()
    for (let i = 0; i < 5; i++) {
      const progress = 1 - m.hit
      c.globalAlpha = m.hit * 1.12
      oval(
        c,
        77 + i * 12 + progress * 25,
        192 + (86 + i * 6) * progress * progress,
        3 + m.lift * 2,
        7,
        '#85bbd2',
      )
    }
    c.globalAlpha = 1
  }
}

function drawFactory(c: Ink, game: ArcadeGame, m: Moment) {
  const [paint, detail] = game.palette
  const console = game.id === 'power-grid'
  const robot = game.id === 'robot-echo'
  if (console || robot) {
    for (let i = 0; i < 3; i++) {
      const x = -151 + i * 151
      const active = m.pads.some((pad) => {
        if (pad === 'kick' || pad === 'floorTom') return i === 0
        if (pad === 'snare' || pad === 'midTom') return i === 1
        return i === 2
      })
      const shock = active ? m.lift : m.hit * 0.17
      c.save()
      c.translate(x, 281 - shock * 31)
      c.rotate((i - 1) * shock * 0.21)
      roundRect(c, -53, -84, 106, 145, 15, [paint, detail, '#e1ab78'][i], OUTLINE)
      roundRect(c, -40, -70, 80, 52, 8, '#e2d4a7', OUTLINE)
      if (robot) {
        eyes(c, 0, -45, 16, active ? m.hit : 0)
        stroke(c, [0, -84, 7, -111], OUTLINE, 6)
        oval(c, 7, -113, 7, 7, active && m.hit > 0.25 ? m.color : '#e4b692', OUTLINE)
      } else {
        c.beginPath()
        c.arc(0, -35, 20, -Math.PI, 0)
        c.strokeStyle = OUTLINE
        c.lineWidth = 3
        c.stroke()
        stroke(c, [0, -35, -13 + 23 * shock, -49], '#a65264', 4)
      }
      for (const light of [-21, 0, 21]) oval(c, light, 3, 6, 6, active ? m.color : '#7e6670', OUTLINE)
      roundRect(c, -26, 26 - shock * 6, 52, 13, 6, '#4a4c60', OUTLINE)
      c.restore()
    }
    return
  }
  roundRect(c, -127, 143, 254, 201, 23, '#5a6173', OUTLINE)
  roundRect(c, -107, 159, 214, 160, 14, '#d5a98d', OUTLINE)
  const shift = (m.success % 4) * 12 + m.lift * 8
  for (let i = 0; i < 4; i++) {
    const x = -139 + i * 74 + shift
    roundRect(c, x, 304, 70, 38, 6, '#faedd5', OUTLINE)
    if (i < 3 && m.success > i) {
      const color = i === 1 ? detail : paint
      polygon(c, [x + 20, 325, x + 35, 310, x + 51, 324, x + 35, 337], color, OUTLINE)
    }
  }
  const squash = m.hit * (m.lane === 'snare' ? 51 : 38)
  stroke(c, [0, 175, 0, 221 + squash], '#f6d7b3', 27)
  roundRect(c, -60, 205 + squash, 120, 48, 11, paint, OUTLINE)
  eyes(c, 0, 225 + squash, 14, m.hit)
  roundRect(c, -70, 248 + squash, 140, 11, 5, detail, OUTLINE)
  roundRect(c, -95, 147, 190, 29, 7, '#717c8a', OUTLINE)
  for (let x = -63; x <= 65; x += 31) stroke(c, [x, 151, x + 9, 171], '#e8b484', 7)
}

const paintActor: Record<ArcadeScene, (c: Ink, game: ArcadeGame, moment: Moment) => void> = {
  rail: drawRail,
  kitchen: drawKitchen,
  space: drawSpace,
  garden: drawGarden,
  factory: drawFactory,
}

type Marker = { step: number; pads: Lane[]; accent: boolean; cue?: ArcadeCue }

function cueMarkers(game: ArcadeGame) {
  const markers = new Map<number, Marker>()
  function get(step: number) {
    let marker = markers.get(step)
    if (!marker) {
      marker = { step, pads: [], accent: false }
      markers.set(step, marker)
    }
    return marker
  }
  for (const note of game.notes) {
    const event = get(note.step)
    event.pads.push(note.lane)
    event.accent ||= note.accent === true
  }
  for (const cue of game.cues) get(cue.step).cue = cue
  return Array.from(markers.values()).sort((a, b) => a.step - b.step)
}

function firstAtOrAfter(markers: Marker[], step: number) {
  // The set is bounded and sorted, so work stays tied to the visible window.
  let lo = 0
  let hi = markers.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (markers[mid].step < step) lo = mid + 1
    else hi = mid
  }
  return lo
}

function cueBanner(
  c: Ink,
  marker: Marker,
  step: number,
  preempt: number,
  echoCall: boolean,
  signal: boolean,
  blocked: boolean,
  reduced: boolean,
) {
  const pads = marker.pads.length > 0 ? marker.pads : marker.cue ? [marker.cue.lane] : []
  const wide = signal || pads.length > 1 ? 186 : 143
  const left = -wide / 2
  const y = 41
  roundRect(c, left, y, wide, 49, 14, '#242438', OUTLINE)
  const signalOnly = signal && !marker.pads.length
  const color = signalOnly ? (blocked ? '#ff8b88' : '#badf87') : kit[pads[0]].color
  if (!reduced) {
    const charge = Math.max(0.03, Math.min(1, 1 - (marker.step - step) / preempt))
    roundRect(c, left + 10, y + 41, (wide - 20) * charge, 4, 2, color)
  }
  const nameY = y + 20
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = '700 18px system-ui, sans-serif'
  c.fillStyle = color
  const signalText = blocked ? '低音 · 留白' : '高音 · 准备'
  const name = signalOnly ? signalText : pads.map((lane) => kit[lane].name).join(' + ')
  c.fillText(name, 0, nameY, wide - 16)
  const badge = echoCall ? '听示范' : marker.accent ? '重音' : signal && marker.pads.length ? signalText : ''
  if (badge) {
    c.font = '700 12px system-ui, sans-serif'
    roundRect(c, -47, y - 23, 94, 19, 6, '#27243e', OUTLINE)
    c.fillStyle = signal ? (blocked ? '#ff8b88' : '#badf87') : marker.accent ? '#ffd386' : '#eee1ff'
    c.fillText(badge, 0, y - 14)
  }
}

function sparks(c: Ink, strength: number, age: number, color: string, reduced: boolean) {
  if (strength <= 0 || age > 320) return
  const u = age / 320
  const depth = 1 - (1 - u) ** 2
  const particleCount = reduced ? 0 : strength > 0.8 ? 10 : 6
  c.fillStyle = color
  for (let i = 0; i < particleCount; i++) {
    const angle = -Math.PI * (0.08 + 0.84 * (i / Math.max(1, particleCount - 1)))
    const dx = Math.cos(angle) * (82 + 66 * depth)
    const dy = Math.sin(angle) * (28 + 64 * depth)
    c.globalAlpha = 1 - u
    c.save()
    c.translate(dx, 259 + dy)
    c.rotate(angle)
    c.fillRect(-4, -2, 8 + (1 - u) * 8, 4)
    c.restore()
  }
  c.globalAlpha = 1
}

type Props = {
  game: ArcadeGame
  session: RefObject<Session>
  reduced: boolean
  active: boolean
}

export default function ArcadeStage({ game, session, reduced, active }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const node = canvas.current!
    const ctx = node.getContext('2d', { alpha: false })
    const layer = document.createElement('canvas')
    const bg = layer.getContext('2d', { alpha: false })
    if (!ctx || !bg) return

    const markers = cueMarkers(game)
    const signals = markers.filter((marker) => marker.cue)
    const responsePads = new Set(game.cues.map((cue) => cue.lane))
    const beats = markers.filter((marker) => marker.pads.length > 0)
    let logicalWidth = 720
    let pixelScale = 1
    let frame = 0
    let sizeChanged = true
    let width = 720
    let height = HEIGHT

    function draw(now: number) {
      if (sizeChanged) {
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1_000_000 / (width * height)))
        node.width = layer.width = Math.max(1, Math.round(width * ratio))
        node.height = layer.height = Math.max(1, Math.round(height * ratio))
        pixelScale = node.height / HEIGHT
        logicalWidth = node.width / pixelScale
        bg!.setTransform(pixelScale, 0, 0, pixelScale, node.width / 2, 0)
        backdrop(bg!, logicalWidth, game)
        sizeChanged = false
      }
      ctx!.setTransform(1, 0, 0, 1, 0, 0)
      ctx!.drawImage(layer, 0, 0)
      ctx!.setTransform(pixelScale, 0, 0, pixelScale, node.width / 2, 0)

      const round = active ? session.current.round : null
      const beat = round ? (now - round.startAt) / round.beat : 0
      const step = beat * 4
      const lookahead = game.rule === 'echo' && !round?.demo ? 0.25 : 2.8
      const upcoming = markers[firstAtOrAfter(markers, step - 0.48)]
      const marker = round && beat > -0.9 && upcoming?.step <= step + lookahead ? upcoming : undefined
      const recentSignal = signals[firstAtOrAfter(signals, step + 0.0001) - 1]
      const signal = recentSignal && step < recentSignal.step + 7 ? recentSignal.cue : undefined
      const blocked = game.rule === 'rest' && signal?.note !== undefined && signal.note < 54
      const recentCue = round && recentSignal && ((step - recentSignal.step) * round.beat) / 4 < 240
        ? recentSignal
        : undefined
      const call = game.rule === 'echo' ? recentCue : undefined
      const isSignal = game.rule === 'rest' && Boolean(recentCue)
      const pastBeatCount = round?.demo ? firstAtOrAfter(beats, step + 0.0001) : 0
      const matched = beats[pastBeatCount - 1]
      let age = Infinity
      let lane: Lane | undefined
      let strength = 0
      const activePads: Lane[] = []

      if (matched?.pads.length && round) {
        age = ((step - matched.step) * round.beat) / 4
        lane = matched.pads[0]
        strength = matched.accent || matched.pads.length > 1 ? 1 : 0.72
        if (age < 200) activePads.push(...matched.pads)
      }
      // Echo prompts animate the appropriate world actor on the actual audio onset.
      if (round && game.rule === 'echo' && signal && recentSignal) {
        const promptAge = ((step - recentSignal.step) * round.beat) / 4
        if (promptAge < 250 && promptAge < age) {
          age = promptAge
          lane = signal.lane
          strength = 0.55
          activePads.push(signal.lane)
        }
      }
      if (round && !round.demo) {
        for (const id in session.current.impacts) {
          const hit = session.current.impacts[id as Lane]!
          if (hit.judgment !== 'good' && hit.judgment !== 'perfect') continue
          const elapsed = Math.max(0, now - hit.at)
          if (elapsed < 145) activePads.push(hit.lane)
          if (elapsed >= age) continue
          age = elapsed
          lane = hit.lane
          strength = Math.min(1, 0.38 + hit.velocity / 177)
        }
      }
      if ((!lane || age > 330) && marker) lane = marker.pads[0] ?? marker.cue?.lane
      const motion = Math.max(0, 1 - age / 320)
      const pop = strength * motion ** 2
      const bounce =
        reduced || !Number.isFinite(age) ? 0 : strength * Math.sin(Math.PI * Math.min(1, age / 330))
      const tone = lane ? kit[lane].color : game.palette[2]
      const charge = !marker ? 0 : Math.max(0, 1 - Math.abs(marker.step - step) / lookahead)
      const success = round?.demo ? pastBeatCount : round?.resolved.size ?? 0
      const scale = Math.min(1, logicalWidth / 530)
      ctx!.save()
      ctx!.translate(0, 354 * (1 - scale))
      ctx!.scale(scale, scale)
      paintActor[game.scene](ctx!, game, {
        beat: reduced ? Math.floor(beat) : beat,
        lift: bounce,
        hit: pop,
        charge: reduced ? 0 : charge,
        success,
        color: tone,
        lane,
        pads: activePads,
        blocked,
      })
      sparks(ctx!, strength, age, tone, reduced)
      ctx!.restore()
      const cue = call ?? marker ?? (isSignal ? recentCue : undefined)
      if (cue && (call || game.rule !== 'echo' || round?.demo)) {
        const pads = game.rule === 'rest' && !round?.demo && cue.step > step
          ? cue.pads.filter((pad) => !responsePads.has(pad))
          : cue.pads
        const event = { ...cue, pads, cue: cue.cue ?? recentCue?.cue }
        if (pads.length || call || isSignal) cueBanner(ctx!, event, step, lookahead, Boolean(call), isSignal, blocked, reduced)
      }
      if (active) frame = requestAnimationFrame(draw)
    }

    const observer = new ResizeObserver(([entry]) => {
      width = Math.max(1, entry.contentRect.width)
      height = Math.max(1, entry.contentRect.height)
      sizeChanged = true
      if (!active) draw(performance.now())
    })
    observer.observe(node)
    if (active) frame = requestAnimationFrame(draw)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [game, session, reduced, active])

  return (
    <canvas
      ref={canvas}
      className="arcade-canvas"
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
