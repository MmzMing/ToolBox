import { describe, expect, it } from 'vitest'

import {
  buildKinshipPath,
  buildQuickButtons,
  buildTreeLayout,
  calculateKinship,
  filterId,
  getGenById,
  getSelectors,
  KINSHIP_EXAMPLES,
  number2zh,
  resolveRelation,
  reverseId,
  zh2number,
} from '@/tools/life/chinese-kinship-calculator/kinship.service'

describe('calculateKinship', () => {
  it('resolves one-step terms', () => {
    expect(calculateKinship({ text: '爸爸', sex: 1 }).terms).toEqual(['爸爸'])
    expect(calculateKinship({ text: '儿子', sex: 1 }).terms).toEqual(['儿子'])
    expect(calculateKinship({ text: '老婆', sex: 1 }).terms).toEqual(['老婆'])
  })

  it('resolves grandparent chains', () => {
    expect(calculateKinship({ text: '爸爸的爸爸', sex: 1 }).terms).toEqual(['爷爷'])
    expect(calculateKinship({ text: '妈妈的妈妈', sex: 1 }).terms).toEqual(['外婆'])
    expect(calculateKinship({ text: '爸爸的妈妈', sex: 1 }).terms).toEqual(['奶奶'])
    expect(calculateKinship({ text: '妈妈的爸爸', sex: 1 }).terms[0]).toBe('外公')
  })

  it('resolves parent-generation collateral terms', () => {
    expect(calculateKinship({ text: '爸爸的哥哥', sex: 1 }).terms).toEqual(['伯父'])
    expect(calculateKinship({ text: '爸爸的弟弟', sex: 1 }).terms[0]).toBe('叔叔')
    expect(calculateKinship({ text: '妈妈的哥哥', sex: 1 }).terms[0]).toBe('大舅')
    expect(calculateKinship({ text: '妈妈的姐姐', sex: 1 }).terms[0]).toBe('大姨')
  })

  it('resolves cousins and spouse-side peers', () => {
    expect(calculateKinship({ text: '爸爸的哥哥的儿子', sex: 1 }).terms).toEqual(['堂哥', '堂弟'])
    expect(calculateKinship({ text: '老婆的弟弟', sex: 1 }).terms[0]).toBe('小舅子')
    expect(calculateKinship({ text: '老婆的妈妈', sex: 1 }).terms[0]).toBe('岳母')
  })

  it('resolves the 堂/表/从/两姨 collateral branches', () => {
    expect(calculateKinship({ text: '表哥', sex: 1 }).terms).toEqual(['姑表哥', '舅表哥'])
    expect(calculateKinship({ text: '两姨兄弟', sex: 1 }).terms).toEqual(['姨哥', '姨弟'])
    expect(calculateKinship({ text: '堂叔', sex: 1 }).terms).toEqual(['堂叔'])
    expect(calculateKinship({ text: '内侄', sex: 1 }).terms).toEqual(['舅侄', '舅侄女'])
    expect(calculateKinship({ text: '妈妈的哥哥的儿子', sex: 1 }).terms).toEqual([
      '舅表哥',
      '舅表弟',
    ])
    expect(calculateKinship({ text: '爸爸的妹妹的女儿的老公', sex: 1 }).terms).toEqual([
      '姑表姐夫',
      '姑表妹夫',
    ])
  })

  it('resolves joint addresses that span several chains', () => {
    expect(calculateKinship({ text: '太奶爷', sex: 1 }).terms).toEqual([
      '曾祖父',
      '曾外祖父',
      '外曾祖父',
    ])
    expect(calculateKinship({ text: '姑太老爷', sex: 1 }).terms[0]).toBe('姑曾祖父')
  })

  it('looks up the chain behind a single address', () => {
    expect(calculateKinship({ text: '表哥', sex: 1 }).chains).toEqual([
      '爸爸的姐妹的儿子',
      '妈妈的兄弟的儿子',
    ])
    expect(calculateKinship({ text: '爸爸的哥哥', sex: 1 }).chains).toEqual([])
  })

  it('supports numeric birth-order terms', () => {
    expect(calculateKinship({ text: '爸爸的二哥', sex: 1 }).terms).toEqual(['二伯'])
    expect(calculateKinship({ text: '妈妈的二哥', sex: 1 }).terms[0]).toBe('二舅')
  })

  it('returns multiple terms for ambiguous chains', () => {
    const result = calculateKinship({ text: '爸爸的哥哥的弟弟的儿子', sex: 1 })
    expect(result.terms).toEqual(['堂哥', '堂弟', '哥哥', '弟弟', '自己'])
  })

  it('reverses the chain to answer what they call me', () => {
    expect(calculateKinship({ text: '爸爸', sex: 1, reverse: true }).terms).toEqual(['儿子'])
    expect(calculateKinship({ text: '爸爸', sex: 0, reverse: true }).terms).toEqual(['女儿'])
    expect(calculateKinship({ text: '爸爸的舅舅', sex: 0, reverse: true }).terms).toEqual([
      '甥孙女',
    ])
    expect(calculateKinship({ text: '岳母', sex: 1, reverse: true }).terms).toEqual(['女婿'])
  })

  it('returns empty output for blank input', () => {
    const result = calculateKinship({ text: '', sex: 1 })
    expect(result.terms).toEqual([])
    expect(result.path).toEqual([])
    expect(result.pathText).toBe('')
    expect(result.isValid).toBe(false)
  })

  it('marks unrecognized input invalid', () => {
    const result = calculateKinship({ text: '外星人', sex: 1 })
    expect(result.isValid).toBe(false)
    expect(result.terms).toEqual([])
    expect(result.path).toEqual([])
  })

  it('builds the generation path with cumulative gens', () => {
    const result = calculateKinship({ text: '爸爸的儿子的爸爸', sex: 1 })
    expect(result.path.map((node) => node.gen)).toEqual([1, 0, 1])
    expect(result.path.map((node) => node.label)).toEqual(['爸爸', '儿子', '爸爸'])
    expect(result.path.map((node) => node.index)).toEqual([0, 1, 2])
    expect(result.pathText).toBe('爸爸的儿子的爸爸')
    expect(result.isValid).toBe(true)
  })
})

