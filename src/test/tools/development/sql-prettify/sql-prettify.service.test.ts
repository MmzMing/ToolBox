import { describe, expect, it } from 'vitest'

import { formatSql } from '@/tools/development/sql-prettify/sql-prettify.service'

describe('formatSql', () => {
  it('formats keywords and indentation', () => {
    expect(formatSql('select a,b from t where x=1')).toBe(
      'select\n  a,\n  b\nfrom\n  t\nwhere\n  x = 1',
    )
  })

  it('keeps keywords as written and breaks clauses onto new lines', () => {
    const output = formatSql('SELECT * FROM users WHERE id = 7 ORDER BY name')
    expect(output).toBe('SELECT\n  *\nFROM\n  users\nWHERE\n  id = 7\nORDER BY\n  name')
  })

  it('returns empty string for empty input', () => {
    expect(formatSql('')).toBe('')
    expect(formatSql('   \n  ')).toBe('')
  })

  it('throws on invalid sql', () => {
    expect(() => formatSql('SELECT ###')).toThrow(/Invalid SQL/)
    expect(() => formatSql('SELECT ###')).toThrow(/Unexpected/)
  })
})
