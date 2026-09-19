/**
 * IP 查询服务：本机公网 IP + 任意 IP 归属地查询。
 * 这两个能力依赖免费公共服务（需联网），是全站唯一的联网工具，
 * 其余工具仍 100% 本地运行。查询服务：ipwho.is（HTTPS、免费、无需密钥）、ipify。
 */

export interface IpInfo {
  ip: string
  country: string
  region: string
  city: string
  isp: string
  latitude: number | null
  longitude: number | null
  timezone: string | null
}

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_REGEX = /^[0-9a-f:]{2,45}$/i

/** 宽松校验 v4/v6 形态（完整合法性由查询服务判定） */
export function isPlausibleIp(value: string): boolean {
  const trimmed = value.trim()
  return IPV4_REGEX.test(trimmed) || IPV6_REGEX.test(trimmed)
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
  const data = (await response.json()) as {
    success?: boolean
    message?: string
    ip?: string
    country?: string
    region?: string
    city?: string
    connection?: { isp?: string }
    latitude?: number
    longitude?: number
    timezone?: { id?: string }
  }
  if (data.success === false) {
    throw new Error(data.message || 'Lookup failed')
  }
  return {
    ip: data.ip ?? ip.trim(),
    country: data.country ?? '',
    region: data.region ?? '',
    city: data.city ?? '',
    isp: data.connection?.isp ?? '',
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
    timezone: data.timezone?.id ?? null,
  }
}

/** 归属地结果转为有序的展示行（label 为稳定 i18n 键） */
export function ipInfoRows(info: IpInfo): { label: string; value: string }[] {
  return (
    [
      { label: 'ip', value: info.ip },
      { label: 'country', value: info.country },
      { label: 'region', value: info.region },
      { label: 'city', value: info.city },
      { label: 'isp', value: info.isp },
      {
        label: 'coordinates',
        value:
          info.latitude !== null && info.longitude !== null
            ? `${info.latitude}, ${info.longitude}`
            : '',
      },
      { label: 'timezone', value: info.timezone ?? '' },
    ] as { label: string; value: string }[]
  ).filter((row) => row.value !== '')
}
