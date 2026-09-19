import { Eye, EyeOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildBasicAuthCredentials, buildBasicAuthHeader } from './basic-auth-generator.service'

export default function BasicAuthGenerator() {
  const { t } = useTranslation('tools-web')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const header = useMemo(() => buildBasicAuthHeader(username, password), [username, password])
  const credentials = useMemo(
    () => buildBasicAuthCredentials(username, password),
    [username, password],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="basic-auth-username">{t('basic-auth-generator.username')}</Label>
        <Input
          id="basic-auth-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="admin"
          className="font-mono text-sm"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="basic-auth-password">{t('basic-auth-generator.password')}</Label>
        <div className="relative flex items-center">
          <Input
            id="basic-auth-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="pr-9 font-mono text-sm"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1"
            aria-label={
              showPassword
                ? t('basic-auth-generator.hidePassword')
                : t('basic-auth-generator.showPassword')
            }
            title={
              showPassword
                ? t('basic-auth-generator.hidePassword')
                : t('basic-auth-generator.showPassword')
            }
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('basic-auth-generator.headerLabel')}</Label>
        <InputCopyable value={header} readOnly className="font-mono text-sm" />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('basic-auth-generator.credentialsLabel')}</Label>
        <div>
          <SpanCopyable value={credentials} className="max-w-full" />
        </div>
      </div>
    </div>
  )
}
