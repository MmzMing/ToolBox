import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { deviceInfoFields, getDeviceInfo, type DeviceInfoField } from './device-information.service'

export default function DeviceInformation() {
  const { t } = useTranslation('tools-web')

  const info = useMemo(() => getDeviceInfo(), [])

  return (
    <Table>
      <TableBody>
        {deviceInfoFields.map((field: DeviceInfoField) => (
          <TableRow key={field}>
            <TableCell className="w-48 font-medium">
              {t(`device-information.field-${field}`)}
            </TableCell>
            <TableCell>
              <SpanCopyable value={info[field]} className="max-w-full" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
