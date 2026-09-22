import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle } from 'lucide-react'
import {
  decryptAES,
  encryptAES,
  encryptionAlgorithms,
  isEncryptionAvailable,
  isLegacyCipherText,
  type EncryptionAlgorithm,
} from './encryption.service'

type ErrorKey = 'requiredSecret' | 'decryptFailed' | 'encryptFailed' | null

export default function Encryption() {
  const { t } = useTranslation('tools-crypto')

  const [algorithm, setAlgorithm] = useState<EncryptionAlgorithm>('AES')
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [plainText, setPlainText] = useState('')
  const [cipherText, setCipherText] = useState('')
  const [output, setOutput] = useState('')
  const [errorKey, setErrorKey] = useState<ErrorKey>(null)
  const [legacyNotice, setLegacyNotice] = useState(false)
  /** PBKDF2 要故意算上半秒，期间禁用按钮，避免用户连点排队一堆派生 */
  const [busy, setBusy] = useState(false)

  const handleEncrypt = async () => {
    if (secret === '') {
      setErrorKey('requiredSecret')
      return
    }
    setBusy(true)
    setErrorKey(null)
    setLegacyNotice(false)
    try {
      setOutput(await encryptAES(plainText, secret))
    } catch {
      setErrorKey('encryptFailed')
    } finally {
      setBusy(false)
    }
  }

  const handleDecrypt = async () => {
    if (secret === '') {
      setErrorKey('requiredSecret')
      return
    }
    setBusy(true)
    setErrorKey(null)
    setLegacyNotice(false)
    try {
      setOutput(await decryptAES(cipherText, secret))
      setLegacyNotice(isLegacyCipherText(cipherText))
    } catch {
      setErrorKey('decryptFailed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!isEncryptionAvailable && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{t('encryption.insecureContext')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col gap-2">
          <Label>{t('encryption.algorithm')}</Label>
          <Select
            value={algorithm}
            onValueChange={(value) => setAlgorithm(value as EncryptionAlgorithm)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {encryptionAlgorithms.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="encryption-secret">{t('encryption.secretKey')}</Label>
          <div className="relative flex items-center">
            <Input
              id="encryption-secret"
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              className="pr-9 font-mono"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-1"
              aria-label={showSecret ? t('encryption.hideKey') : t('encryption.showKey')}
              onClick={() => setShowSecret((previous) => !previous)}
            >
              {showSecret ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="encryption-plain">{t('encryption.plaintext')}</Label>
        <Textarea
          id="encryption-plain"
          value={plainText}
          onChange={(event) => setPlainText(event.target.value)}
          className="min-h-24 font-mono text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="encryption-cipher">{t('encryption.ciphertext')}</Label>
        <Textarea
          id="encryption-cipher"
          value={cipherText}
          onChange={(event) => setCipherText(event.target.value)}
          className="min-h-24 font-mono text-sm"
          placeholder="v2:..."
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => void handleEncrypt()}
          disabled={busy || !isEncryptionAvailable}
          className="gap-2"
        >
          <Lock className="size-4" />
          {t('encryption.encrypt')}
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleDecrypt()}
          disabled={busy || !isEncryptionAvailable}
          className="gap-2"
        >
          <LockOpen className="size-4" />
          {t('encryption.decrypt')}
        </Button>
      </div>

      {errorKey !== null && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{t(`encryption.${errorKey}`)}</AlertDescription>
        </Alert>
      )}

      {legacyNotice && (
        <Alert>
          <AlertTriangle />
          <AlertDescription>{t('encryption.legacyNotice')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('common:output')}</Label>
        <TextareaCopyable value={output} rows={4} />
      </div>
    </div>
  )
}
