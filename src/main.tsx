import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from '@/components/error-boundary'
import { initI18n, resolveInitialLocale } from '@/modules/i18n'
import { AppProviders } from '@/plugins/app-providers'
import './index.css'

/** 语言包已随主包一起加载（modules/i18n 的 eager glob），挂载不再需要 await */
function bootstrap() {
  initI18n(resolveInitialLocale())

  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('#root element is missing')
  }

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <AppProviders />
      </ErrorBoundary>
    </StrictMode>,
  )
}

/**
 * 启动期失败的兜底：这里的异常发生在 React 挂载之前，所以只能用裸 DOM 和写死的
 * 双语文案，否则页面永远是一片空白。
 */
function renderBootstrapFailure() {
  const host = document.getElementById('root') ?? document.body

  // html-sanitized: 下面整段是写死的字面量，不拼任何外部输入
  host.innerHTML =
    '<div style="display:flex;min-height:100vh;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:12px;padding:16px;text-align:center;font:14px system-ui">' +
    '<p style="margin:0">应用启动失败 / Failed to start the app</p>' +
    '<button type="button" style="padding:8px 16px;border:1px solid currentColor;' +
    'border-radius:8px;background:transparent;cursor:pointer">重新加载 / Reload</button>' +
    '</div>'

  host.querySelector('button')?.addEventListener('click', () => window.location.reload())
}

try {
  bootstrap()
} catch (error: unknown) {
  console.error('[app-bootstrap] failed', error)
  renderBootstrapFailure()
}
