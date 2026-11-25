import { kit, type Lane, type Lesson, type Round } from './game'

let context: AudioContext | undefined, master: GainNode | undefined, noise: AudioBuffer | undefined
let masterMuted: boolean | undefined
let backing: GainNode | undefined
let scheduled: AudioScheduledSourceNode[] = []
let openHatGain: GainNode | undefined
let cached: { url: string; buffer: AudioBuffer } | undefined
const padSamples = new Map<string, AudioBuffer>()
const renderingSamples = new Set<string>()

export function enableAudio(muted: boolean) {
  try {
    if (!context) {
      context = new AudioContext({ latencyHint: 'interactive' })
      master = context.createGain()
      master.connect(context.destination)
    }
    if (masterMuted !== muted) {
      const level = muted ? 0 : 0.7
      if (masterMuted === undefined) master!.gain.value = level
      else master!.gain.setTargetAtTime(level, context.currentTime, 0.012)
      masterMuted = muted
    }
    if (context.state !== 'running' && context.state !== 'closed') return context.resume()
  } catch {
    /* Touch pads and the visual clock also work without Web Audio. */
  }
  return Promise.resolve()
}
function tone(
  bus: AudioNode,
  at: number,
  from: number,
  to: number,
  duration: number,
  gain: number,
  shape: OscillatorType = 'sine',
) {
  const c = bus.context,
    source = c.createOscillator(),
    amp = c.createGain()
  source.type = shape
  source.frequency.setValueAtTime(from, at)
  source.frequency.exponentialRampToValueAtTime(to, at + duration * 0.76)
  amp.gain.setValueAtTime(Math.max(0.0002, gain), at)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  source.connect(amp).connect(bus)
  source.start(at)
  source.stop(at + duration)
  return source
}
function hiss(bus: AudioNode, at: number, duration: number, freq: number, gain: number) {
  const c = bus.context
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const source = c.createBufferSource(),
    filter = c.createBiquadFilter(),
    amp = c.createGain()
  source.buffer = noise
  filter.type = 'highpass'
  filter.frequency.value = freq
  amp.gain.setValueAtTime(gain, at)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  source.connect(filter).connect(amp).connect(bus)
  source.start(at)
  source.stop(at + duration)
  return source
}
function drum(bus: AudioNode, at: number, lane: Lane, velocity: number) {
  const pad = kit[lane],
    strength = Math.max(0.05, velocity / 127)
  const pitch = pad.pitch
  switch (pad.voice) {
    case 'kick':
      return [tone(bus, at, 144, 42, 0.26, 0.67 * strength)]
    case 'snare':
      return [
        hiss(bus, at, 0.18, 930, 0.47 * strength),
        tone(bus, at, 215, 126, 0.12, 0.24 * strength, 'triangle'),
      ]
    case 'rim':
      return [
        tone(bus, at, pitch || 320, (pitch || 320) * 0.67, 0.12, 0.42 * strength, 'triangle'),
        hiss(bus, at, 0.075, 1500, 0.22 * strength),
      ]
    case 'stick':
      return [tone(bus, at, pitch || 790, (pitch || 790) * 0.62, 0.055, 0.44 * strength, 'triangle')]
    case 'tom':
    case 'aux':
      return [tone(bus, at, pitch * 1.45, pitch * 0.67, 0.37, 0.48 * strength, 'triangle')]
    case 'hat':
      return [hiss(bus, at, 0.085, 5700, 0.36 * strength)]
    case 'pedal':
      return [hiss(bus, at, 0.065, 3500, 0.42 * strength)]
    case 'open':
      return [hiss(bus, at, 0.52, 4700, 0.4 * strength)]
    case 'crash':
      return [
        hiss(bus, at, pitch ? 0.62 : 0.84, pitch ? 2650 : 2000, 0.52 * strength),
        tone(bus, at, 411, 329, 0.32, 0.08 * strength, 'square'),
      ]
    case 'ride':
      return [
        tone(bus, at, 880, 857, 0.38, 0.17 * strength, 'triangle'),
        hiss(bus, at, 0.31, 4300, 0.22 * strength),
      ]
    case 'bell':
      return [
        tone(bus, at, 1370, 1320, 0.42, 0.27 * strength),
        tone(bus, at, 2100, 2050, 0.27, 0.11 * strength),
      ]
  }
}

const grooveVoices = {
  rail: { bass: [0, 8, 14], melody: [2, 6, 10, 12], intervals: [7, 12, 14, 9], shape: 'triangle' },
  kitchen: { bass: [0, 6, 8, 12], melody: [2, 4, 10, 15], intervals: [12, 16, 19, 16], shape: 'sine' },
  space: { bass: [0, 10], melody: [2, 7, 11, 14], intervals: [12, 19, 21, 24], shape: 'sine' },
  garden: { bass: [0, 8], melody: [0, 5, 8, 13], intervals: [12, 14, 19, 17], shape: 'triangle' },
  factory: { bass: [0, 3, 8, 11], melody: [2, 6, 12, 14], intervals: [7, 15, 12, 17], shape: 'triangle' },
} as const

const hz = (note: number) => 440 * 2 ** ((note - 69) / 12)

