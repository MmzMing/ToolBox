/** UTF-8 安全的 Base64 编码（TextEncoder 处理中文等多字节字符，而非 btoa 直接吃 Latin-1） */
function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/** 仅 Base64 凭证部分：base64(username:password) */
export function buildBasicAuthCredentials(username: string, password: string): string {
  return encodeBase64Utf8(`${username}:${password}`)
}

/** 完整 Authorization 请求头：Authorization: Basic <credentials> */
export function buildBasicAuthHeader(username: string, password: string): string {
  return `Authorization: Basic ${buildBasicAuthCredentials(username, password)}`
}
