import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const outputRoot = join(root, 'build', 'google-audio')
const serverUrl = 'https://generativelanguage.googleapis.com'
const apiRevision = '2026-05-20'
const musicModel = 'lyria-3.5'
const voiceModel = 'gemini-3.8-flash-tts'
const waves = { response_format: { mime_type: 'audio/wav' }, store: true }

const musicPrompt = `Compose an original 40.000-second cartoon harbor boss-battle soundtrack audition for 潮汐鼓港. Exact target: 96 BPM locked to 4/4, 16 bars of 2.500 seconds, D minor, first downbeat at 0.000, no count-in. Bright nautical adventure band on a little wooden drumboat versus a turquoise bronze-bell crab. A D–F–A–G trumpet call, mischievous clarinet reply, clipped accordion chords, pizzicato strings and upright bass. The pulse must be clear on small speakers; short percussion accents only, leave space for a real player to strike.

[0–10 s, bars 1–4] Show the drummer's four-note idea. The young lead drummer gives one bright Mandarin call “起锚！” near 0.3 s; the band answers. Thin out for the second and fourth bars.
[10–20 s, bars 5–8] Playful transposed brass and clarinet reply; deeper crew answers “嗨哟！” near 10.3 s. Back off the kit during player response.
[20–30 s, bars 9–12] The crab winds up; low stopped brass, sparse woodblock, and the captain calls “当心！” near 20.3 s, then leave clear rests.
[30–40 s, bars 13–16] The crew calls “破浪！” near 30.3 s. Original brass lead and crew on a short wordless double answer, climbing into A7 then resolving fully to D minor right before 40.000 s. No slow fade, extra bars or other words. Make those four short spoken or chanted Mandarin phrases clear and separated from lead instruments. No borrowed tune or real-person voice imitation.`

const percussionPrompt = `Record a percussion-only soundboard performance from an original sparse score, for a cartoon wooden drumboat versus a bronze bell-shell crab. 16 measures of 4/4, 96 BPM, 40 seconds. Start one event on each measure's first downbeat and leave the rest of the bar silent, like isolated sample takes. Dry close-miked attack with a short 0.2–0.55 s natural decay; leave over 1.5 s of silence between events. No ambience, click, accompanying instruments, melody, voice, chanting, constant beat or backing track. At bars 1–3 play three different wood-rim taps with a small bronze edge; bar 4 a bright exact bell ping; 5 a nautical double wood signal; 6 a rising struck-guiro and bronze rattle; 7 a heavy low drum and struck bronze slam; 8 a round mallet and clamped plate; 9 three fluttering woodblocks; 10 a low thump and short cabasa wash; 11–12 two muted shield-like metal-and-wood catches; 13 a bright counter bell with a wood crack; 14 a dull hull slap with a dry wooden creak; 15 a sudden sequence of striking and cracking wood and metal for boss armor; 16 one tiny stopped bell and silence. Perform the sequence once. The take will be cut into individual sounds.`

const voicePrompt = `LeadDrummer [clear, spirited, a quick rallying call in natural Mandarin, dry isolated voice]: 起锚！
Captain [lower, energetic crew answer, clearly separated from other turns]: 嗨哟！
Captain [punchy and concerned but playful]: 当心！
LeadDrummer [bold, with a clean hard onset]: 破浪！
Captain [warm and triumphant, no singing, no music or background sound]: 嘿，好样的！`

const jobs = {
  music: { model: musicModel, prompt: musicPrompt },
  percussion: { model: musicModel, prompt: percussionPrompt },
  voice: { model: voiceModel, prompt: voicePrompt }
}
const usage = 'node scripts/generate-google-audio.mjs [music|percussion|voice] [--dry-run|--mock] [--take=name]'

function options(args) {
  const tokens = args.flatMap(arg => arg.trim().split(/\s+/)).filter(Boolean)
  // Gemini CLI shell-escapes the complete slash-command argument as one token.
  const modes = tokens.filter(token => Object.hasOwn(jobs, token))
  const takeTokens = tokens.filter(token => /^--take=[a-z0-9][a-z0-9-]{0,29}$/.test(token))
  const dry = tokens.includes('--dry-run')
  const mock = tokens.includes('--mock')
  const help = tokens.includes('--help')
  if (modes.length > 1 || takeTokens.length > 1 || Number(dry) + Number(mock) + Number(help) > 1 ||
      tokens.length !== modes.length + takeTokens.length + Number(dry) + Number(mock) + Number(help)) {
    throw new Error(usage)
  }
  return { mode: modes[0] ?? 'music', take: takeTokens[0]?.slice(7) ?? 'original', dry, mock, help }
}

