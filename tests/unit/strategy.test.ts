import { describe, expect, it, vi } from 'vitest'
import { createStrategyDetailState } from '~/features/strategy/detail-state'
import type { StrategyApi } from '~/features/strategy/api'
import { currentStrategy, historyNode, replay } from '../e2e/strategy-fixtures'
function deferred<T>() {
  let resolve!: (value: T) => void
  return {
    promise: new Promise<T>((done) => {
      resolve = done
    }),
    resolve: (value: T) => resolve(value),
  }
}
function setup() {
  const api: StrategyApi = {
    current: vi.fn().mockResolvedValue(currentStrategy),
    history: vi
      .fn()
      .mockResolvedValue({ items: [{ ...historyNode, replay_count: 1 }], page: 1, total_pages: 1 }),
    node: vi.fn().mockResolvedValue(historyNode),
  }
  return { api, state: createStrategyDetailState(api) }
}
describe('strategy detail', () => {
  it('scopes the conversation-wide current response by immutable node, including untested/restored states', async () => {
    const { api, state } = setup()
    await state.load('conversation')
    expect(state.replays.value.map((r) => r.id)).toEqual(['replay-1'])
    state.allReplays.value = true
    expect(state.replays.value).toHaveLength(2)
    for (const status of ['modified', 'restored', 'draft'] as const) {
      vi.mocked(api.current).mockResolvedValue({
        ...currentStrategy,
        current_node_id: null,
        status,
      })
      await state.load('conversation')
      expect(state.replays.value).toEqual([])
      state.allReplays.value = true
      expect(state.replays.value).toHaveLength(2)
      expect(state.selectedNodeId.value).toBeNull()
    }
  })
  it('ignores late version responses and clears private resources after reset', async () => {
    const { api, state } = setup()
    await state.load('conversation')
    const slow = deferred<typeof historyNode>()
    vi.mocked(api.node).mockReturnValue(slow.promise)
    const reading = state.selectVersion('node-old')
    await state.selectVersion('current')
    slow.resolve(historyNode)
    await reading
    expect(state.detail.value?.design).toEqual(currentStrategy.design)
    expect(state.node.value).toBeNull()
    const request = deferred<typeof currentStrategy>()
    vi.mocked(api.current).mockReturnValue(request.promise)
    const loading = state.load('conversation')
    state.reset()
    request.resolve(currentStrategy)
    await loading
    expect(state.current.value).toBeNull()
    expect(state.versions.value).toEqual([])
  })
  it('loads all history pages, reports partial failure and retries without treating it as an empty history', async () => {
    const { api, state } = setup()
    vi.mocked(api.history).mockImplementation(async (_id, page) => {
      if (page === 2) throw new Error('offline')
      return {
        items: [{ ...historyNode, replay_count: 1 }],
        page: 1,
        size: 100,
        total: 101,
        total_pages: 2,
      }
    })
    await state.load('conversation')
    expect(state.detail.value).toBeTruthy()
    expect(state.historyError.value).toBe('strategy.historyFailed')
    vi.mocked(api.history).mockImplementation(async (_id, page) => ({
      items: [{ ...historyNode, id: `node-${page}`, replay_count: 1 }],
      page: page!,
      size: 100,
      total: 101,
      total_pages: 2,
    }))
    await state.loadHistory()
    expect(state.versions.value.map((v) => v.id)).toEqual(['node-1', 'node-2'])
    expect(state.historyError.value).toBe('')
  })
  it('keeps no-trades results and resets scope only for explicit context changes', async () => {
    const { api, state } = setup()
    vi.mocked(api.current).mockResolvedValue({
      ...currentStrategy,
      replays: [
        {
          ...replay('no-trades', 'node-current'),
          result_type: 'no_trades',
          trade_count: 0,
          net_return_rate: '0',
        },
      ],
    })
    await state.load('conversation')
    expect(state.replays.value[0]?.trade_count).toBe(0)
    state.selectTab('replays')
    state.allReplays.value = true
    state.selectTab('replays')
    expect(state.allReplays.value).toBe(true)
    state.selectTab('code')
    expect(state.allReplays.value).toBe(false)
    state.allReplays.value = true
    await state.selectVersion('node-old')
    expect(state.allReplays.value).toBe(false)
    expect(state.detail.value?.code).toEqual(historyNode.code)
  })
})
