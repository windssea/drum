import test from 'node:test'
import assert from 'node:assert/strict'
import { judgeHit, makeRound, ACCENT_VELOCITY } from '../src/game.ts'

function round(notes, options = {}) {
  const lesson = { bpm: 100, bars: 4, division: 16, notes,
    arcade: { style: 'rail', roots: [48], cues: [], together: false, inputOffset: 0, ...options } }
  return makeRound(lesson, 100, 5000, false)
}

test('millisecond event timestamps determine the window and use signed calibration', () => {
  const bar = round([{ step: 0, lane: 'kick' }, { step: 1, lane: 'kick' }], { inputOffset: 45 })
  assert.equal(bar.window, 72)
  assert.equal(judgeHit(bar, 'kick', 4972), null)
  assert.equal(judgeHit(bar, 'kick', 5047)?.offset, 2)
  assert.equal(judgeHit(bar, 'kick', 5160)?.offset, -35)
  assert.equal(judgeHit(bar, 'kick', 5195), null)
  const ahead = round([{step: 0, lane: 'kick'}], {inputOffset:-55})
  assert.equal(judgeHit(ahead,'kick',4945)?.offset, 0)
})

test('a cue without a target, a wrong pad and a weak accent score no hit', () => {
  const bar = round([{ step: 4, lane: 'snare', dynamics: 'strong' }, { step: 8, lane: 'snare', dynamics: 'soft' }])
  assert.equal(judgeHit(bar, 'snare', 5000), null)
  assert.equal(judgeHit(bar, 'kick', 5600), null)
  assert.deepEqual(judgeHit(bar, 'snare', 5600, ACCENT_VELOCITY - 1), { judgment: 'extra', mistake: 'strong' })
  assert.equal(judgeHit(bar, 'snare', 5600, ACCENT_VELOCITY)?.judgment, 'perfect')
  assert.deepEqual(judgeHit(bar, 'snare', 6200, 125), { judgment: 'extra', mistake: 'soft' })
  assert.equal(judgeHit(bar, 'snare', 6200, 70)?.judgment, 'perfect')
})

test('a chord requires distinct pads inside 55 ms, regardless of hit order', () => {
  const notes = [{ step: 4, lane: 'kick' }, { step: 4, lane: 'crash' }]
  const bar = round(notes, { together: true })
  assert.equal(judgeHit(bar, 'crashEdge', 5570)?.judgment, 'perfect')
  assert.deepEqual(judgeHit(bar, 'kick', 5626), { judgment: 'extra', mistake: 'together' })
  assert.equal(judgeHit(bar, 'kick', 5625)?.judgment, 'perfect')
  assert.equal(judgeHit(bar, 'crash', 5600), null)
  assert.deepEqual([...bar.resolved], [1, 0])
})