describe('buildKinshipPath', () => {
  it('classifies every step so the tree can route its edges', () => {
    const path = buildKinshipPath('老婆的哥哥的儿子')
    expect(path.map((node) => node.kind)).toEqual(['spouse', 'sibling', 'child'])
    expect(path.map((node) => node.gen)).toEqual([0, 0, -1])
  })

  it('skips labels that cannot be resolved', () => {
    expect(buildKinshipPath('爸爸的魔法').map((node) => node.label)).toEqual(['爸爸'])
  })
})

describe('buildTreeLayout', () => {
  it('keeps the baseline row and contiguous generation rows', () => {
    const layout = buildTreeLayout(buildKinshipPath('爸爸的哥哥的儿子'), '堂哥')
    expect(layout.rows).toEqual([1, 0])
    expect(layout.nodes.map((node) => node.kind)).toEqual([
      'self',
      'parent',
      'sibling',
      'child',
      'result',
    ])
    expect(layout.maxCol).toBe(2)
  })

  it('only spends a new column on same-generation steps', () => {
    const layout = buildTreeLayout(buildKinshipPath('爸爸的爸爸'), '')
    expect(layout.nodes.map((node) => node.col)).toEqual([0, 0, 0])
    expect(layout.rows).toEqual([2, 1, 0])
  })

  it('never places two nodes in the same cell', () => {
    const layout = buildTreeLayout(buildKinshipPath('爸爸的儿子'), '儿子')
    const cells = layout.nodes.map((node) => `${node.gen}:${node.col}`)
    expect(new Set(cells).size).toBe(cells.length)
  })
})

