import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { parseUserAgent, userAgentFields, type UserAgentField } from './user-agent-parser.service'

function defaultUserAgent(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

export default function UserAgentParser() {
  const { t } = useTranslation('tools-web')

  const [ua, setUa] = useState(defaultUserAgent)

  /** ua-parser-js 对畸形 UA 会抛错，而这里是渲染期——抛出去就是整页白屏 */
  const parsed = useMemo(() => {
    try {
      return parseUserAgent(ua)
    } catch {
      return Object.fromEntries(
        userAgentFields.map((field) => [field, t('common:error')]),
      ) as Record<UserAgentField, string>
    }
  }, [ua, t])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ua-input">{t('user-agent-parser.uaLabel')}</Label>
        <InputCopyable
          id="ua-input"
          value={ua}
          onValueChange={setUa}
          placeholder="Mozilla/5.0 …"
          className="font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <Table>
        <TableBody>
          {userAgentFields.map((field: UserAgentField) => (
            <TableRow key={field}>
              <TableCell className="w-48 font-medium">
                {t(`user-agent-parser.field-${field}`)}
              </TableCell>
              <TableCell>
                <SpanCopyable value={parsed[field]} className="max-w-full" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