function scheduleArcade(bus: AudioNode, first: number, beat: number, lesson: Lesson) {
  const track = lesson.arcade!
  const style = grooveVoices[track.style]
  for (let bar = 0; bar < lesson.bars; bar++) {
    const root = track.roots[bar % track.roots.length]
    const at = first + bar * 4 * beat
    const bass = hz(root >= 48 ? root - 12 : root)
    for (const step of style.bass) {
      const start = at + (step * beat) / 4
      scheduled.push(tone(bus, start, bass, bass, beat * 0.48, 0.15, 'triangle'))
    }
    style.melody.forEach((step, i) => {
      const start = at + (step * beat) / 4
      const pitch = hz(root + style.intervals[(i + bar) % style.intervals.length])
      scheduled.push(tone(bus, start, pitch, pitch, beat * 0.35, 0.065, style.shape))
    })
  }
  for (const cue of track.cues) {
    const at = first + (cue.step * beat) / 4
    if (cue.note === undefined) {
      scheduled.push(...drum(bus, at, cue.lane, 72))
    } else {
      const pitch = hz(cue.note)
      const end = cue.note < 54 ? pitch * 0.74 : pitch
      scheduled.push(tone(bus, at, pitch, end, beat * 0.4, 0.23, 'triangle'))
      if (cue.note >= 54) scheduled.push(tone(bus, at, pitch * 2, pitch * 2, beat * 0.19, 0.075))
    }
  }
}

function sampleKey(lane: Lane) {
  const { voice, pitch } = kit[lane]
  return voice + ':' + pitch
}

export function prepareDrums(ids: Iterable<Lane>) {
  if (!context || typeof OfflineAudioContext === 'undefined') return
  const rate = context.sampleRate
  for (const lane of ids) {
    const key = sampleKey(lane)
    if (padSamples.has(key) || renderingSamples.has(key)) continue
    try {
      const offline = new OfflineAudioContext(1, Math.ceil(rate * 0.86), rate)
      drum(offline.destination, 0, lane, 127)
      renderingSamples.add(key)
      void offline
        .startRendering()
        .then((buffer) => padSamples.set(key, buffer))
        .catch(() => {
          /* The live synthesizer is available if rendering fails. */
        })
        .finally(() => renderingSamples.delete(key))
    } catch {
      renderingSamples.delete(key)
    }
  }
}

export function playDrum(lane: Lane, velocity: number, muted: boolean) {
  if (muted) return
  if (!context || context.state !== 'running' || masterMuted) void enableAudio(false).catch(() => {})
  if (!context || !master) return
  const at = context.currentTime
  const voice = kit[lane].voice
  if (['hat', 'open', 'pedal'].includes(voice) && openHatGain) {
    openHatGain.gain.setTargetAtTime(0, at, 0.008)
    openHatGain = undefined
  }
  const sample = padSamples.get(sampleKey(lane))
  if (sample) {
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = sample
    gain.gain.value = Math.max(0.05, velocity / 127)
    source.connect(gain).connect(master)
    if (voice === 'open') openHatGain = gain
    source.onended = () => {
      gain.disconnect()
      if (openHatGain === gain) openHatGain = undefined
    }
    source.start()
    return
  }
  if (voice !== 'open') drum(master, at, lane, velocity)
  else {
    const gain = context.createGain()
    gain.connect(master)
    openHatGain = gain
    drum(gain, at, lane, velocity)[0].onended = () => {
      gain.disconnect()
      if (openHatGain === gain) openHatGain = undefined
    }
  }
  setTimeout(() => prepareDrums([lane]), 0)
}
export async function loadBacking(url: string, signal: AbortSignal) {
  if (!context) throw Error('浏览器无法播放歌曲音频')
  if (cached?.url === url) return cached.buffer
  const response = await fetch(url, { signal })
  if (!response.ok) throw Error('歌曲伴奏下载失败')
  const buffer = await context.decodeAudioData(await response.arrayBuffer())
  signal.throwIfAborted()
  cached = { url, buffer }
  return buffer
}
export function stopBacking() {
  for (const source of scheduled) source.stop()
  scheduled = []
  backing?.disconnect()
  backing = undefined
}
export function startBacking(round: Round, lesson: Lesson, buffer?: AudioBuffer) {
  stopBacking()
  if (!context || !master) return
  const c = context,
    beat = round.beat / 1000
  const countAt = c.currentTime + 0.12,
    first = countAt + 4 * beat
  const stamp = c.getOutputTimestamp?.()
  // Convert the scheduled downbeat into the same performance-clock domain as MIDI event.timeStamp.
  const usable =
    typeof stamp?.performanceTime === 'number' &&
    typeof stamp.contextTime === 'number' &&
    stamp.performanceTime > 0 &&
    Math.abs(performance.now() - stamp.performanceTime) < 250
  round.startAt = usable
    ? stamp.performanceTime! + (first - stamp.contextTime!) * 1000
    : performance.now() + (first - c.currentTime + (c.outputLatency || 0)) * 1000
  backing = c.createGain()
  backing.connect(master)
  for (let i = -4; i < lesson.bars * 4; i++) {
    if (lesson.song && i >= 0) break
    const freq = i % 4 === 0 ? 1380 : 920
    scheduled.push(
      tone(
        backing,
        first + i * beat,
        freq,
        freq * 0.8,
        0.046,
        i < 0 ? 0.24 : lesson.arcade ? (i % 4 === 0 ? 0.085 : 0.055) : 0.105,
        'triangle',
      ),
    )
  }
  if (lesson.arcade) scheduleArcade(backing, first, beat, lesson)
  if (buffer && lesson.song) {
    const source = c.createBufferSource()
    source.buffer = buffer
    source.connect(backing)
    source.start(first, lesson.song.offsetMs / 1000)
    scheduled.push(source)
  }
  if (round.demo) {
    let open: GainNode | undefined
    for (const note of round.targets) {
      const at = first + note.at / 1000,
        voice = kit[note.lane].voice
      if (open && ['hat', 'open', 'pedal'].includes(voice)) {
        open.gain.setTargetAtTime(0, at, 0.008)
        open = undefined
      }
      let bus = backing
      if (voice === 'open') {
        open = c.createGain()
        open.connect(backing)
        bus = open
      }
      scheduled.push(...drum(bus, at, note.lane, note.velocity ?? 94))
    }
  }
}
