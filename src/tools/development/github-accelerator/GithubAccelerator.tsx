import { ChevronDown, Download, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { githubAcceleratorNodes } from '@/config/github-accelerator'
import { usePreferencesStore } from '@/stores/preferences.store'
import {
  buildAcceleratedUrl,
  normalizeNodePrefix,
  parseGithubTarget,
} from './github-accelerator.service'

interface NodeRow {
  prefix: string
  label: string
  builtIn: boolean
}

/** 展示名取 host（含子路径），去掉协议与结尾斜杠 */
function nodeLabel(prefix: string): string {
  return prefix.replace(/^https:\/\//, '').replace(/\/$/, '')
}

/**
 * GitHub 加速下载：解析链接为原始直链，选一个节点后给出单个下载入口。
 * 纯字符串处理，不发起任何请求；下载由浏览器按节点返回的 Content-Disposition 接管。
 */
export default function GithubAccelerator() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'github-accelerator' })

  const [input, setInput] = useState('')
  const [draftNode, setDraftNode] = useState('')
  const [nodeError, setNodeError] = useState('')

  const customNodes = usePreferencesStore((state) => state.customAcceleratorNodes)
  const setCustomNodes = usePreferencesStore((state) => state.setCustomAcceleratorNodes)
  const selectedPrefix = usePreferencesStore((state) => state.acceleratorNode)
  const setSelectedPrefix = usePreferencesStore((state) => state.setAcceleratorNode)

  const parsed = useMemo(() => parseGithubTarget(input), [input])

  const nodes = useMemo<NodeRow[]>(
    () => [
      ...githubAcceleratorNodes.map((node) => ({ ...node, builtIn: true })),
      ...customNodes.map((prefix) => ({ prefix, label: nodeLabel(prefix), builtIn: false })),
    ],
    [customNodes],
  )

  // 选中的节点可能已被删除，回退到列表第一个
  const activeNode = nodes.find((node) => node.prefix === selectedPrefix) ?? nodes[0]

  const handleAddNode = () => {
    const normalized = normalizeNodePrefix(draftNode)
    if (!normalized) {
      setNodeError('nodeInvalid')
      return
    }
    if (nodes.some((node) => node.prefix === normalized)) {
      setNodeError('nodeExists')
      return
    }
    setCustomNodes([...customNodes, normalized])
    setDraftNode('')
    setNodeError('')
  }

  const handleRemoveNode = (prefix: string) => {
    setCustomNodes(customNodes.filter((node) => node !== prefix))
    setNodeError('')
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="gh-accelerator-input">{t('inputLabel')}</Label>
          {input !== '' && (
            <Button variant="ghost" size="sm" onClick={() => setInput('')} className="gap-1.5">
              <X className="size-4" />
              {t('clear')}
            </Button>
          )}
        </div>
        <Input
          id="gh-accelerator-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('inputPlaceholder')}
          className="font-mono"
          spellCheck={false}
        />
        {parsed.hint && (
          <Alert>
            <AlertDescription>{t(`hints.${parsed.hint}`)}</AlertDescription>
          </Alert>
        )}
        {parsed.targets.length === 0 && input.trim() === '' && (
          <p className="text-muted-foreground text-sm">{t('hints.emptyInput')}</p>
        )}
      </Card>

      {parsed.targets.map((target) => {
        const spareLinks = [
          { label: t('originalLabel'), value: target.url },
          ...(target.jsdelivrUrl ? [{ label: t('jsdelivrLabel'), value: target.jsdelivrUrl }] : []),
          ...nodes
            .filter((node) => node.prefix !== activeNode.prefix)
            .map((node) => ({
              label: node.label,
              value: buildAcceleratedUrl(node.prefix, target.url),
            })),
        ]

        return (
          <Card key={target.url} className="flex flex-col gap-3 p-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="secondary">{t(`kinds.${target.kind}`)}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{target.name}</span>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground text-xs">{t('nodeLabel')}</Label>
              <Select value={activeNode.prefix} onValueChange={setSelectedPrefix}>
                <SelectTrigger className="w-full font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((node) => (
                    <SelectItem key={node.prefix} value={node.prefix}>
                      {node.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <span className="text-muted-foreground w-20 shrink-0 text-xs">
                {t('acceleratedLabel')}
              </span>
              <SpanCopyable
                value={buildAcceleratedUrl(activeNode.prefix, target.url)}
                className="min-w-0 flex-1"
              />
            </div>

            <Button asChild className="w-full">
              <a
                href={buildAcceleratedUrl(activeNode.prefix, target.url)}
                download={target.name}
                target="_blank"
                rel="noreferrer"
              >
                <Download data-icon="inline-start" />
                {t('download')}
              </a>
            </Button>

            <Collapsible className="border-t pt-3">
              <CollapsibleTrigger className="group/collapsible text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs">
                <ChevronDown className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                {t('moreLinks')}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 flex flex-col gap-2">
                  {spareLinks.map((link) => (
                    <li key={link.value} className="flex min-w-0 items-center gap-2">
                      <span className="text-muted-foreground w-20 shrink-0 truncate text-xs">
                        {link.label}
                      </span>
                      <SpanCopyable value={link.value} className="min-w-0 flex-1" />
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )
      })}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="gh-accelerator-node">{t('nodesTitle')}</Label>
          {customNodes.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCustomNodes([])
                setNodeError('')
              }}
              className="gap-1.5"
            >
              <RotateCcw className="size-4" />
              {t('resetNodes')}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="gh-accelerator-node"
            value={draftNode}
            onChange={(event) => {
              setDraftNode(event.target.value)
              setNodeError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draftNode.trim() !== '') {
                handleAddNode()
              }
            }}
            placeholder={t('nodePlaceholder')}
            className="min-w-0 font-mono sm:max-w-xs"
            spellCheck={false}
          />
          <Button
            variant="outline"
            onClick={handleAddNode}
            disabled={draftNode.trim() === ''}
            className="shrink-0 gap-1.5"
          >
            <Plus className="size-4" />
            {t('addNode')}
          </Button>
        </div>

        {nodeError && (
          <Alert variant="destructive">
            <AlertDescription>{t(nodeError)}</AlertDescription>
          </Alert>
        )}

        <ul className="flex flex-col gap-1">
          {nodes.map((node) => (
            <li key={node.prefix} className="flex min-w-0 items-center gap-2">
              <Badge variant={node.builtIn ? 'outline' : 'secondary'} className="shrink-0">
                {node.builtIn ? t('builtIn') : t('custom')}
              </Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{node.prefix}</span>
              {!node.builtIn && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('removeNode')}
                  onClick={() => handleRemoveNode(node.prefix)}
                  className="shrink-0"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        <p className="text-muted-foreground text-xs">{t('privacyNote')}</p>
      </Card>
    </div>
  )
}
