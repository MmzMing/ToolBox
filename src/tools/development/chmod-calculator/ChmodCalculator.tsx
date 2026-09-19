import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { formatChmod, parseChmod, type PermissionTriad } from './chmod-calculator.service'

const SUBJECT_KEYS = ['owner', 'group', 'others'] as const
const BIT_KEYS = ['read', 'write', 'execute'] as const

type SubjectKey = (typeof SUBJECT_KEYS)[number]
type BitKey = (typeof BIT_KEYS)[number]

const INITIAL_PERMS: PermissionTriad[] = [
  [true, true, true],
  [true, false, true],
  [true, false, true],
]

export default function ChmodCalculator() {
  const { t } = useTranslation('tools-development')
  const [perms, setPerms] = useState<PermissionTriad[]>(INITIAL_PERMS)
  const [error, setError] = useState<string | null>(null)

  const { digits, symbolic } = formatChmod(perms)

  const handleBitChange = (subject: SubjectKey, bit: BitKey, checked: boolean) => {
    const subjectIndex = SUBJECT_KEYS.indexOf(subject)
    const bitIndex = BIT_KEYS.indexOf(bit)
    setPerms(
      perms.map((triad, index) =>
        index === subjectIndex
          ? (triad.map((value, i) => (i === bitIndex ? checked : value)) as PermissionTriad)
          : triad,
      ),
    )
  }

  const handleDigitsChange = (value: string) => {
    try {
      setPerms(parseChmod(value))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SUBJECT_KEYS.map((subject) => (
          <Card key={subject}>
            <CardHeader>
              <CardTitle className="text-base">{t(`chmod-calculator.${subject}`)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {BIT_KEYS.map((bit) => {
                const subjectIndex = SUBJECT_KEYS.indexOf(subject)
                const bitIndex = BIT_KEYS.indexOf(bit)
                const id = `chmod-${subject}-${bit}`
                return (
                  <Label key={bit} htmlFor={id} className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={perms[subjectIndex][bitIndex]}
                      onCheckedChange={(checked) => handleBitChange(subject, bit, checked === true)}
                    />
                    {t(`chmod-calculator.${bit}`)}
                  </Label>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('chmod-calculator.numericLabel')}</Label>
        <InputCopyable
          value={digits}
          onValueChange={handleDigitsChange}
          className="font-mono"
          placeholder="755"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('chmod-calculator.symbolicLabel')}</Label>
        <InputCopyable value={symbolic} readOnly className="font-mono" placeholder="rwxr-xr-x" />
      </div>
    </div>
  )
}