function argumentsFor(mode, path) {
  const job = jobs[mode]
  if (mode === 'voice') {
    return ['tts', '--stdin', '-m', job.model, '--multi-speaker', 'LeadDrummer=Kore,Captain=Puck',
      '--language', 'cmn-CN', '--out', path]
  }
  return ['music', '--stdin', '-m', job.model, '--body', JSON.stringify(waves), '--out', path]
}

function apiOutput(mode, path, { dry = false, mockUrl } = {}) {
  const flags = ['--no-interactive', '--no-retries', '--output-format', 'json', '--api-version', 'v1beta',
    '--api-revision', apiRevision, '--server-url', mockUrl ?? serverUrl, '--timeout', mockUrl ? '10s' : '15m']
  const childEnv = { ...process.env }
  if (dry || mockUrl) {
    flags.push('--no-keyring')
    for (const name of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_ACCESS_TOKEN']) delete childEnv[name]
  }
  if (mockUrl) flags.push('--api-key', 'local-mock-token')
  if (dry) flags.push('--dry-run')
  if (!mockUrl && !dry && !childEnv.GEMINI_API_KEY && childEnv.GOOGLE_API_KEY) {
    childEnv.GEMINI_API_KEY = childEnv.GOOGLE_API_KEY
  }

  const args = [...flags, ...argumentsFor(mode, path)]
  return new Promise((resolveOutput, reject) => {
    const child = spawn('gemini-api', args, { cwd: root, env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stdin.on('error', () => {}) // A CLI error can close stdin before all prompt bytes arrive.
    child.on('error', error => {
      reject(new Error(error.code === 'ENOENT' ? 'gemini-api executable missing from PATH.' : 'Could not start gemini-api.'))
    })
    child.on('close', code => {
      if (code === 3) {
        reject(new Error('gemini-api rejected authentication or authorization. Check its Gemini API credentials and model access.'))
      } else if (code !== 0) {
        reject(new Error(`gemini-api exited with code ${code}. Check model access, quota, and connectivity before starting another take.`))
      } else {
        try {
          resolveOutput(JSON.parse(stdout))
        } catch {
          reject(new Error('gemini-api completed without valid JSON artifact metadata. Check the take directory.'))
        }
      }
    })
    child.stdin.end(jobs[mode].prompt, 'utf8')
  })
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function manifestFile(directory, manifest) {
  const finalPath = join(directory, 'manifest.json')
  const tempPath = join(directory, '.manifest.json.tmp')
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await rename(tempPath, finalPath)
}

async function inspectAudio(directory, result) {
  if (typeof result.path !== 'string') throw new Error('gemini-api returned no audio artifact path.')
  const absolute = resolve(root, result.path)
  const name = basename(absolute)
  if (absolute !== join(directory, name) || !/^preview\.(wav|mp3|ogg|flac)$/i.test(name)) {
    throw new Error('gemini-api reported an unsupported audio artifact path.')
  }
  const bytes = await readFile(absolute)
  const extension = extname(name).toLowerCase()
  const valid = {
    '.wav': () => bytes.length > 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE',
    '.mp3': () => bytes.length > 10 && (bytes.toString('ascii', 0, 3) === 'ID3' || bytes[0] === 255 && (bytes[1] & 224) === 224),
    '.ogg': () => bytes.toString('ascii', 0, 4) === 'OggS',
    '.flac': () => bytes.toString('ascii', 0, 4) === 'fLaC'
  }[extension]
  if (!valid() || result.size_bytes !== bytes.length) throw new Error('The audio file does not match gemini-api metadata.')
  return { file: name, bytes: bytes.length, sha256: digest(bytes), mimeType: result.mime_type ?? null }
}

async function generate({ mode, take }, base = outputRoot, mockUrl) {
  const { model, prompt } = jobs[mode]
  const fingerprint = digest(JSON.stringify([apiRevision, argumentsFor(mode, 'preview.wav'), prompt]))
  const directory = join(base, `${mode}-${take}-${fingerprint.slice(0, 12)}`)
  const reference = relative(root, join(directory, 'manifest.json')).replaceAll('\\', '/')
  await mkdir(base, { recursive: true })
  try {
    await mkdir(directory) // An exclusive directory claim prevents a second billable submission.
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const cached = await readFile(join(directory, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => null)
    if (cached?.status === 'completed') {
      const audio = await readFile(join(directory, cached.audio.file)).catch(() => null)
      if (audio && digest(audio) === cached.audio.sha256) {
        return { ...cached, reference, reused: true }
      }
    }
    throw new Error(`The take already exists but is incomplete or unverifiable. Inspect ${reference} before choosing a new --take=name. No new request was sent.`)
  }
  const manifest = { mode, take, model, apiRevision, fingerprint, mock: Boolean(mockUrl), status: 'pending',
    interactionId: null, startedAt: new Date().toISOString() }
  await manifestFile(directory, manifest)
  await writeFile(join(directory, 'prompt.txt'), prompt + '\n')
  try {
    const result = await apiOutput(mode, join(directory, 'preview.wav'), { mockUrl })
    const interactionId = result.response_id ?? result.id
    if (typeof interactionId === 'string' && /^[\w-]{1,512}$/.test(interactionId)) {
      manifest.interactionId = interactionId
    }
    if (result.status && result.status !== 'completed') throw new Error('The provider did not report a completed interaction.')
    manifest.audio = await inspectAudio(directory, result)
    manifest.status = 'completed'
    manifest.completedAt = new Date().toISOString()
    await manifestFile(directory, manifest)
    return { ...manifest, reference, reused: false }
  } catch (error) {
    manifest.status = 'failed'
    await manifestFile(directory, manifest)
    throw error
  }
}

function testWav() {
  const wav = Buffer.alloc(48)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(40, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(24000, 24)
  wav.writeUInt32LE(48000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(4, 40)
  wav.writeInt16LE(1000, 44)
  return wav
}

async function runMock() {
  await mkdir(outputRoot, { recursive: true })
  const directory = await mkdtemp(join(outputRoot, 'mock-'))
  const fixture = testWav()
  const received = []
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST')
      assert.equal(req.url, '/v1beta/interactions')
      assert.equal(req.headers['x-goog-api-key'], 'local-mock-token')
      assert.equal(req.headers.authorization, undefined)
      assert.equal(req.headers['api-revision'], apiRevision)
      const buffers = []
      for await (const chunk of req) buffers.push(chunk)
      const request = JSON.parse(Buffer.concat(buffers))
      const voice = request.model === voiceModel
      assert.equal(request.response_format.type, 'audio')
      assert.equal(request.stream, false)
      received.push(request)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        id: `mock-audio-${received.length}`, status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Sample metadata.' }] },
          { type: 'model_output', content: [{ type: 'audio', mime_type: voice ? 'audio/l16' : 'audio/wav',
            data: (voice ? fixture.subarray(44) : fixture).toString('base64') }] }]
      }))
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end('{}')
    }
  })
  await new Promise((listening, reject) => server.listen(0, '127.0.0.1', listening).once('error', reject))
  const mockUrl = `http://127.0.0.1:${server.address().port}`
  try {
    const music = await generate({ mode: 'music', take: 'test' }, directory, mockUrl)
    const cached = await generate({ mode: 'music', take: 'test' }, directory, mockUrl)
    const percussion = await generate({ mode: 'percussion', take: 'test' }, directory, mockUrl)
    const voice = await generate({ mode: 'voice', take: 'test' }, directory, mockUrl)
    assert.equal(received.length, 3)
    assert.equal(music.interactionId, 'mock-audio-1')
    assert.equal(percussion.interactionId, 'mock-audio-2')
    assert.equal(cached.reused, true)
    assert.equal(cached.audio.sha256, digest(fixture))
    assert.equal(voice.audio.sha256, digest(fixture))
    assert.equal(received[0].response_format.mime_type, 'audio/wav')
    assert.equal(received[2].input[0].content[0].text, '起锚！')
    console.log(`Local mock passed. 3 requests, 3 playable WAV files, 1 duplicate reused. ${relative(root, directory)}`)
  } finally {
    server.close()
  }
}

async function main() {
  const selected = options(process.argv.slice(2))
  if (selected.help) {
    console.log(usage)
  } else if (selected.mock) {
    await runMock()
  } else if (selected.dry) {
    const preview = await apiOutput(selected.mode, join(outputRoot, 'preview.wav'), { dry: true })
    assert.equal(preview.dry_run, true)
    const { method, url, body } = preview.request
    // Keep the provider request but omit every header from the terminal output.
    console.log(JSON.stringify({ dryRun: true, method, url, apiRevision, body }, null, 2))
  } else {
    const result = await generate(selected)
    const path = result.reference.replace(/manifest\.json$/, result.audio.file)
    console.log(`${result.reused ? 'Reused' : 'Generated'} ${result.mode}: ${path}\n` +
      `Interaction ID: ${result.interactionId ?? 'not reported by this CLI command'}\nManifest: ${result.reference}`)
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
