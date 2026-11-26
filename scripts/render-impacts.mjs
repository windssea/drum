import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const sourceDirectory = join(root, 'art', 'audio', 'sources')
const buildDirectory = join(root, 'build', 'google-audio')
const rate = 44_100
const sources = {
  wood: {
    path: 'omni-harbor-wood.flac',
    id: 'v1_ChdfNXdIYTUyVkhwaUw2dGtQOHZIYzJBURIXXzV3SGE1MlZIcGlMNnRrUDh2SGMyQVE',
    sha256: 'abe73c23e18a9117795a49d767639d69d02a6f76b683ea33060e629bd4da34c9',
    videoSha256: '737066682d593df05dc03af343c03867bda2e00bcf662b01488348fceb55c296',
    gain: 2
  },
  brass: {
    path: 'omni-harbor-brass.flac',
    id: 'v1_ChdBSjBIYTUtcER0dUw2dGtQMklfZDRBURIXQUowSGE1LXBEdHVMNnRrUDJJX2Q0QVE',
    sha256: 'd3a1b7cdaab60d8db2fb92f1fe65e221ee7af92adc834dbfdb0faaceee6d3154',
    videoSha256: 'b03203c79138e12096bd3d895904ba97e6ca5ff5e2e679e9154324aaa4cf6f27',
    gain: 2
  },
  kit: {
    path: 'omni-percussion.flac',
    id: 'v1_Chc3cHdIYTlPZ0VNRzB1cjhQaXNDdmlBWRIXN3B3SGE5T2dFTUcwdXI4UGlzQ3ZpQVk',
    sha256: 'f5f0c523d68b965a5aa53d79af592a225e6ca73c12be081166c1d67e3e4eb1a6',
    videoSha256: '948a86605f655f95faab5957174da53b9fdd2ea02454987fc713760453a0f701',
    gain: 1
  }
}

function cut(source, start, seconds, { at = 0, level = 1, hp = 90, lp = 9000, tail = 0.018 } = {}) {
  return { source, start, seconds, at, level, hp, lp, tail }
}

// The clip start times are measured on the decoded reference soundtracks.
// Every layer is a cut from the original synchronized audio. The output envelope
// only removes edit clicks and (for training transients) suppresses late tails.
const edits = {
  hit: [0.106, 0.56, cut('wood', 0.718, 0.085, { at: 0.019, lp: 6800 })],
  hit_b: [0.104, 0.56, cut('wood', 2.199, 0.083, { at: 0.020, hp: 185 })],
  hit_c: [0.104, 0.54, cut('wood', 3.584, 0.083, { at: 0.019, hp: 150, lp: 5100 })],
  accent: [0.20, 0.53, cut('brass', 0.676, 0.178, { at: 0.020, hp: 720, tail: 0.070 })],
  start: [0.255, 0.60,
    cut('wood', 0.718, 0.083),
    cut('wood', 2.199, 0.106, { at: 0.088 }),
    cut('brass', 0.676, 0.114, { at: 0.127, hp: 610, level: 0.32, tail: 0.040 })],
  windup: [0.257, 0.56,
    cut('brass', 4.854, 0.241, { hp: 430, lp: 6400, tail: 0.060 })],
  slam: [0.307, 0.67,
    cut('kit', 1.327, 0.267, { hp: 43, lp: 400, level: 0.91, tail: 0.054 }),
    cut('brass', 6.095, 0.217, { at: 0.008, hp: 210, level: 0.68, tail: 0.039 }),
    cut('wood', 4.983, 0.075, { at: 0.041, hp: 260, level: 0.31 })],
  armor: [0.355, 0.67,
    cut('wood', 4.983, 0.065, { at: 0.013, level: 0.55 }),
    cut('wood', 7.444, 0.082, { at: 0.062, level: 0.53 }),
    cut('brass', 7.682, 0.245, { at: 0.087, hp: 320, lp: 7850, tail: 0.063 })],
  power: [0.336, 0.67,
    cut('kit', 2.491, 0.248, { hp: 50, lp: 690, level: 0.78, tail: 0.060 }),
    cut('wood', 6.277, 0.131, { at: 0.012, hp: 125, lp: 4900, level: 1.1 }),
    cut('brass', 3.356, 0.174, { at: 0.023, hp: 300, lp: 4200, level: 0.44, tail: 0.038 })],
  flurry: [0.255, 0.63,
    cut('wood', 3.584, 0.062, { hp: 230, level: 0.76 }),
    cut('wood', 2.199, 0.062, { at: 0.052, hp: 260, level: 0.9 }),
    cut('wood', 0.718, 0.085, { at: 0.114, hp: 320 }),
    cut('kit', 5.019, 0.065, { at: 0.126, hp: 2900, level: 0.32 })],
  break: [0.342, 0.66,
    cut('kit', 1.327, 0.175, { hp: 53, lp: 340, level: 0.53, tail: 0.039 }),
    cut('brass', 7.630, 0.310, { at: 0.011, hp: 1010, lp: 9300, tail: 0.100 }),
    cut('kit', 6.318, 0.125, { at: 0.034, hp: 4500, level: 0.55, tail: 0.057 })],
  guard: [0.134, 0.53, cut('brass', 2.055, 0.104, { at: 0.022, hp: 260, lp: 5900 })],
  guard_b: [0.141, 0.53, cut('brass', 3.356, 0.111, { at: 0.023, hp: 220, lp: 5500 })],
  counter: [0.305, 0.66,
    cut('wood', 4.983, 0.078, { hp: 450, lp: 7700, level: 0.66 }),
    cut('brass', 2.055, 0.085, { at: 0.031, hp: 510, level: 0.51 }),
    cut('brass', 0.676, 0.212, { at: 0.041, hp: 465, tail: 0.065 })],
  hurt: [0.262, 0.64,
    cut('kit', 1.327, 0.206, { hp: 75, lp: 370, level: 0.67, tail: 0.060 }),
    cut('wood', 6.277, 0.133, { at: 0.010, hp: 170, lp: 2800, level: 0.91 }),
    cut('wood', 4.983, 0.078, { at: 0.049, hp: 180, lp: 2200, level: 0.40 })]
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

function decode(source) {
  const path = join(sourceDirectory, source.path)
  if (sha256(readFileSync(path)) !== source.sha256) {
    throw new Error(`Unrecognized take for ${source.path}. Expected Omni interaction ${source.id}.`)
  }
  const audio = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:a:0',
    '-af', `volume=${source.gain}`, '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'],
  { maxBuffer: 8 * 1024 * 1024 })
  if (audio.status !== 0 || audio.stdout.length === 0) {
    throw new Error(`Could not decode the synchronized audio from ${source.path} with FFmpeg.`)
  }
  return audio.stdout
}

