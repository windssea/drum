(() => {
  if (window.harborBridge) return
  const WIDTH = 1152
  const HEIGHT = 720
  const ROLAND_NOTES = { 35: 'kick', 36: 'kick', 37: 'snare', 38: 'snare', 40: 'snare' }
  const contextConstructor = window.AudioContext || window.webkitAudioContext
  let audio
  let kit
  let song
  let send
  let midiAccess
  let currentMidi
  let pendingMidi = false
  let scheduleId = 0

  function prepareSound() {
    if (!audio && contextConstructor) {
      audio = new contextConstructor({ latencyHint: 'interactive' })
      kit = {
        kick: drumBuffer('kick'),
        snare: drumBuffer('snare'),
      }
    }
    if (audio?.state === 'suspended' || audio?.state === 'interrupted') return audio.resume()
    return Promise.resolve()
  }

  function drumBuffer(lane) {
    const rate = audio.sampleRate
    const length = Math.round((lane === 'kick' ? 0.27 : 0.19) * rate)
    const buffer = audio.createBuffer(1, length, rate)
    const samples = buffer.getChannelData(0)
    let phase = 0
    let lastNoise = 0
    for (let i = 0; i < length; i++) {
      const t = i / rate
      if (lane === 'kick') {
        phase += (44 + 115 * Math.exp(-t * 37)) / rate
        samples[i] = Math.sin(phase * Math.PI * 2) * Math.exp(-t * 18) * 0.72
      } else {
        const white = 2 * Math.random() - 1
        const bright = (white - lastNoise * 0.65) * 0.40
        samples[i] = (bright + 0.20 * Math.sin(t * Math.PI * 356)) * Math.exp(-t * 29)
        lastNoise = white
      }
      samples[i] *= Math.min(1, i / (rate * 0.0015), (length - i) / (rate * 0.009))
    }
    return buffer
  }

  function drum(lane, velocity, at = audio?.currentTime ?? 0, output = audio?.destination) {
    if (!audio || !kit || !output) return
    const source = audio.createBufferSource()
    const level = audio.createGain()
    level.gain.value = velocity / 127 * 0.78
    source.buffer = kit[lane]
    source.connect(level).connect(output)
    source.start(at)
  }

  function tone(at, note, length, gain, type = 'sine') {
    const oscillator = audio.createOscillator()
    const level = audio.createGain()
    oscillator.type = type
    oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12)
    level.gain.setValueAtTime(0.0001, at)
    level.gain.exponentialRampToValueAtTime(gain, at + 0.009)
    level.gain.exponentialRampToValueAtTime(0.0001, at + length)
    oscillator.connect(level).connect(song)
    oscillator.start(at)
    oscillator.stop(at + length + 0.008)
  }

  function stop() {
    scheduleId++
    if (song) {
      song.disconnect()
      song = undefined
    }
  }

  async function start(beatMs, cuesJson) {
    stop()
    const request = scheduleId
    try {
      await prepareSound()
      if (request !== scheduleId) return
      if (!audio || audio.state !== 'running') {
        send('audio_unavailable')
        return
      }
      song = audio.createGain()
      song.gain.value = 0.77
      song.connect(audio.destination)
      const beat = beatMs / 1000
      const countAt = audio.currentTime + 0.15
      const first = countAt + 4 * beat

      for (let i = -4; i < 16; i++) {
        const at = first + i * beat
        const emphasis = i % 4 === 0
        tone(at, emphasis ? 93 : 88, 0.055, i < 0 ? 0.16 : 0.044, 'triangle')
        if (i < 0) continue
        const bar = Math.floor(i / 4)
        const root = [43, 48, 40, 45][bar]
        if (i % 2 === 0) {
          tone(at, root + (i % 4 === 2 ? 7 : 0), 0.44, 0.14, 'triangle')
          tone(at + beat / 2, root + 31, 0.19, 0.040)
        }
        if (i % 4 === 0) tone(at + beat * 0.28, [71, 76, 74, 72][bar], 0.31, 0.06)
        if (i % 4 === 3) tone(at + beat * 0.6, [74, 71, 76, 79][bar], 0.20, 0.04)
      }
      for (const [index, lane] of JSON.parse(cuesJson)) drum(lane, 106, first + index * beat, song)
      const output = audio.getOutputTimestamp?.()
      const stamped = output?.performanceTime > 0 && Number.isFinite(output.contextTime)
      const audibleStart = stamped
        ? output.performanceTime + (first - output.contextTime) * 1000
        : performance.now() + (first - audio.currentTime + (audio.baseLatency || 0) + (audio.outputLatency || 0)) * 1000
      send('round', audibleStart)
    } catch {
      if (request === scheduleId) send('audio_unavailable')
    }
  }

  function stamp(event) {
    const now = performance.now()
    return event.timeStamp > 0 && Math.abs(now - event.timeStamp) < 10000 ? event.timeStamp : now
  }

  function receive(event) {
    const [status = 0, note = 0, velocity = 0] = event.data || []
    const lane = ROLAND_NOTES[note]
    if ((status & 0xf0) === 0x90 && lane && velocity > 0) send('hit', lane, stamp(event), velocity)
  }

  function attachMidi() {
    const ports = [...midiAccess.inputs.values()].filter((port) => port.state === 'connected')
    const preferred = ports.find((port) => /Roland|TD-\d|V-Drums/i.test(port.name || '')) || ports[0]
    if (preferred !== currentMidi) {
      currentMidi?.removeEventListener('midimessage', receive)
      currentMidi = preferred
      currentMidi?.addEventListener('midimessage', receive)
    }
    send('midi', currentMidi ? 'connected' : 'waiting')
  }

  async function connectMidi() {
    if (pendingMidi || midiAccess) return
    if (!navigator.requestMIDIAccess) {
      send('midi', 'unsupported')
      return
    }
    pendingMidi = true
    try {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false })
      midiAccess.addEventListener('statechange', attachMidi)
      attachMidi()
    } catch {
      send('midi', 'denied')
    } finally {
      pendingMidi = false
    }
  }

  function strike(lane, event) {
    const at = stamp(event)
    // Initiate resume while the raw user gesture is still on the stack.
    prepareSound().catch(() => {})
    drum(lane, 105)
    send('hit', lane, at, 105)
  }

  function trigger(canvas, event) {
    if (event.button !== 0) return
    const rect = canvas.getBoundingClientRect()
    const fit = Math.min(rect.width / WIDTH, rect.height / HEIGHT)
    const x = (event.clientX - rect.left - (rect.width - WIDTH * fit) / 2) / fit
    const y = (event.clientY - rect.top - (rect.height - HEIGHT * fit) / 2) / fit
    if (y >= 544 && y <= 666 && x >= 36 && x <= 1116) {
      if (x > 568 && x < 584) return
      strike(x <= 568 ? 'kick' : 'snare', event)
      event.preventDefault()
    } else if (y >= 40 && y <= 90 && x >= 700 && x <= 1116) {
      if (x <= 919) connectMidi()
      else if (x >= 935) send('action')
      event.preventDefault()
    }
  }

  function bind(callback) {
    send = callback
    const canvas = document.getElementById('canvas') || document.querySelector('canvas')
    canvas.addEventListener('pointerdown', (event) => trigger(canvas, event))
    window.addEventListener('keydown', (event) => {
      if (event.repeat || event.altKey || event.metaKey || event.ctrlKey) return
      switch (event.code) {
        case 'KeyD': strike('kick', event); break
        case 'KeyF': strike('snare', event); break
        case 'KeyM': connectMidi(); break
        case 'Space': send('action'); break
        default: return
      }
      event.preventDefault()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stop()
        send('interrupted')
      }
    })
  }

  window.harborBridge = { bind, start, stop, now: () => performance.now() }
})()
