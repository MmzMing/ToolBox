import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import type { EncodedSecret } from '../hmac.service'
import {
  KEY_FORMAT_IDS,
  type KeyFormatId,
  type KeyFormatReason,
  type KeyFormatRole,
  type KeyFormats,
} from '../key-formats.service'

/** 被禁用的行也要落回正确分组，角色由这里补齐（服务层只报 id 与原因） */
const UNAVAILABLE_ROLES: Partial<Record<KeyFormatId, KeyFormatRole>> = {
  'traditional-pem': 'private',
  'private-raw-hex': 'private',
  'ssh-private': 'private',
  'ssh-public': 'public',
  'fingerprint-sha256': 'public',
  'fingerprint-md5': 'public',
}

interface FormatGroup {
  id: 'pem' | 'ssh' | 'jwk' | 'raw'
  ids: readonly KeyFormatId[]
}

/**
 * 输出按格式族切换，而不是全矩阵纵向铺开：一把 RSA 私钥的 PEM 就有 3 段几十行的块，
 * 全铺会把工作台撑成十几屏。用下拉而非第二排 Tab——它紧贴外层功能 Tab 时长得一模一样，
 * 两层同名控件叠在一起没人分得清自己在切什么。
 */
const FORMAT_GROUPS: readonly FormatGroup[] = [
  { id: 'pem', ids: ['pkcs8-pem', 'traditional-pem', 'spki-pem'] },
  { id: 'ssh', ids: ['ssh-public', 'ssh-private', 'fingerprint-sha256', 'fingerprint-md5'] },
  { id: 'jwk', ids: ['jwk-private', 'jwk-public', 'jwks'] },
  {
    id: 'raw',
    ids: [
      'pkcs8-der',
      'spki-der',
      'public-raw-hex',
      'public-raw-base64',
      'public-raw-base64url',
      'private-raw-hex',
    ],
  },
]

interface MatrixRow {
  id: KeyFormatId
  role: KeyFormatRole
  text: string
  reason?: KeyFormatReason
}

function rowsOf(formats: KeyFormats): MatrixRow[] {
  return [
    ...formats.outputs,
    ...formats.unavailable.map(({ id, reason }) => ({
      id,
      role: UNAVAILABLE_ROLES[id] ?? 'public',
      text: '',
      reason,
    })),
  ].sort((left, right) => KEY_FORMAT_IDS.indexOf(left.id) - KEY_FORMAT_IDS.indexOf(right.id))
}

/**
 * 超过这个长度就走块输出。72 是窄屏（约 540px 宽、font-mono 12px）下单行输入框放得下的
 * 字符数上限——再长的值留在输入框里就是横向滚动条，而输出区的软换行能完整显示。
 * 低于它的指纹（SHA256 是 71 字符）、hex、base64 仍走单行，读起来更省事。
 */
const BLOCK_OUTPUT_LENGTH = 72
/** 块输出最高到 12 行，再长在容器里滚，不让一段私钥把整页顶开 */
const MAX_BLOCK_ROWS = 12
/** 与 TextareaCopyable 的高度公式对齐：12 行 × 1.421875rem 行高 + 1.5rem 内边距 */
const BLOCK_MAX_HEIGHT_CLASS = 'max-h-[calc(12*1.421875rem_+_1.5rem)]'

interface CopyRowProps {
  label: string
  value: string
  /** highlight.js 语言标识，块输出才用得上 */
  language?: string
}

/** 带标签的只读输出行：短值走单行输入框，PEM / JWK 与超长单行走会断行的输出区 */
export function CopyRow({ label, value, language }: CopyRowProps) {
  const lineCount = value.split('\n').length
  const isBlock = lineCount > 1 || value.length > BLOCK_OUTPUT_LENGTH
  // rows 只是最小高度，所以按真实换行数给；再按字符数估行数会在文字下面留出一条死白
  const rows = Math.min(MAX_BLOCK_ROWS, lineCount)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label className="text-muted-foreground font-mono text-xs">{label}</Label>
      {isBlock ? (
        <TextareaCopyable
          value={value}
          rows={rows}
          highlight={language !== undefined}
          language={language}
          className={cn('min-w-0 font-mono', BLOCK_MAX_HEIGHT_CLASS)}
        />
      ) : (
        <InputCopyable value={value} readOnly className="min-w-0 font-mono text-xs" />
      )}
    </div>
  )
}

/**
 * 同一份密钥字节的三种编码表示。
 *
 * 行标签直接取 `EncodedSecret` 的字段名：hex / base64 / base64url 是跨语言通用的格式标识，
 * 再翻一套「十六进制」只会与 format.* 里的既有说法分叉。
 */
export function EncodingRows({ secret }: { secret: EncodedSecret }) {
  const entries = Object.entries(secret) as [keyof EncodedSecret, string][]
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {entries.map(([encoding, value]) => (
        <CopyRow key={encoding} label={encoding} value={value} />
      ))}
    </div>
  )
}

function FormatRow({ row }: { row: MatrixRow }) {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'key-generator' })
  const label = t(`format.${row.id}`)

  if (row.reason) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <Label className="text-muted-foreground/70 text-xs">{label}</Label>
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
          {t(`unavailable.${row.reason}`)}
        </p>
      </div>
    )
  }

  return <CopyRow label={label} value={row.text} />
}

interface FormatMatrixProps {
  formats: KeyFormats | null
}

/** 全格式输出：PEM / OpenSSH / JWK / 原始字节 四族，用下拉切换 */
export function FormatMatrix({ formats }: FormatMatrixProps) {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'key-generator' })
  const [groupId, setGroupId] = useState<FormatGroup['id']>('pem')

  const group = useMemo(() => {
    const found = FORMAT_GROUPS.find((item) => item.id === groupId)
    if (!found || !formats) {
      return null
    }
    return {
      ...found,
      rows: rowsOf(formats).filter((row) => found.ids.includes(row.id)),
    }
  }, [formats, groupId])

  if (!group) {
    return null
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {group.rows.some((row) => row.role === 'private' && !row.reason) && (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <Lock className="size-4 shrink-0" />
              {t('warning-private-key')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground text-xs">{t('output-format')}</span>
          <Select value={groupId} onValueChange={(next) => setGroupId(next as FormatGroup['id'])}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_GROUPS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {t(`group-${item.id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* PEM 正文按 64 列硬换行（openssl 惯例），单列铺满整宽时右边会空一片；宽屏改两列卡片正好吃掉 */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {group.rows.map((row) => (
          <FormatRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  )
}
