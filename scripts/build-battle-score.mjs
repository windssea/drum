import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rate = 48_000
const performanceBpm = 96
const rehearsalBpm = 72
const tau = Math.PI * 2
const musicPath = fileURLToPath(new URL('../game/music/', import.meta.url))

const pitches = (note) => 440 * 2 ** ((note - 69) / 12)
let seed = 0x32db1847
function noise() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 2147483648 - 1
}

const dsp = {
  kick(samples, f, gain) {
    let phase = 0
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate
      phase += (f + 135 * Math.exp(-31 * t)) * tau / rate
      const punch = .3 * Math.sin(phase * 2.22) * Math.exp(-35 * t)
      const click = noise() * .11 * Math.exp(-134 * t)
      samples[i] = gain * Math.min(1, t * 1450) * (Math.sin(phase) * Math.exp(-14.7 * t) + punch + click)
    }
  },
  snare(samples, f, gain) {
    let mic = 0
    let head = 0
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate
      const white = noise()
      mic += .26 * (white - mic)
      head += .055 * (white - head)
      const wire = .90 * (mic - head) + .24 * (white - mic)
      const shell = Math.sin(t * tau * f) * .42 + Math.sin(t * tau * f * 1.61) * .18
      samples[i] = gain * Math.min(1, t * 2000) * (wire * Math.exp(-20 * t) + shell * Math.exp(-36 * t))
    }
  },
  cymbal(samples, f, gain, open) {
    let low = 0
    let buffer = 0
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate
      const white = noise()
      low += .32 * (white - low)
      const alloy =
        Math.sin(t * tau * f * 4.92) * Math.sin(t * tau * f * 7.61) +
        Math.sin(t * tau * f * 13.07) * Math.sin(t * tau * f * 10.21)
      buffer += .64 * (.29 * alloy + .74 * (white - low) - buffer)
      samples[i] = gain * Math.min(1, t * 2100) * buffer * Math.exp((open ? -9.5 : -53) * t)
    }
  },
  bass(samples, f, gain) {
    const length = samples.length / rate
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate
      const phase = tau * (f * t + .055 * (1 - Math.exp(-65 * t)))
      const body = Math.sin(phase) + .32 * Math.sin(2 * phase) + .19 * Math.sin(3 * phase) + .1 * Math.sin(5 * phase)
      const pick = Math.sin(9 * phase) * Math.exp(-44 * t) * .17
      const attack = Math.min(1, t * 330)
      const release = Math.min(1, (length - t) / .043)
      samples[i] = Math.tanh((body + pick) * .9) * gain * attack * release * Math.exp(-1.9 * t)
    }
  },
  horn(samples, f, gain) {
    const length = samples.length / rate
    let phase = 0
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate
      const swell = Math.min(1, t / .038)
      const tail = Math.min(1, (length - t) / .074)
      const bend = -.016 * Math.exp(-38 * t) + .0031 * Math.sin(t * tau * 5.4)
      phase += tau * f * (1 + bend) / rate
      const bloom = .42 + .58 * swell
      const buzz = Math.sin(phase) * .33 + Math.sin(2 * phase) * .56 +
        Math.sin(3 * phase) * .40 + Math.sin(4 * phase) * .27 +
        Math.sin(5 * phase) * .20 + Math.sin(7 * phase) * .09
      samples[i] = gain * Math.tanh(buzz * bloom * 1.2) * swell * tail * (1 - .25 * (t / length))
    }
  },
  reed(samples, f, gain) {
    const length = samples.length / rate
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate
      const phase = tau * f * t
      const tone = Math.sin(phase) + Math.sin(phase * 2 + .4) * .31 + Math.sin(phase * 3) * .13
      samples[i] = gain * tone * Math.min(t * 170, 1) * Math.min((length - t) * 23, 1) * Math.exp(-8.6 * t)
    }
  },
}

class Mix {
  constructor(length, bpm = performanceBpm) {
    this.stepFrames = rate * 60 / (bpm * 4)
    this.left = new Float64Array(length)
    this.right = new Float64Array(length)
  }

