import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { defaults, decodeNote, judgeHit, makeRound } from '../src/game.ts'

const chart = JSON.parse(readFileSync(new URL('../public/songs/frere-jacques/chart.json', import.meta.url)))
const song = { ...chart, division: 8 }

test('Roland articulations remain distinct and releases never consume a note', () => {
  const notes = [36, 38, 37, 40, 48, 50, 45, 47, 43, 58, 42, 22, 46, 26, 44, 49, 55, 57, 52, 51, 59, 53, 27, 28]
  assert.equal(new Set(notes.map(note => defaults[note])).size, 24)
  assert.ok(notes.every(note => defaults[note]))
  for (const bytes of [[0x89, 42, 99], [0x99, 42, 0], [0xb9, 4, 110], [0xa9, 49, 127]]) {
    assert.equal(decodeNote(new Uint8Array(bytes)), null)
  }
  assert.deepEqual(decodeNote(new Uint8Array([0x99, 53, 112])), { note: 53, velocity: 112, channel: 10 })
})

test('simultaneous kick and closed hat are independent; open hat, pedal and rebounds cannot claim them', () => {
  const round = makeRound(song, 80, 1000, false)
  for (const lane of ['openHat', 'pedalHat', 'ride', 'bell']) assert.equal(judgeHit(round, lane, 1000), null)
  assert.equal(judgeHit(round, 'hatEdge', 1002)?.judgment, 'perfect')
  assert.equal(judgeHit(round, 'hat', 1005), null)
  assert.equal(judgeHit(round, 'kick', 970)?.offset, -30)
  assert.equal(round.resolved.size, 2)
})

test('the song contains 70 playable hits in eight bars, ending with a unison at 22.5 s', () => {
  const round = makeRound(song, 80, 0, false)
  assert.equal(round.duration, 24000)
  assert.equal(round.targets.length, 70)
  assert.deepEqual(round.targets.filter(n => n.at === 22500).map(n => n.lane).sort(), ['crash', 'kick'])
  for (const n of round.targets) assert.equal(judgeHit(round, n.lane, n.at)?.judgment, 'perfect')
  assert.equal(round.resolved.size, 70)
})
