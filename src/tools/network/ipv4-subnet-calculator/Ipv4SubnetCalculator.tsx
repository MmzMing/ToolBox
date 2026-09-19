import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  calculateSubnet,
  parseNetmaskOrPrefix,
  type SubnetCalculation,
} from './ipv4-subnet-calculator.service'

type InputMode = 'prefix' | 'netmask'

const MODE_PLACEHOLDERS: Record<InputMode, string> = {
  prefix: '192.168.1.10/24',
  netmask: '192.168.1.10/255.255.255.0',
}

export default function Ipv4SubnetCalculator() {
  const { t } = useTranslation('tools-network')
  const [mode, setMode] = useState<InputMode>('prefix')
  const [input, setInput] = useState('')

  const result = useMemo<{ value: SubnetCalculation | null; error: string | null }>(() => {
    if (input.trim() === '') {
      return { value: null, error: null }
    }
    try {
      const { ip, prefix } = parseNetmaskOrPrefix(input)
      return { value: calculateSubnet(ip, prefix), error: null }
    } catch (err) {
      return { value: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input])

  const subnet = result.value
  const rows = subnet
    ? (
        [
          ['field-networkAddress', subnet.networkAddress],
          ['field-broadcastAddress', subnet.broadcastAddress],
          ['field-netmask', subnet.netmask],
          ['field-wildcardMask', subnet.wildcardMask],
          ['field-totalHosts', String(subnet.totalHosts)],
          ['field-usableHosts', String(subnet.usableHosts)],
          ['field-firstUsableHost', subnet.firstUsableHost],
          ['field-lastUsableHost', subnet.lastUsableHost],
          ['field-addressClass', subnet.addressClass],
          [
            'field-isPrivate',
            subnet.isPrivate
              ? t('ipv4-subnet-calculator.privateYes')
              : t('ipv4-subnet-calculator.privateNo'),
          ],
        ] as const
      ).map(([fieldKey, value]) => ({
        label: t(`ipv4-subnet-calculator.${fieldKey}`),
        value,
      }))
    : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('ipv4-subnet-calculator.modeLabel')}</Label>
        <Select value={mode} onValueChange={(value) => setMode(value as InputMode)}>
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="prefix">{t('ipv4-subnet-calculator.mode-prefix')}</SelectItem>
            <SelectItem value="netmask">{t('ipv4-subnet-calculator.mode-netmask')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('common:input')}</Label>
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={MODE_PLACEHOLDERS[mode]}
          className="font-mono text-sm"
        />
      </div>

      {result.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {subnet && (
        <div className="flex flex-col gap-2">
          <Label>{t('common:output')}</Label>
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-muted-foreground w-32 shrink-0 text-sm">{row.label}</span>
                <InputCopyable value={row.value} readOnly className="font-mono text-sm" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
