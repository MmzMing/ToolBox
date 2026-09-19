import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import enCheatsheet from '@/modules/i18n/locales/en/tools-cheatsheet.json'
import zhCheatsheet from '@/modules/i18n/locales/zh/tools-cheatsheet.json'
import { photoCheatsheetImage } from '@/tools/cheatsheet/photo-cheatsheet/photo-cheatsheet.service'

describe('photoCheatsheetImage', () => {
  it('points at a site-relative asset that ships under public', () => {
    expect(photoCheatsheetImage.src.startsWith('/images/')).toBe(true)
    const file = path.resolve(process.cwd(), 'public', photoCheatsheetImage.src.slice(1))
    expect(existsSync(file)).toBe(true)
  })

  it('has zh and en alt copy for the image', () => {
    for (const locale of [zhCheatsheet, enCheatsheet]) {
      expect(locale['photo-cheatsheet'][photoCheatsheetImage.altKey]).toBeTruthy()
    }
  })
})
