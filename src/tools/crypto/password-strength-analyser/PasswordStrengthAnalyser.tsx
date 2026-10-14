import { Check, Eye, EyeOff, ShieldAlert, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import GeneratorParams from './GeneratorParams'
import GeneratedList from './GeneratedList'
import {
  DEFAULT_GENERATOR_OPTIONS,
  generatePasswords,
  type GeneratedPassword,
  type PasswordGeneratorOptions,
} from './password-generator.service'
import { analysePassword } from './password-strength-analyser.service'

const SCORE_STRENGTH_KEYS = [
  'strength0',
  'strength1',
  'strength2',
  'strength3',
  'strength4',
] as const

/** 分段色条颜色（按 score 0-4 递进）：红 → 橙 → 黄 → 青 → 蓝，取自 --strength-N */
const SCORE_COLORS = [
  'bg-strength-1',
  'bg-strength-2',
  'bg-strength-3',
  'bg-strength-4',
  'bg-strength-5',
] as const

const SEGMENT_COUNT = 5

export default function PasswordStrengthAnalyser() {
  const { t } = useTranslation('tools-crypto')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [options, setOptions] = useState<PasswordGeneratorOptions>(DEFAULT_GENERATOR_OPTIONS)
  const [results, setResults] = useState<GeneratedPassword[]>([])
  const [failed, setFailed] = useState(false)

  const analysis = useMemo(() => analysePassword(password), [password])

  const handlePick = (generated: string) => {
    setPassword(generated)
    setShowPassword(true)
  }

  const handleGenerate = () => {
    try {
      const generated = generatePasswords(options)
      setResults(generated)
      setFailed(false)
      handlePick(generated[0].value)
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="order-2 flex flex-col gap-4 xl:order-1">
        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-sm font-medium">
              {t('password-strength-analyser.gen.results')}
            </h2>
            <GeneratedList items={results} onPick={handlePick} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="password-strength-input">
            {t('password-strength-analyser.password')}
          </Label>
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
                <Check className="text-primary size-4 shrink-0" />
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

      <div className="order-1 xl:order-2">
        <GeneratorParams
          options={options}
          onOptionsChange={(patch) => setOptions((previous) => ({ ...previous, ...patch }))}
          onGenerate={handleGenerate}
          hasError={failed}
        />
      </div>
    </div>
  )
}