  add(samples, start, pan, room = 0) {
    if (start < 0 || start >= this.left.length) throw Error('Event outside score')
    const l = Math.sqrt((1 - pan) / 2)
    const r = Math.sqrt((1 + pan) / 2)
    const samplesToMix = Math.min(samples.length, this.left.length - start)
    const firstTap = Math.round(rate * .031)
    const secondTap = Math.round(rate * .059)
    const thirdTap = Math.round(rate * .109)
    for (let i = 0; i < samplesToMix; i++) {
      const position = start + i
      const value = samples[i]
      this.left[position] += value * l
      this.right[position] += value * r
      if (room && i % 2 === 0) {
        const reflection = (value + (samples[i + 1] ?? value)) * .5 * room
        for (let pair = 0; pair < 2; pair++) {
          const pos = position + pair
          if (pos + firstTap < this.right.length) this.right[pos + firstTap] += reflection * r
          if (pos + secondTap < this.left.length) this.left[pos + secondTap] += reflection * l * .74
          if (pos + thirdTap < this.right.length) this.right[pos + thirdTap] -= reflection * .47
        }
      }
    }
  }

  voice(name, step, note, length, gain, pan = 0, room = 0) {
    const samples = new Float32Array(Math.round(this.stepFrames * length))
    dsp[name](samples, pitches(note), gain, name === 'cymbal' && length > 1.5)
    this.add(samples, Math.round(step * this.stepFrames), pan, room)
  }

  render(peak) {
    let observedPeak = 0
    const length = this.left.length
    for (let i = 0; i < length; i++) {
      const fade = Math.min(1, Math.max(0, (length - 1 - i) / (rate * .07)))
      this.left[i] = Math.tanh(this.left[i] * 1.36) * fade
      this.right[i] = Math.tanh(this.right[i] * 1.36) * fade
      observedPeak = Math.max(observedPeak, Math.abs(this.left[i]), Math.abs(this.right[i]))
    }

    const out = Buffer.alloc(44 + length * 4)
    out.write('RIFF', 0)
    out.writeUInt32LE(out.length - 8, 4)
    out.write('WAVEfmt ', 8)
    out.writeUInt32LE(16, 16)
    out.writeUInt16LE(1, 20)
    out.writeUInt16LE(2, 22)
    out.writeUInt32LE(rate, 24)
    out.writeUInt32LE(rate * 4, 28)
    out.writeUInt16LE(4, 32)
    out.writeUInt16LE(16, 34)
    out.write('data', 36)
    out.writeUInt32LE(length * 4, 40)
    const level = 32767 * peak / observedPeak
    for (let i = 0; i < length; i++) {
      const offset = 44 + i * 4
      out.writeInt16LE(Math.round(this.left[i] * level), offset)
      out.writeInt16LE(Math.round(this.right[i] * level), offset + 2)
    }
    return out
  }
}

// Each row is a distinct bar. All timings and lengths below are sixteenth-note units.
const chords = [
  [38, [57, 60, 64]], [41, [57, 62, 64]], [43, [58, 62, 65]], [45, [55, 61, 70]],
  [38, [57, 60, 65]], [34, [57, 62, 65]], [43, [58, 62, 64]], [45, [55, 62, 67]],
  [41, [57, 60, 67]], [36, [55, 62, 64]], [46, [57, 62, 65]], [45, [55, 61, 70]],
  [38, [57, 60, 65]], [34, [57, 62, 65]], [43, [58, 62, 65]], [45, [55, 61, 67]],
]

