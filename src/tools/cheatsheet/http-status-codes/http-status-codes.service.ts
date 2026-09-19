import { getReasonPhrase as libGetReasonPhrase } from 'http-status-codes'

export const statusGroupKeys = [
  'informational',
  'success',
  'redirect',
  'clientError',
  'serverError',
] as const

export type StatusGroupKey = (typeof statusGroupKeys)[number]

export interface StatusEntry {
  code: number
  /** i18n 名称键（稳定）：映射 <name>.status-<nameKey> 与 <name>.desc-<nameKey> */
  nameKey: string
}

/** 常见 HTTP 状态码（~50 个），code 升序、nameKey 稳定供 i18n 使用 */
export const statusCategories: readonly StatusEntry[] = [
  { code: 100, nameKey: 'continue' },
  { code: 101, nameKey: 'switchingProtocols' },
  { code: 102, nameKey: 'processing' },
  { code: 103, nameKey: 'earlyHints' },
  { code: 200, nameKey: 'ok' },
  { code: 201, nameKey: 'created' },
  { code: 202, nameKey: 'accepted' },
  { code: 203, nameKey: 'nonAuthoritative' },
  { code: 204, nameKey: 'noContent' },
  { code: 205, nameKey: 'resetContent' },
  { code: 206, nameKey: 'partialContent' },
  { code: 300, nameKey: 'multipleChoices' },
  { code: 301, nameKey: 'movedPermanently' },
  { code: 302, nameKey: 'found' },
  { code: 303, nameKey: 'seeOther' },
  { code: 304, nameKey: 'notModified' },
  { code: 307, nameKey: 'temporaryRedirect' },
  { code: 308, nameKey: 'permanentRedirect' },
  { code: 400, nameKey: 'badRequest' },
  { code: 401, nameKey: 'unauthorized' },
  { code: 402, nameKey: 'paymentRequired' },
  { code: 403, nameKey: 'forbidden' },
  { code: 404, nameKey: 'notFound' },
  { code: 405, nameKey: 'methodNotAllowed' },
  { code: 406, nameKey: 'notAcceptable' },
  { code: 407, nameKey: 'proxyAuthenticationRequired' },
  { code: 408, nameKey: 'requestTimeout' },
  { code: 409, nameKey: 'conflict' },
  { code: 410, nameKey: 'gone' },
  { code: 411, nameKey: 'lengthRequired' },
  { code: 412, nameKey: 'preconditionFailed' },
  { code: 413, nameKey: 'payloadTooLarge' },
  { code: 414, nameKey: 'uriTooLong' },
  { code: 415, nameKey: 'unsupportedMediaType' },
  { code: 416, nameKey: 'rangeNotSatisfiable' },
  { code: 417, nameKey: 'expectationFailed' },
  { code: 418, nameKey: 'imATeapot' },
  { code: 421, nameKey: 'misdirectedRequest' },
  { code: 422, nameKey: 'unprocessableEntity' },
  { code: 426, nameKey: 'upgradeRequired' },
  { code: 428, nameKey: 'preconditionRequired' },
  { code: 429, nameKey: 'tooManyRequests' },
  { code: 431, nameKey: 'requestHeaderFieldsTooLarge' },
  { code: 451, nameKey: 'unavailableForLegalReasons' },
  { code: 500, nameKey: 'internalServerError' },
  { code: 501, nameKey: 'notImplemented' },
  { code: 502, nameKey: 'badGateway' },
  { code: 503, nameKey: 'serviceUnavailable' },
  { code: 504, nameKey: 'gatewayTimeout' },
  { code: 505, nameKey: 'httpVersionNotSupported' },
  { code: 507, nameKey: 'insufficientStorage' },
  { code: 511, nameKey: 'networkAuthenticationRequired' },
]

/** 状态码所属分组：1xx→informational、2xx→success、3xx→redirect、4xx→clientError、5xx→serverError */
export function getStatusGroup(code: number): StatusGroupKey | null {
  if (!Number.isInteger(code) || code < 100 || code > 599) {
    return null
  }
  return statusGroupKeys[Math.floor(code / 100) - 1] ?? null
}

/** 按分组筛选内置状态码（code 升序保持不变） */
export function statusesByGroup(group: StatusGroupKey): readonly StatusEntry[] {
  const groupIndex = statusGroupKeys.indexOf(group)
  return statusCategories.filter((entry) => Math.floor(entry.code / 100) - 1 === groupIndex)
}

/** 状态码 → reason phrase（来自 http-status-codes 库）；未知状态码返回 null */
export function getReasonPhrase(code: number): string | null {
  try {
    return libGetReasonPhrase(code)
  } catch {
    return null
  }
}
