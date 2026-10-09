import { BookOpen, Info, MoreHorizontal } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

import { ActionPill, PillLink } from '@/components/action-pill'
import { GithubIcon } from '@/components/icons/github-icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { siteConfig } from '@/config/site'
import type { ExternalLinkMode } from '@/layouts/app-shell/dock-logic'

type ExternalLinksProps = {
  /** inline：桌面全展开；menu：平板收进「更多」 */
  mode: ExternalLinkMode
  /** 「更多」菜单的受控开关，与顶栏其余下拉互斥 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type ExternalLink = {
  key: 'blog' | 'about' | 'github'
  icon: ComponentType<SVGProps<SVGSVGElement>>
  href: string
  external: boolean
}

const links: readonly ExternalLink[] = [
  { key: 'blog', icon: BookOpen, href: siteConfig.blogUrl, external: true },
  { key: 'about', icon: Info, href: '/about', external: false },
  { key: 'github', icon: GithubIcon, href: siteConfig.githubUrl, external: true },
]

/** 博客 / 关于 / GitHub 三个站外入口，按断点收成两种形态 */
export function ExternalLinks({ mode, open, onOpenChange }: ExternalLinksProps) {
  const { t } = useTranslation('common')

  if (mode === 'menu') {
    return (
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <ActionPill label={t('dock.more')} icon={MoreHorizontal} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {links.map((link) => {
            const Icon = link.icon
            return (
              <DropdownMenuItem key={link.key} asChild>
                {link.external ? (
                  <a href={link.href} target="_blank" rel="noreferrer">
                    <Icon className="size-4" />
                    {t(link.key)}
                  </a>
                ) : (
                  <Link to={link.href}>
                    <Icon className="size-4" />
                    {t(link.key)}
                  </Link>
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      {links.map((link) =>
        link.external ? (
          <PillLink key={link.key} label={t(link.key)} icon={link.icon} href={link.href} />
        ) : (
          <PillLink key={link.key} label={t(link.key)} icon={link.icon} to={link.href} />
        ),
      )}
    </>
  )
}
