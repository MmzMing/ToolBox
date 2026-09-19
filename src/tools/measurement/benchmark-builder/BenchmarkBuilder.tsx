import { useState } from 'react'
import { Info, Play, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { runBenchmark, type BenchmarkResult } from './benchmark-builder.service'

interface Scenario {
  id: string
  name: string
  code: string
}

function createScenario(): Scenario {
  return { id: crypto.randomUUID(), name: '', code: '' }
}

const DEFAULT_ITERATIONS = 1000

export default function BenchmarkBuilder() {
  const { t } = useTranslation('tools-measurement')

  const [scenarios, setScenarios] = useState<Scenario[]>(() => [
    { id: 'demo', name: 'demo', code: '() => 1 + 1' },
  ])
  const [iterations, setIterations] = useState(String(DEFAULT_ITERATIONS))
  const [results, setResults] = useState<BenchmarkResult[]>([])
  const [resultIds, setResultIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const updateScenario = (id: string, patch: Partial<Omit<Scenario, 'id'>>) => {
    setScenarios((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  const handleRun = () => {
    const parsedIterations = Number(iterations)
    if (!Number.isFinite(parsedIterations) || parsedIterations <= 0) {
      setError(t('benchmark-builder.invalidIterations'))
      return
    }
    const runnable = scenarios.filter((scenario) => scenario.code.trim() !== '')
    if (runnable.length === 0) {
      setError(t('benchmark-builder.noScenarios'))
      return
    }
    try {
      setResults(
        runBenchmark(
          runnable.map((scenario, index) => ({
            name: scenario.name.trim() === '' ? `#${index + 1}` : scenario.name.trim(),
            code: scenario.code,
          })),
          Math.floor(parsedIterations),
        ),
      )
      setResultIds(runnable.map((scenario) => scenario.id))
      setError(null)
    } catch {
      setResults([])
      setResultIds([])
      setError(t('benchmark-builder.compileError'))
    }
  }

  const fastestMs = results.length > 0 ? Math.min(...results.map((result) => result.avgMs)) : 0

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <Info className="size-4" />
        <AlertDescription>{t('benchmark-builder.safetyNote')}</AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3">
        <Label>{t('benchmark-builder.scenariosLabel')}</Label>
        {scenarios.map((scenario, index) => (
          <div key={scenario.id} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <Input
              value={scenario.name}
              onChange={(event) => updateScenario(scenario.id, { name: event.target.value })}
              placeholder={t('benchmark-builder.namePlaceholder', { index: index + 1 })}
            />
            <Input
              value={scenario.code}
              onChange={(event) => updateScenario(scenario.id, { code: event.target.value })}
              placeholder="() => { /* ... */ }"
              className="font-mono text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('benchmark-builder.removeScenario')}
              onClick={() =>
                setScenarios((previous) => previous.filter((item) => item.id !== scenario.id))
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => setScenarios((previous) => [...previous, createScenario()])}
        >
          <Plus data-icon="inline-start" />
          {t('benchmark-builder.addScenario')}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="benchmark-iterations">{t('benchmark-builder.iterationsLabel')}</Label>
          <Input
            id="benchmark-iterations"
            type="number"
            min={1}
            value={iterations}
            onChange={(event) => setIterations(event.target.value)}
            className="w-32"
          />
        </div>
        <Button onClick={handleRun}>
          <Play data-icon="inline-start" />
          {t('benchmark-builder.run')}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t('benchmark-builder.resultsLabel')}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('benchmark-builder.colName')}</TableHead>
                <TableHead>{t('benchmark-builder.colTotal')}</TableHead>
                <TableHead>{t('benchmark-builder.colAvg')}</TableHead>
                <TableHead className="w-56">{t('benchmark-builder.colRatio')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result, index) => {
                const speedPercent =
                  fastestMs > 0 && result.avgMs > 0 ? (fastestMs / result.avgMs) * 100 : 0
                return (
                  <TableRow key={resultIds[index] ?? result.name}>
                    <TableCell className="font-medium">{result.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {result.totalMs.toFixed(2)} ms
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {result.avgMs.toFixed(4)} ms
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={speedPercent}
                          className="h-2 flex-1"
                          aria-label="relative speed"
                        />
                        <span className="w-14 shrink-0 text-right font-mono text-xs">
                          ×{result.ratio.toFixed(2)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
