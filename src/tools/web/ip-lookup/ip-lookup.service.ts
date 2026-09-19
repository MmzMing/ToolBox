/**
 * IP 查询服务：本机公网 IP + 任意 IP 归属地查询。
 * 这两个能力依赖免费公共服务（需联网），是全站唯一的联网工具，
 * 其余工具仍 100% 本地运行。查询服务：ipwho.is（HTTPS、免费、无需密钥）、ipify。
 */

export interface IpInfo {
  ip: string
  continent: string
  country: string
  countryCode: string
  region: string
  city: string
  postcode: string
  latitude: number | null
  longitude: number | null
  capital: string
  callingCode: string
  isp: string
  org: string
  asn: string
  domain: string
  timezoneId: string
  utcOffset: string
  abbreviation: string
  localTime: string
}

/** ipwho.is 响应：字段可能缺失（私有/保留地址只返回部分），故全部可选 */
interface IpWhoResponse {
  success?: boolean
  message?: string
  ip?: string
  continent?: string
  country?: string
  country_code?: string
  region?: string
  city?: string
  postal_code?: string
  postcode?: string
  latitude?: number
  longitude?: number
  capital?: string
  calling_code?: string
  connection?: { isp?: string; org?: string; asn?: number; domain?: string }
  timezone?: { id?: string; abbr?: string; utc?: string; offset?: number; current_time?: string }
  localtime?: string
}

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_REGEX = /^[0-9a-f:]{2,45}$/i

/** 宽松校验 v4/v6 形态（完整合法性由查询服务判定） */
export function isPlausibleIp(value: string): boolean {
  const trimmed = value.trim()
  return IPV4_REGEX.test(trimmed) || IPV6_REGEX.test(trimmed)
}

/** 秒偏移 → ±HH:MM（ipwho.is 部分响应只给数值 offset） */
export function formatUtcOffset(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return ''
  }
  const sign = seconds < 0 ? '-' : '+'
  const absolute = Math.abs(seconds)
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor((absolute % 3600) / 60)
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** 获取本机公网 IP（ipify，HTTPS 免费） */
export async function fetchPublicIp(): Promise<string> {
  const response = await fetch('https://api.ipify.org?format=json')
  if (!response.ok) {
    throw new Error(`ipify responded ${response.status}`)
  }
  const data = (await response.json()) as { ip?: string }
  if (!data.ip) {
    throw new Error('ipify response missing ip')
  }
  return data.ip
}

/** 查询任意 IP 的归属地信息（ipwho.is） */
export async function lookupIp(ip: string): Promise<IpInfo> {
  if (!isPlausibleIp(ip)) {
    throw new Error(`Invalid IP: ${ip}`)
  }
  const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip.trim())}`)
  if (!response.ok) {
    throw new Error(`ipwho.is responded ${response.status}`)
  }
  const data = (await response.json()) as IpWhoResponse
  if (data.success === false) {
    throw new Error(data.message || 'Lookup failed')
  }
  const asn = data.connection?.asn
  return {
    ip: data.ip ?? ip.trim(),
    continent: data.continent ?? '',
    country: data.country ?? '',
    countryCode: data.country_code ?? '',
    region: data.region ?? '',
    city: data.city ?? '',
    postcode: data.postal_code ?? data.postcode ?? '',
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
    capital: data.capital ?? '',
    callingCode: data.calling_code ?? '',
    isp: data.connection?.isp ?? '',
    org: data.connection?.org ?? '',
    asn: typeof asn === 'number' ? `AS${asn}` : '',
    domain: data.connection?.domain ?? '',
    timezoneId: data.timezone?.id ?? '',
    utcOffset: data.timezone?.utc ?? formatUtcOffset(data.timezone?.offset),
    abbreviation: data.timezone?.abbr ?? '',
    localTime: data.timezone?.current_time ?? data.localtime ?? '',
  }
}

/** 经纬度对（无坐标时为空串） */
export function formatCoordinates(info: IpInfo): string {
  return info.latitude !== null && info.longitude !== null
    ? `${info.latitude}, ${info.longitude}`
    : ''
}

/** 归属地结果转为有序的展示格（label 为稳定 i18n 键，空值不展示） */
export function ipInfoRows(info: IpInfo): { label: string; value: string }[] {
  return (
    [
      { label: 'country', value: info.country },
      { label: 'region', value: info.region },
      { label: 'city', value: info.city },
      { label: 'postcode', value: info.postcode },
      { label: 'continent', value: info.continent },
      { label: 'coordinates', value: formatCoordinates(info) },
      { label: 'capital', value: info.capital },
      { label: 'callingCode', value: info.callingCode },
      { label: 'isp', value: info.isp },
      { label: 'org', value: info.org },
      { label: 'asn', value: info.asn },
      { label: 'domain', value: info.domain },
      { label: 'timezone', value: info.timezoneId },
      { label: 'utcOffset', value: info.utcOffset },
      { label: 'abbreviation', value: info.abbreviation },
      { label: 'localTime', value: info.localTime },
    ] as { label: string; value: string }[]
  ).filter((row) => row.value !== '')
}

/** 地点摘要行，如「CN 中国 · 广东省 · 广州」 */
export function locationSummary(info: IpInfo): string {
  return [info.country, info.region, info.city].filter(Boolean).join(' · ')
}

/**
 * 高德地图 marker URI（uri.amap.com 规范：position 为「经度,纬度」）。
 * ipwho.is 给的是 WGS-84 坐标，国内会有数百米级偏移，仅作大致定位。
 */
export function mapMarkerUrl(info: IpInfo): string | null {
  if (info.latitude === null || info.longitude === null) {
    return null
  }
  const name = locationSummary(info)
  const query = new URLSearchParams({
    position: `${info.longitude},${info.latitude}`,
    name,
    coordinate: 'wgs84',
  })
  return `https://uri.amap.com/marker?${query.toString()}`
}
