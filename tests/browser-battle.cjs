/* End-to-end Web export check. Start a server for build/web, then run with
   PLAYWRIGHT_PATH pointing to playwright, CHROME_PATH to Chrome if needed. */
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')

const bpm = Number(process.env.BATTLE_BPM || 96)
assert.ok([72, 96].includes(bpm), 'Supported battle tempos are 72 and 96 BPM')
const kit = { K: 36, S: 38, H: 42, T: 48 }
// Each column is one subdivision. Multiple instruments in a column are simultaneous.
function chart(columns, stepSize) {
  return columns.split(' ').flatMap((cell, i) =>
    Array.from(cell)
      .filter((key) => key in kit)
      .map((key) => [i * stepSize, kit[key]]),
  )
}
const attacks = [
  chart('KH SH KH SH', 4),
  chart('KH H SH H KH H SH H', 2),
  chart('K H KS H K H KS H', 2),
]
const guards = [
  chart('S S S S S S S S', 2),
  chart('T T S S T T S S', 2),
  chart('T S T T S T S S T S T T S T S S', 1),
  chart('KH - H - SH - H - KH - H - S S T T', 1),
]
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
  })
  try {
    const p = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true })
    const errors = []
    p.on('pageerror', (e) => errors.push(e.message))
    p.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text())
    })
    await p.addInitScript(() => {
      const input = Object.assign(new EventTarget(), { state: 'connected', name: 'Roland TD test' })
      const access = Object.assign(new EventTarget(), { inputs: new Map([['usb', input]]) })
      Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access })
      const qa = (window.battleQA = {
        clips: [],
        pcm: [],
        impacts: [],
        hits: [],
        buffers: [],
        next: [],
        frames: [],
        round: 0,
      })
      qa.strike = (note, velocity = 106) =>
        input.dispatchEvent(
          Object.assign(new Event('midimessage'), { data: new Uint8Array([153, note, velocity]) }),
        )
      let bridge
      Object.defineProperty(window, 'harborBridge', {
        get: () => bridge,
        set(value) {
          bridge = value
          for (const [method, field] of [
            ['setClip', 'clips'],
            ['setPcm', 'pcm'],
            ['impact', 'impacts'],
          ]) {
            const original = value[method]
            value[method] = (...args) => {
              qa[field].push(args[0])
              return original(...args)
            }
          }
          const bind = value.bind
          value.bind = (callback) =>
            bind((...args) => {
              if (args[0] === 'round') {
                qa.round = args[1]
                qa.frames = []
                const tick = (t) => {
                  if (t >= qa.round) {
                    qa.frames.push(t)
                  }
                  if (t < qa.round + (64 * 60000) / qa.bpm - 500) requestAnimationFrame(tick)
                }
                requestAnimationFrame(tick)
                for (const [step, note] of qa.next) {
                  const at = qa.round + (step * 60000) / qa.bpm / 4
                  setTimeout(() => qa.strike(note), Math.max(0, at - performance.now()))
                }
              } else if (args[0] === 'hit') qa.hits.push(args[1])
              return callback(...args)
            })
        },
      })
      const start = AudioBufferSourceNode.prototype.start
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.context instanceof AudioContext && this.buffer)
          qa.buffers.push([
            this.buffer.duration,
            this.context.currentTime,
            args[0] || 0,
            this.playbackRate.value,
          ])
        return start.apply(this, args)
      }
    })
    if (process.env.BATTLE_RECORD) {
      await p.addInitScript(() => {
        const connect = AudioNode.prototype.connect
        const mixTaps = new WeakMap()
        AudioNode.prototype.connect = function (...args) {
          const result = connect.apply(this, args)
          if (args[0] instanceof AudioDestinationNode && this.context instanceof AudioContext) {
            let tap = mixTaps.get(this.context)
            if (!tap) {
              tap = this.context.createMediaStreamDestination()
              mixTaps.set(this.context, tap)
            }
            connect.call(this, tap)
          }
          return result
        }
        const start = AudioBufferSourceNode.prototype.start
        AudioBufferSourceNode.prototype.start = function (...args) {
          const tap = mixTaps.get(this.context)
          if (
            !window.battleRecording &&
            tap &&
            Math.abs((this.buffer?.duration ?? 0) - (64 * 60) / battleQA.bpm) < 0.01
          ) {
            const stream = document.querySelector('canvas').captureStream(30)
            stream.addTrack(tap.stream.getAudioTracks()[0])
            const recorder = new MediaRecorder(stream, {
              mimeType: 'video/webm;codecs=vp8,opus',
              videoBitsPerSecond: 2500000,
            })
            const chunks = []
            recorder.ondataavailable = (event) => {
              if (event.data.size) chunks.push(event.data)
            }
            window.battleRecording = () =>
              new Promise((resolve) => {
                recorder.onstop = async () => {
                  const reader = new FileReader()
                  reader.onload = () => resolve(reader.result.split(',')[1])
                  reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }))
                }
                recorder.stop()
              })
            recorder.start(1000)
          }
          return start.apply(this, args)
        }
      })
    }
    if (process.env.BATTLE_TEST_LATENCY === '1') {
      await p.addInitScript(() => {
        const hits = (window.padLatency = [])
        let current
        document.addEventListener(
          'pointerdown',
          (event) => {
            if (!window.measurePads) return
            current = { input: event.timeStamp, received: performance.now() }
            hits.push(current)
          },
          { capture: true },
        )
        const start = AudioBufferSourceNode.prototype.start
        AudioBufferSourceNode.prototype.start = function (...args) {
          if (current && !current.audio && this.context instanceof AudioContext)
            current.audio = performance.now()
          return start.apply(this, args)
        }
        for (const method of [
          'drawElements',
          'drawArrays',
          'drawElementsInstanced',
          'drawArraysInstanced',
        ]) {
          const draw = WebGL2RenderingContext.prototype[method]
          WebGL2RenderingContext.prototype[method] = function (...args) {
            if (current && current.audio && !current.draw) current.draw = performance.now()
            return draw.apply(this, args)
          }
        }
      })
    }
    const res = await p.goto(process.env.BATTLE_URL || 'http://127.0.0.1:4226/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    assert.equal(res.status(), 200)
    await p.waitForFunction(
      () => window.harborBridge && !document.querySelector('#status'),
      {},
      { timeout: 150000 },
    )
    const installed = await p.evaluate(() => [battleQA.clips, battleQA.pcm])
    assert.deepEqual(installed[0].sort(), ['battle', 'battle_slow', 'defeat', 'victory'])
    assert.deepEqual(installed[1].sort(), [
      'break',
      'counter',
      'flurry',
      'guard',
      'hit',
      'hurt',
      'power',
    ])
    await p.keyboard.press('m')
    const events = []
    // Choose freely, including a non-recommended first order.
    ;[1, 0, 2, 0].forEach((order, i) => {
      attacks[order].forEach(([step, lane]) => events.push([i * 64 + 16 + step, lane]))
      guards[i].forEach(([step, lane]) => events.push([i * 64 + 48 + step, lane]))
    })
    await p.evaluate(
      ({ events, bpm }) => {
        battleQA.next = events
        battleQA.bpm = bpm
      },
      { events, bpm },
    )
    if (bpm === 72) await p.keyboard.press('b')
    await p.keyboard.press('Space')
    await p.waitForFunction(() => battleQA.round > 0, {}, { timeout: 15000 })
    const startTime = await p.evaluate(() => battleQA.round)
    if (process.env.BATTLE_CAPTURE) {
      await p.waitForFunction(
        (first) => performance.now() >= first + (8.15 * 60000) / battleQA.bpm,
        startTime,
        {
          timeout: 15000,
        },
      )
      await p.screenshot({ path: process.env.BATTLE_CAPTURE })
    }
    await p.waitForFunction(
      () => battleQA.impacts.includes('win') || battleQA.impacts.includes('lose'),
      {},
      { timeout: 70000 },
    )
    const result = await p.evaluate(() => {
      const q = battleQA,
        gaps = q.frames
          .slice(1)
          .map((t, i) => t - q.frames[i])
          .sort((a, b) => a - b)
      return {
        effects: q.impacts,
        roundMusic: q.buffers.filter((b) => Math.abs(b[0] - (64 * 60) / q.bpm) < 0.01 && b[3] === 1)
          .length,
        stinger: q.buffers.some((b) => Math.abs(b[0] - 1.85) < 0.01),
        played: q.hits.length,
        frameP95: gaps[Math.ceil(gaps.length * 0.95) - 1],
        count: gaps.length,
      }
    })
    assert.equal(result.played, events.length)
    assert.equal(result.roundMusic, 1)
    assert.equal(result.stinger, true)
    for (const kind of ['power', 'flurry', 'break', 'guard', 'counter', 'win'])
      assert.ok(result.effects.includes(kind), JSON.stringify(result))
    assert.equal(result.effects.filter((e) => e === 'counter').length, 4)
    assert.deepEqual(errors, [])
    if (process.env.BATTLE_RECORD) {
      await p.waitForTimeout(1850)
      const capture = await p.evaluate(() => window.battleRecording())
      require('node:fs').writeFileSync(process.env.BATTLE_RECORD, Buffer.from(capture, 'base64'))
    }
    // Touch and keyboard physically traverse the same four-pad layout in the browser.
    await p.keyboard.press('d')
    await p.keyboard.press('f')
    await p.keyboard.press('j')
    await p.keyboard.press('k')
    const box = await p.locator('canvas').boundingBox()
    const s = Math.min(box.width / 1152, box.height / 720)
    const tap = (x, y) =>
      p.touchscreen.tap(
        box.x + (box.width - 1152 * s) / 2 + x * s,
        box.y + (box.height - 720 * s) / 2 + y * s,
      )
    await tap(980, 645)
    assert.deepEqual(await p.evaluate(() => battleQA.hits.slice(-5)), [
      'kick',
      'snare',
      'hat',
      'tom',
      'tom',
    ])
    const cdp = await p.context().newCDPSession(p)
    const contact = (x, id) => ({
      x: box.x + (box.width - 1152 * s) / 2 + x * s,
      y: box.y + (box.height - 720 * s) / 2 + 645 * s,
      id,
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [contact(155, 1), contact(690, 2)],
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    assert.deepEqual(await p.evaluate(() => battleQA.hits.slice(-2)), ['kick', 'hat'])
    const articulations = await p.evaluate(() => {
      const before = battleQA.hits.length
      for (const note of [42, 22, 46, 44, 40, 50, 49, 51, 53, 38, 43]) battleQA.strike(note)
      battleQA.strike(38, 0)
      return battleQA.hits.slice(before)
    })
    assert.deepEqual(articulations, ['hat', 'hat', ...Array(7).fill('midi_extra'), 'snare', 'tom'])
    if (process.env.BATTLE_TEST_LATENCY === '1') {
      await p.evaluate(() => (window.measurePads = true))
      for (let i = 0; i < 20; i++) {
        await tap(150 + (i % 4) * 272, 645)
        await p.waitForFunction((index) => window.padLatency[index]?.draw, i, { timeout: 1500 })
      }
      await p.evaluate(() => (window.measurePads = false))
      const timings = await p.evaluate(() => window.padLatency)
      const p95 = (list) => list.sort((a, b) => a - b)[Math.ceil(list.length * 0.95) - 1]
      console.log(
        JSON.stringify({
          touchSampleCount: timings.length,
          handlerToAudioScheduleP95: p95(timings.map((t) => t.audio - t.received)),
          eventToFirstDrawP95: p95(timings.map((t) => t.draw - t.input)),
        }),
      )
    }
    if (process.env.BATTLE_TEST_LOSS === '1') {
      await p.evaluate(() => {
        battleQA.next = []
        battleQA.impacts = []
        battleQA.buffers = []
      })
      await tap(596, 65)
      await p.evaluate(() => {
        battleQA.bpm = battleQA.bpm === 96 ? 72 : 96
      })
      await tap(1000, 65)
      await p.waitForFunction(() => battleQA.impacts.includes('lose'), {}, { timeout: 55000 })
      assert.equal(await p.evaluate(() => battleQA.impacts.filter((k) => k === 'hurt').length), 3)
      assert.ok(await p.evaluate(() => battleQA.buffers.some((b) => Math.abs(b[0] - 1.72) < 0.01)))
      assert.ok(
        await p.evaluate(() =>
          battleQA.buffers.some((b) => Math.abs(b[0] - (64 * 60) / battleQA.bpm) < 0.01),
        ),
      )
      assert.deepEqual(errors, [])
    }
    await p.waitForTimeout(1900)
    const newPage = p.context().waitForEvent('page', { timeout: 8000 })
    await tap(159, 395)
    const guide = await newPage
    await guide.waitForLoadState('domcontentloaded')
    assert.equal(new URL(guide.url()).pathname, '/practice/')
    assert.equal(await guide.locator('pre').count(), 7)
    await guide.close()
    console.log(
      JSON.stringify({
        scoredInputs: events.length,
        bpm,
        beats: 64,
        actions: result.effects.filter((e) => !['hit', 'guard'].includes(e)),
        frameP95: result.frameP95,
        frames: result.count,
        pcmInstalled: installed[1].length,
        completeScore: true,
        victoryStinger: true,
        practiceCharts: 7,
        defeatRun: process.env.BATTLE_TEST_LOSS === '1',
        errors,
      }),
    )
  } finally {
    await browser.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
