import { describe, expect, it } from 'vitest'

import zhDevelopment from '@/modules/i18n/locales/zh/tools-development.json'
import enDevelopment from '@/modules/i18n/locales/en/tools-development.json'
import {
  buildCron,
  cronFieldNames,
  cronPresets,
  cronReferenceGroups,
  describeCron,
} from '@/tools/development/crontab-generator/crontab-generator.service'

const VALID_PARTS = { minute: '*', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' }

describe('buildCron', () => {
  it('joins the five fields into an expression', () => {
    expect(buildCron({ ...VALID_PARTS, minute: '*/5', hour: '9-18' })).toBe('*/5 9-18 * * *')
  })

  it('accepts supported field syntaxes', () => {
    const variants = ['*', '*/5', '0', '15', '1-5', '1-5/2', '1,3', '1,3-5,7', '*/10', '5/2']
    for (const value of variants) {
      expect(buildCron({ ...VALID_PARTS, minute: value })).toBe(`${value} * * * *`)
    }
  })

  it('throws on invalid fields', () => {
    expect(() => buildCron({ ...VALID_PARTS, minute: 'abc' })).toThrow(/minute/)
    expect(() => buildCron({ ...VALID_PARTS, hour: '25-30!' })).toThrow(/hour/)
    expect(() => buildCron({ ...VALID_PARTS, dayOfWeek: '1..3' })).toThrow(/dayOfWeek/)
    expect(() => buildCron({ ...VALID_PARTS, month: '' })).toThrow(/month/)
    expect(() => buildCron({ ...VALID_PARTS, dayOfMonth: '1,,' })).toThrow(/dayOfMonth/)
  })
})

describe('describeCron', () => {
  it('describes in chinese for zh locale', () => {
    expect(describeCron('*/5 * * * *', 'zh')).toContain('5 分钟')
  })

  it('describes in english for en locale', () => {
    expect(describeCron('*/5 * * * *', 'en')).toBe('Every 5 minutes')
  })

  it('returns the original expression when parsing fails', () => {
    expect(describeCron('not a cron', 'en')).toBe('not a cron')
    expect(describeCron('', 'zh')).toBe('')
  })
})

describe('cronPresets', () => {
  it('provides valid preset expressions', () => {
    for (const preset of cronPresets) {
      expect(() => buildCron(preset.parts)).not.toThrow()
    }
    expect(cronPresets.map((preset) => buildCron(preset.parts))).toContain('0 0 * * 1')
  })
})

describe('cronReferenceGroups', () => {
  const allItems = cronReferenceGroups.flatMap((group) => group.items)

  it('lists the five fields in cron order', () => {
    const fields = cronReferenceGroups.find((group) => group.id === 'fields')
    expect(fields?.items.map((item) => item.descriptionKey.slice('ref-'.length))).toEqual([
      ...cronFieldNames,
    ])
  })

  it('keeps group ids unique and every group non-empty', () => {
    const ids = cronReferenceGroups.map((group) => group.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const group of cronReferenceGroups) {
      expect(group.items.length).toBeGreaterThan(0)
    }
  })

  it('carries a non-empty copyable value per item', () => {
    for (const item of allItems) {
      expect(item.value.trim()).not.toBe('')
      expect(item.descriptionKey.startsWith('ref-')).toBe(true)
    }
  })

  it('lists only valid five-field expressions under examples', () => {
    const examples = cronReferenceGroups.find((group) => group.id === 'examples')
    expect(examples).toBeDefined()
    for (const item of examples?.items ?? []) {
      const [minute, hour, dayOfMonth, month, dayOfWeek] = item.value.split(' ')
      expect(() => buildCron({ minute, hour, dayOfMonth, month, dayOfWeek })).not.toThrow()
      expect(item.value).toBe(buildCron({ minute, hour, dayOfMonth, month, dayOfWeek }))
    }
  })

  it('has zh and en copy for every description key', () => {
    for (const locale of [zhDevelopment, enDevelopment]) {
      const copy = locale['crontab-generator'] as Record<string, string>
      for (const item of allItems) {
        expect(copy[item.descriptionKey], item.descriptionKey).toBeTruthy()
      }
    }
  })
})