// Opening D–F–A–G call repeats and moves through the relative-major bridge before the final cadence.
const hornParts = [
  [[0, 62, 2.1], [3, 65, 1.3], [6, 69, 1.7], [8, 67, 2.6], [13, 60, 2]],
  [[2, 69, 1.3], [6, 72, 1.9], [10, 69, 2.7], [14, 65, 1.3]],
  [[0, 67, 2.2], [7, 70, 2.4], [14, 65, 1.5]],
  [[5, 64, 1.25], [11, 67, 1.09], [14, 61, 1.4]],
  [[0, 62, 2.2], [3, 65, 1.4], [6, 69, 2], [8, 67, 3.4], [13, 72, 2.5]],
  [[2, 74, 2], [5, 72, 1], [7, 69, 1.55], [10, 65, 2.9], [14, 69, 1.1]],
  [[0, 70, 2.4], [7, 67, 1.6], [14, 64, 1.1]],
  [[3, 67, .9], [7, 69, 1.6], [14, 61, 1.5]],
  [[0, 65, 2.1], [3, 67, 1.4], [6, 72, 2], [8, 69, 3.0], [13, 72, 2.8]],
  [[0, 76, 1.4], [4, 74, 1.6], [7, 72, 1.6], [10, 67, 2.1], [14, 72, 1.4]],
  [[4, 70, 3], [13, 74, 2.3]],
  [[5, 70, 1.3], [13, 69, 1.7]],
  [[0, 74, 2.1], [3, 77, 1.4], [6, 81, 1.7], [8, 79, 2.6], [13, 76, 2.2]],
  [[2, 77, 1.8], [6, 74, 1.4], [8, 72, 2.7], [12, 69, 1.6], [15, 65, .75]],
  [[3, 70, 1.9], [8, 74, 1.8], [14, 76, 1.1]],
  [[1, 67, 2.7], [7, 64, 1.3], [10, 61, 1.7], [12, 62, 3.9]],
]

const bassFigures = [
  [[0, 0, 3], [5, 7, 1.5], [8, 12, 2.4], [11, 7, 1.4], [14, 0, 1.45]],
  [[0, 0, 2], [3, 12, 1.0], [6, 7, 1.6], [8, 0, 2.4], [11, 12, 1.0], [14, 0, 1.4]],
  [[0, 0, 3.7], [6, 7, 1.5], [8, 0, 3.6], [14, 12, 1.2]],
  [[0, 0, 3.1], [5, 7, 1.6], [8, 12, 2.0], [11, 7, 1.1], [14, 0, 1.7]],
]

// Keep the reference drum performances audible. Syncopated horn and bass lines carry
// the syncopation; the backing kit always marks the same four quarter beats.
function drumKit(mix, role, offset) {
  const listening = role === 0 || role === 2
  for (const step of [0, 8]) {
    mix.voice('kick', offset + step, 31, 2.15, listening ? .52 : .69)
  }
  for (const step of [4, 12]) {
    if (listening) {
      // Short pitched woodblock instead of a second snare competing with the call.
      mix.voice('reed', offset + step, 74, .32, .15, .42)
    } else {
      mix.voice('snare', offset + step, 51, .95, .48, .36, .035)
    }
  }
  const hatLevel = listening ? .10 : .16
  for (const step of [0, 4, 8, 12]) {
    mix.voice('cymbal', offset + step, 61, .56, hatLevel, -.49)
  }
}

function buildScore(bpm) {
  const beatFrames = rate * 60 / bpm
  const mix = new Mix(Math.round(64 * beatFrames), bpm)
  for (const [bar, [root, voicing]] of chords.entries()) {
    const cycle = bar >> 2
    const role = bar % 4
    const start = bar * 16
    const finalBar = bar === 15
    drumKit(mix, role, start)
    for (const [step, interval, duration] of bassFigures[role]) {
      if (finalBar && step >= 11) continue
      const octaveAnswer = bar === 9 && step === 8 ? 7 : interval
      mix.voice('bass', start + step, root + octaveAnswer, duration, step === 0 ? .46 : .35, 0)
    }
    for (const step of (role <= 1 ? [2, 6, 10, 14] : [3, 11])) {
      if (finalBar && step >= 11) continue
      for (const [i, note] of voicing.entries()) {
        mix.voice('reed', start + step, note, 2.2, role <= 1 ? .085 : .057, (i - 1) * .50, .14)
      }
    }
    for (const [i, [step, note, duration]] of hornParts[bar].entries()) {
      const finalAccent = finalBar && step === 12
      const gain = finalAccent ? .25 : role === 1 ? .207 : role === 0 ? .17 : .145
      mix.voice('horn', start + step, note, duration, gain * (i % 2 === 0 ? 1 : .88), -.23, .16)
      if (cycle >= 1 && (role < 2 || finalAccent)) {
        const support = finalAccent ? 57 : note - (cycle === 3 && i % 2 === 0 ? 12 : 7)
        mix.voice('horn', start + step + .025, support, duration, role === 1 ? .089 : .058, .44, .14)
      }
    }
    if (finalBar) {
      mix.voice('kick', start + 12, 31, 2.4, .48)
      mix.voice('bass', start + 12, 38, 3.9, .49)
      mix.voice('cymbal', start + 12, 68, 3.8, .19, .48, .13)
      for (const [i, note] of [50, 53, 57, 65].entries()) {
        mix.voice('reed', start + 12, note, 3.9, .16, (i - 1.5) * .36, .10)
      }
    }
  }
  return mix
}

