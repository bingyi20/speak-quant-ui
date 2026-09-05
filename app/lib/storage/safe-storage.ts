export function readStorage<T>(
  storage: Pick<Storage, 'getItem'>,
  key: string,
  validate: (value: unknown) => value is T,
): T | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? 'null')
    return validate(value) ? value : null
  } catch {
    return null
  }
}
export function writeStorage(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  key: string,
  value: unknown,
) {
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage is optional */
  }
}
export function safeReturnPath(value: unknown, fallback = '/new-task'): string {
  if (
    typeof value !== 'string' ||
    !/^\/(new-task|conversations\/[A-Za-z0-9_-]+)(?:\?.*)?$/.test(value) ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char === '\\')
  )
    return fallback
  return value
}
