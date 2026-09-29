import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  PanelGroup,
  PanelRadioField,
  PanelSection,
  PanelSwitchField,
  PanelTextField,
} from '@/components/panel-fields'
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
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
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

      <PanelGroup>
        <PanelSection title={t('sectionNetwork')}>
          <PanelTextField
            label={t('ssidLabel')}
            value={ssid}
            onChange={setSsid}
            placeholder="My-WiFi"
          />
          <PanelTextField
            label={t('passwordLabel')}
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            disabled={encryption === 'nopass'}
            hint={encryption === 'nopass' ? t('passwordSkipped') : undefined}
          />
        </PanelSection>

        <PanelSection title={t('sectionSecurity')}>
          <PanelRadioField
            label={t('encryptionLabel')}
            hint={t(`encryption-${encryption}`)}
            value={encryption}
            onChange={(value) => setEncryption(value as WifiEncryption)}
            options={wifiEncryptionTypes.map((type) => ({
              value: type,
              label: t(`enc-${type}`),
            }))}
          />
          <PanelSwitchField label={t('hiddenLabel')} checked={hidden} onChange={setHidden} />
        </PanelSection>

        <div className="p-4">
          <Button className="w-full" disabled={dataUrl === ''} onClick={handleDownload}>
            <Download data-icon="inline-start" />
            {t('download')}
          </Button>
        </div>
      </PanelGroup>
    </div>
  )
}
