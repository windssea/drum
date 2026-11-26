;(() => {
  if (window.harborBridge) return
  const WIDTH = 1152,
    HEIGHT = 720
  const padLanes = ['kick', 'snare', 'hat', 'tom']
  const keys = { KeyD: 'kick', KeyF: 'snare', KeyJ: 'hat', KeyK: 'tom' }
  let midiRoutes = {}
  const contextConstructor = window.AudioContext || window.webkitAudioContext
  const clips = new Map()
  const decoding = new Map()
  const kit = new Map()
  const scheduled = new Set()
  let audio, master, sceneBus, musicBus, decoder
  let midiAccess, currentMidi, send
  let guideLink
  let midiPending = false,
    generation = 0

  function unpack(value) {
    if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(value)
    return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0))
  }

  function offline() {
    if (!decoder) decoder = new OfflineAudioContext(1, 1, 48000)
    return decoder
  }
  function setClip(name, encoded) {
    const data = unpack(encoded)
    const job = offline()
      .decodeAudioData(data.buffer)
      .then((buffer) => clips.set(name, buffer))
      .catch((error) => {
        console.error('Cannot decode battle music', name, error.message)
      })
    decoding.set(name, job)
  }
  function setPcm(name, encoded, rate) {
    const bytes = unpack(encoded)
    const pcm = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const buffer = offline().createBuffer(1, bytes.byteLength / 2, rate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768
    clips.set(name, buffer)
  }

  function makeDrum(lane) {
    const rate = offline().sampleRate
    const seconds = { kick: 0.3, snare: 0.19, hat: 0.085, tom: 0.28 }[lane]
    const buffer = offline().createBuffer(1, Math.ceil(seconds * rate), rate)
    const samples = buffer.getChannelData(0)
    let phase = 0,
      prev = 0
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate,
        white = 2 * Math.random() - 1
      if (lane === 'kick' || lane === 'tom') {
        const freq = lane === 'kick' ? 46 + 160 * Math.exp(-t * 40) : 118 + 92 * Math.exp(-t * 17)
        phase += (freq * 2 * Math.PI) / rate
        samples[i] = (Math.sin(phase) + 0.12 * Math.sin(phase * 2.02)) * Math.exp(-t * 17)
      } else if (lane === 'snare') {
        samples[i] =
          (0.55 * (white - prev * 0.7) + 0.32 * Math.sin(2 * Math.PI * 181 * t)) * Math.exp(-t * 29)
      } else {
        samples[i] = 0.38 * (white - prev) * Math.exp(-t * 68)
      }
      prev = white
      samples[i] *= Math.min(1, i / (rate * 0.0009), (samples.length - i) / (rate * 0.007))
    }
    return buffer
  }
  function prepareSound() {
    if (!audio) {
      if (!contextConstructor) return Promise.reject(new Error('Web Audio unavailable'))
      audio = new contextConstructor({ latencyHint: 'interactive' })
      master = audio.createGain()
      master.gain.value = 0.78
      master.connect(audio.destination)
    }
    if (audio.state === 'suspended' || audio.state === 'interrupted') return audio.resume()
    return Promise.resolve()
  }
  function play(buffer, level, at, bus, grouped = false, rate = 1) {
    if (!audio || !bus || !buffer) return
    const src = audio.createBufferSource(),
      gain = audio.createGain()
    src.buffer = buffer
    src.playbackRate.value = rate
    gain.gain.value = level
    src.connect(gain).connect(bus)
    if (grouped) scheduled.add(src)
    src.onended = () => {
      scheduled.delete(src)
      gain.disconnect()
    }
    src.start(at)
  }
  function drums(lane, velocity, at = audio?.currentTime, bus = master, grouped = false) {
    play(kit.get(lane), Math.min(1, Math.max(0.12, velocity / 127)) * 0.68, at, bus, grouped)
  }

  function stop() {
    generation++
    for (const src of scheduled) src.stop()
    scheduled.clear()
    sceneBus?.disconnect()
    sceneBus = undefined
    musicBus?.disconnect()
    musicBus = undefined
  }
  function click(at, accent) {
    const osc = audio.createOscillator(),
      g = audio.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(accent ? 1330 : 910, at)
    g.gain.setValueAtTime(0.26, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.055)
    osc.connect(g).connect(sceneBus)
    scheduled.add(osc)
    osc.onended = () => {
      scheduled.delete(osc)
      g.disconnect()
    }
    osc.start(at)
    osc.stop(at + 0.057)
  }
  function impact(kind, strength = 1) {
    const buffer = clips.get(kind === 'win' ? 'victory' : kind === 'lose' ? 'defeat' : kind)
    if (!audio || !buffer) return
    const at = audio.currentTime
    const ending = kind === 'win' || kind === 'lose'
    if (musicBus && !ending && kind !== 'hit') {
      const mix = musicBus.gain
      if (typeof mix.cancelAndHoldAtTime === 'function') mix.cancelAndHoldAtTime(at)
      else {
        const current = mix.value
        mix.cancelScheduledValues(at)
        mix.setValueAtTime(current, at)
      }
      mix.linearRampToValueAtTime(0.42, at + 0.009)
      mix.linearRampToValueAtTime(0.77, at + 0.18)
    }
    const gain = ending ? 0.78 : kind === 'hit' ? 0.36 : 0.64
    play(buffer, gain * Math.min(1.1, Math.max(0.45, strength)), at, master, true)
  }

  async function start(beatMs, cuesJson) {
    stop()
    const run = generation
    try {
      await prepareSound()
      await Promise.all(decoding.values())
      if (generation !== run) return
      const track = clips.get(Math.round(60000 / beatMs) === 72 ? 'battle_slow' : 'battle')
      if (!track || audio.state !== 'running') throw new Error('Battle audio unavailable')
      sceneBus = audio.createGain()
      sceneBus.connect(master)
      musicBus = audio.createGain()
      musicBus.gain.value = 0.77
      musicBus.connect(sceneBus)
      const beat = beatMs / 1000,
        countAt = audio.currentTime + 0.12,
        first = countAt + 4 * beat
      for (let i = 0; i < 4; i++) click(countAt + i * beat, i === 0)
      play(track, 1, first, musicBus, true)
      for (const [position, lane, velocity = 108] of JSON.parse(cuesJson)) {
        drums(lane, velocity, first + position * beat, sceneBus, true)
      }
      const output = audio.getOutputTimestamp?.()
      const valid =
        output?.performanceTime > 0 &&
        Number.isFinite(output.contextTime) &&
        Math.abs(performance.now() - output.performanceTime) < 350
      const downbeat = valid
        ? output.performanceTime + (first - output.contextTime) * 1000
        : performance.now() +
          (first - audio.currentTime + (audio.outputLatency || audio.baseLatency || 0)) * 1000
      send('round', downbeat)
    } catch {
      if (run === generation) {
        stop()
        send('audio_unavailable')
      }
    }
  }
  function stamp(e) {
    const now = performance.now()
    const time =
      e.timeStamp >= performance.timeOrigin ? e.timeStamp - performance.timeOrigin : e.timeStamp
    return time > 0 && time <= now + 1 ? time : now
  }
  function receive(e) {
    const [status, note, velocity] = e.data || []
    const lane = midiRoutes[note]
    if ((status & 0xf0) === 0x90 && velocity > 0 && typeof lane === 'string') {
      send('hit', lane || 'midi_extra', stamp(e), velocity, note)
    }
  }
  function attachMidi() {
    const ports = [...midiAccess.inputs.values()].filter((p) => p.state === 'connected')
    const preferred = ports.find((p) => /Roland|TD-\d|V-Drums/i.test(p.name || '')) || ports[0]
    if (preferred !== currentMidi) {
      currentMidi?.removeEventListener('midimessage', receive)
      currentMidi = preferred
      currentMidi?.addEventListener('midimessage', receive)
    }
    send('midi', currentMidi ? 'connected' : 'waiting')
  }
  async function connectMidi() {
    if (midiPending || midiAccess) return
    if (!navigator.requestMIDIAccess) {
      send('midi', 'unsupported')
      return
    }
    midiPending = true
    try {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false })
      midiAccess.addEventListener('statechange', attachMidi)
      attachMidi()
    } catch {
      send('midi', 'denied')
    } finally {
      midiPending = false
    }
  }
  function strike(lane, e) {
    const at = stamp(e)
    if (!audio || audio.state !== 'running') void prepareSound().catch(() => {})
    drums(lane, 106)
    send('hit', lane, at, 106)
  }
  function canvasPosition(canvas, e) {
    const rect = canvas.getBoundingClientRect()
    const fit = Math.min(rect.width / WIDTH, rect.height / HEIGHT)
    const x = (e.clientX - rect.left - (rect.width - WIDTH * fit) / 2) / fit
    const y = (e.clientY - rect.top - (rect.height - HEIGHT * fit) / 2) / fit
    return { x, y }
  }
  function trigger(canvas, e) {
    if (e.button !== 0) return
    const { x, y } = canvasPosition(canvas, e)
    if (y >= 605 && y <= 682 && x >= 36 && x <= 1116) {
      const index = Math.floor((x - 36) / 272)
      if ((x - 36) % 272 >= 264 || !padLanes[index]) return
      strike(padLanes[index], e)
    } else if (y >= 40 && y <= 90 && x >= 512 && x <= 1116) {
      if (x <= 684) send('tempo')
      else if (x >= 700 && x <= 919) void connectMidi()
      else if (x >= 935) send('action')
    } else return
    e.preventDefault()
  }
  function bind(callback) {
    send = callback
    for (const lane of padLanes) kit.set(lane, makeDrum(lane))
    const canvas = document.getElementById('canvas') || document.querySelector('canvas')
    canvas.addEventListener('pointerdown', (e) => trigger(canvas, e))
    // Use a real link so touch browsers and assistive technology can open the score.
    guideLink = document.createElement('a')
    guideLink.href = '/practice/'
    guideLink.target = '_blank'
    guideLink.rel = 'noopener'
    guideLink.hidden = true
    guideLink.setAttribute('aria-label', '查看七张架子鼓练习谱')
    Object.assign(guideLink.style, {position: 'fixed', zIndex: '4', borderRadius: '8px'})
    const positionGuide = () => {
      const rect = canvas.getBoundingClientRect()
      const fit = Math.min(rect.width / WIDTH, rect.height / HEIGHT)
      Object.assign(guideLink.style, {
        left: (rect.left + (rect.width - WIDTH * fit) / 2 + 56 * fit) + 'px',
        top: (rect.top + (rect.height - HEIGHT * fit) / 2 + 367 * fit) + 'px',
        width: (205 * fit) + 'px',
        height: (56 * fit) + 'px',
      })
    }
    document.body.append(guideLink)
    positionGuide()
    new ResizeObserver(positionGuide).observe(canvas)
    window.addEventListener('resize', positionGuide)
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.altKey || e.metaKey || e.ctrlKey) return
      if (keys[e.code]) strike(keys[e.code], e)
      else if (e.code === 'KeyM') void connectMidi()
      else if (e.code === 'KeyB') send('tempo')
      else if (e.code === 'Space') send('action')
      else return
      e.preventDefault()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stop()
        send('interrupted')
      }
    })
  }
  window.harborBridge = {
    bind,
    setClip,
    setPcm,
    setGuideVisible: (show) => { guideLink.hidden = !show },
    setMidiRoutes: (json) => { midiRoutes = JSON.parse(json) },
    start,
    stop,
    impact,
    now: () => performance.now(),
  }
})()
