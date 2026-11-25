import { BEAT, BPM, DURATION, type Lane } from './game'

let context: AudioContext | undefined
let output: GainNode | undefined
let noise: AudioBuffer | undefined
let backing: GainNode | undefined
let backingSources: AudioScheduledSourceNode[] = []

export function enableAudio(muted: boolean) {
  if (!window.AudioContext) return
  try {
    if (!context) {
      context = new AudioContext({ latencyHint: 'interactive' })
      output = context.createGain()
      output.connect(context.destination)
    }
    output!.gain.setTargetAtTime(muted ? 0 : 0.7, context.currentTime, 0.015)
    if (context.state === 'suspended') void context.resume().catch(() => {})
  } catch {
    // Visual feedback remains available when the device cannot open audio.
  }
}

function tone(
  destination: AudioNode, at: number, frequency: number, endFrequency: number,
  length: number, volume: number, shape: OscillatorType = 'sine',
) {
  const audio = context!
  const source = audio.createOscillator()
  const gain = audio.createGain()
  source.type = shape
  source.frequency.setValueAtTime(frequency, at)
  source.frequency.exponentialRampToValueAtTime(endFrequency, at + length * 0.8)
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  source.connect(gain).connect(destination)
  source.start(at)
  source.stop(at + length)
  return source
}

function hiss(at: number, length: number, frequency: number, volume: number) {
  const audio = context!
  if (!noise) {
    noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.26), audio.sampleRate)
    const samples = noise.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  }
  const source = audio.createBufferSource()
  const filter = audio.createBiquadFilter()
  const gain = audio.createGain()
  source.buffer = noise
  filter.type = 'highpass'
  filter.frequency.value = frequency
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  source.connect(filter).connect(gain).connect(output!)
  source.start(at)
  source.stop(at + length)
}

export function playDrum(lane: Lane, velocity: number) {
  if (!context || !output) return
  const at = context.currentTime + 0.003
  const strength = Math.max(0.05, velocity / 127)
  switch (lane) {
    case 'kick': tone(output, at, 142, 42, 0.26, 0.65 * strength); break
    case 'snare':
      hiss(at, 0.19, 980, 0.48 * strength)
      tone(output, at, 214, 122, 0.11, 0.23 * strength, 'triangle')
      break
    case 'hat': hiss(at, 0.075, 6600, 0.3 * strength); break
    case 'tom': tone(output, at, 240, 105, 0.25, 0.43 * strength, 'triangle'); break
  }
}

export function stopBacking() {
  for (const source of backingSources) source.stop()
  backingSources = []
  backing?.disconnect()
  backing = undefined
}

export function startBacking(startAt: number) {
  if (!context || !output) return
  stopBacking()
  backing = context.createGain()
  backing.connect(output)
  const lead = context.currentTime + Math.max(0.015, (startAt - performance.now()) / 1000)
  const beat = 60 / BPM
  const bass = [55, 55, 65.41, 49, 55, 55, 73.42, 49]
  for (let step = -4; step * BEAT < DURATION; step++) {
    const at = lead + step * beat
    const accent = step % 4 === 0
    if (at < context.currentTime) continue
    backingSources.push(tone(backing, at, accent ? 1300 : 840, accent ? 1000 : 680, 0.052, 0.12, 'triangle'))
    if (step >= 0 && step % 2 === 0) {
      const frequency = bass[(step / 2) % bass.length]
      backingSources.push(tone(backing, at, frequency, frequency, 0.26, 0.15, 'triangle'))
      backingSources.push(tone(backing, at + beat / 2, frequency * 2, frequency * 2, 0.12, 0.045, 'sine'))
    }
  }
}
