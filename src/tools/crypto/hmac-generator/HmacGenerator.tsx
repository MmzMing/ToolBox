import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
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
import { computeHmac, hmacAlgorithms, type HmacAlgorithm } from './hmac-generator.service'

export default function HmacGenerator() {
  const { t } = useTranslation('tools-crypto')
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>('HMACSHA256')
  const [secret, setSecret] = useState('')
  const [message, setMessage] = useState('')

  const output = useMemo(
    () => (secret === '' ? '' : computeHmac(algorithm, message, secret)),
    [algorithm, message, secret],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="hmac-secret">{t('hmac-generator.secretKey')}</Label>
        <Input
          id="hmac-secret"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          className="font-mono"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('hmac-generator.algorithm')}</Label>
        <Select value={algorithm} onValueChange={(value) => setAlgorithm(value as HmacAlgorithm)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hmacAlgorithms.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="hmac-message">{t('hmac-generator.message')}</Label>
        <Textarea
          id="hmac-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="min-h-24 font-mono text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('common:output')}</Label>
        <TextareaCopyable value={output} rows={2} />
      </div>
    </div>
  )
}
