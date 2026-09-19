import { Check, LockKeyhole, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SALT_ROUNDS_RANGE, comparePassword, hashPassword } from './bcrypt.service'

/** bcrypt 哈希前缀，用于区分“格式非法”与“不匹配” */
const BCRYPT_HASH_PATTERN = /^\$2[abxy]\$\d{2}\$/

export default function Bcrypt() {
  const { t } = useTranslation('tools-crypto')

  const [password, setPassword] = useState('')
  const [saltRounds, setSaltRounds] = useState(10)
  const [hash, setHash] = useState('')
  const [hashError, setHashError] = useState(false)

  const [verifyPassword, setVerifyPassword] = useState('')
  const [verifyHash, setVerifyHash] = useState('')
  const [verifyResult, setVerifyResult] = useState<'match' | 'mismatch' | 'invalidHash' | null>(
    null,
  )

  const handleHash = () => {
    try {
      setHash(hashPassword(password, saltRounds))
      setHashError(false)
    } catch {
      setHash('')
      setHashError(true)
    }
  }

  const handleVerify = () => {
    if (!BCRYPT_HASH_PATTERN.test(verifyHash)) {
      setVerifyResult('invalidHash')
      return
    }
    setVerifyResult(comparePassword(verifyPassword, verifyHash) ? 'match' : 'mismatch')
  }

  return (
    <Tabs defaultValue="hash">
      <TabsList>
        <TabsTrigger value="hash">{t('bcrypt.tabHash')}</TabsTrigger>
        <TabsTrigger value="verify">{t('bcrypt.tabVerify')}</TabsTrigger>
      </TabsList>

      <TabsContent value="hash" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="bcrypt-password">{t('bcrypt.password')}</Label>
          <Input
            id="bcrypt-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="font-mono"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bcrypt-rounds">{t('bcrypt.saltRounds')}</Label>
          <div className="flex items-center gap-3">
            <Slider
              id="bcrypt-rounds"
              min={SALT_ROUNDS_RANGE.min}
              max={SALT_ROUNDS_RANGE.max}
              step={1}
              value={[saltRounds]}
              onValueChange={(values) => setSaltRounds(values[0])}
              className="flex-1"
            />
            <span className="w-8 text-center text-sm tabular-nums">{saltRounds}</span>
          </div>
        </div>

        <Button onClick={handleHash} className="w-fit gap-2">
          <LockKeyhole className="size-4" />
          {t('bcrypt.hash')}
        </Button>

        {hashError && (
          <Alert variant="destructive">
            <AlertDescription>{t('bcrypt.emptyPassword')}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Label>{t('bcrypt.hashResult')}</Label>
          <InputCopyable value={hash} readOnly className="font-mono" placeholder="$2b$10$..." />
        </div>
      </TabsContent>

      <TabsContent value="verify" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="bcrypt-verify-password">{t('bcrypt.password')}</Label>
          <Input
            id="bcrypt-verify-password"
            type="password"
            value={verifyPassword}
            onChange={(event) => setVerifyPassword(event.target.value)}
            className="font-mono"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bcrypt-verify-hash">{t('bcrypt.hashToVerify')}</Label>
          <Input
            id="bcrypt-verify-hash"
            value={verifyHash}
            onChange={(event) => setVerifyHash(event.target.value)}
            className="font-mono"
            placeholder="$2b$10$..."
          />
        </div>

        <Button onClick={handleVerify} className="w-fit">
          {t('bcrypt.verify')}
        </Button>

        {verifyResult === 'match' && (
          <Alert>
            <Check className="text-primary" />
            <AlertDescription>{t('bcrypt.match')}</AlertDescription>
          </Alert>
        )}
        {verifyResult === 'mismatch' && (
          <Alert variant="destructive">
            <X />
            <AlertDescription>{t('bcrypt.mismatch')}</AlertDescription>
          </Alert>
        )}
        {verifyResult === 'invalidHash' && (
          <Alert variant="destructive">
            <X />
            <AlertDescription>{t('bcrypt.invalidHash')}</AlertDescription>
          </Alert>
        )}
      </TabsContent>
    </Tabs>
  )
}
