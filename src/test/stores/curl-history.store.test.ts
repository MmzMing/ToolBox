// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildCurl,
  createEmptyModel,
  createHeaderRow,
} from '@/tools/development/curl-generator/curl-generator.service'
import { useCurlHistoryStore } from '@/stores/curl-history.store'

function modelWith(url: string) {
  const model = createEmptyModel()
  model.url = url
  model.headers = [createHeaderRow('Accept', 'application/json')]
  return model
}

describe('curl history store', () => {
  beforeEach(() => {
    useCurlHistoryStore.getState().clear()
  })

  it('remembers the newest entry first', () => {
    const first = modelWith('https://a.com')
    const second = modelWith('https://b.com')
    useCurlHistoryStore.getState().remember(first, buildCurl(first), 'GET a.com')
    useCurlHistoryStore.getState().remember(second, buildCurl(second), 'GET b.com')
    const entries = useCurlHistoryStore.getState().entries
    expect(entries).toHaveLength(2)
    expect(entries[0].summary).toBe('GET b.com')
  })

  it('collapses repeats of the same command and keeps only the newest', () => {
    const model = modelWith('https://a.com')
    const key = buildCurl(model)
    useCurlHistoryStore.getState().remember(model, key, 'a')
    const changed = { ...model, method: 'POST' }
    useCurlHistoryStore.getState().remember(changed, buildCurl(changed), 'post')
    useCurlHistoryStore.getState().remember(model, key, 'a again')
    const entries = useCurlHistoryStore.getState().entries
    expect(entries).toHaveLength(2)
    expect(entries[0].summary).toBe('a again')
    expect(entries[1].summary).toBe('post')
  })

  it('ignores an empty command', () => {
    useCurlHistoryStore.getState().remember(createEmptyModel(), '   ', 'blank')
    expect(useCurlHistoryStore.getState().entries).toHaveLength(0)
  })

  it('caps the list at twenty entries', () => {
    for (let index = 0; index < 25; index += 1) {
      const model = modelWith(`https://x.com/${index}`)
      useCurlHistoryStore.getState().remember(model, buildCurl(model), `#${index}`)
    }
    const entries = useCurlHistoryStore.getState().entries
    expect(entries).toHaveLength(20)
    expect(entries[0].summary).toBe('#24')
  })

  it('removes a single entry and clears everything', () => {
    const model = modelWith('https://a.com')
    useCurlHistoryStore.getState().remember(model, buildCurl(model), 'a')
    const other = modelWith('https://b.com')
    useCurlHistoryStore.getState().remember(other, buildCurl(other), 'b')

    const target = useCurlHistoryStore.getState().entries[1]
    useCurlHistoryStore.getState().remove(target.id)
    expect(useCurlHistoryStore.getState().entries.map((entry) => entry.summary)).toEqual(['b'])

    useCurlHistoryStore.getState().clear()
    expect(useCurlHistoryStore.getState().entries).toEqual([])
  })

  it('drops stored rows that are not shaped like a request model', () => {
    localStorage.setItem(
      'toolbox.curl-history',
      JSON.stringify({
        state: {
          entries: [
            { id: 'ok', at: 1, summary: 'kept', model: { url: 'https://a.com', method: 'GET' } },
            { id: 'bad', at: 2, summary: 'junk', model: { nothing: true } },
            'not-an-object',
          ],
        },
        version: 1,
      }),
    )
    useCurlHistoryStore.persist.rehydrate()
    const entries = useCurlHistoryStore.getState().entries
    expect(entries.map((entry) => entry.summary)).toEqual(['kept'])
  })
})
