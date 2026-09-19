export interface RegexMemoItem {
  /** 正则语法片段（展示与复制用） */
  pattern: string
  /** i18n 键：tools-development 命名空间下 regex-memo.<descriptionKey> */
  descriptionKey: string
}

export interface RegexMemoGroup {
  id: string
  items: RegexMemoItem[]
}

function item(pattern: string, key: string): RegexMemoItem {
  return { pattern, descriptionKey: `item-${key}` }
}

/** 正则语法速查静态数据：锚点 / 字符类 / 量词 / 分组引用 / 断言 / 常用示例 */
export const regexMemoGroups: readonly RegexMemoGroup[] = [
  {
    id: 'anchors',
    items: [
      item('^', 'anchor-start'),
      item('$', 'anchor-end'),
      item('\\b', 'anchor-word-boundary'),
      item('\\B', 'anchor-not-word-boundary'),
    ],
  },
  {
    id: 'classes',
    items: [
      item('\\d', 'class-digit'),
      item('\\D', 'class-not-digit'),
      item('\\w', 'class-word'),
      item('\\W', 'class-not-word'),
      item('\\s', 'class-whitespace'),
      item('\\S', 'class-not-whitespace'),
      item('.', 'class-any'),
      item('[abc]', 'class-set'),
      item('[^abc]', 'class-negated-set'),
      item('[a-z]', 'class-range'),
    ],
  },
  {
    id: 'quantifiers',
    items: [
      item('*', 'quant-zero-or-more'),
      item('+', 'quant-one-or-more'),
      item('?', 'quant-optional'),
      item('{n}', 'quant-exact'),
      item('{n,}', 'quant-min'),
      item('{n,m}', 'quant-range'),
      item('*?', 'quant-lazy'),
    ],
  },
  {
    id: 'groups',
    items: [
      item('(…)', 'group-capture'),
      item('(?:…)', 'group-non-capture'),
      item('(?<name>…)', 'group-named'),
      item('\\1', 'group-backreference'),
      item('a|b', 'group-alternation'),
    ],
  },
  {
    id: 'assertions',
    items: [
      item('(?=…)', 'assert-lookahead'),
      item('(?!…)', 'assert-negative-lookahead'),
      item('(?<=…)', 'assert-lookbehind'),
      item('(?<!…)', 'assert-negative-lookbehind'),
    ],
  },
  {
    id: 'examples',
    items: [
      item('[\\w.+-]+@[\\w-]+\\.[\\w.-]+', 'example-email'),
      item('https?://[^\\s]+', 'example-url'),
      item('\\b\\d{1,3}(\\.\\d{1,3}){3}\\b', 'example-ipv4'),
      item('\\d{4}-\\d{2}-\\d{2}', 'example-date'),
      item('#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b', 'example-hex-color'),
    ],
  },
]
