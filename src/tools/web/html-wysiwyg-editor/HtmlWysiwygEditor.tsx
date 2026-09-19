import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toggle } from '@/components/ui/toggle'
import {
  editorCommands,
  getSelectedCommandState,
  type CommandState,
  type EditorCommand,
} from './html-wysiwyg-editor.service'

const commandIcons: ReadonlyMap<string, LucideIcon> = new Map([
  ['bold', Bold],
  ['italic', Italic],
  ['underline', Underline],
  ['strikeThrough', Strikethrough],
  ['formatBlock:<h1>', Heading1],
  ['formatBlock:<h2>', Heading2],
  ['formatBlock:<h3>', Heading3],
  ['insertUnorderedList', List],
  ['insertOrderedList', ListOrdered],
  ['createLink', Link2],
  ['removeFormat', RemoveFormatting],
])

function commandIcon(command: EditorCommand): LucideIcon {
  const key =
    command.argument === undefined ? command.command : `${command.command}:${command.argument}`
  return commandIcons.get(key) ?? Bold
}

function isCommandPressed(command: EditorCommand, state: CommandState): boolean {
  if (command.command === 'bold') {
    return state.bold
  }
  if (command.command === 'italic') {
    return state.italic
  }
  if (command.command === 'underline') {
    return state.underline
  }
  if (command.command === 'strikeThrough') {
    return state.strikeThrough
  }
  return false
}

export default function HtmlWysiwygEditor() {
  const { t } = useTranslation('tools-web')

  const editorRef = useRef<HTMLDivElement | null>(null)
  const [html, setHtml] = useState('')
  const [commandState, setCommandState] = useState<CommandState>({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
  })
  const [linkUrl, setLinkUrl] = useState('')

  // 选区变化时同步加粗/斜体等按钮的按下状态
  useEffect(() => {
    const syncCommandState = () => {
      setCommandState(getSelectedCommandState(document))
    }
    document.addEventListener('selectionchange', syncCommandState)
    return () => document.removeEventListener('selectionchange', syncCommandState)
  }, [])

  const syncHtml = () => {
    const editor = editorRef.current
    if (editor !== null) {
      setHtml(editor.innerHTML)
    }
  }

  // execCommand 只在事件处理器中调用（API 已废弃但仍是 contenteditable 编辑器的经典方案）
  const applyCommand = (command: EditorCommand) => {
    const editor = editorRef.current
    if (editor === null) {
      return
    }
    const argument = command.command === 'createLink' ? linkUrl.trim() : command.argument
    if (command.command === 'createLink' && (argument ?? '') === '') {
      return
    }
    editor.focus()
    document.execCommand(command.command, false, argument)
    syncHtml()
    setCommandState(getSelectedCommandState(document))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border p-2">
        {editorCommands.map((command) => {
          const Icon = commandIcon(command)
          const label = t(`html-wysiwyg-editor.cmd-${command.labelKey}`)
          return (
            <Toggle
              key={command.labelKey}
              size="sm"
              variant="outline"
              pressed={isCommandPressed(command, commandState)}
              onPressedChange={() => applyCommand(command)}
              onMouseDown={(event) => event.preventDefault()}
              aria-label={label}
              title={label}
            >
              <Icon className="size-4" />
            </Toggle>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="wysiwyg-link-url">{t('html-wysiwyg-editor.linkInputLabel')}</Label>
        <Input
          id="wysiwyg-link-url"
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          placeholder="https://example.com"
          className="font-mono text-sm"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('html-wysiwyg-editor.editorLabel')}</Label>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={t('html-wysiwyg-editor.editorLabel')}
          onInput={syncHtml}
          onBlur={syncHtml}
          className="bg-background focus-visible:ring-ring [&_a]:text-primary min-h-40 rounded-lg border p-3 text-sm leading-relaxed break-words outline-none focus-visible:ring-2 [&_a]:underline [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
        />
        <p className="text-muted-foreground text-sm">{t('html-wysiwyg-editor.editorHint')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('html-wysiwyg-editor.htmlOutput')}</Label>
        <TextareaCopyable value={html} highlight language="xml" rows={6} placeholder="<p>…</p>" />
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const editor = editorRef.current
            if (editor !== null) {
              editor.innerHTML = ''
              syncHtml()
            }
          }}
        >
          {t('common:clear')}
        </Button>
      </div>
    </div>
  )
}
