import test from 'node:test'
import assert from 'node:assert/strict'
import { arcadeGames, ruleNames } from '../src/arcade/catalog.ts'
import { kit } from '../src/game.ts'

const stepLane = ({ step, lane }) => `${step}:${lane}`

test('the arcade has 20 unique, playable rounds across four difficulties', () => {
  assert.equal(arcadeGames.length, 20)
  assert.equal(new Set(arcadeGames.map(({ id }) => id)).size, arcadeGames.length)
  const patterns = new Set()
  for (const level of [1, 2, 3, 4]) {
    const games = arcadeGames.filter((game) => game.level === level)
    assert.deepEqual(new Set(games.map((game) => game.rule)), new Set(Object.keys(ruleNames)))
  }
  for (const game of arcadeGames) {
    const steps = game.bars * 16
    assert.ok(game.bpm > 0 && game.bars >= 4 && game.bars <= 8, game.id)
    assert.equal(game.music.length, game.bars, game.id)
    assert.ok(
      game.music.every((note) => Number.isInteger(note) && note >= 36 && note < 63),
      game.id,
    )
    assert.ok(game.notes.length > 0, game.id)
    assert.ok(game.notes.at(-1).step < steps - 2, game.id)
    assert.equal(new Set(game.notes.map(stepLane)).size, game.notes.length, game.id)
    assert.ok(new Set(game.notes.map(({ lane }) => lane)).size <= 6, game.id)
    for (const events of [game.notes, game.cues]) {
      assert.ok(
        events.every(
          ({ lane, step }, i) =>
            Object.hasOwn(kit, lane) &&
            Boolean(kit[lane].key) &&
            Number.isInteger(step) &&
            step >= 0 &&
            step < steps &&
            (i === 0 || events[i - 1].step <= step),
        ),
        game.id,
      )
    }
    const pattern = game.notes.map(stepLane).join()
    assert.ok(!patterns.has(pattern), game.id)
    patterns.add(pattern)
  }
})

test('every call in the echo games matches the exact lane and interval of its reply', () => {
  const delays = { 'pancake-turn': 8, 'satellite-echo': 8, 'robot-echo': 16, 'kitchen-echo': 16 }
  for (const game of arcadeGames.filter(({ rule }) => rule === 'echo')) {
    assert.deepEqual(
      game.cues.map((cue) => stepLane({ ...cue, step: cue.step + delays[game.id] })),
      game.notes.map(stepLane),
      game.id,
    )
  }
})

test('high signals have an answer and low signals never ask for the same drum at their response beat', () => {
  const delays = { 'signal-box': 4, 'still-wind': 2, 'oven-timer': 8, 'mars-traffic': 2 }
  for (const game of arcadeGames.filter(({ rule }) => rule === 'rest')) {
    const responseLane = game.cues[0].lane
    const answers = new Set(game.notes.filter(({ lane }) => lane === responseLane).map(stepLane))
    for (const cue of game.cues) {
      const when = stepLane({ ...cue, step: cue.step + delays[game.id] })
      const low = cue.note < 60
      assert.equal(answers.has(when), !low, `${game.id}: ${when}`)
      if (!low) answers.delete(when)
    }
    assert.equal(answers.size, 0, game.id)
  }
})

test('chords and accents form playable gestures over a whole round', () => {
  for (const game of arcadeGames.filter(({ rule }) => rule === 'chord')) {
    const counts = new Map()
    for (const { step } of game.notes) counts.set(step, (counts.get(step) || 0) + 1)
    assert.ok(
      [...counts.values()].some((count) => count > 1),
      game.id,
    )
    assert.ok(
      [...counts.values()].every((count) => count <= 3),
      game.id,
    )
  }
  for (const game of arcadeGames.filter(({ rule }) => rule === 'accent')) {
    const accents = game.notes.filter(({ accent }) => accent)
    assert.ok(accents.length >= game.bars, game.id)
    const lightLanes = new Set(game.notes.filter(({ accent }) => !accent).map(({ lane }) => lane))
    assert.ok(
      accents.every(({ lane }) => lightLanes.has(lane)),
      game.id,
    )
  }
})
