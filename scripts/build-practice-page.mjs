import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = new URL('../docs/drum-vocabulary.md', import.meta.url)
const output = process.argv[2] ?? fileURLToPath(new URL('../build/web/practice/index.html', import.meta.url))
const repoDocs = 'https://github.com/windssea/drum/blob/main/docs/'

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escape = (value) => value.replace(/[&<>"']/g, (char) => entities[char])
const headingPattern = /^(#{1,6})\s+(.+?)\s*#*$/u
const listPattern = /^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/u
const fencePattern = /^\x60{3}/u
const inlinePattern = /\x60([^\x60]+)\x60|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^\s)]+)\)/gu

function inline(source) {
  let markup = ''
  let end = 0
  for (const item of source.matchAll(inlinePattern)) {
    const [token, code, bold, label, link] = item
    markup += escape(source.slice(end, item.index))
    if (code) {
      markup += '<code>' + escape(code) + '</code>'
    } else if (bold) {
      markup += '<strong>' + escape(bold) + '</strong>'
    } else {
      const destination = new URL(link, repoDocs)
      if (!['https:', 'http:'].includes(destination.protocol))
        throw new Error('Invalid practice link: ' + link)
      const href = link.startsWith('#') ? link : destination.href
      markup += '<a href="' + escape(href) + '">' + escape(label) + '</a>'
    }
    end = item.index + token.length
  }
  return markup + escape(source.slice(end))
}

function render(markdown) {
  const lines = markdown.split(/\r?\n/u)
  const title = lines[0].match(/^#\s+(.+)$/u)?.[1]
  if (!title) throw new Error('The practice guide must start with its title')

  const body = []
  const sections = []
  const ids = new Set()
  let scoreName = title
  for (let index = 1; index < lines.length; ) {
    const line = lines[index++]
    if (!line.trim()) continue

    const heading = line.match(headingPattern)
    if (heading) {
      const level = heading[1].length
      const name = heading[2]
      let id = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '')
      while (ids.has(id)) id += '-续'
      ids.add(id)
      if (level === 2) sections.push({ name, id })
      body.push('<h' + level + ' id="' + escape(id) + '">' + inline(name) + '</h' + level + '>')
      scoreName = name
      continue
    }

    if (fencePattern.test(line)) {
      const start = index
      while (index < lines.length && !fencePattern.test(lines[index])) index++
      if (index === lines.length) throw new Error('Unclosed practice score block on line ' + start)
      body.push(
        '<pre tabindex="0" aria-label="' + escape(scoreName + ' 鼓谱') + '"><code>' +
          escape(lines.slice(start, index).join('\n')) + '</code></pre>',
      )
      index++
      continue
    }

    const listItem = line.match(listPattern)
    if (listItem) {
      const ordered = /^\d/u.test(listItem[1])
      const tag = ordered ? 'ol' : 'ul'
      const start = ordered ? Number.parseInt(listItem[1], 10) : 1
      body.push('<' + tag + (start === 1 ? '' : ' start="' + start + '"') + '>')
      body.push('<li>' + inline(listItem[2]) + '</li>')
      let next = lines[index]?.match(listPattern)
      while (next && /^\d/u.test(next[1]) === ordered) {
        body.push('<li>' + inline(next[2]) + '</li>')
        next = lines[++index]?.match(listPattern)
      }
      body.push('</' + tag + '>')
      continue
    }

    const paragraph = [line.trim()]
    while (
      index < lines.length && lines[index].trim() &&
      !headingPattern.test(lines[index]) && !fencePattern.test(lines[index]) && !listPattern.test(lines[index])
    ) {
      paragraph.push(lines[index++].trim())
    }
    body.push('<p>' + inline(paragraph.join(' ')) + '</p>')
  }

  return { title, sections, body: body.join('\n') }
}

