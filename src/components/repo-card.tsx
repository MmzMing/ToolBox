import type { ComponentType, SVGProps } from 'react'
import { useTranslation } from 'react-i18next'
import { GitFork, Scale, Star } from 'lucide-react'

import { GithubIcon } from '@/components/icons/github-icon'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { siteConfig } from '@/config/site'
import { useGithubRepo } from '@/composable/use-github-repo'

type RepoCardProps = {
  owner: string
  name: string
  description: string
  url: string
  /** "owner/name"；传了才请求并展示 star/fork，纯链接卡片省略 */
  repo?: string
  /** 左上角圆形头像；默认取站内品牌图，离线可用，不热链外部资源 */
  avatar?: string
  /** 右上角标识，默认 GitHub mark；指向非仓库站点时换成语义图标 */
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  /** 许可证标识（如 MIT）；不传则不渲染 */
  license?: string
}

/** 紧凑计数：1200 -> 1.2K，与 GitHub 自己的展示一致 */
function formatCount(value: number, locale: string): string {
  return (
    new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
      .format(value)
      // 部分 locale 会在数字与单位间塞窄空格（U+202F）或不换行空格，去掉后卡片里的间距才稳定
      .replace(/[\u202f\u00a0]/g, '')
  )
}

/** star / fork 计数；请求失败时整段不渲染，而不是显示 0 冒充真实值 */
function RepoStats({ repo }: { repo: string }) {
  const { i18n } = useTranslation()
  const state = useGithubRepo(repo)

  if (state.status === 'loading') {
    return <Skeleton className="h-3.5 w-24" />
  }
  if (state.status === 'error') {
    return null
  }

  return (
    <>
      <span className="flex items-center gap-1.5">
        <Star className="size-3.5" />
        {formatCount(state.info.stars, i18n.language)}
      </span>
      <span className="flex items-center gap-1.5">
        <GitFork className="size-3.5" />
        {formatCount(state.info.forks, i18n.language)}
      </span>
    </>
  )
}

/**
 * GitHub 仓库卡片样式的对外链接卡片（关于页用）。
 *
 * 悬停时整张卡片一起提亮（背景 + 边框 + 全部文字），而不是只让某个字段变色。
 */
export function RepoCard({
  owner,
  name,
  description,
  url,
  repo,
  avatar = siteConfig.icons.brand,
  icon: Icon = GithubIcon,
  license,
}: RepoCardProps) {
  return (
    <Card className="group hover:border-primary/40 hover:bg-accent/60 h-full overflow-hidden p-0 transition-colors">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`${owner} / ${name}`}
        className="text-muted-foreground group-hover:text-foreground flex h-full flex-col gap-2 p-4 transition-colors"
      >
        <span className="flex items-start gap-2">
          <img src={avatar} alt="" className="size-6 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span>{owner}</span>
            <span> / </span>
            <span className="text-foreground font-semibold">{name}</span>
          </span>
          <Icon className="size-4 shrink-0" />
        </span>
        <span className="text-sm leading-relaxed">{description}</span>
        {(repo || license) && (
          <span className="mt-auto flex min-h-4 items-center gap-4 text-xs font-medium">
            {repo && <RepoStats repo={repo} />}
            {license && (
              <span className="flex items-center gap-1.5">
                <Scale className="size-3.5" />
                {license}
              </span>
            )}
          </span>
        )}
      </a>
    </Card>
  )
}
