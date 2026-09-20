import { AnimatePresence, motion } from 'motion/react'
import { Eye, FileText, Palette } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { EditPanel } from './EditPanel'
import { PreviewPanel } from './PreviewPanel'
import { SectionIcon } from './SectionIcon'
import { SidePanel } from './SidePanel'
import { useResumeStore } from '../store'

type MobileTab = 'content' | 'style' | 'preview'

const TABS: Array<{ key: MobileTab; icon: typeof FileText }> = [
  { key: 'content', icon: FileText },
  { key: 'style', icon: Palette },
  { key: 'preview', icon: Eye },
]

/**
 * 窄屏工作台：三栏放不下，改成底部三 tab（内容 / 样式 / 预览）。
 *
 * 预览页里 PreviewPanel 保持挂载，导出与打印才抓得到 `#resume-preview`；
 * 但切到别的 tab 时它会被 AnimatePresence 卸载，所以导出按钮在移动端只认预览 tab。
 */
export function MobileWorkbench() {
  const { t } = useTranslation('tools-resume')
  const [tab, setTab] = useState<MobileTab>('content')
  const resume = useResumeStore((state) => state.activeResume)
  const setActiveSection = useResumeStore((state) => state.setActiveSection)

  if (!resume) {
    return null
  }

  const sections = resume.menuSections.filter(
    (section) => section.id === 'basic' || section.enabled,
  )

  return (
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: tab === 'preview' ? 0 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.2 }}
            className="h-full min-h-0 overflow-hidden"
          >
            {tab === 'content' && (
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b">
                  <ScrollArea className="w-full whitespace-nowrap">
                    <div className="flex gap-2 p-2">
                      {sections.map((section) => (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => setActiveSection(section.id)}
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                            resume.activeSection === section.id
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:bg-muted',
                          )}
                        >
                          <SectionIcon name={section.icon} className="size-4 shrink-0" />
                          {section.title}
                        </button>
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" className="invisible" />
                  </ScrollArea>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <EditPanel />
                </div>
              </div>
            )}

            {tab === 'style' && (
              <div className="h-full min-h-0 overflow-y-auto">
                <SidePanel />
              </div>
            )}

            {tab === 'preview' && (
              <div className="h-full min-h-0 overflow-y-auto">
                <PreviewPanel />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <nav className="border-background/95 bg-background relative flex h-16 shrink-0 items-stretch justify-around border-t shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 px-4 transition-colors',
              tab === key ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className={cn('size-5 transition-transform', tab === key && 'scale-110')} />
            <span className="text-[10px] font-medium">{t(`resume.mobile.${key}`)}</span>
            {tab === key && (
              <motion.span
                layoutId="mobile-tab-indicator"
                className="bg-primary absolute bottom-0 h-1 w-12 rounded-t-full"
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
