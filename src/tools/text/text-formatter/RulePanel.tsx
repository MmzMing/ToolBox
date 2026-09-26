import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownUp,
  ArrowLeftRight,
  Braces,
  CaseSensitive,
  Eraser,
  Funnel,
  Quote,
  Type,
  WandSparkles,
} from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ruleGroups, rulesOfGroup, type RuleGroup, type TextRule } from './text-formatter.rules'

/**
 * 分组色只引用 index.css 的 --rule-* 令牌，亮暗主题自动切换。
 * 按钮必须用 ghost 变体：outline 自带 `dark:bg-input/30`，同变体组会盖掉分组底色。
 */
const GROUP_META: Record<RuleGroup, { icon: LucideIcon; header: string; button: string }> = {
  sort: {
    icon: ArrowDownUp,
    header: 'text-rule-sort',
    button: 'border-rule-sort/35 bg-rule-sort/10 hover:bg-rule-sort/25 dark:hover:bg-rule-sort/25',
  },
  case: {
    icon: CaseSensitive,
    header: 'text-rule-case',
    button: 'border-rule-case/35 bg-rule-case/10 hover:bg-rule-case/25 dark:hover:bg-rule-case/25',
  },
  naming: {
    icon: Type,
    header: 'text-rule-naming',
    button:
      'border-rule-naming/35 bg-rule-naming/10 hover:bg-rule-naming/25 dark:hover:bg-rule-naming/25',
  },
  extract: {
    icon: Funnel,
    header: 'text-rule-extract',
    button:
      'border-rule-extract/35 bg-rule-extract/10 hover:bg-rule-extract/25 dark:hover:bg-rule-extract/25',
  },
  delimiter: {
    icon: ArrowLeftRight,
    header: 'text-rule-delimiter',
    button:
      'border-rule-delimiter/35 bg-rule-delimiter/10 hover:bg-rule-delimiter/25 dark:hover:bg-rule-delimiter/25',
  },
  wrap: {
    icon: Quote,
    header: 'text-rule-wrap',
    button: 'border-rule-wrap/35 bg-rule-wrap/10 hover:bg-rule-wrap/25 dark:hover:bg-rule-wrap/25',
  },
  escape: {
    icon: Braces,
    header: 'text-rule-escape',
    button:
      'border-rule-escape/35 bg-rule-escape/10 hover:bg-rule-escape/25 dark:hover:bg-rule-escape/25',
  },
  clean: {
    icon: Eraser,
    header: 'text-rule-clean',
    button:
      'border-rule-clean/35 bg-rule-clean/10 hover:bg-rule-clean/25 dark:hover:bg-rule-clean/25',
  },
  convert: {
    icon: WandSparkles,
    header: 'text-rule-convert',
    button:
      'border-rule-convert/35 bg-rule-convert/10 hover:bg-rule-convert/25 dark:hover:bg-rule-convert/25',
  },
}

interface RulePanelProps {
  onPick: (rule: TextRule) => void
  /** 当前文本为空时禁用，避免点出一堆空结果 */
  disabled: boolean
}

/**
 * 快捷规则面板：9 组一键规则，点一条即作用到当前结果。
 * memo 是为了输入时不重建这 64 个按钮，onPick 需要保持引用稳定才有效。
 */
export const RulePanel = memo(function RulePanel({ onPick, disabled }: RulePanelProps) {
  const { t } = useTranslation('tools-text')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('text-formatter.rulesTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {ruleGroups.map((group) => {
          const meta = GROUP_META[group]
          const GroupIcon = meta.icon
          return (
            <section key={group} className="flex flex-col gap-2">
              <h3 className={cn('flex items-center gap-1.5 text-sm font-medium', meta.header)}>
                <GroupIcon className="size-4" />
                {t(`text-formatter.groups.${group}`)}
              </h3>
              <div className="flex flex-wrap gap-2">
                {rulesOfGroup(group).map((rule) => (
                  <Button
                    key={rule.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className={meta.button}
                    onClick={() => onPick(rule)}
                  >
                    {t(`text-formatter.rules.${rule.id}`)}
                  </Button>
                ))}
              </div>
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
})
