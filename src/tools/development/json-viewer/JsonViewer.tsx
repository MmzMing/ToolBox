import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatJson, jsonIndents, minifyJson, type JsonIndent } from './json-viewer.service'

const INDENT_KEYS: Record<JsonIndent, string> = { 2: '2', 4: '4', tab: 'tab' }

export default function JsonViewer() {
  const { t } = useTranslation('tools-development')
  const { t: tCommon } = useTranslation('common')
  const [indent, setIndent] = useState<JsonIndent>(2)
  const [mode, setMode] = useState<'beautify' | 'minify'>('beautify')

  const transformer = useMemo(
    () => (input: string) => (mode === 'beautify' ? formatJson(input, indent) : minifyJson(input)),
    [indent, mode],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        {mode === 'beautify' && (
          <div className="flex flex-col gap-2">
            <Label>{t('json-viewer.indentLabel')}</Label>
            <Select
              value={INDENT_KEYS[indent]}
              onValueChange={(value) => setIndent(value as JsonIndent)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jsonIndents.map((item) => (
                  <SelectItem key={INDENT_KEYS[item]} value={INDENT_KEYS[item]}>
                    {t(`json-viewer.indent-${INDENT_KEYS[item]}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs value={mode} onValueChange={(value) => setMode(value as 'beautify' | 'minify')}>
          <TabsList>
            <TabsTrigger value="beautify">{t('json-viewer.mode-beautify')}</TabsTrigger>
            <TabsTrigger value="minify">{t('json-viewer.mode-minify')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <FormatTransformer
        transformer={transformer}
        inputLabel={tCommon('input')}
        outputLabel={tCommon('output')}
        highlight
        language="json"
        rows={12}
      />
    </div>
  )
}
