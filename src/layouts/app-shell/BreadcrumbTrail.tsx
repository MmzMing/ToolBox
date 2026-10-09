import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { Crumb } from '@/layouts/app-shell/dock-logic'
import { categoryIcons } from '@/tools/categories'

/**
 * 面包屑胶囊：分类 › 工具名。
 *
 * 首页那一级由左边的 logo 胶囊承担，所以这里刻意丢掉 home crumb——
 * 两颗胶囊各自独立，才有"从 logo 里分离出来"的观感。
 */
export function BreadcrumbTrail({ crumbs }: { crumbs: Crumb[] }) {
  const trail = crumbs.filter((crumb) => crumb.kind !== 'home')
  if (trail.length === 0) {
    return null
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {trail.map((crumb, index) => {
          const CategoryIcon = crumb.categoryKey === null ? null : categoryIcons[crumb.categoryKey]
          return (
            <Fragment key={`${crumb.kind}-${crumb.label}`}>
              {index > 0 && (
                <BreadcrumbSeparator>
                  <ChevronRight className="size-4" />
                </BreadcrumbSeparator>
              )}
              <BreadcrumbItem>
                {crumb.kind === 'category' ? (
                  <span className="text-dock-foreground/70 flex min-w-0 items-center gap-1.5">
                    {CategoryIcon && <CategoryIcon className="size-4 shrink-0" />}
                    <span className="truncate">{crumb.label}</span>
                  </span>
                ) : (
                  <BreadcrumbPage className="min-w-0 truncate font-medium">
                    {crumb.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
