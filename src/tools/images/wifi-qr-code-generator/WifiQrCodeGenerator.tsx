import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import {
  buildWifiString,
  generateWifiQrDataUrl,
  wifiEncryptionTypes,
  type WifiEncryption,
} from './wifi-qr-code-generator.service'

export default function WifiQrCodeGenerator() {
  const { t } = useTranslation('tools-images')

  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [encryption, setEncryption] = useState<WifiEncryption>('WPA')
  const [hidden, setHidden] = useState(false)

  const [dataUrl, setDataUrl] = useState('')
  const [hasRenderError, setHasRenderError] = useState(false)

  const wifiString = useMemo(() => {
    if (ssid === '') {
      return { value: '', error: false }
    }
    try {
      return { value: buildWifiString({ ssid, password, encryption, hidden }), error: false }
    } catch {
      return { value: '', error: true }
    }
  }, [ssid, password, encryption, hidden])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (wifiString.value === '') {
        setDataUrl('')
        setHasRenderError(false)
        return
      }
      void generateWifiQrDataUrl(wifiString.value)
        .then((url) => {
          if (!cancelled) {
            setDataUrl(url)
            setHasRenderError(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHasRenderError(true)
          }
        })
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [wifiString.value])

  const activeDataUrl = wifiString.value === '' ? '' : dataUrl

  const handleDownload = () => {
    if (activeDataUrl === '') {
      return
    }
    const anchor = document.createElement('a')
    anchor.href = activeDataUrl
    anchor.download = 'wifi-qr-code.png'
    anchor.click()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="wifi-ssid">{t('wifi-qr-code-generator.ssidLabel')}</Label>
          <Input
            id="wifi-ssid"
            value={ssid}
            onChange={(event) => setSsid(event.target.value)}
            placeholder="My-WiFi"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wifi-password">{t('wifi-qr-code-generator.passwordLabel')}</Label>
          <Input
            id="wifi-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            disabled={encryption === 'nopass'}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('wifi-qr-code-generator.encryptionLabel')}</Label>
        <RadioGroup
          value={encryption}
          onValueChange={(value) => setEncryption(value as WifiEncryption)}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {wifiEncryptionTypes.map((type) => (
            <Label key={type} className="flex items-center gap-2 font-normal">
              <RadioGroupItem value={type} />
              {t(`wifi-qr-code-generator.encryption-${type}`)}
            </Label>
          ))}
        </RadioGroup>
      </div>

      <Label className="flex w-fit items-center gap-2 font-normal">
        <Switch checked={hidden} onCheckedChange={setHidden} />
        {t('wifi-qr-code-generator.hiddenLabel')}
      </Label>

      <div className="flex flex-col gap-2">
        <Label>{t('wifi-qr-code-generator.stringLabel')}</Label>
        <InputCopyable
          value={wifiString.value}
          readOnly
          placeholder="WIFI:T:WPA;S:My-WiFi;P:pass;;"
        />
        {wifiString.error && (
          <Alert variant="destructive">
            <AlertDescription>{t('wifi-qr-code-generator.emptySsid')}</AlertDescription>
          </Alert>
        )}
      </div>

      {hasRenderError && (
        <Alert variant="destructive">
          <AlertDescription>{t('wifi-qr-code-generator.renderError')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('wifi-qr-code-generator.previewLabel')}</Label>
        {activeDataUrl === '' ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm">
            {t('wifi-qr-code-generator.emptyPreview')}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <img
              src={dataUrl}
              alt="WiFi QR code preview"
              width={256}
              height={256}
              className="max-w-full rounded-lg border"
            />
            <Button onClick={handleDownload}>
              <Download data-icon="inline-start" />
              {t('wifi-qr-code-generator.download')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
