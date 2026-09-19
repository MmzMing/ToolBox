import { BookOpen, ChevronRight, Menu, PanelLeft, Search, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'

import { LocaleSwitcher } from '@/components/locale-switcher'
import { GithubIcon } from '@/components/icons/github-icon'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
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
import { usePreferencesStore } from '@/stores/preferences.store'
import { SidebarContent } from '@/layouts/sidebar-content'
import { getToolByPath } from '@/tools'
import { categoryIcons } from '@/tools/categories'
import { siteConfig } from '@/config/site'

/**
 * 全局布局：左侧手风琴分类导航（桌面可折叠，平板与手机为抽屉）+ 顶栏 + 内容区。
 * 顶栏左侧为侧栏开关与面包屑，右侧为搜索入口（Ctrl/Cmd+K）、语言与主题切换。
 */
export default function BaseLayout() {
  const { t } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const openPalette = useSearchStore((state) => state.setOpen)
  const sidebarCollapsed = usePreferencesStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = usePreferencesStore((state) => state.setSidebarCollapsed)

  const activeTool = getToolByPath(location.pathname)
  const CategoryIcon = activeTool ? categoryIcons[activeTool.category] : null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-svh w-full">
        <aside
          className={`bg-sidebar sticky top-0 h-svh shrink-0 overflow-hidden border-r transition-[width] duration-200 md:block ${
            sidebarCollapsed ? 'hidden w-0 border-r-0' : 'w-64'
          }`}
        >
          <div className="flex h-full w-64 flex-col">
            <SidebarContent />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-background/95 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur md:px-4">
            {/* 移动端：抽屉导航 */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label={t('openMenu')}
                >
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

            {/* 桌面端：侧栏展开/收缩 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden md:inline-flex"
                  aria-label={sidebarCollapsed ? t('openSidebar') : t('collapseSidebar')}
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                >
                  <PanelLeft className={sidebarCollapsed ? '' : 'text-primary'} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {sidebarCollapsed ? t('openSidebar') : t('collapseSidebar')}
              </TooltipContent>
            </Tooltip>

            {/* 移动端 Logo */}
            <Link to="/" className="flex items-center gap-2 md:hidden">
              <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg">
                <Wrench className="size-4" />
              </span>
              <span className="text-base font-semibold">ToolBox</span>
            </Link>

            {/* 面包屑 */}
            <Breadcrumb className="hidden min-w-0 flex-1 md:block">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/" className="flex items-center gap-1.5">
                      <Wrench className="size-3.5" />
                      {t('breadcrumbHome')}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {activeTool && (
                  <>
                    <BreadcrumbSeparator>
                      <ChevronRight className="size-3.5" />
                    </BreadcrumbSeparator>
                    <BreadcrumbItem>
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        {CategoryIcon && <CategoryIcon className="size-3.5" />}
                        {tCategory(activeTool.category)}
                      </span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator>
                      <ChevronRight className="size-3.5" />
                    </BreadcrumbSeparator>
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-medium">
                        {t(`tools-${activeTool.category}:${activeTool.name}.title`)}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
                {!activeTool && location.pathname !== '/' && (
                  <>
                    <BreadcrumbSeparator>
                      <ChevronRight className="size-3.5" />
                    </BreadcrumbSeparator>
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-medium">
                        {location.pathname === '/about' ? t('about') : location.pathname}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="hidden flex-1 md:block" aria-hidden="true" />

            {/* 右侧：搜索 + 语言 + 主题 + 博客 + GitHub */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openPalette(true)}
                    className="text-muted-foreground hover:bg-muted aria-expanded:bg-muted flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors md:mr-1 md:px-3"
                  >
                    <Search className="size-4 shrink-0" />
                    <span className="hidden min-w-24 text-left md:inline">
                      {t('searchPlaceholder')}
                    </span>
                    <kbd className="bg-background text-muted-foreground hidden shrink-0 rounded border px-1.5 font-mono text-[10px] lg:inline">
                      Ctrl K
                    </kbd>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="md:hidden">
                  {t('searchPlaceholder')}
                </TooltipContent>
              </Tooltip>
              <LocaleSwitcher />
              <ThemeToggle />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={siteConfig.blogUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t('blog')}
                    >
                      <BookOpen className="size-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('blog')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={siteConfig.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t('github')}
                    >
                      <GithubIcon className="size-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('github')}</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <main className="flex-1">
            <Outlet />
          </main>

          <footer className="text-muted-foreground border-t px-4 py-4 text-center text-xs">
            ToolBox · {t('footerNote')}
          </footer>
        </div>

        <CommandPalette />
      </div>
    </TooltipProvider>
  )
}
