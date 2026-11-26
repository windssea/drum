import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// All sound comes from the recorded Lyria performances. Cuts are taken a few
// milliseconds before the measured attack so the transient enters the game on beat.
const rate = 48000
const sources = fileURLToPath(new URL('../art/audio/lyria/', import.meta.url))
const music = fileURLToPath(new URL('../game/music/', import.meta.url))
const straight = [
  { start: .046, beats: 48 }, { start: 44.846, beats: 16 },
]
const triplet = [3.696, 15.696, 31.696, 55.696].map(start => ({ start, beats: 16 }))
const arrangements = [
  { stem: 'battle', file: 'harbor-straight.mp3', beatSeconds: .8, cuts: straight,
    lufs: -16.6, attackOffsetMs: { 96: -6, 72: 11 } },
  { stem: 'battle_space', file: 'harbor-straight-no-kit.flac', beatSeconds: .8, cuts: straight,
    lufs: -19.6, attackOffsetMs: { 96: -6, 72: 11 } },
  { stem: 'battle_shuffle', file: 'harbor-triplet-no-kit.flac', beatSeconds: .5, cuts: triplet,
    lufs: -18.8, attackOffsetMs: { 96: 11, 72: 12 } },
]

function ffmpeg(args, options = {}) {
  return execFileSync('ffmpeg', args, { maxBuffer: 64 * 1024 * 1024, ...options })
}
const raw = ['-f', 'f32le', '-ar', String(rate), '-ac', '2']

// Preserve pitch with overlap-add time stretching. Only phrase joins are faded:
// an uninterrupted 12-bar stretch keeps the performance and sung syllables intact.
function phrase(file, start, tempo, frames, tail = .008, extra = []) {
  const seconds = frames / rate
  const filters = [
    'aresample=' + rate, 'atempo=' + tempo, ...extra,
    'apad=whole_len=' + frames, 'atrim=end_sample=' + frames,
    'afade=t=in:d=0.001', 'afade=t=out:st=' + (seconds - tail) + ':d=' + tail,
  ]
  // Read beyond the selected musical endpoint to give WSOLA lookahead for the
  // last transient. Trim the processed output at the exact destination boundary.
  const audio = ffmpeg(['-hide_banner', '-loglevel', 'error', '-i', join(sources, file),
    '-af', 'atrim=start=' + start + ':end=' + (start + seconds * tempo + .20) +
      ',asetpts=PTS-STARTPTS,' + filters.join(','), ...raw, 'pipe:1'])
  if (audio.length !== frames * 2 * 4) throw Error('Unexpected phrase duration in ' + file)
  return audio
}

function master(audio, target) {
  // Analyze without altering the input. The recording only gets a static gain
  // adjustment, constrained by measured true peak. Its internal dynamics survive.
  const args = ['-hide_banner', '-nostats', ...raw, '-i', 'pipe:0',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=15:print_format=json', '-f', 'null', '-']
  const report = execResult(args, audio)
  const analysis = JSON.parse(report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1))
  const gain = Math.min(target - Number(analysis.input_i), -1.9 - Number(analysis.input_tp))
  if (!Number.isFinite(gain)) throw Error('No measurable audio in master')
  const samples = new Float32Array(audio.buffer, audio.byteOffset, audio.length / 4)
  const multiplier = 10 ** (gain / 20)
  for (let i = 0; i < samples.length; i++) samples[i] *= multiplier
  return audio
}

function execResult(args, input) {
  const run = spawnSync('ffmpeg', args, { input, maxBuffer: 4 * 1024 * 1024 })
  if (run.status !== 0) throw Error(run.error?.message || run.stderr.toString())
  return run.stderr.toString()
}

function encode(audio, stem) {
  ffmpeg(['-y', '-v', 'error', ...raw, '-i', 'pipe:0', '-c:a', 'libvorbis', '-q:a', '5',
    '-map_metadata', '-1', '-metadata', 'title=' + stem, join(music, stem + '.ogg')], { input: audio })
}

mkdirSync(music, { recursive: true })
const practiceOnly = process.argv.includes('--practice-only')
for (const arrangement of arrangements) {
  if (practiceOnly && arrangement.stem === 'battle') continue
  for (const bpm of [96, 72]) {
    const frameAt = beats => Math.round(beats * 60 / bpm * rate)
    const tempo = arrangement.beatSeconds * bpm / 60
    // Fixed WSOLA bias measured by correlating transient envelopes in each pair
    // of input/output recordings; a positive offset places the music later.
    const offset = arrangement.attackOffsetMs[bpm]
    const correction = offset > 0 ? 'adelay=' + offset + ':all=1' :
      'atrim=start_sample=' + Math.round(-offset * rate / 1000)
    const pieces = arrangement.cuts.map(({ start, beats }, index) => phrase(
      arrangement.file, start, tempo, frameAt(beats),
      index === arrangement.cuts.length - 1 ? .070 : .008, [correction]))
    const track = master(Buffer.concat(pieces), arrangement.lufs)
    const stem = arrangement.stem + (bpm === 72 ? '_slow' : '')
    encode(track, stem)
    encode(Buffer.concat([Buffer.alloc(frameAt(4) * 8), track]), stem + '_native')
    console.log(stem, track.length / 8, 'frames')
  }
}

if (!practiceOnly && !process.argv.includes('--battle-only')) {
  const victory = phrase('harbor-cadence.flac', 57.8325, 1, 88800, .065)
  const defeat = phrase('harbor-triplet.flac', 62.014, 1, 82560, .16, ['lowpass=f=2600'])
  encode(master(victory, -14.8), 'victory')
  encode(master(defeat, -17.5), 'defeat')
}
