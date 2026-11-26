;(() => {
  if (window.harborBridge) return
  const padLanes = ['kick', 'snare', 'hat', 'tom']
  const keys = { KeyD: 'kick', KeyF: 'snare', KeyJ: 'hat', KeyK: 'tom' }
  let midiRoutes = {}
  const contextConstructor = window.AudioContext || window.webkitAudioContext
  const clips = new Map()
  const decoding = new Map()
  const scoreFiles = new Map()
  let scoreCache
  const scheduled = new Set()
  const activeImpacts = new Set()
  const activeVoices = new Set()
  let audio, master, sceneBus, musicBus, effectsBus, decoder
  let impactProfile
  let songStart = null
  let songBeat = 0
  let crewEnd = -Infinity
  const lastEffect = new Map()
  const nextVariant = new Map()
  let midiAccess, currentMidi, send
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
    if (name.startsWith('battle')) {
      scoreFiles.set(name, data)
      return
    }
    const job = offline()
      .decodeAudioData(data.buffer)
      .then((buffer) => clips.set(name, buffer))
      .catch((error) => {
        console.error('Cannot decode battle music', name, error.message)
      })
    decoding.set(name, job)
  }
  function scoreFor(name) {
    if (scoreCache?.name === name) return scoreCache.decoded
    const file = scoreFiles.get(name)
    if (!file) throw new Error('Missing score: ' + name)
    // Decoding detaches its input and expands it to stereo float PCM.
    // Keep only the selected arrangement decoded on memory-constrained tablets.
    const decoded = offline()
      .decodeAudioData(file.buffer.slice(0))
      .catch((error) => {
        if (scoreCache?.decoded === decoded) scoreCache = undefined
        throw error
      })
    scoreCache = { name, decoded }
    return decoded
  }
  function setPcm(name, encoded, rate) {
    const bytes = unpack(encoded)
    const pcm = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const buffer = offline().createBuffer(1, bytes.byteLength / 2, rate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768
    clips.set(name, buffer)
  }

  function prepareSound() {
    if (!audio) {
      if (!contextConstructor) return Promise.reject(new Error('Web Audio unavailable'))
      audio = new contextConstructor({ latencyHint: 'interactive' })
      master = audio.createGain()
      master.gain.value = 0.78
      master.connect(audio.destination)
      effectsBus = audio.createGain()
      effectsBus.connect(master)
    }
    if (audio.state === 'suspended' || audio.state === 'interrupted') return audio.resume()
    return Promise.resolve()
  }
  function play(buffer, level, at, bus, group, rate = 1) {
    if (!audio || !bus || !buffer) return
    const src = audio.createBufferSource(),
      gain = audio.createGain()
    src.buffer = buffer
    src.playbackRate.value = rate
    gain.gain.value = level
    src.connect(gain).connect(bus)
    group?.add(src)
    src.onended = () => {
      group?.delete(src)
      gain.disconnect()
    }
    src.start(at)
  }
  function drums(lane, velocity, at = audio?.currentTime, bus = master, grouped = false) {
    play(clips.get('kit_' + lane), Math.min(1, Math.max(0.12, velocity / 127)) * 0.68, at, bus, grouped ? scheduled : null)
  }

  function stop(leaveImpacts = false) {
    generation++
    for (const src of scheduled) src.stop()
    scheduled.clear()
    for (const src of activeVoices) src.stop()
    activeVoices.clear()
    if (!leaveImpacts) {
      for (const src of activeImpacts) src.stop()
      activeImpacts.clear()
    }
    sceneBus?.disconnect()
    sceneBus = undefined
    musicBus?.disconnect()
    musicBus = undefined
    songStart = null
    crewEnd = -Infinity
    lastEffect.clear()
    nextVariant.clear()
  }
  function click(at, accent) {
    play(clips.get('kit_click'), accent ? 0.60 : 0.40, at, sceneBus, scheduled)
  }
  function impact(kind, strength = 1) {
    if (!audio || !impactProfile) return
    const at = audio.currentTime
    const ending = kind === 'win' || kind === 'lose'
    let name = kind === 'win' ? 'victory' : kind === 'lose' ? 'defeat' : kind
    const variants = impactProfile.variants[kind]
    if (variants) {
      const next = nextVariant.get(kind) || 0
      if (at - (lastEffect.get(kind) ?? -Infinity) < impactProfile.cooldown_ms[kind] / 1000) return
      lastEffect.set(kind, at)
      nextVariant.set(kind, (next + 1) % variants.length)
      name = variants[next]
    }
    const buffer = clips.get(name)
    if (!buffer) return
    const speech = !ending && (at < crewEnd || speechIsNear(at) || speechIsNear(at + 0.179))
    if (musicBus && !speech && impactProfile.ducked.includes(kind)) duckMusic(at)
    const gain = impactProfile.levels[kind] * (speech ? 0.58 : 1)
    play(buffer, gain * Math.min(1.1, Math.max(0.45, strength)), at, effectsBus, activeImpacts)
  }
  function voice(name) {
    const clip = clips.get('voice_' + name)
    if (!audio || !clip || audio.currentTime < crewEnd) return
    const at = audio.currentTime
    crewEnd = at + clip.duration
    if (musicBus) duckMusic(at, clip.duration)
    play(clip, 0.79, at, effectsBus, activeVoices)
  }
  function speechIsNear(at) {
    if (songStart === null) return false
    const seconds = at - songStart
    return impactProfile.speech_beats.some((beat) => {
      const entrance = beat * songBeat
      return seconds >= entrance - impactProfile.speech_lead &&
        seconds < entrance + impactProfile.speech_seconds
    })
  }
  function duckMusic(at, voiceDuration = 0) {
    const level = musicBus.gain
    if (typeof level.cancelAndHoldAtTime === 'function') level.cancelAndHoldAtTime(at)
    else {
      const current = level.value
      level.cancelScheduledValues(at)
      level.setValueAtTime(current, at)
    }
    const floor = voiceDuration ? 0.43 : 0.60
    const sustain = Math.max(0.064, voiceDuration)
    level.linearRampToValueAtTime(floor, at + 0.018)
    level.setValueAtTime(floor, at + sustain)
    level.linearRampToValueAtTime(0.77, at + sustain + 0.115)
  }

  async function start(beatMs, cuesJson, course = 0) {
    stop()
    const run = generation
    try {
      await prepareSound()
      const family = ['battle', 'battle_space', 'battle_space', 'battle_shuffle'][course]
      const suffix = Math.round(60000 / beatMs) === 72 ? '_slow' : ''
      const [track] = await Promise.all([scoreFor(family + suffix), ...decoding.values()])
      if (generation !== run) return
      if (!track || audio.state !== 'running') throw new Error('Battle audio unavailable')
      sceneBus = audio.createGain()
      sceneBus.connect(master)
      musicBus = audio.createGain()
      musicBus.gain.value = 0.77
      musicBus.connect(sceneBus)
      const beat = beatMs / 1000,
        countAt = audio.currentTime + 0.12,
        first = countAt + 4 * beat
      songStart = first
      songBeat = beat
      for (let i = 0; i < 4; i++) click(countAt + i * beat, i === 0)
      play(track, 1, first, musicBus, scheduled)
      if (impactProfile) {
        for (const [kind, position, offset] of impactProfile.timeline) {
          const at = first + position * beat + offset
          const gain = impactProfile.levels[kind] * (speechIsNear(at) ? 0.58 : 1)
          play(clips.get(kind), gain, at, effectsBus, scheduled)
        }
      }
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
  const controls = new Map()
  let canvas, safeProbe, targets = {}
  function displayMetrics() {
    const box = canvas.getBoundingClientRect()
    const safe = getComputedStyle(safeProbe)
    return JSON.stringify([box.width, box.height, ...['paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom'].map(key => parseFloat(safe[key]) || 0), matchMedia('(prefers-reduced-motion: reduce)').matches])
  }
  function positionControls() {
    const box = canvas.getBoundingClientRect()
    for (const [key, node] of controls) {
      const rect = targets[key]
      if (!rect) continue
      node.style.left = (box.left + rect[0] * box.width) + 'px'
      node.style.top = (box.top + rect[1] * box.height) + 'px'
      node.style.width = rect[2] * box.width + 'px'
      node.style.height = rect[3] * box.height + 'px'
    }
  }
  function bind(callback) {
    send = callback
    canvas = document.getElementById('canvas') || document.querySelector('canvas')
    safeProbe = document.createElement('div')
    safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'
    document.body.append(safeProbe)
    const labels = { action: '开始或结束战斗', tempo: '切换练习速度', midi: '连接电子鼓 MIDI', course: '切换训练课组', guide: '查看架子鼓练习谱', kick: '底鼓', snare: '军鼓', hat: '踩镲', tom: '通鼓' }
    for (const [key, label] of Object.entries(labels)) {
      const node = document.createElement(key === 'guide' ? 'a' : 'button')
      node.className = 'harbor-target'
      node.dataset.harborControl = key
      node.setAttribute('aria-label', label)
      if (key === 'guide') {
        node.href = '/practice/'
        node.target = '_blank'
        node.rel = 'noopener'
      } else {
        node.type = 'button'
        if (padLanes.includes(key)) {
          const hit = e => {
            strike(key, e)
            node.classList.remove('struck')
            // Restart without a synchronous style read on the input path.
            if (node._fadeTimer) clearTimeout(node._fadeTimer)
            node.classList.add('struck')
            node._fadeTimer = setTimeout(() => node.classList.remove('struck'), 72)
          }
          node.addEventListener('pointerdown', e => {
            if (e.button !== 0) return
            hit(e)
            e.preventDefault()
          })
          node.addEventListener('click', e => { if (e.detail === 0) hit(e) })
        } else {
          node.addEventListener('click', () => key === 'midi' ? connectMidi() : send(key))
        }
      }
      node.addEventListener('focus', () => send('focus', node.matches(':focus-visible') ? key : ''))
      node.addEventListener('blur', () => send('focus', ''))
      if (key === 'guide' || key === 'course') node.hidden = true
      controls.set(key, node)
      document.body.append(node)
    }
    const refresh = () => { positionControls(); send('layout') }
    new ResizeObserver(refresh).observe(canvas)
    window.addEventListener('resize', refresh)
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refresh)
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.altKey || e.metaKey || e.ctrlKey) return
      if (keys[e.code]) strike(keys[e.code], e)
      else if (e.code === 'KeyM') void connectMidi()
      else if (e.code === 'KeyB') send('tempo')
      else if (e.code === 'KeyL') send('course')
      else if (e.code === 'ArrowLeft') send('navigate', -1, 0)
      else if (e.code === 'ArrowRight') send('navigate', 1, 0)
      else if (e.code === 'ArrowUp') send('navigate', 0, -1)
      else if (e.code === 'ArrowDown') send('navigate', 0, 1)
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
    displayMetrics,
    setLayout: (json) => {
      targets = JSON.parse(json)
      positionControls()
    },
    connectMidi,
    focusControl: (name) => controls.get(name)?.focus({preventScroll: true}),
    openGuide: () => { if (!controls.get('guide').hidden) controls.get('guide').click() },
    tapPad: (lane) => controls.get(lane)?.click(),
    setClip,
    setPcm,
    configureImpacts: (json) => { impactProfile = JSON.parse(json) },
    setGuideVisible: (show) => {
      controls.get('guide').hidden = !show
      controls.get('course').hidden = !show
      controls.get('tempo').disabled = !show
    },
    setMidiRoutes: (json) => {
      midiRoutes = JSON.parse(json)
    },
    start,
    stop,
    impact,
    voice,
    now: () => performance.now(),
  }
})()
