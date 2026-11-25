import { useEffect, useRef, useState } from 'react'
import { decodeNote } from './game'

export type MidiHit = NonNullable<ReturnType<typeof decodeNote>> & { at: number }

export function useMidi(onHit: (hit: MidiHit) => void) {
  const [access, setAccess] = useState<MIDIAccess | null>(null)
  const [inputs, setInputs] = useState<MIDIInput[]>([])
  const [preferred, setPreferred] = useState('')
  const [error, setError] = useState('')
  const [requesting, setRequesting] = useState(false)
  const handler = useRef(onHit)
  useEffect(() => { handler.current = onHit }, [onHit])

  const input = inputs.find(port => port.id === preferred)
    ?? inputs.find(port => /Roland|TD-\d|USB MIDI/i.test(port.name ?? ''))
    ?? inputs[0]

  useEffect(() => {
    if (!access) return
    const update = () => setInputs([...access.inputs.values()]
      .filter(port => port.state === 'connected'))
    update()
    access.addEventListener('statechange', update)
    return () => access.removeEventListener('statechange', update)
  }, [access])

  useEffect(() => {
    if (!input) return
    let cancelled = false
    function receive(event: MIDIMessageEvent) {
      const note = decodeNote(event.data)
      if (!note) return
      const now = performance.now()
      const at = Math.abs(event.timeStamp - now) < 5000 ? event.timeStamp : now
      handler.current({ ...note, at })
    }
    input.addEventListener('midimessage', receive)
    void input.open().catch(() => {
      if (!cancelled && input.state === 'connected') setError('无法打开这个 MIDI 输入。请关闭占用它的页面，再重新连接。')
    })
    return () => {
      cancelled = true
      input.removeEventListener('midimessage', receive)
      void input.close().catch(() => {})
    }
  }, [input])

  async function connect() {
    if (requesting) return
    if (!window.isSecureContext) {
      setError('请用 HTTPS 地址打开本页，再连接电子鼓。本机 localhost 也可使用。')
      return
    }
    if (typeof navigator.requestMIDIAccess !== 'function') {
      setError('当前浏览器没有 Web MIDI 功能。请用已通过测试的浏览器打开。')
      return
    }
    setError('')
    setRequesting(true)
    try {
      const granted = await navigator.requestMIDIAccess({ sysex: false })
      setInputs([...granted.inputs.values()].filter(port => port.state === 'connected'))
      setAccess(granted)
    } catch {
      setError('未能读取 MIDI 设备。请在浏览器的网站设置中允许 MIDI 访问，再重试。')
    } finally {
      setRequesting(false)
    }
  }

  return { access, connect, input, inputs, preferred: input?.id ?? '', setPreferred, error, requesting }
}
