import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from '@/components/error-boundary'
import { initI18n, resolveInitialLocale } from '@/modules/i18n'
import { AppProviders } from '@/plugins/app-providers'
import './index.css'

/** 先完成语言包加载再挂载，避免首屏文案闪语言 key */
async function bootstrap() {
  const locale = resolveInitialLocale()
  await initI18n(locale)

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
 * 启动期失败的兜底：语言包分片 404 之类的异常发生在 React 与 i18n 之前，
 * 所以这里只能用裸 DOM 和写死的双语文案，否则页面永远是一片空白。
 */
function renderBootstrapFailure() {
  const host = document.getElementById('root') ?? document.body

  host.innerHTML =
    '<div style="display:flex;min-height:100vh;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:12px;padding:16px;text-align:center;font:14px system-ui">' +
    '<p style="margin:0">应用启动失败 / Failed to start the app</p>' +
    '<button type="button" style="padding:8px 16px;border:1px solid currentColor;' +
    'border-radius:8px;background:transparent;cursor:pointer">重新加载 / Reload</button>' +
    '</div>'

  host.querySelector('button')?.addEventListener('click', () => window.location.reload())
}

void bootstrap().catch((error: unknown) => {
  console.error('[app-bootstrap] failed', error)
  renderBootstrapFailure()
})