describe('resolveRelation', () => {
  it('answers how one relative addresses another', () => {
    expect(resolveRelation({ text: '外婆', target: '舅妈' })).toEqual(['婆婆'])
    expect(resolveRelation({ text: '我', target: '爸爸' })).toEqual(['儿子', '女儿'])
  })

  it('returns the relation chain behind an address', () => {
    expect(resolveRelation({ text: '舅爷爷', type: 'chain' })).toEqual(['爸爸的妈妈的兄弟'])
  })

  it('returns joint labels for a pair of relatives', () => {
    expect(resolveRelation({ text: '堂哥', target: '叔叔', type: 'pair' })).toEqual([
      '伯侄',
      '叔侄',
      '父子',
    ])
    expect(resolveRelation({ text: '舅妈', target: '外婆', type: 'pair' })).toEqual(['婆媳'])
  })

  it('shortens the chain between two relatives when optimal is on', () => {
    expect(resolveRelation({ text: '爸爸', target: '祖父母', optimal: true })).toEqual(['儿子'])
    expect(resolveRelation({ text: '姑姑', target: '叔叔', optimal: true })).toEqual([
      '姐姐',
      '妹妹',
    ])
  })

  it('rejects chains that contradict the given sex', () => {
    expect(resolveRelation({ text: '老婆的妈妈', sex: 0 })).toEqual([])
  })
})

describe('getSelectors', () => {
  it('maps spoken Chinese to relation sign chains', () => {
    expect(getSelectors('爸爸的哥哥')).toEqual([',f,ob'])
    expect(getSelectors('妈妈的妈妈')).toEqual([',m,m'])
  })

  it('expands colloquial synonyms through the replace rules', () => {
    expect(getSelectors('伯父')).toEqual([',f,ob'])
    expect(getSelectors('表哥')).toEqual([',f,xs,s&o', ',m,xb,s&o'])
  })

  it('returns nothing for unknown words', () => {
    expect(getSelectors('魔法学徒')).toEqual([])
  })
})

describe('reverseId', () => {
  it('flips a chain to the other person point of view', () => {
    expect(reverseId('f', 1)).toEqual(['s'])
    expect(reverseId('f', 0)).toEqual(['d'])
    expect(reverseId('xb&o', 1)).toEqual(['xb&l'])
  })

  it('keeps both guesses when the sex is unknown', () => {
    expect(reverseId('f', -1)).toEqual(['s', 'd'])
    expect(reverseId('', -1)).toEqual([''])
  })
})

describe('filterId', () => {
  it('drops the age-specific chain when a generic one covers it', () => {
    expect(filterId(['f,ob', 'f,xb'])).toEqual(['f,xb'])
    expect(filterId(['f,ob', 'f,lb'])).toEqual(['f,ob', 'f,lb'])
  })
})

describe('number conversion', () => {
  it('converts Chinese numerals both ways', () => {
    expect(zh2number('二')).toBe(2)
    expect(zh2number('十')).toBe(10)
    expect(zh2number('十二')).toBe(12)
    expect(zh2number('大')).toBe(1)
    expect(zh2number('小')).toBe(99)
    expect(number2zh(2)).toBe('二')
    expect(number2zh(12)).toBe('十二')
  })
})

describe('getGenById', () => {
  it('sums generation deltas', () => {
    expect(getGenById('f,f,f')).toBe(3)
    expect(getGenById('s,s')).toBe(-2)
    expect(getGenById('ob,lb')).toBe(0)
  })
})

describe('buildQuickButtons', () => {
  it('returns nine buttons with the sex-dependent spouse key', () => {
    const maleButtons = buildQuickButtons(1)
    expect(maleButtons).toHaveLength(9)
    expect(maleButtons.map((button) => button.label)).toContain('老婆')
    expect(maleButtons.map((button) => button.label)).not.toContain('老公')

    const femaleButtons = buildQuickButtons(0)
    expect(femaleButtons.map((button) => button.label)).toContain('老公')
    expect(femaleButtons.map((button) => button.label)).not.toContain('老婆')
  })
})

describe('KINSHIP_EXAMPLES', () => {
  it('lists clickable examples that all resolve', () => {
    expect(KINSHIP_EXAMPLES.length).toBeGreaterThan(3)
    const invalid = KINSHIP_EXAMPLES.filter(
      (example) => calculateKinship({ text: example, sex: 1 }).terms.length === 0,
    )
    expect(invalid).toEqual([])
  })
})
