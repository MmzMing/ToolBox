import { Check, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  generateTotp,
  totpDigitOptions,
  totpPeriodOptions,
  verifyTotp,
  type TotpDigits,
  type TotpPeriod,
} from './otp-code-generator-and-validator.service'

export default function OtpCodeGeneratorAndValidator() {
  const { t } = useTranslation('tools-web')

  const [secret, setSecret] = useState('')
  const [digits, setDigits] = useState<TotpDigits>(6)
  const [period, setPeriod] = useState<TotpPeriod>(30)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [generated, setGenerated] = useState<{ code: string; error: string | null }>({
    code: '',
    error: null,
  })
  const [codeToVerify, setCodeToVerify] = useState('')
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const counter = Math.floor(nowMs / 1000 / period)
  const remainingSeconds = period - (Math.floor(nowMs / 1000) % period)

  useEffect(() => {
    if (secret === '') {
      return
    }
    let cancelled = false
    generateTotp(secret, { digits, period }, counter * period * 1000)
      .then((code) => {
        if (!cancelled) {
          setGenerated({ code, error: null })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGenerated({ code: '', error: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [secret, digits, period, counter])

  const currentCode = secret === '' ? '' : generated.code
  const secretError = secret === '' ? null : generated.error

  const canVerify = useMemo(() => secret !== '' && secretError === null, [secret, secretError])

  const handleVerify = () => {
    if (!canVerify || codeToVerify.trim() === '') {
      setVerifyResult(null)
      return
    }
    void verifyTotp(secret, codeToVerify, { digits, period }, Date.now()).then(setVerifyResult)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="otp-secret">{t('otp-code-generator-and-validator.secretLabel')}</Label>
        <InputCopyable
          id="otp-secret"
          value={secret}
          onValueChange={(value) => {
            setSecret(value)
            setVerifyResult(null)
          }}
          placeholder={t('otp-code-generator-and-validator.secretPlaceholder')}
          className="font-mono text-sm"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>{t('otp-code-generator-and-validator.digitsLabel')}</Label>
          <Select
            value={String(digits)}
            onValueChange={(value) => setDigits(Number(value) as TotpDigits)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {totpDigitOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('otp-code-generator-and-validator.periodLabel')}</Label>
          <Select
            value={String(period)}
            onValueChange={(value) => setPeriod(Number(value) as TotpPeriod)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {totpPeriodOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {t('otp-code-generator-and-validator.periodValue', { seconds: option })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {secretError && (
        <Alert variant="destructive">
          <AlertDescription>{secretError}</AlertDescription>
        </Alert>
      )}

      {currentCode !== '' && (
        <div className="flex flex-col gap-2">
          <Label>{t('otp-code-generator-and-validator.currentCodeLabel')}</Label>
          <div className="flex flex-wrap items-center gap-4">
            <SpanCopyable
              value={currentCode}
              className="font-mono text-2xl font-semibold tracking-widest"
            />
            <span className="text-muted-foreground text-sm">
              {t('otp-code-generator-and-validator.remainingSeconds', {
                seconds: remainingSeconds,
              })}
            </span>
          </div>
          <Progress value={(remainingSeconds / period) * 100} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="otp-verify">{t('otp-code-generator-and-validator.verifyLabel')}</Label>
        <div className="flex gap-2">
          <Input
            id="otp-verify"
            value={codeToVerify}
            onChange={(event) => {
              setCodeToVerify(event.target.value)
              setVerifyResult(null)
            }}
            placeholder={String(digits).padStart(digits, '0')}
            className="font-mono text-sm"
            inputMode="numeric"
            autoComplete="off"
          />
          <Button variant="outline" className="gap-2" disabled={!canVerify} onClick={handleVerify}>
            <RefreshCw className="size-4" />
            {t('otp-code-generator-and-validator.verifyButton')}
          </Button>
        </div>
        {verifyResult !== null && (
          <p className="flex items-center gap-1.5 text-sm">
            {verifyResult ? (
              <>
                <Check className="text-primary size-4" />
                <span className="text-primary">
                  {t('otp-code-generator-and-validator.verifyMatch')}
                </span>
              </>
            ) : (
              <>
                <X className="text-destructive size-4" />
                <span className="text-destructive">
                  {t('otp-code-generator-and-validator.verifyMismatch')}
                </span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
