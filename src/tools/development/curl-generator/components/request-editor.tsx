import { Braces, Send, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  createEncodedFieldRow,
  createFormFieldRow,
  createHeaderRow,
  createOption,
  createParamRow,
  type BodyKind,
  type EncodedFieldRow,
  type FormFieldRow,
  type HttpRequestModel,
  type ParamRow,
} from '../request-model'

import { KeyValueList } from './key-value-list'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const BODY_KINDS: readonly BodyKind[] = ['none', 'json', 'urlencoded', 'raw', 'form', 'binary']
const AUTH_KINDS = ['none', 'basic', 'bearer', 'apikey', 'digest'] as const

const BOOLEAN_SWITCHES: readonly { flag: string; label: string }[] = [
  { flag: '-L', label: 'location' },
  { flag: '-i', label: 'include' },
  { flag: '-v', label: 'verbose' },
  { flag: '-s', label: 'silent' },
  { flag: '-k', label: 'insecure' },
  { flag: '-g', label: 'globoff' },
  { flag: '--compressed', label: 'compressed' },
  { flag: '--http2', label: 'http2' },
]

const VALUE_SWITCHES: readonly { flag: string; label: string; placeholder: string }[] = [
  { flag: '-m', label: 'maxTime', placeholder: '30' },
  { flag: '--connect-timeout', label: 'connectTimeout', placeholder: '10' },
  { flag: '--retry', label: 'retry', placeholder: '3' },
  { flag: '-x', label: 'proxy', placeholder: 'http://127.0.0.1:7890' },
  { flag: '-o', label: 'output', placeholder: 'response.json' },
]

const HEADER_PRESETS: readonly { name: string; value: string }[] = [
  { name: 'Accept', value: 'application/json' },
  { name: 'Content-Type', value: 'application/json' },
  { name: 'User-Agent', value: 'curl/8.5.0' },
  { name: 'Authorization', value: 'Bearer ' },
]

/**
 * 设置区一行三列：选项 / 说明 / 控件。控件列用 auto 由内容定宽，
 * 否则两条固定轨在 lg 断点（左栏仅 ~464px）会把说明挤成一字一行。
 */
const SETTING_ROW = 'grid grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-3'

interface EditorProps {
  model: HttpRequestModel
  patch: (next: Partial<HttpRequestModel>) => void
  onSend: () => void
  pending: boolean
}

