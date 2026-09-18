import { Menu, Search, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'

import { LocaleSwitcher } from '@/components/locale-switcher'
import { GithubIcon } from '@/components/icons/github-icon'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { CommandPalette } from '@/modules/command-palette/command-palette'
import { useSearchStore } from '@/stores/search.store'
import { SidebarContent } from '@/layouts/sidebar-content'

const GITHUB_URL = 'https://github.com/your-org/toolbox'

/**
 * 全局布局：左侧手风琴分类导航（PC 常驻 / 平板与手机为抽屉）+ 顶栏 + 内容区。
 * 顶栏含 Command Palette 搜索入口（Ctrl/Cmd+K）、语言与主题切换。
 */
export default function BaseLayout() {
  const { t } = useTranslation('common')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const openPalette = useSearchStore((state) => state.setOpen)

  return (
    <div className="flex min-h-svh w-full">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-4">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label={t('openMenu')}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>ToolBox</SheetTitle>
                <SheetDescription>{t('openMenu')}</SheetDescription>
              </SheetHeader>
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex items-center gap-2 md:hidden">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="size-4" />
            </span>
            <span className="text-base font-semibold">ToolBox</span>
          </Link>

          <button
            type="button"
            onClick={() => openPalette(true)}
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted md:mx-2 md:max-w-md"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">{t('searchPlaceholder')}</span>
            <kbd className="ml-auto hidden shrink-0 rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label={t('github')}>
                <GithubIcon className="size-4" />
              </a>
            </Button>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>

        <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
          ToolBox · {t('footerNote')}
        </footer>
      </div>

      <CommandPalette />
    </div>
  )
}
