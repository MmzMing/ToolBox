import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { initI18n, resolveInitialLocale } from '@/modules/i18n'
import { AppProviders } from '@/plugins/app-providers'
import './index.css'

/** 先完成语言包加载再挂载，避免首屏文案闪语言 key */
async function bootstrap() {
  const locale = resolveInitialLocale()
  await initI18n(locale)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProviders />
    </StrictMode>,
  )
}

void bootstrap()
