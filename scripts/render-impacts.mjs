// Original one-shots for Tidebeat Harbor. Times are seconds; gain values are linear.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = fileURLToPath(new URL('../game/audio/', import.meta.url))
const rate = 44100
mkdirSync(dir, { recursive: true })
function writeHit(name, seconds, render) {
  const mix = new Float32Array(Math.ceil(seconds * rate))
  let seed = 137
  function component(start, duration, generate) {
    const first = Math.round(start * rate)
    const length = Math.min(mix.length - first, Math.round(duration * rate))
    for (let i = 0; i < length; i++) {
      const env = Math.min(1, i / (rate * 0.0012), (length - i) / (rate * 0.008))
      mix[first + i] += generate(i / rate) * env
    }
  }
  function sweep(start, duration, high, low, decay, gain, overtone = 0) {
    let phase = 0
    component(start, duration, (t) => {
      phase += (2 * Math.PI * (low + (high - low) * Math.exp(-t * decay))) / rate
      return (
        gain * (Math.sin(phase) + overtone * Math.sin(phase * 2.04)) * Math.exp((-t * 5) / duration)
      )
    })
  }
  function ring(start, duration, note, gain) {
    for (const [ratio, level] of [
      [1, 1],
      [1.51, 0.42],
      [2.72, 0.19],
      [4.13, 0.08],
    ])
      sweep(start, duration, note * ratio * 1.02, note * ratio, 19, gain * level)
  }
  function crack(start, duration, gain, bright = true) {
    let prev = 0
    component(start, duration, (t) => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
      const sample = seed / 0x80000000 - 1
      prev += (sample - prev) * (bright ? 0.31 : 0.075)
      return (bright ? sample - prev : prev) * gain * Math.exp((-t * 6) / duration)
    })
  }
  render({ sweep, ring, crack })
  const wav = Buffer.alloc(44 + mix.length * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(wav.length - 44, 40)
  for (let i = 0; i < mix.length; i++)
    wav.writeInt16LE(Math.round(30000 * Math.tanh(mix[i])), 44 + i * 2)
  writeFileSync(path.join(dir, 'impact_' + name + '.wav'), wav)
}
writeHit('hit', 0.16, ({ sweep, crack }) => {
  crack(0, 0.045, 0.26)
  sweep(0, 0.15, 520, 190, 41, 0.35)
})
writeHit('power', 0.58, ({ sweep, crack, ring }) => {
  crack(0, 0.1, 0.65)
  sweep(0, 0.46, 257, 44, 29, 0.94, 0.2)
  crack(0.028, 0.42, 1.3, false)
  ring(0.042, 0.4, 146.83, 0.18)
})
writeHit('flurry', 0.38, ({ sweep, crack, ring }) => {
  for (const [i, at] of [0, 0.057, 0.117].entries()) {
    crack(at, 0.068, 0.55 - i * 0.06)
    sweep(at, 0.14, 850 + i * 170, 260 + i * 90, 24, 0.37)
  }
  ring(0.11, 0.24, 587.33, 0.19)
})
writeHit('break', 0.54, ({ sweep, crack, ring }) => {
  crack(0, 0.2, 0.82)
  sweep(0, 0.34, 420, 60, 20, 0.6)
  for (const [i, n] of [293.66, 440, 698.46].entries()) ring(i * 0.031, 0.38, n, 0.23)
})
writeHit('guard', 0.3, ({ sweep, crack, ring }) => {
  crack(0, 0.042, 0.45)
  sweep(0, 0.16, 124, 76, 33, 0.55)
  ring(0.006, 0.28, 490, 0.32)
})
writeHit('counter', 0.54, ({ sweep, crack, ring }) => {
  ring(0, 0.2, 880, 0.31)
  sweep(0.014, 0.36, 190, 61, 27, 0.69)
  crack(0.014, 0.17, 0.56)
  ring(0.062, 0.39, 587.33, 0.27)
  ring(0.122, 0.3, 880, 0.19)
})
writeHit('hurt', 0.35, ({ sweep, crack }) => {
  crack(0, 0.17, 0.63, false)
  sweep(0, 0.29, 186, 56, 16, 0.68, 0.25)
  sweep(0.032, 0.27, 201, 62, 13, 0.3)
})
