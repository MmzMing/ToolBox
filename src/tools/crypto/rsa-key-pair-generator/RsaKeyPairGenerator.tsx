import { KeySquare, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle } from 'lucide-react'
import {
  generateRsaKeyPair,
  rsaKeySizes,
  type RsaKeyPairPems,
  type RsaKeySize,
} from './rsa-key-pair-generator.service'

export default function RsaKeyPairGenerator() {
  const { t } = useTranslation('tools-crypto')
  const [keySize, setKeySize] = useState<RsaKeySize>(2048)
  const [keys, setKeys] = useState<RsaKeyPairPems | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasError, setHasError] = useState(false)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setHasError(false)
    try {
      setKeys(await generateRsaKeyPair(keySize))
    } catch {
      setHasError(true)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <Label>{t('rsa-key-pair-generator.keySize')}</Label>
          <Select
            value={String(keySize)}
            onValueChange={(value) => setKeySize(Number(value) as RsaKeySize)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rsaKeySizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} {t('rsa-key-pair-generator.bits')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void handleGenerate()} disabled={isGenerating} className="gap-2">
          <RefreshCw className="size-4" />
          {isGenerating ? t('rsa-key-pair-generator.generating') : t('common:generate')}
        </Button>
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{t('common:error')}</AlertDescription>
        </Alert>
      )}

      {keys !== null && (
        <>
          <div className="flex flex-col gap-2">
            <Label>
              <KeySquare className="mr-1 inline size-4" />
              {t('rsa-key-pair-generator.publicKey')}
            </Label>
            <TextareaCopyable value={keys.publicKeyPem} rows={5} className="font-mono text-xs" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('rsa-key-pair-generator.privateKey')}</Label>
            <TextareaCopyable value={keys.privateKeyPem} rows={8} className="font-mono text-xs" />
          </div>
        </>
      )}
    </div>
  )
}
