import { describe, expect, it } from 'vitest'

import {
  buildCron,
  cronPresets,
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
