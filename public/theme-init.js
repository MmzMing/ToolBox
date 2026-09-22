// 防主题闪烁：首屏绘制前应用主题 class（与 src/modules/theme 约定同键同策略）。
// 独立文件而不是 <script> 内联，是为了让部署层的 CSP 能收紧到 script-src 'self'。
;(function () {
  try {
    var stored = localStorage.getItem('theme') || 'system'
    var dark =
      stored === 'dark' ||
      (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  } catch (error) {
    /* 隐私模式下 localStorage 会抛错，主题退回默认亮色 */
  }
})()
