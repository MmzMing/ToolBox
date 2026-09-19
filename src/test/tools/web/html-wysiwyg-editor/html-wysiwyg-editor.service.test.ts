import { describe, expect, it } from 'vitest'

import {
  editorCommands,
  statefulCommands,
} from '@/tools/web/html-wysiwyg-editor/html-wysiwyg-editor.service'

describe('editorCommands', () => {
  it('covers formatting, headings, lists, link and cleanup', () => {
    const commands = editorCommands.map((entry) => entry.command)
    for (const expected of [
      'bold',
      'italic',
      'underline',
      'strikeThrough',
      'formatBlock',
      'insertUnorderedList',
      'insertOrderedList',
      'createLink',
      'removeFormat',
    ]) {
      expect(commands).toContain(expected)
    }
  })

  it('has unique stable label keys and non-empty commands', () => {
    const labelKeys = editorCommands.map((entry) => entry.labelKey)
    expect(new Set(labelKeys).size).toBe(labelKeys.length)
    for (const entry of editorCommands) {
      expect(entry.command).not.toBe('')
      expect(entry.labelKey).not.toBe('')
    }
  })

  it('passes a block tag argument for heading commands', () => {
    for (const entry of editorCommands.filter((item) => item.command === 'formatBlock')) {
      expect(entry.argument).toMatch(/^<h[1-3]>$/)
    }
  })
})

describe('statefulCommands', () => {
  it('lists the four toggle style commands', () => {
    expect(statefulCommands).toEqual(['bold', 'italic', 'underline', 'strikeThrough'])
  })
})
