/** 触发一次本地下载：数据全程留在浏览器，不经过服务器 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  // 立刻 revoke 会和浏览器接管 blob 的时机抢跑，留到下一个宏任务
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadText(text: string, fileName: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), fileName)
}