function buildSting(won) {
  const mix = new Mix(Math.round(rate * (won ? 1.85 : 1.72)))
  if (won) {
    for (const [step, note, length] of [[0, 62, 1.8], [2, 66, 1.8], [4, 69, 1.8], [6, 74, 5.0]]) {
      mix.voice('horn', step, note, length, .47, -.20, .15)
      mix.voice('bass', step, note - 24, length, .38)
      if (step === 6) {
        for (const i of [50, 54, 57, 62]) mix.voice('reed', step, i, 4, .18, .3, .14)
      }
    }
    mix.voice('kick', 0, 31, 2, .48)
    mix.voice('kick', 6, 31, 2, .58)
    mix.voice('cymbal', 6, 65, 4, .28, .55, .13)
  } else {
    for (const [step, note] of [[0, 69], [3, 65], [6, 62]]) {
      mix.voice('horn', step, note, 3.5, .34, -.14, .16)
      mix.voice('reed', step, note - 5, 3.5, .22, .32, .14)
      mix.voice('bass', step, note - 24, 3.4, .36)
    }
    mix.voice('kick', 0, 29, 2, .42)
    mix.voice('snare', 1.5, 52, 1.4, .28, .13, .11)
  }
  return mix
}

function encode(pcm, file, directory) {
  const wav = join(directory, 'master.wav')
  writeFileSync(wav, pcm)
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', wav,
    '-c:a', 'libvorbis', '-q:a', '5', '-map_metadata', '-1',
    '-metadata', 'title=' + file.replace('.ogg', ''), join(musicPath, file),
  ])
}

mkdirSync(musicPath, { recursive: true })
const temp = mkdtempSync(join(tmpdir(), 'tidebeat-score-'))
try {
  for (const [bpm, basename] of [[performanceBpm, 'battle'], [rehearsalBpm, 'battle_slow']]) {
    // Render identical pitches and per-instrument envelopes at each tempo. Only
    // beat locations and written note lengths change; no playback-rate scaling.
    seed = 0x32db1847
    const stereoMaster = buildScore(bpm).render(.76)
    const leadFrames = Math.round(4 * rate * 60 / bpm)
    const withCountIn = Buffer.concat([stereoMaster.subarray(0, 44), Buffer.alloc(leadFrames * 4), stereoMaster.subarray(44)])
    withCountIn.writeUInt32LE(withCountIn.length - 8, 4)
    withCountIn.writeUInt32LE(withCountIn.length - 44, 40)
    encode(stereoMaster, basename + '.ogg', temp)
    encode(withCountIn, basename + '_native.ogg', temp)
  }
  if (!process.argv.includes('--battle-only')) {
    // Fixed noise state keeps the shipped brass cadences independent of changes
    // to the number of percussion samples rendered in the battle arrangements.
    seed = -3964036
    encode(buildSting(true).render(.68), 'victory.ogg', temp)
    encode(buildSting(false).render(.62), 'defeat.ogg', temp)
  }
  console.log('Rendered 16 bars at 96 and 72 BPM, stereo 48 kHz.')
} finally {
  // The app loads the compressed assets directly.
  rmSync(join(temp, 'master.wav'), { force: true })
  rmdirSync(temp)
}
