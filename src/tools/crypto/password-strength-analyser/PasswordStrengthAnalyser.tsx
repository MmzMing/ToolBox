import { Check, Eye, EyeOff, ShieldAlert, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { analysePassword } from './password-strength-analyser.service'

const SCORE_STRENGTH_KEYS = [
  'strength0',
  'strength1',
  'strength2',
  'strength3',
  'strength4',
] as const

/** 分段色条颜色（按 score 0-4 递进） */
const SCORE_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-lime-500',
  'bg-green-500',
] as const

const SEGMENT_COUNT = 5

export default function PasswordStrengthAnalyser() {
  const { t } = useTranslation('tools-crypto')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const analysis = useMemo(() => analysePassword(password), [password])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password-strength-input">{t('password-strength-analyser.password')}</Label>
        <div className="relative flex items-center">
          <Input
            id="password-strength-input"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pr-9 font-mono"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1"
            aria-label={
              showPassword
                ? t('password-strength-analyser.hidePassword')
                : t('password-strength-analyser.showPassword')
            }
            onClick={() => setShowPassword((previous) => !previous)}
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>{t('password-strength-analyser.strength')}</Label>
          <span className="text-sm font-medium">
            {t(`password-strength-analyser.${SCORE_STRENGTH_KEYS[analysis.score]}`)}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
            <div
              key={index}
              className={`h-2 flex-1 rounded-full ${index <= analysis.score ? SCORE_COLORS[analysis.score] : 'bg-muted'}`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm">
            {t('password-strength-analyser.length')}
          </span>
          <span className="font-mono text-sm">{analysis.length}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm">
            {t('password-strength-analyser.entropyBits')}
          </span>
          <span className="font-mono text-sm">{analysis.entropyBits}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm">
            {t('password-strength-analyser.crackTime')}
          </span>
          <span className="font-mono text-sm">{analysis.crackTimeText}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {analysis.checks.map((check) => (
          <div key={check.id} className="flex items-center gap-2 text-sm">
            {check.passed ? (
              <Check className="size-4 shrink-0 text-green-600" />
            ) : (
              <X className="text-destructive size-4 shrink-0" />
            )}
            <span className={check.passed ? '' : 'text-muted-foreground'}>
              {t(`password-strength-analyser.checks.${check.id}`)}
            </span>
          </div>
        ))}
      </div>

      <div className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>{t('password-strength-analyser.disclaimer')}</span>
      </div>
    </div>
  )
}
