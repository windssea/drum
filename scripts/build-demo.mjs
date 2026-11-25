// Rebuild this specific arrangement. Node writes a type-1 MIDI, reads its tracks,
// renders the accompaniment and quantizes channel 10 into the shipped drum chart.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const out = fileURLToPath(new URL('../public/songs/frere-jacques/', import.meta.url))
fs.mkdirSync(out, { recursive: true })
const ppq = 480
const tempo = 750000 // microseconds per quarter, exactly 80 BPM
const totalBars = 8
const ticksPerBar = ppq * 4
const melody = [
  [
    [60, 1],
    [62, 1],
    [64, 1],
    [60, 1],
  ],
  [
    [60, 1],
    [62, 1],
    [64, 1],
    [60, 1],
  ],
  [
    [64, 1],
    [65, 1],
    [67, 2],
  ],
  [
    [64, 1],
    [65, 1],
    [67, 2],
  ],
  [
    [67, 0.5],
    [69, 0.5],
    [67, 0.5],
    [65, 0.5],
    [64, 1],
    [60, 1],
  ],
  [
    [67, 0.5],
    [69, 0.5],
    [67, 0.5],
    [65, 0.5],
    [64, 1],
    [60, 1],
  ],
  [
    [60, 1],
    [55, 1],
    [60, 2],
  ],
  [
    [60, 1],
    [55, 1],
    [60, 2],
  ],
]
const notes = []
function add(channel, pitch, beat, length, velocity) {
  notes.push({ channel, pitch, tick: Math.round(beat * ppq), length: Math.round(length * ppq), velocity })
}
for (let bar = 0; bar < totalBars; bar++) {
  let beat = bar * 4
  for (const [pitch, length] of melody[bar]) {
    add(0, pitch + 12, beat, length * 0.88, 90)
    beat += length
  }
  const root = [48, 48, 53, 55, 48, 53, 55, 48][bar]
  for (const b of [0, 2]) add(1, root - 12, bar * 4 + b, 1.55, 84)
  const chord = [root, root + 4, root + 7]
  for (const b of [0.5, 1.5, 2.5, 3.5]) for (const pitch of chord) add(2, pitch, bar * 4 + b, 0.38, 49)
  for (let b = 0; b < 4; b++) {
    // End on a unison downbeat on beat 3, leaving beat 4 silent under the held melody.
    if (bar === 7 && b >= 2) {
      if (b === 2) {
        add(9, 36, bar * 4 + b, 0.15, 105)
        add(9, 49, bar * 4 + b, 0.5, 97)
      }
      break
    }
    add(9, b % 2 === 0 ? 36 : 38, bar * 4 + b, 0.18, b % 2 === 0 ? 102 : 94)
    add(9, 42, bar * 4 + b, 0.12, b === 0 ? 90 : 77)
    if (bar >= 4 && bar < 6) add(9, 42, bar * 4 + b + 0.5, 0.1, 64)
  }
}
function vlq(n) {
  const bytes = [n & 127]
  while ((n = Math.floor(n / 128)) > 0) bytes.unshift(128 | (n & 127))
  return bytes
}
function track(events) {
  let last = 0
  const bytes = []
  for (const e of events.sort((a, b) => a.tick - b.tick)) {
    bytes.push(...vlq(e.tick - last), ...e.data)
    last = e.tick
  }
  bytes.push(...vlq(totalBars * ticksPerBar - last), 255, 47, 0)
  const header = Buffer.alloc(8)
  header.write('MTrk')
  header.writeUInt32BE(bytes.length, 4)
  return Buffer.concat([header, Buffer.from(bytes)])
}
const tracks = [
  track([
    { tick: 0, data: [255, 81, 3, tempo >> 16, (tempo >> 8) & 255, tempo & 255] },
    { tick: 0, data: [255, 88, 4, 4, 2, 24, 8] },
  ]),
]
for (const channel of [0, 1, 2, 9]) {
  const events = channel === 9 ? [] : [{ tick: 0, data: [192 + channel, [11, 33, 24][channel]] }]
  for (const n of notes.filter((n) => n.channel === channel))
    events.push(
      { tick: n.tick, data: [144 + channel, n.pitch, n.velocity] },
      { tick: n.tick + n.length, data: [128 + channel, n.pitch, 0] },
    )
  tracks.push(track(events))
}
const header = Buffer.from('4d546864000000060001000501e0', 'hex')
const midiPath = path.join(out, 'arrangement.mid')
fs.writeFileSync(midiPath, Buffer.concat([header, ...tracks]))

