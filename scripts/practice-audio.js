// Inlined at the end of the exported handbook. Read the same cells as its visible score.
(() => {
  const Audio = window.AudioContext || window.webkitAudioContext
  const controls = document.querySelector('[data-practice-controls]')
  if (!Audio || !controls) return
  const tempo = controls.querySelector('[data-practice-tempo]')
  const stopButton = controls.querySelector('[data-practice-stop]')
  const status = controls.querySelector('[data-practice-status]')
  const soundtrack = document.querySelector('[data-soundtrack]')
  const instruments = ['kick', 'snare', 'hat', 'tom', 'stick']
  const kit = new Map()
  let audio
  let playing

  let loadingKit
  function prepareKit() {
    if (!loadingKit) {
      const sources = JSON.parse(document.getElementById('practice-kit').textContent)
      loadingKit = Promise.all(instruments.map(async (name) => {
        const bytes = Uint8Array.from(atob(sources[name]), (char) => char.charCodeAt(0))
        kit.set(name, await audio.decodeAudioData(bytes.buffer))
      })).catch((error) => {
        loadingKit = undefined
        throw error
      })
    }
    return loadingKit
  }

  function stop(message = '已停止试听') {
    const run = playing
    if (!run) return
    playing = undefined
    for (const source of run.sources) {
      source.onended = null
      source.stop()
    }
    run.bus?.disconnect()
    run.button.textContent = '听两小节'
    run.button.setAttribute('aria-pressed', 'false')
    stopButton.disabled = true
    status.textContent = message
  }

  async function play(button) {
    soundtrack?.pause()
    const toggled = playing?.button === button
    stop()
    if (toggled) return
    const run = { button, sources: [] }
    playing = run
    stopButton.disabled = false
    button.setAttribute('aria-pressed', 'true')
    button.textContent = '停止试听'
    try {
      audio ??= new Audio({ latencyHint: 'interactive' })
      if (audio.state !== 'running') await audio.resume()
      if (playing !== run) return
      const events = JSON.parse(button.dataset.practiceEvents)
      const columns = Number(button.dataset.practiceColumns)
      const bpm = Number(tempo.value)
      if (![72, 96].includes(bpm) || !Number.isInteger(columns) || columns <= 0 ||
          !events.length || !events.every(([column, lane]) => Number.isInteger(column) &&
            column >= 0 && column < columns && instruments.includes(lane))) throw Error('Invalid score')
      await prepareKit()
      if (playing !== run) return
      const bar = 4 * 60 / bpm
      const start = audio.currentTime + .045
      run.bus = audio.createGain()
      run.bus.gain.value = .70
      run.bus.connect(audio.destination)
      for (let repeat = 0; repeat < 2; repeat++) {
        for (const [column, lane, velocity = 104] of events) {
          const source = audio.createBufferSource()
          const gain = audio.createGain()
          source.buffer = kit.get(lane)
          gain.gain.value = Math.max(0, Math.min(127, velocity)) / 127
          source.connect(gain).connect(run.bus)
          run.sources.push(source)
          source.start(start + (repeat + column / columns) * bar)
        }
      }
      // End on the bar line, including any written rests after the last note.
      const end = audio.createBufferSource()
      end.buffer = audio.createBuffer(1, 1, audio.sampleRate)
      end.connect(run.bus)
      end.onended = () => { if (playing === run) stop('两小节示范结束') }
      run.sources.push(end)
      end.start(start + 2 * bar)
      status.textContent = button.dataset.practiceTitle + ' · ' + bpm + ' BPM · 示范两小节'
    } catch {
      if (playing === run) stop('未能播放，请检查浏览器声音权限后重试')
    }
  }

  controls.hidden = false
  soundtrack?.addEventListener('play', () => { if (playing) stop() })
  for (const button of document.querySelectorAll('[data-practice-play]')) {
    button.hidden = false
    button.addEventListener('click', () => play(button))
  }
  stopButton.addEventListener('click', () => stop())
  tempo.addEventListener('change', () => stop('速度已更改，可重新试听'))
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop() })
  window.addEventListener('pagehide', () => stop())
})()
