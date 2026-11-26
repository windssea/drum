export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/index.wasm') return env.ASSETS.fetch(request)
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })

    const key = 'engine/' + env.WASM_SHA256 + '.wasm.gz'
    const object = request.method === 'HEAD' ? await env.ENGINE.head(key) : await env.ENGINE.get(key)
    if (!object) return new Response('Game engine unavailable', { status: 503 })
    const headers = new Headers({
      'Content-Type': 'application/wasm',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'ETag': 'W/"' + env.WASM_SHA256 + '"',
      'Vary': 'Accept-Encoding',
    })
    if (request.headers.get('If-None-Match') === headers.get('ETag'))
      return new Response(null, { status: 304, headers })
    const gzip = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(request.headers.get('Accept-Encoding') || '')
    if (gzip) headers.set('Content-Encoding', 'gzip')
    if (request.method === 'HEAD') return new Response(null, { headers })
    const body = gzip ? object.body : object.body.pipeThrough(new DecompressionStream('gzip'))
    return new Response(body, { headers, encodeBody: 'manual' })
  },
}
