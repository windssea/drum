/* End-to-end Web export check. Start a server for build/web, then run with
   PLAYWRIGHT_PATH pointing to playwright, CHROME_PATH to Chrome if needed. */
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')

const bpm = Number(process.env.BATTLE_BPM || 96)
assert.ok([72, 96].includes(bpm), 'Supported battle tempos are 72 and 96 BPM')
const course = Number(process.env.BATTLE_COURSE || 0)
assert.ok([0, 1, 2, 3].includes(course), 'Choose a course from 0 to 3')
const divisions = course === 3 ? 3 : 4
const kit = { K: 36, S: 38, H: 42, T: 48, X: 37 }
// Each column is one subdivision. Multiple instruments in a column are simultaneous.
function chart(columns, stepSize) {
  return columns.split(' ').flatMap((cell, i) =>
    Array.from(cell)
      .filter((key) => key in kit)
      .map((key) => [i * stepSize, kit[key]]),
  )
}
const attacks = [
  [chart('KH SH KH SH', 4), chart('KH H SH H KH H SH H', 2), chart('K H KS H K H KS H', 2)],
  [
    chart('KH H H KH SH H H H', 2),
    chart('KH H SH H KH KH SH H', 2),
    chart('KH H KSH H KH H KSH H', 2),
  ],
  [
    chart('KH H H H S H H H KH H H H S H H H', 1),
    chart('KH - SH K H - SH -', 2),
    chart('H H H H KXH H H H', 2),
  ],
  [
    chart('KH - H SH - H KH - H SH - H', 1),
    chart('KH - H H - H KSH - H H - H', 1),
    chart('KH H H SH H H KH H H SH H H', 1),
  ],
][course]
const straightGuards = [
  chart('S S S S S S S S', 2),
  chart('T T S S T T S S', 2),
  chart('T S T T S T S S T S T T S T S S', 1),
  chart('KH - H - SH - H - KH - H - S S T T', 1),
]
const tripletGuards = [
  chart('S S S S S S S S S S S S', 1),
  chart('T T S S T T S S T T S S', 1),
  chart('T S S T T S T S S T T S', 1),
  chart('KH - H SH - H KH - H S S T', 1),
]
const guards = course === 3 ? tripletGuards : straightGuards
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
  })
  try {
    const p = await browser.newPage({ viewport: {
      width: Number(process.env.BATTLE_WIDTH || 1024), height: Number(process.env.BATTLE_HEIGHT || 768),
    }, hasTouch: true })
    const errors = []
    p.on('pageerror', (e) => errors.push(e.message))
    p.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text())
    })
    await p.addInitScript(() => {
      const input = Object.assign(new EventTarget(), { state: 'connected', name: 'Roland TD test' })
      const scoreFiles = new Map()
      const buffers = new WeakMap()
      let installingPcm
      const createBuffer = BaseAudioContext.prototype.createBuffer
      BaseAudioContext.prototype.createBuffer = function (...args) {
        const buffer = createBuffer.apply(this, args)
        if (installingPcm) buffers.set(buffer, installingPcm)
        return buffer
      }
      const oggHeader = (bytes) => String.fromCharCode(...bytes.subarray(0, 48))
      const decode = OfflineAudioContext.prototype.decodeAudioData
      OfflineAudioContext.prototype.decodeAudioData = async function (data) {
        const name = scoreFiles.get(oggHeader(new Uint8Array(data)))
        const decoded = await decode.call(this, data)
        if (name) buffers.set(decoded, name)
        return decoded
      }
      const access = Object.assign(new EventTarget(), { inputs: new Map([['usb', input]]) })
      Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access })
      const qa = (window.battleQA = {
        clips: [],
        pcm: [],
        impacts: [],
        voices: [],
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
              if (method === 'impact' && args[0] === 'win') qa.finishedAt = performance.now()
              if (method === 'setClip') scoreFiles.set(atob(args[1].slice(0, 64)), args[0])
              if (method !== 'setPcm') return original(...args)
              installingPcm = args[0]
              try {
                return original(...args)
              } finally {
                installingPcm = undefined
              }
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
                  const at = qa.round + (step * 60000) / qa.bpm / qa.divisions
                  setTimeout(() => qa.strike(note), Math.max(0, at - performance.now()))
                }
              } else if (args[0] === 'hit') qa.hits.push(args[1])
              return callback(...args)
            })
        },
      })
      const start = AudioBufferSourceNode.prototype.start
      AudioBufferSourceNode.prototype.start = function (...args) {
        const clipName = buffers.get(this.buffer)
        if (this.context instanceof AudioContext && clipName?.startsWith('voice_'))
          qa.voices.push(clipName)
        if (this.context instanceof AudioContext && this.buffer)
          qa.buffers.push([
            this.buffer.duration,
            this.context.currentTime,
            args[0] || 0,
            this.playbackRate.value,
            buffers.get(this.buffer),
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
    assert.deepEqual(installed[0].sort(), [
      'battle',
      'battle_shuffle',
      'battle_shuffle_slow',
      'battle_slow',
      'battle_space',
      'battle_space_slow',
      'defeat',
      'victory',
    ])
    const kitNames = ['kit_click', 'kit_cross', 'kit_hat', 'kit_kick', 'kit_snare', 'kit_tom']
    assert.deepEqual(installed[1].filter((name) => name.startsWith('kit_')).sort(), kitNames)
    assert.deepEqual(installed[1].filter((name) => name.startsWith('voice_')).sort(), [
      'voice_castoff',
      'voice_heave',
      'voice_push',
      'voice_watch',
      'voice_win',
    ])
    assert.deepEqual(
      installed[1].filter((name) => !name.startsWith('kit_') && !name.startsWith('voice_')).sort(),
      [
        'accent',
        'armor',
        'break',
        'counter',
        'flurry',
        'guard',
        'guard_b',
        'hit',
        'hit_b',
        'hit_c',
        'hurt',
        'power',
        'slam',
        'start',
        'windup',
      ],
    )
    const control = name => p.locator('[data-harbor-control="' + name + '"]')
    const tap = name => control(name).tap()
    await p.keyboard.press('m')
    for (let i = 0; i < course; i++) {
      if (i === 0) await tap('course')
      else await p.keyboard.press('l')
    }
    const events = []
    // Choose freely, including a non-recommended first order.
    const sequence = process.env.BATTLE_FOLLOW_DEMO === '1' ? [0, 1, 2, 0] : [1, 0, 2, 0]
    sequence.forEach((order, i) => {
      attacks[order].forEach(([step, lane]) => events.push([(i * 16 + 4) * divisions + step, lane]))
      guards[i].forEach(([step, lane]) => events.push([(i * 16 + 12) * divisions + step, lane]))
    })
    await p.evaluate(
      ({ events, bpm, divisions }) => {
        battleQA.next = events
        battleQA.bpm = bpm
        battleQA.divisions = divisions
      },
      { events, bpm, divisions },
    )
    if (bpm === 72) await p.keyboard.press('b')
    await p.keyboard.press('Space')
    await p.waitForFunction(() => battleQA.round > 0, {}, { timeout: 15000 })
    const startTime = await p.evaluate(() => battleQA.round)
    if (process.env.BATTLE_CAPTURE) {
      await p.waitForFunction(
        ({ first, beat }) => performance.now() >= first + (beat * 60000) / battleQA.bpm,
        { first: startTime, beat: Number(process.env.BATTLE_CAPTURE_BEAT || 8.15) },
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
        roundMusic: q.buffers
          .filter((b) => Math.abs(b[0] - (64 * 60) / q.bpm) < 0.01 && b[3] === 1)
          .map((buffer) => buffer[4]),
        stinger: q.buffers.some((b) => Math.abs(b[0] - 1.85) < 0.01),
        sounded: [...new Set(q.buffers.map((b) => b[4]).filter(Boolean))],
        played: q.hits.length,
        frameP95: gaps[Math.ceil(gaps.length * 0.95) - 1],
        count: gaps.length,
      }
    })
    assert.equal(result.played, events.length)
    const score = ['battle', 'battle_space', 'battle_space', 'battle_shuffle'][course]
    assert.deepEqual(result.roundMusic, [score + (bpm === 72 ? '_slow' : '')])
    for (const effect of [
      'start',
      'windup',
      'slam',
      'armor',
      'power',
      'flurry',
      'break',
      'counter',
    ]) {
      assert.ok(result.sounded.includes(effect), 'Missing audible cue: ' + effect)
    }
    assert.equal(result.stinger, true)
    for (const kind of ['power', 'flurry', 'break', 'guard', 'counter', 'win'])
      assert.ok(result.effects.includes(kind), JSON.stringify(result))
    assert.equal(result.effects.filter((e) => e === 'counter').length, 4)
    assert.deepEqual(errors, [])
    await p.waitForFunction(() => battleQA.voices.includes('voice_win'), {}, { timeout: 3000 })
    if (process.env.BATTLE_RECORD) {
      await p.waitForFunction(() => performance.now() >= battleQA.finishedAt + 1850)
      const capture = await p.evaluate(() => window.battleRecording())
      require('node:fs').writeFileSync(process.env.BATTLE_RECORD, Buffer.from(capture, 'base64'))
    }
    // Touch and keyboard physically traverse the same four-pad layout in the browser.
    await p.keyboard.press('d')
    await p.keyboard.press('f')
    await p.keyboard.press('j')
    await p.keyboard.press('k')
    await tap('tom')
    assert.deepEqual(await p.evaluate(() => battleQA.hits.slice(-5)), [
      'kick',
      'snare',
      'hat',
      'tom',
      'tom',
    ])
    const cdp = await p.context().newCDPSession(p)
    const contact = async (name, id) => {
      const box = await control(name).boundingBox()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, id }
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [await contact('kick', 1), await contact('hat', 2)],
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
        await tap(['kick', 'snare', 'hat', 'tom'][i % 4])
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
      await tap('tempo')
      await p.evaluate(() => {
        battleQA.bpm = battleQA.bpm === 96 ? 72 : 96
      })
      await tap('action')
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
    const voicesHeard = await p.evaluate(() => [...new Set(battleQA.voices)])
    for (const line of ['voice_castoff', 'voice_win'])
      assert.ok(voicesHeard.includes(line), 'Missing ' + line)
    const newPage = p.context().waitForEvent('page', { timeout: 8000 })
    await tap('guide')
    const guide = await newPage
    await guide.waitForLoadState('domcontentloaded')
    assert.equal(new URL(guide.url()).pathname, '/practice/')
    assert.equal(await guide.locator('pre').count(), 20)
    const lessons = guide.locator('[data-practice-play]')
    assert.equal(await lessons.count(), 20)
    await lessons.nth(9).click()
    await guide.waitForFunction(() =>
      document.querySelector('[data-practice-status]')?.textContent.includes('72 BPM'),
    )
    await guide.locator('[data-practice-stop]').click()
    assert.equal(await guide.locator('[data-practice-stop]').isDisabled(), true)
    assert.equal(
      await guide.locator('audio[data-soundtrack]').getAttribute('src'),
      '/index.theme.ogg',
    )
    await guide.close()
    console.log(
      JSON.stringify({
        scoredInputs: events.length,
        bpm,
        course,
        beats: 64,
        actions: result.effects.filter((e) => !['hit', 'guard'].includes(e)),
        frameP95: result.frameP95,
        frames: result.count,
        pcmInstalled: installed[1].length,
        completeScore: true,
        victoryStinger: true,
        practiceCharts: 20,
        voicesHeard,
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