/** 左栏：URL 行 + 横向 Tab 分区（Apifox 那种请求编辑器） */
export function RequestEditor({ model, patch, onSend, pending }: EditorProps) {
  const { t } = useTranslation('tools-development')
  const ns = (key: string) => t(`curl-generator.${key}`)
  const headerCount = model.headers.filter((header) => header.enabled).length
  const paramCount = model.query.filter((row) => row.enabled).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={model.method} onValueChange={(method) => patch({ method })}>
          <SelectTrigger className="w-32 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={model.url}
          onChange={(event) => patch({ url: event.target.value })}
          placeholder={ns('urlPlaceholder')}
          className="min-w-48 flex-1 font-mono text-sm"
          spellCheck={false}
        />
        <Button
          className="shrink-0 gap-1.5"
          onClick={onSend}
          disabled={model.url === '' || pending}
        >
          <Send size={14} />
          {pending ? ns('sending') : ns('send')}
        </Button>
      </div>

      <Tabs defaultValue="params">
        <TabsList>
          <TabsTrigger value="params">
            {ns('tabs.params')}
            {paramCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {paramCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="headers">
            {ns('tabs.headers')}
            {headerCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {headerCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="body">{ns('tabs.body')}</TabsTrigger>
          <TabsTrigger value="auth">{ns('tabs.auth')}</TabsTrigger>
          <TabsTrigger value="settings">{ns('tabs.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="params" className="mt-4">
          <KeyValueList<ParamRow>
            rows={model.query}
            onChange={(query) => patch({ query })}
            blank={() => createParamRow()}
            nameHeader={ns('cols.paramName')}
            valueHeader={ns('cols.paramValue')}
            namePlaceholder="key"
            valuePlaceholder="value"
          />
        </TabsContent>

        <TabsContent value="headers" className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">{ns('commonHeaders')}</span>
            {HEADER_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                size="sm"
                className="h-7 font-mono text-[11px]"
                onClick={() =>
                  patch({ headers: [...model.headers, createHeaderRow(preset.name, preset.value)] })
                }
              >
                {preset.name}
              </Button>
            ))}
          </div>
          <KeyValueList
            rows={model.headers}
            onChange={(headers) => patch({ headers })}
            blank={() => createHeaderRow()}
            nameHeader={ns('cols.headerName')}
            valueHeader={ns('cols.paramValue')}
            namePlaceholder="Accept"
            valuePlaceholder="application/json"
          />
        </TabsContent>

        <TabsContent value="body" className="mt-4">
          <BodyEditor model={model} patch={patch} />
        </TabsContent>

        <TabsContent value="auth" className="mt-4">
          <AuthEditor model={model} patch={patch} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsEditor model={model} patch={patch} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BodyEditor({ model, patch }: { model: HttpRequestModel; patch: EditorProps['patch'] }) {
  const { t } = useTranslation('tools-development')
  const ns = (key: string) => t(`curl-generator.${key}`)
  const body = model.body

  const setKind = (kind: BodyKind) => {
    switch (kind) {
      case 'json':
        patch({ body: { kind, text: body.kind === 'json' ? body.text : '' } })
        break
      case 'raw':
        patch({
          body: {
            kind,
            text: body.kind === 'raw' || body.kind === 'json' ? body.text : '',
            useDataRaw: body.kind === 'raw' ? body.useDataRaw : true,
          },
        })
        break
      case 'urlencoded':
        patch({
          body: {
            kind,
            fields:
              body.kind === 'urlencoded'
                ? body.fields
                : body.kind === 'form'
                  ? body.fields.map((field) => ({
                      id: field.id,
                      name: field.name,
                      value: field.value,
                      encode: false,
                      enabled: field.enabled,
                    }))
                  : [createEncodedFieldRow()],
          },
        })
        break
      case 'form':
        patch({
          body: {
            kind,
            fields:
              body.kind === 'form'
                ? body.fields
                : body.kind === 'urlencoded'
                  ? body.fields.map((field) => ({
                      id: field.id,
                      name: field.name,
                      value: field.value,
                      isFile: false,
                      enabled: field.enabled,
                    }))
                  : [createFormFieldRow()],
          },
        })
        break
      case 'binary':
        patch({ body: { kind, path: body.kind === 'binary' ? body.path : '' } })
        break
      default:
        patch({ body: { kind: 'none' } })
    }
  }

  const formatJson = () => {
    if (body.kind !== 'json') return
    try {
      patch({ body: { kind: 'json', text: JSON.stringify(JSON.parse(body.text), null, 2) } })
    } catch {
      // 非法 JSON 保持原样，由校验区提示
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={body.kind}
          onValueChange={(value) => value && setKind(value as BodyKind)}
        >
          {BODY_KINDS.map((kind) => (
            <ToggleGroupItem key={kind} value={kind} className="px-3 text-xs">
              {ns(`bodyKinds.${kind}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {body.kind === 'json' && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={formatJson}>
            <Braces size={13} />
            {ns('formatJson')}
          </Button>
        )}
      </div>

      {(body.kind === 'json' || body.kind === 'raw') && (
        <>
          <Textarea
            value={body.text}
            onChange={(event) => patch({ body: { ...body, text: event.target.value } })}
            placeholder={body.kind === 'json' ? '{"key":"value"}' : ns('rawPlaceholder')}
            className="min-h-40 font-mono text-xs"
            spellCheck={false}
          />
          {body.kind === 'raw' && (
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <Switch
                checked={body.useDataRaw}
                onCheckedChange={(useDataRaw) => patch({ body: { ...body, useDataRaw } })}
              />
              {ns('useDataRaw')}
            </label>
          )}
        </>
      )}

      {body.kind === 'urlencoded' && (
        <KeyValueList<EncodedFieldRow>
          rows={body.fields}
          onChange={(fields) => patch({ body: { kind: 'urlencoded', fields } })}
          blank={() => createEncodedFieldRow()}
          nameHeader={ns('cols.paramName')}
          valueHeader={ns('cols.paramValue')}
          namePlaceholder="key"
          valuePlaceholder="value"
          renderValue={(field, update) => (
            <div className="flex min-w-0 items-center gap-2">
              <Input
                value={field.value}
                onChange={(event) => update({ value: event.target.value })}
                className="min-w-0 flex-1 font-mono text-xs"
                placeholder="value"
              />
              <label className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-[11px]">
                <Checkbox
                  checked={field.encode}
                  onCheckedChange={(checked) => update({ encode: checked === true })}
                />
                {ns('encodeValue')}
              </label>
            </div>
          )}
        />
      )}

      {body.kind === 'form' && (
        <KeyValueList<FormFieldRow>
          rows={body.fields}
          onChange={(fields) => patch({ body: { kind: 'form', fields } })}
          blank={() => createFormFieldRow()}
          nameHeader={ns('cols.paramName')}
          valueHeader={ns('cols.paramValue')}
          namePlaceholder="field"
          valuePlaceholder="value"
          renderValue={(field, update) => (
            <div className="flex min-w-0 items-center gap-2">
              <Input
                value={field.value}
                onChange={(event) => update({ value: event.target.value })}
                className="min-w-0 flex-1 font-mono text-xs"
                placeholder={field.isFile ? '/tmp/report.pdf' : 'value'}
              />
              <label className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-[11px]">
                <Checkbox
                  checked={field.isFile}
                  onCheckedChange={(checked) => update({ isFile: checked === true })}
                />
                {ns('fileField')}
              </label>
            </div>
          )}
        />
      )}

      {body.kind === 'binary' && (
        <Input
          value={body.path}
          onChange={(event) => patch({ body: { kind: 'binary', path: event.target.value } })}
          placeholder="/tmp/payload.bin"
          className="max-w-md font-mono text-xs"
        />
      )}

      {body.kind === 'none' && (
        <p className="text-muted-foreground text-xs">{ns('bodyNoneHint')}</p>
      )}
    </div>
  )
}

function AuthEditor({ model, patch }: { model: HttpRequestModel; patch: EditorProps['patch'] }) {
  const { t } = useTranslation('tools-development')
  const ns = (key: string) => t(`curl-generator.${key}`)
  const auth = model.auth

  const choose = (kind: (typeof AUTH_KINDS)[number]) => {
    if (kind === 'basic') patch({ auth: { kind, user: '', password: '', via: 'option' } })
    else if (kind === 'digest') patch({ auth: { kind, user: '', password: '' } })
    else if (kind === 'bearer') patch({ auth: { kind, token: '', via: 'header' } })
    else if (kind === 'apikey') patch({ auth: { kind, name: '', value: '', in: 'header' } })
    else patch({ auth: { kind: 'none' } })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-xs">{ns('authType')}</span>
        <Select
          value={auth.kind}
          onValueChange={(value) => choose(value as (typeof AUTH_KINDS)[number])}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTH_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {ns(`authKinds.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(auth.kind === 'basic' || auth.kind === 'digest') && (
        <div className="flex flex-wrap gap-2">
          <Input
            value={auth.user}
            onChange={(event) => patch({ auth: { ...auth, user: event.target.value } })}
            placeholder={ns('authUser')}
            className="w-48 font-mono text-xs"
          />
          <Input
            value={auth.password}
            onChange={(event) => patch({ auth: { ...auth, password: event.target.value } })}
            placeholder={ns('authPassword')}
            type="password"
            className="w-48 font-mono text-xs"
          />
          {auth.kind === 'basic' && (
            <Select
              value={auth.via}
              onValueChange={(via) => patch({ auth: { ...auth, via: via as 'option' | 'header' } })}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="option">-u user:password</SelectItem>
                <SelectItem value="header">Authorization: Basic</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {auth.kind === 'bearer' && (
        <div className="flex flex-wrap gap-2">
          <Input
            value={auth.token}
            onChange={(event) => patch({ auth: { ...auth, token: event.target.value } })}
            placeholder={ns('authToken')}
            type="password"
            className="min-w-60 flex-1 font-mono text-xs"
          />
          <Select
            value={auth.via}
            onValueChange={(via) => patch({ auth: { ...auth, via: via as 'option' | 'header' } })}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="header">Authorization: Bearer</SelectItem>
              <SelectItem value="option">--oauth2-bearer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {auth.kind === 'apikey' && (
        <div className="flex flex-wrap gap-2">
          <Input
            value={auth.name}
            onChange={(event) => patch({ auth: { ...auth, name: event.target.value } })}
            placeholder="X-API-Key"
            className="w-48 font-mono text-xs"
          />
          <Input
            value={auth.value}
            onChange={(event) => patch({ auth: { ...auth, value: event.target.value } })}
            placeholder={ns('authToken')}
            type="password"
            className="min-w-48 flex-1 font-mono text-xs"
          />
          <Select
            value={auth.in}
            onValueChange={(where) => patch({ auth: { ...auth, in: where as 'header' | 'query' } })}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="header">{ns('authInHeader')}</SelectItem>
              <SelectItem value="query">{ns('authInQuery')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {auth.kind === 'none' && (
        <p className="text-muted-foreground text-xs">{ns('authNoneHint')}</p>
      )}
    </div>
  )
}

function SettingsEditor({
  model,
  patch,
}: {
  model: HttpRequestModel
  patch: EditorProps['patch']
}) {
  const { t } = useTranslation('tools-development')
  const ns = (key: string) => t(`curl-generator.${key}`)
  const options = model.options
  const passthrough = options.filter((option) => !option.recognized)

  const toggle = (flag: string, on: boolean) => {
    const rest = options.filter((option) => option.flag !== flag)
    patch({ options: on ? [...rest, createOption(flag, undefined, true)] : rest })
  }
  const setValue = (flag: string, value: string) => {
    const rest = options.filter((option) => option.flag !== flag)
    patch({ options: value === '' ? rest : [...rest, createOption(flag, value, true)] })
  }
  const valueOf = (flag: string) => options.find((option) => option.flag === flag)?.value ?? ''

  return (
    <div className="flex flex-col gap-1">
      {BOOLEAN_SWITCHES.map((item) => (
        <div key={item.flag} className={`${SETTING_ROW} hover:bg-accent/40 rounded-md px-1 py-1`}>
          <code className="font-mono text-xs">{item.flag}</code>
          <span className="text-muted-foreground text-xs">{ns(`flags.${item.label}`)}</span>
          <Switch
            className="justify-self-start"
            checked={options.some((option) => option.flag === item.flag)}
            onCheckedChange={(on) => toggle(item.flag, on)}
            aria-label={item.flag}
          />
        </div>
      ))}

      <div className="my-3 border-t" />

      {VALUE_SWITCHES.map((item) => (
        <div key={item.flag} className={`${SETTING_ROW} hover:bg-accent/40 rounded-md px-1 py-1`}>
          <code className="font-mono text-xs">{item.flag}</code>
          <span className="text-muted-foreground text-xs">{ns(`flags.${item.label}`)}</span>
          <Input
            value={valueOf(item.flag)}
            onChange={(event) => setValue(item.flag, event.target.value)}
            placeholder={item.placeholder}
            className="h-8 w-48 justify-self-start font-mono text-xs"
            aria-label={item.flag}
          />
        </div>
      ))}

      {passthrough.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-dashed p-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-medium">{ns('sections.passthrough')}</h3>
            <Badge variant="outline">{passthrough.length}</Badge>
          </div>
          <p className="text-muted-foreground text-xs">{ns('passthroughHint')}</p>
          {passthrough.map((option) => (
            <div
              key={option.id}
              className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center gap-2"
            >
              <Checkbox
                checked={option.enabled}
                onCheckedChange={(checked) =>
                  patch({
                    options: options.map((item) =>
                      item.id === option.id ? { ...item, enabled: checked === true } : item,
                    ),
                  })
                }
                aria-label={ns('rows.enable')}
              />
              <code className="min-w-0 truncate font-mono text-xs">
                {option.value === undefined ? option.flag : `${option.flag} ${option.value}`}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 justify-self-end"
                onClick={() => patch({ options: options.filter((item) => item.id !== option.id) })}
                aria-label={ns('rows.delete')}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
