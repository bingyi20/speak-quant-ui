import { describe, expect, it, vi } from 'vitest'
import { parseSse } from '~/lib/sse/parser'
import { openEventStream } from '~/lib/sse/connection'
import { createHttpClient } from '~/lib/http/client'
import { requestDownload, downloadFilename } from '~/lib/download/client'
import {
  formatDecimal,
  formatRatio,
  formatDate,
  formatDateTime,
  formatQuantity,
} from '~/lib/format'
import { renderMarkdown } from '~/lib/format/markdown'
import { BoundedCache } from '~/lib/chart/cache'
import { safeReturnPath } from '~/lib/storage/safe-storage'
function stream(text: string) {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const byte of bytes) c.enqueue(new Uint8Array([byte]))
      c.close()
    },
  })
}
describe('stream and non-JSON transports', () => {
  it('decodes multibyte text, CRLF, comments and multiline frames across one-byte chunks', async () => {
    const frames = []
    for await (const frame of parseSse(
      stream(': ping\r\nevent: custom\r\ndata: 中文😀\r\ndata: next\r\n\r\n'),
    ))
      frames.push(frame)
    expect(frames).toEqual([{ event: 'custom', data: '中文😀\nnext', id: undefined }])
  })
  it('does not emit incomplete frames at EOF', async () => {
    const frames = []
    for await (const frame of parseSse(stream('data: partial'))) frames.push(frame)
    expect(frames).toEqual([])
  })
  it('stops after terminal event and does not reconnect', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(stream('event: done\ndata: {}\n\n'), {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    )
    const events = vi.fn()
    await openEventStream(createHttpClient({ baseURL: 'http://localhost/api', fetch }), '/events', {
      signal: new AbortController().signal,
      onEvent: events,
      isTerminal: (e) => e.event === 'done',
    })
    expect(fetch).toHaveBeenCalledOnce()
    expect(events).toHaveBeenCalledOnce()
  })
  it('treats EOF as failure rather than successful completion', async () => {
    const client = createHttpClient({
      baseURL: 'http://localhost/api',
      fetch: async () =>
        new Response(stream(''), { headers: { 'Content-Type': 'text/event-stream' } }),
    })
    await expect(
      openEventStream(client, '/events', {
        signal: new AbortController().signal,
        maxRetries: 0,
        onEvent: vi.fn(),
        isTerminal: () => false,
      }),
    ).rejects.toMatchObject({ kind: 'network' })
  })
  it('returns real ZIP blobs and recognizes JSON download errors', async () => {
    const client = createHttpClient({
      baseURL: 'http://localhost/api',
      fetch: async () =>
        new Response('zip', {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': "attachment; filename*=UTF-8''runner%20test.zip",
          },
        }),
    })
    const result = await requestDownload(client, '/download', { method: 'POST' })
    expect(await result.blob.text()).toBe('zip')
    expect(result.filename).toBe('runner test.zip')
    const failed = createHttpClient({
      baseURL: 'http://localhost/api',
      fetch: async () => Response.json({ code: 50000, message: 'Failed', data: null }),
    })
    await expect(requestDownload(failed, '/download')).rejects.toMatchObject({ code: 50000 })
    expect(downloadFilename('attachment; filename="../../evil.zip"')).not.toContain('/')
  })
})
describe('presentation boundaries', () => {
  it('preserves fractional quantities without padding integer volumes or trailing zeros', () => {
    expect(formatQuantity('22629.8900', 'zh-CN')).toBe('22,629.89')
    expect(formatQuantity('22629.00', 'en-US')).toBe('22,629')
    expect(formatQuantity('0.00000001')).toBe('0.00000001')
    expect(formatQuantity('1.23456789')).toBe('1.23456789')
    expect(formatQuantity(null)).toBe('—')
    expect(formatQuantity('invalid')).toBe('—')
  })
  it('formats API timestamps consistently without shifting to the browser timezone', () => {
    expect(formatDateTime('2026-08-01T08:00:00Z')).toBe('2026/08/01 08:00')
    expect(formatDateTime(Date.parse('2026-01-01T00:05:00Z'))).toBe('2026/01/01 00:05')
    expect(formatDateTime('invalid')).toBe('—')
  })
  it('formats decimal strings without float loss, including negative subunit amounts', () => {
    expect(formatDecimal('9007199254740993.129', 'en-US')).toBe('9,007,199,254,740,993.13')
    expect(formatDecimal('-0.125', 'en-US')).toBe('-0.13')
    expect(formatRatio('0.1234', 'en-US')).toBe('12.34%')
    expect(formatDecimal('not-a-number')).toBe('—')
    expect(formatRatio('Infinity')).toBe('—')
    expect(formatDate('2026-09-05', 'en-US', 'not-a-timezone')).toBe('—')
  })
  it('removes raw HTML, scripts and unsafe markdown URLs on both render paths', () => {
    const html = renderMarkdown(
      '**safe** [bad](javascript:alert)\n\n<img src=x onerror=alert(1)><script>alert(1)</script>',
    )
    expect(html).toContain('<strong>safe</strong>')
    expect(html).not.toMatch(/<script|<img|javascript:|onerror/)
  })
  it('bounds cache size and promotes recently accessed entries', () => {
    const cache = new BoundedCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a')
    cache.set('c', 3)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(1)
    expect(cache.size).toBe(2)
  })
  it('allows only supported local login-return destinations', () => {
    expect(safeReturnPath('/conversations/abc')).toBe('/conversations/abc')
    for (const value of ['https://evil.com', '//evil.com', '/login', '/\\evil.com'])
      expect(safeReturnPath(value)).toBe('/new-task')
  })
})
