import { useTranslation } from 'react-i18next'

import { STYLE_GROUPS, styleAnchorId } from './style-groups'
import type { StyleGroupKey } from './style-groups'
import { ModePanel } from './style-panels/ModePanel'
import { SpacingPanel } from './style-panels/SpacingPanel'
import { ThemePanel } from './style-panels/ThemePanel'
import { TypographyPanel } from './style-panels/TypographyPanel'

/**
 * 样式页：主题色 / 排版 / 间距 / 显示模式一次全展开。
 *
 * 与内容页不同，这里不按章节切——操作栏的样式按钮只负责把对应分组滚到顶。
 */
export function StylePage() {
  const { t } = useTranslation('tools-resume')
  const panels: Record<StyleGroupKey, React.ReactNode> = {
    theme: <ThemePanel />,
    typography: <TypographyPanel />,
    spacing: <SpacingPanel />,
    mode: <ModePanel />,
  }

  return (
    <div className="@container w-full">
      <div className="grid grid-cols-1 items-start gap-4 @[560px]:grid-cols-2">
        {STYLE_GROUPS.map(({ key }) => (
          <section
            key={key}
            id={styleAnchorId(key)}
            className="border-border bg-card scroll-mt-4 rounded-xl border p-4"
          >
            <h2 className="text-sm font-medium">{t(`resume.sidePanel.${key}.title`)}</h2>
            <div className="mt-3 flex flex-col gap-4">{panels[key]}</div>
          </section>
        ))}
      </div>
    </div>
  )
}