const css = `
  :root {
    color-scheme: dark;
    color: #f2f1e9;
    background: #101623;
    font: 18px/1.7 system-ui, "Microsoft YaHei", "PingFang SC", sans-serif;
    --accent: #ffcf79;
    --stroke: #3b465c;
  }
  * { box-sizing: border-box }
  body { margin: 0 }
  .wrap {
    width: min(100%, 58rem);
    margin-inline: auto;
    padding-inline: max(1rem, env(safe-area-inset-left)) max(1rem, env(safe-area-inset-right));
  }
  .mast {
    border-top: 6px solid #df8b66;
    border-bottom: 1px solid var(--stroke);
    background: #1d2738;
    padding-block: max(1rem, env(safe-area-inset-top)) 1.3rem;
  }
  h1 { margin: .42rem 0 1rem; font-size: clamp(2rem, 5.6vw, 3.75rem) }
  h2 { border-top: 1px solid var(--stroke); padding-top: 1.2rem; margin: 2.1rem 0 .6rem; font-size: 1.58rem }
  h3 { margin: 1.65rem 0 .35rem; font-size: 1.22rem; color: var(--accent) }
  h1, h2, h3, h4, h5, h6 { scroll-margin-top: 1rem; line-height: 1.35 }
  main { padding-block: .25rem 3rem }
  p { margin: 0 0 .9rem }
  nav { display: flex; flex-wrap: wrap; gap: .42rem; align-items: stretch }
  a { color: var(--accent); text-underline-offset: .18em; overflow-wrap: anywhere }
  a:focus-visible, pre:focus-visible { outline: 3px solid #a4edf0; outline-offset: 3px }
  .back, nav a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: .28rem .68rem;
    text-decoration: none;
    border: 1px solid var(--stroke);
    border-radius: .4rem;
  }
  .back { background: var(--accent); border-color: var(--accent); color: #222331; font-weight: 700 }
  nav a { background: #151e2e }
  nav a:hover { border-color: var(--accent) }
  :target { color: var(--accent) }
  code { font-family: "Cascadia Mono", ui-monospace, Consolas, monospace }
  pre {
    margin: 0 0 1.25rem;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    border: 1px solid var(--stroke);
    border-left: 4px solid #77c8c9;
    border-radius: .4rem;
    padding: .75rem .85rem;
    background: #0c131e;
    color: #d5f6f3;
    font-size: 1.02rem;
    line-height: 1.65;
    white-space: pre;
  }
  li { margin-bottom: .6rem }
  ol, ul { padding-inline-start: 1.6rem }
  @media print {
    :root { color-scheme: light; color: black; background: white; font-size: 10.5pt }
    .mast, pre { color: black; background: white; border-color: #777 }
    .mast { padding-block: 0 .5rem; border-top: 0 }
    .wrap { width: 100%; padding-inline: 0 }
    .back, nav { display: none }
    h1 { font-size: 24pt }
    h2 { margin-top: 1.25rem; font-size: 16pt }
    h3, a, :target { color: black }
    h2, h3 { break-after: avoid }
    pre { overflow: visible; break-inside: avoid; font-size: 10pt }
  }
`

const { title, sections, body } = render(readFileSync(source, 'utf8'))
const navigation = sections.map(({ name, id }) => '<a href="#' + escape(id) + '">' + inline(name) + '</a>').join('\n')
const html = '<!doctype html>\n<html lang="zh-CN">\n<head>\n' +
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<meta name="theme-color" content="#101623"><title>' + escape(title) + ' · 潮汐鼓港</title>\n' +
  '<style>' + css + '</style>\n</head>\n<body>\n' +
  '<header class="mast"><div class="wrap"><a class="back" href="/">← 返回游戏</a><h1>' + inline(title) + '</h1>\n' +
  '<nav aria-label="练习谱目录">' + navigation + '</nav></div></header>\n' +
  '<main class="wrap">' + body + '</main>\n</body>\n</html>\n'
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, html)
console.log('Practice guide: ' + output)
