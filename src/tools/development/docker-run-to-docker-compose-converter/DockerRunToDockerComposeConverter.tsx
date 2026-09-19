import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { convertDockerRun } from './docker-run-to-docker-compose-converter.service'

const DEFAULT_INPUT =
  'docker run -d --name web -p 8080:80 -v /data:/app/data -e NODE_ENV=production nginx:latest'

export default function DockerRunToDockerComposeConverter() {
  const { t } = useTranslation('tools-development')
  const { t: tCommon } = useTranslation('common')
  const [input, setInput] = useState(DEFAULT_INPUT)

  const { output, error } = useMemo(() => {
    if (input.trim() === '') {
      return { output: '', error: null as string | null }
    }
    try {
      return { output: convertDockerRun(input), error: null as string | null }
    } catch (err) {
      return { output: '', error: err instanceof Error ? err.message : String(err) }
    }
  }, [input])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{tCommon('input')}</Label>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('docker-run-to-docker-compose-converter.inputPlaceholder')}
          className="min-h-40 font-mono text-sm"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{tCommon('output')}</Label>
        <TextareaCopyable value={output} highlight language="yaml" rows={12} />
      </div>
    </div>
  )
}
