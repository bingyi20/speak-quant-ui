import type { HttpClient, RequestOptions } from '../http/client'
import { ApiError, responseError } from '../http/error'
export function downloadFilename(header: string | null): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  let name = header?.match(/filename="?([^";]+)"?/i)?.[1] ?? 'download.zip'
  if (encoded) {
    try {
      name = decodeURIComponent(encoded)
    } catch {
      /* use ordinary name */
    }
  }
  return (
    Array.from(name)
      .map((char) => (char.charCodeAt(0) < 32 || char === '/' || char === '\\' ? '_' : char))
      .join('')
      .replace(/^\.+/, '') || 'download.zip'
  )
}
export async function requestDownload(
  client: HttpClient,
  path: string,
  options: RequestOptions = {},
) {
  return client.withResponse(
    path,
    {
      ...options,
      timeoutMs: options.timeoutMs ?? 600_000,
      headers: { ...Object.fromEntries(new Headers(options.headers)), Accept: 'application/zip' },
    },
    async (response) => {
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('json')) throw responseError(response.status, await response.json())
      if (
        !contentType.includes('application/zip') &&
        !contentType.includes('application/octet-stream')
      )
        throw new ApiError('Unexpected download format', { kind: 'protocol' })
      return {
        blob: await response.blob(),
        filename: downloadFilename(response.headers.get('content-disposition')),
      }
    },
  )
}
export function saveDownload(file: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(file.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
