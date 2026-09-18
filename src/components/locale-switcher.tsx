import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { changeLocale } from '@/modules/i18n'
import { supportedLocales } from '@/stores/preferences.store'

const localeLabels = { zh: '简体中文', en: 'English' } as const

/** 语言切换下拉（中英），持久化在 preferences store */
export function LocaleSwitcher() {
  const { t, i18n } = useTranslation('common')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('language')}>
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {supportedLocales.map((value) => (
          <DropdownMenuItem
            key={value}
            onClick={() => void changeLocale(value)}
            disabled={value === i18n.resolvedLanguage}
          >
            {localeLabels[value]}
            {value === i18n.resolvedLanguage && (
              <span className="ml-auto text-xs text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
