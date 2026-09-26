export type FlagCategory = 'request' | 'body' | 'auth' | 'connection' | 'output'

export interface CurlFlag {
  /** 分组，供 UI 决定出现在哪个开关区 */
  readonly category: FlagCategory
  /** true 表示该选项后面必须跟一个值 */
  readonly value: boolean
  readonly short?: string
}

/**
 * 已收录的 curl 选项表。语义取自 curl 官方手册与 curlconverter 的 `src/curl/opts.ts`
 * （MIT），这里只保留约 60 个与「构造 HTTP 请求」相关的高频项；未收录的选项解析后
 * 以 `recognized: false` 原样透传，不会被丢弃。
 */
export const CURL_FLAGS: Readonly<Record<string, CurlFlag>> = {
  // 请求行
  url: { category: 'request', value: true },
  request: { category: 'request', value: true, short: 'X' },
  get: { category: 'request', value: false, short: 'G' },
  head: { category: 'request', value: false, short: 'I' },
  globoff: { category: 'request', value: false, short: 'g' },
  'url-query': { category: 'request', value: true },
  'proto-default': { category: 'request', value: true },

  // 请求头与 Cookie
  header: { category: 'request', value: true, short: 'H' },
  'user-agent': { category: 'request', value: true, short: 'A' },
  referer: { category: 'request', value: true, short: 'e' },
  range: { category: 'request', value: true, short: 'r' },
  'time-cond': { category: 'request', value: true, short: 'z' },
  cookie: { category: 'request', value: true, short: 'b' },
  'cookie-jar': { category: 'request', value: true, short: 'c' },
  'junk-session-cookies': { category: 'request', value: false, short: 'j' },

  // 请求体
  data: { category: 'body', value: true, short: 'd' },
  'data-ascii': { category: 'body', value: true },
  'data-raw': { category: 'body', value: true },
  'data-binary': { category: 'body', value: true },
  'data-urlencode': { category: 'body', value: true },
  json: { category: 'body', value: true },
  form: { category: 'body', value: true, short: 'F' },
  'form-string': { category: 'body', value: true },
  'upload-file': { category: 'body', value: true, short: 'T' },
  newline: { category: 'body', value: false },

  // 认证
  user: { category: 'auth', value: true, short: 'u' },
  basic: { category: 'auth', value: false },
  digest: { category: 'auth', value: false },
  negotiate: { category: 'auth', value: false },
  ntlm: { category: 'auth', value: false },
  anyauth: { category: 'auth', value: false },
  'oauth2-bearer': { category: 'auth', value: true },
  'aws-sigv4': { category: 'auth', value: true },

  // 连接与安全
  location: { category: 'connection', value: false, short: 'L' },
  'max-redirs': { category: 'connection', value: true },
  insecure: { category: 'connection', value: false, short: 'k' },
  cacert: { category: 'connection', value: true },
  cert: { category: 'connection', value: true, short: 'E' },
  key: { category: 'connection', value: true },
  'connect-timeout': { category: 'connection', value: true },
  'max-time': { category: 'connection', value: true, short: 'm' },
  proxy: { category: 'connection', value: true, short: 'x' },
  'proxy-user': { category: 'connection', value: true, short: 'U' },
  proxytunnel: { category: 'connection', value: false, short: 'p' },
  socks5: { category: 'connection', value: true },
  resolve: { category: 'connection', value: true },
  'dns-servers': { category: 'connection', value: true },
  interface: { category: 'connection', value: true },
  ipv4: { category: 'connection', value: false, short: '4' },
  ipv6: { category: 'connection', value: false, short: '6' },
  'limit-rate': { category: 'connection', value: true },
  retry: { category: 'connection', value: true },
  'retry-delay': { category: 'connection', value: true },
  'retry-max-time': { category: 'connection', value: true },
  'keepalive-time': { category: 'connection', value: true },
  compressed: { category: 'connection', value: false },
  'fail-on-error': { category: 'connection', value: false },
  'tls-max': { category: 'connection', value: true },
  'tlsv1.2': { category: 'connection', value: false },
  'tlsv1.3': { category: 'connection', value: false },
  'http1.0': { category: 'connection', value: false, short: '1' },
  'http1.1': { category: 'connection', value: false },
  http2: { category: 'connection', value: false },
  'http2-prior-knowledge': { category: 'connection', value: false },
  http3: { category: 'connection', value: false },

  // 输出与行为
  output: { category: 'output', value: true, short: 'o' },
  'remote-name': { category: 'output', value: false, short: 'O' },
  'remote-header-name': { category: 'output', value: false, short: 'J' },
  include: { category: 'output', value: false, short: 'i' },
  verbose: { category: 'output', value: false, short: 'v' },
  silent: { category: 'output', value: false, short: 's' },
  'show-error': { category: 'output', value: false, short: 'S' },
  'progress-bar': { category: 'output', value: false, short: '#' },
  fail: { category: 'output', value: false, short: 'f' },
  'write-out': { category: 'output', value: true, short: 'w' },
  'dump-header': { category: 'output', value: true, short: 'D' },
  stderr: { category: 'output', value: true },
  trace: { category: 'output', value: true },
  'trace-ascii': { category: 'output', value: true },
  'continue-at': { category: 'output', value: true, short: 'C' },
  append: { category: 'output', value: false, short: 'a' },
  'max-filesize': { category: 'output', value: true },
  parallel: { category: 'output', value: false, short: 'Z' },
  next: { category: 'output', value: false, short: ':' },
}

/** 短选项名 → 规范长名，由 CURL_FLAGS 反推，避免两份表漂移 */
export const SHORT_TO_LONG: Readonly<Record<string, string>> = buildShortMap()

function buildShortMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [long, flag] of Object.entries(CURL_FLAGS)) {
    if (flag.short) map[flag.short] = long
  }
  return map
}

/**
 * 解析长选项：支持 curl 的唯一前缀缩写（`--dat` → `--data`）。
 * `null` 表示不在表里，交由调用方按未识别参数透传。
 */
export function resolveLongFlag(name: string): string | null {
  if (Object.prototype.hasOwnProperty.call(CURL_FLAGS, name)) return name
  const matches = Object.keys(CURL_FLAGS).filter((candidate) => candidate.startsWith(name))
  return matches.length === 1 ? matches[0] : null
}

export function flagTakesValue(longName: string): boolean {
  return CURL_FLAGS[longName]?.value === true
}

export function takesFileReference(value: string): boolean {
  return value.startsWith('@') || value.startsWith('<')
}
