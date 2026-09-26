import { describe, expect, it } from 'vitest'

import {
  createEmptyModel,
  createHeaderRow,
  createParamRow,
  newRowId,
  normalizeModel,
  structuralKey,
} from '@/tools/development/curl-generator/request-model'

describe('createEmptyModel', () => {
  it('starts as an empty GET with no rows', () => {
    expect(createEmptyModel()).toEqual({
      dialect: 'bash',
      lineStyle: 'multiline',
      method: 'GET',
      url: '',
      query: [],
      fragment: '',
      headers: [],
      body: { kind: 'none' },
      auth: { kind: 'none' },
      options: [],
      extras: [],
    })
  })

  it('gives every row a unique id', () => {
    expect(newRowId()).not.toBe(newRowId())
  })
})

describe('structuralKey', () => {
  it('ignores row ids so re-parsed models compare equal', () => {
    const a = createEmptyModel()
    a.headers = [createHeaderRow('A', 'b')]
    const b = createEmptyModel()
    b.headers = [{ id: 'other', name: 'A', value: 'b', enabled: true }]
    expect(structuralKey(a)).toBe(structuralKey(b))
  })

  it('still distinguishes rows that differ only by enabled state', () => {
    const a = createEmptyModel()
    a.query = [createParamRow('k', 'v')]
    const b = createEmptyModel()
    b.query = [{ id: 'x', name: 'k', value: 'v', enabled: false }]
    expect(structuralKey(a)).not.toBe(structuralKey(b))
  })
})

describe('normalizeModel', () => {
  it('rejects values that cannot be a request model', () => {
    expect(normalizeModel(null)).toBeNull()
    expect(normalizeModel('curl')).toBeNull()
    expect(normalizeModel(42)).toBeNull()
    expect(normalizeModel({ foo: true })).toBeNull()
  })

  it('fills defaults for missing fields', () => {
    const model = normalizeModel({ url: 'https://x.com' })
    expect(model).not.toBeNull()
    expect(model?.method).toBe('GET')
    expect(model?.dialect).toBe('bash')
    expect(model?.body).toEqual({ kind: 'none' })
    expect(model?.auth).toEqual({ kind: 'none' })
  })

  it('coerces unknown enum values back to the safe default', () => {
    const model = normalizeModel({ url: '', dialect: 'zsh', lineStyle: 5, method: 'post' })
    expect(model?.dialect).toBe('bash')
    expect(model?.lineStyle).toBe('multiline')
    expect(model?.method).toBe('POST')
  })

  it('keeps only well-formed rows and drops junk entries', () => {
    const model = normalizeModel({
      url: 'https://x.com',
      headers: [{ name: 'A', value: 'b' }, null, 'nope', { value: 'nameless' }],
      query: [{ name: 'k' }],
      extras: ['raw', 7, ''],
      options: [{ flag: '-q' }, { flag: '' }, { flag: '-z', value: 1 }],
    })
    expect(model?.headers).toHaveLength(2)
    expect(model?.headers[1]).toMatchObject({ name: '', value: 'nameless', enabled: true })
    expect(model?.query[0]).toMatchObject({ name: 'k', value: '' })
    expect(model?.extras).toEqual(['raw'])
    expect(model?.options.map((option) => option.flag)).toEqual(['-q', '-z'])
    expect(model?.options[1].value).toBeUndefined()
  })

  it('repairs a half-written body and infers file fields from the @ prefix', () => {
    const form = normalizeModel({
      url: '',
      body: {
        kind: 'form',
        fields: [
          { name: 'f', value: '@a.png' },
          { name: 'g', value: 'x' },
        ],
      },
    })
    expect(form?.body.kind).toBe('form')
    if (form?.body.kind === 'form') {
      expect(form.body.fields.map((field) => field.isFile)).toEqual([true, false])
    }

    const broken = normalizeModel({ url: '', body: { kind: 'wat' } })
    expect(broken?.body).toEqual({ kind: 'none' })
  })

  it('falls back when auth fields are missing or wrong-typed', () => {
    const model = normalizeModel({ url: '', auth: { kind: 'basic', user: 1 } })
    expect(model?.auth).toEqual({ kind: 'basic', user: '', password: '', via: 'option' })
  })
})
