export interface SseFrame {
  event: string
  data: string
  id?: string
}
/** Streaming UTF-8 decoder; frames can span arbitrary network chunk boundaries. */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = 'message'
  let id: string | undefined
  let data: string[] = []
  function line(value: string): SseFrame | undefined {
    if (!value) {
      const frame = data.length ? { event, data: data.join('\n'), id } : undefined
      event = 'message'
      data = []
      return frame
    }
    if (value.startsWith(':')) return
    const colon = value.indexOf(':')
    const field = colon < 0 ? value : value.slice(0, colon)
    const content = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = content || 'message'
    if (field === 'data') data.push(content)
    if (field === 'id' && !content.includes('\0')) id = content
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      while (true) {
        const match = /[\r\n]/.exec(buffer)
        if (!match || (!done && match[0] === '\r' && match.index === buffer.length - 1)) break
        const index = match.index
        const skip = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1
        const frame = line(buffer.slice(0, index))
        buffer = buffer.slice(index + skip)
        if (frame) yield frame
      }
      if (done) break // Incomplete frames are discarded, never treated as completed events.
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