// Decode the length-delimited tracks of this SMF, retaining tempo, meter, onsets and durations.
function analyze(bytes) {
  const events = [],
    grid = bytes.readUInt16BE(12)
  let us = 0,
    meter = [],
    endTick = 0
  for (let cursor = 14; cursor < bytes.length; ) {
    const end = cursor + 8 + bytes.readUInt32BE(cursor + 4)
    let tick = 0
    const active = new Map()
    cursor += 8
    function readVlq() {
      let n = 0,
        b
      do {
        b = bytes[cursor++]
        n = n * 128 + (b & 127)
      } while (b & 128)
      return n
    }
    while (cursor < end) {
      tick += readVlq()
      const status = bytes[cursor++]
      if (status === 255) {
        const type = bytes[cursor++],
          size = readVlq()
        if (type === 81) us = bytes.readUIntBE(cursor, 3)
        if (type === 88) meter = [bytes[cursor], 2 ** bytes[cursor + 1]]
        cursor += size
      } else if (status >> 4 === 12) cursor++
      else {
        const pitch = bytes[cursor++],
          velocity = bytes[cursor++],
          channel = status & 15
        const key = channel * 128 + pitch
        if (status >> 4 === 9 && velocity) active.set(key, { channel, pitch, tick, velocity })
        else if (active.has(key)) {
          const n = active.get(key)
          events.push({ ...n, length: tick - n.tick })
          active.delete(key)
        }
      }
    }
    endTick = Math.max(endTick, tick)
  }
  return { events: events.sort((a, b) => a.tick - b.tick), grid, us, meter, endTick }
}
const analysis = analyze(fs.readFileSync(midiPath))
const { events, grid, us, meter, endTick } = analysis
const ids = { 36: 'kick', 38: 'snare', 42: 'hat', 49: 'crash' }
const drumNotes = events
  .filter((n) => n.channel === 9)
  .map((n) => {
    const step = (n.tick * 4) / grid
    if (!Number.isInteger(step) || !ids[n.pitch]) throw Error('Unexpected percussion event')
    return { step, lane: ids[n.pitch], velocity: n.velocity }
  })
const chart = {
  version: 1,
  bpm: 60000000 / us,
  meter,
  bars: endTick / grid / 4,
  offsetMs: 0,
  notes: drumNotes,
  sections: [
    { bar: 1, name: '主题 · 四分踩镲' },
    { bar: 5, name: '变化 · 八分踩镲' },
    { bar: 7, name: '收束 · 回到四分' },
    { bar: 8, name: '结尾 · 第三拍齐收' },
  ],
}
fs.writeFileSync(path.join(out, 'chart.json'), JSON.stringify(chart, null, 2) + '\n')

// Render only the pitched MIDI tracks so the student supplies the drums. The app
// schedules the reference drums from the extracted chart on the same audio clock.
const sampleRate = 32000,
  secondsPerTick = us / 1000000 / grid
const samples = new Float32Array(Math.round(endTick * secondsPerTick * sampleRate))
for (const n of events.filter((n) => n.channel !== 9)) {
  const start = Math.round(n.tick * secondsPerTick * sampleRate)
  const duration = n.length * secondsPerTick,
    frequency = 440 * 2 ** ((n.pitch - 69) / 12)
  const release = n.channel === 0 ? 0.16 : 0.08
  const end = Math.min(samples.length, start + Math.round((duration + release) * sampleRate))
  for (let i = start; i < end; i++) {
    const t = (i - start) / sampleRate,
      phase = 2 * Math.PI * frequency * t
    const env =
      Math.min(1, t / 0.007) *
      Math.exp(-t * (n.channel === 1 ? 2.2 : 3)) *
      Math.min(1, (duration + release - t) / release)
    const wave =
      Math.sin(phase) + 0.32 * Math.sin(2 * phase) + 0.14 * Math.sin((n.channel === 0 ? 4 : 3) * phase)
    samples[i] += ((wave * env * n.velocity) / 127) * [0.36, 0.28, 0.15][n.channel]
  }
}
const wav = Buffer.alloc(44 + 2 * samples.length)
wav.write('RIFF')
wav.writeUInt32LE(wav.length - 8, 4)
wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(sampleRate, 24)
wav.writeUInt32LE(2 * sampleRate, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write('data', 36)
wav.writeUInt32LE(wav.length - 44, 40)
samples.forEach((v, i) => wav.writeInt16LE(Math.round(29000 * Math.tanh(v)), 44 + i * 2))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drum-song-'))
try {
  const input = path.join(tmp, 'backing.wav')
  fs.writeFileSync(input, wav)
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-c:a',
    'flac',
    path.join(out, 'backing.flac'),
  ])
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
console.log(
  chart.bpm +
    ' BPM, ' +
    chart.bars +
    ' bars, ' +
    drumNotes.length +
    ' percussion events, ' +
    samples.length / sampleRate +
    ' s',
)