function mix(track, decoded, spec) {
  const start = Math.round(spec.start * rate)
  const length = Math.round(spec.seconds * rate)
  const offset = Math.round(spec.at * rate)
  if ((start + length) * 4 > decoded.length || offset + length > track.length) {
    throw new Error(`Edit exceeds source or destination: ${JSON.stringify(spec)}`)
  }
  const highPass = 1 - Math.exp(-2 * Math.PI * spec.hp / rate)
  const lowPass = 1 - Math.exp(-2 * Math.PI * spec.lp / rate)
  const fadeIn = rate * 0.001
  const fadeOut = rate * spec.tail
  let average = 0
  let band = 0
  for (let i = 0; i < length; i++) {
    const sample = decoded.readFloatLE((start + i) * 4)
    average += (sample - average) * highPass
    band += (sample - average - band) * lowPass
    const edge = Math.min(1, i / fadeIn, (length - 1 - i) / fadeOut)
    track[offset + i] += band * edge * spec.level
  }
}

function wav(samples, peak) {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length * 2, 40)
  const greatest = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0)
  if (greatest < 0.01) throw new Error('Expected an audible source impact.')
  const gain = 32767 * peak / greatest
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(Math.round(samples[i] * gain), 44 + i * 2)
  return buffer
}

const decoded = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, decode(source)]))
const generated = Object.entries(edits).map(([name, [duration, peak, ...layers]]) => {
  const samples = new Float32Array(Math.round(duration * rate))
  for (const layer of layers) mix(samples, decoded[layer.source], layer)
  const file = `impact_${name}.wav`
  const bytes = wav(samples, peak)
  return { file, duration, layers, bytes, sha256: sha256(bytes) }
})
const summary = generated.map(({ bytes, ...clip }) => ({ ...clip, bytes: bytes.length }))
mkdirSync(buildDirectory, { recursive: true })
writeFileSync(join(buildDirectory, 'impact-edits.json'), JSON.stringify({ model: 'gemini-omni-1.2-flash',
  rate, sources, outputs: summary }, null, 2) + '\n')
for (const { file, bytes } of generated) writeFileSync(join(root, 'game', 'audio', file), bytes)
console.log(`Edited ${generated.length} PCM effects from three verified Gemini Omni soundtracks.`)
