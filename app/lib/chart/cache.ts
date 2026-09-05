export class BoundedCache<K, V> {
  private entries = new Map<K, V>()
  constructor(private readonly capacity = 8) {
    if (capacity < 1) throw new Error('Cache capacity must be positive')
  }
  get(key: K) {
    const value = this.entries.get(key)
    if (value !== undefined) {
      this.entries.delete(key)
      this.entries.set(key, value)
    }
    return value
  }
  set(key: K, value: V) {
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!)
  }
  clear() {
    this.entries.clear()
  }
  get size() {
    return this.entries.size
  }
}
