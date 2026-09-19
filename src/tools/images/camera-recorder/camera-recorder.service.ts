export const RECORDING_MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm'] as const

/**
 * 选择当前浏览器支持的录制 MIME 类型（依优先级），
 * MediaRecorder 不可用（如 node 环境）或均不支持时返回空字符串。
 */
export function pickRecordingMime(): string {
  if (typeof MediaRecorder === 'undefined') {
    return ''
  }
  for (const mime of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return ''
}
