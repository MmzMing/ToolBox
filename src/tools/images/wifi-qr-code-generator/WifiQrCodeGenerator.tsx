import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ParamField } from '@/components/param-field'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  buildWifiString,
  generateWifiQrDataUrl,
  wifiEncryptionTypes,
  type WifiEncryption,
} from './wifi-qr-code-generator.service'

const WIFI_STRING_PLACEHOLDER = 'WIFI:T:WPA;S:My-WiFi;P:pass;;'

/** WiFi 二维码：左侧预览与配置字符串，右侧参数卡片 */
export default function WifiQrCodeGenerator() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'wifi-qr-code-generator' })

  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [encryption, setEncryption] = useState<WifiEncryption>('WPA')
  const [hidden, setHidden] = useState(false)

  const [dataUrl, setDataUrl] = useState('')
  const [hasRenderError, setHasRenderError] = useState(false)

  const wifiString = useMemo(() => {
    if (ssid === '') {
      return ''
    }
    try {
      return buildWifiString({ ssid, password, encryption, hidden })
    } catch {
      return ''
    }
  }, [ssid, password, encryption, hidden])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (wifiString === '') {
        setDataUrl('')
        setHasRenderError(false)
        return
      }
      void generateWifiQrDataUrl(wifiString)
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
  }, [wifiString])

  const handleDownload = () => {
    if (dataUrl === '') {
      return
    }
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = 'wifi-qr-code.png'
    anchor.click()
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-3">
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed p-4 md:min-h-80">
          {dataUrl === '' ? (
            <p className="text-muted-foreground text-sm">{t('emptyPreview')}</p>
          ) : (
            <img src={dataUrl} alt="WiFi QR code preview" className="max-h-64 w-auto max-w-full" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground text-xs">{t('stringLabel')}</Label>
          <InputCopyable value={wifiString} readOnly placeholder={WIFI_STRING_PLACEHOLDER} />
        </div>
        {hasRenderError && (
          <Alert variant="destructive">
            <AlertDescription>{t('renderError')}</AlertDescription>
          </Alert>
        )}
      </div>

      <Card className="gap-4">
        <CardHeader className="border-b pb-0">
          <CardTitle className="text-sm">{t('paramsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ParamField label={t('ssidLabel')} htmlFor="wifi-ssid">
            <Input
              id="wifi-ssid"
              value={ssid}
              onChange={(event) => setSsid(event.target.value)}
              placeholder="My-WiFi"
            />
          </ParamField>

          <ParamField
            label={t('passwordLabel')}
            htmlFor="wifi-password"
            hint={encryption === 'nopass' ? t('passwordSkipped') : undefined}
          >
            <Input
              id="wifi-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              disabled={encryption === 'nopass'}
            />
          </ParamField>

          <Separator />

          <ParamField label={t('encryptionLabel')} hint={t(`encryption-${encryption}`)}>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={encryption}
              onValueChange={(value) => {
                if (value) {
                  setEncryption(value as WifiEncryption)
                }
              }}
              className="w-full"
            >
              {wifiEncryptionTypes.map((type) => (
                <ToggleGroupItem key={type} value={type} className="flex-1">
                  {t(`enc-${type}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </ParamField>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="wifi-hidden" className="text-muted-foreground text-xs">
              {t('hiddenLabel')}
            </Label>
            <Switch id="wifi-hidden" checked={hidden} onCheckedChange={setHidden} />
          </div>
        </CardContent>
        <CardFooter className="border-t pt-4">
          <Button className="w-full" disabled={dataUrl === ''} onClick={handleDownload}>
            <Download data-icon="inline-start" />
            {t('download')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
