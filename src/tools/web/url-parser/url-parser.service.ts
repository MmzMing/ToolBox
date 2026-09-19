export interface ParsedUrlParam {
  name: string
  value: string
}

export interface ParsedUrl {
  href: string
  protocol: string
  host: string
  hostname: string
  port: string
  pathname: string
  search: string
  hash: string
  origin: string
  searchParams: ParsedUrlParam[]
}

const urlFields = [
  'href',
  'protocol',
  'host',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
  'origin',
] as const

/** 拆解 URL：包装 WHATWG URL 类，输出可序列化对象；非法输入抛 Error */
export function parseUrl(input: string): ParsedUrl {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error(`Invalid URL: ${input === '' ? '(empty)' : input}`)
  }

  const base: Pick<ParsedUrl, (typeof urlFields)[number]> = Object.fromEntries(
    urlFields.map((field) => [field, url[field]]),
  ) as Pick<ParsedUrl, (typeof urlFields)[number]>

  const searchParams: ParsedUrlParam[] = []
  for (const [name, value] of url.searchParams) {
    searchParams.push({ name, value })
  }

  return { ...base, searchParams }
}
