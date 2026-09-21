/** 触发一次浏览器下载（工具内局部实现，避免跨工具 import） */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadText(text: string, fileName: string, mime: string): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), fileName)
}
