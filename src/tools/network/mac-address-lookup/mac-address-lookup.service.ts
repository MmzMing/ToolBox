/**
 * MAC 地址归一化与 OUI 厂商查询（纯逻辑，零依赖）。
 * OUI 静态表为 IEEE 注册数据的常见子集（键 = 前 3 字节大写十六进制，无分隔符）。
 */

const OUI_KEY_LENGTH = 6

export const ouiDatabase: Record<string, string> = {
  '00000C': 'Cisco Systems, Inc',
  '00005E': 'ICANN, IANA Department',
  '000393': 'Apple, Inc.',
  '0004AC': 'IBM Corp',
  '00055D': 'D-Link Systems, Inc.',
  '000569': 'VMware, Inc.',
  '000585': 'Juniper Networks',
  '00090F': 'Fortinet, Inc.',
  '00095B': 'NETGEAR',
  '000A27': 'Apple, Inc.',
  '000C29': 'VMware, Inc.',
  '000D3A': 'Microsoft Corp.',
  '000D93': 'Apple, Inc.',
  '000DB9': 'PC Engines GmbH',
  '0010FA': 'Apple, Inc.',
  '001132': 'Synology Incorporated',
  '001422': 'Dell Inc.',
  '001451': 'Apple, Inc.',
  '00155D': 'Microsoft Corporation',
  '001632': 'Samsung Electronics Co., Ltd',
  '00163E': 'Xensource, Inc.',
  '0016CB': 'Apple, Inc.',
  '0017F2': 'Apple, Inc.',
  '001882': 'Huawei Technologies Co., Ltd',
  '001A11': 'Google, Inc.',
  '001A2B': 'Ayecom Technology Co., Ltd.',
  '001B0C': 'Cisco Systems, Inc',
  '001B21': 'Intel Corporate',
  '001B63': 'Apple, Inc.',
  '001BD4': 'Cisco Systems, Inc',
  '001C14': 'VMware, Inc.',
  '001D60': 'ASUSTek Computer Inc.',
  '001D73': 'Buffalo Inc.',
  '001DD8': 'Microsoft Corporation',
  '001E52': 'Apple, Inc.',
  '001F29': 'Hewlett Packard',
  '0024D7': 'Intel Corporate',
  '0026B9': 'Dell Inc.',
  '005056': 'VMware, Inc.',
  '0050F2': 'Microsoft Corp.',
  '00E04C': 'Realtek Semiconductor Corp.',
  '04D9F5': 'ASUSTek Computer Inc.',
  '080020': 'Oracle Corporation (Sun Microsystems)',
  '080027': 'PCS Systemtechnik GmbH (VirtualBox)',
  '245A4C': 'Ubiquiti Inc.',
  '28CDC1': 'Raspberry Pi Trading Ltd',
  '346BD3': 'Huawei Technologies Co., Ltd',
  '3C5AB4': 'Google, Inc.',
  '3CA9F4': 'Intel Corporate',
  '3CD92B': 'Hewlett Packard',
  '50C7BF': 'TP-Link Technologies Co., Ltd.',
  '640980': 'Xiaomi Communications Co Ltd',
  '7811DC': 'Xiaomi Electronics, Co., Ltd',
  AC220B: 'ASUSTek Computer Inc.',
  AC84C6: 'TP-Link Technologies Co., Ltd.',
  ACBC32: 'Apple, Inc.',
  B827EB: 'Raspberry Pi Foundation',
  D05099: 'ASRock Incorporation',
  D83ADD: 'Raspberry Pi Trading Ltd',
  DCA632: 'Raspberry Pi Trading Ltd',
  E45F01: 'Raspberry Pi Trading Ltd',
  ECFABC: 'Espressif Inc.',
  F01898: 'Apple, Inc.',
  F09FC2: 'Ubiquiti Inc.',
  F40F1B: 'Cisco Systems, Inc',
  F4F5D8: 'Google, Inc.',
}

/**
 * 归一化 MAC 地址为大写冒号分隔格式 'AA:BB:CC:DD:EE:FF'。
 * 支持 ':' '-' '.' 分隔、空格分隔与无分隔；非法输入抛 Error。
 */
export function normalizeMac(input: string): string {
  const hex = input.replaceAll(/[:.\s-]/g, '').toUpperCase()
  if (!/^[0-9A-F]{12}$/.test(hex)) {
    throw new Error(`Invalid MAC address: "${input}"`)
  }
  return (hex.match(/.{2}/g) ?? []).join(':')
}

/** 取 MAC 的 OUI 前缀（前 3 字节），非法输入抛 Error */
export function macOuiPrefix(mac: string): string {
  return normalizeMac(mac).replaceAll(':', '').slice(0, OUI_KEY_LENGTH)
}

/** 查询 MAC 厂商；OUI 未收录时返回 null，MAC 非法时抛 Error */
export function lookupMacVendor(mac: string): string | null {
  return ouiDatabase[macOuiPrefix(mac)] ?? null
}
