import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { jsonToCsv } from './json-to-csv.service'

export default function JsonToCsv() {
  const { t } = useTranslation('tools-development')
  const { t: tCommon } = useTranslation('common')
  const [delimiter, setDelimiter] = useState(',')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('json-to-csv.delimiterLabel')}</Label>
        <Input
          value={delimiter}
          onChange={(event) => setDelimiter(event.target.value)}
          className="max-w-40 font-mono"
          placeholder=","
        />
      </div>

      <FormatTransformer
        transformer={(input) => jsonToCsv(input, { delimiter })}
        inputLabel={tCommon('input')}
        outputLabel={tCommon('output')}
        rows={10}
      />
    </div>
  )
}
