import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { ListKit } from '@tiptap/extension-list'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import {
  hasMeaningfulRichTextContent,
  normalizeLinkHref,
  stripLegacyRichTextClasses,
  stripTrailingListParagraph,
} from '../../rich-text'
import { BetterSpace } from './BetterSpace'

const HIGHLIGHT_COLORS = ['#fef08a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#fed7aa']

function normalizeEditorHtml(value?: string): string {
  if (!value) {
    return ''
  }
  return stripTrailingListParagraph(stripLegacyRichTextClasses(value))
}

type ToolbarButtonProps = {
  icon: typeof Bold
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

function ToolbarButton({ icon: Icon, label, active, disabled, onClick }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(active && 'bg-accent text-accent-foreground')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </Button>
  )
}

type RichEditorProps = {
  content?: string
  placeholder?: string
  onChange: (content: string) => void
}

/** 简历里所有长文本字段（经历描述、项目描述、技能、自评…）的编辑器 */
export function RichEditor({ content = '', placeholder = '', onChange }: RichEditorProps) {
  const { t } = useTranslation('tools-resume')
  const [initialContent] = useState(() => normalizeEditorHtml(content))
  const lastSynced = useRef(initialContent)
  /** Tiptap 只在创建时读一次回调，所以要始终转发最新的那个 onChange */
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  const [linkDraft, setLinkDraft] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        link: false,
        underline: false,
        heading: { levels: [1, 2, 3] },
      }),
      ListKit.configure({
        bulletList: {},
        orderedList: {},
        listItem: {},
        listKeymap: {},
        taskItem: false,
        taskList: false,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      TextStyle,
      Underline,
      Color,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && Boolean(normalizeLinkHref(url)),
        shouldAutoLink: (url) => Boolean(normalizeLinkHref(url)),
      }),
      Highlight.configure({ multicolor: true }),
      BetterSpace,
    ],
    content: initialContent,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'tiptap min-h-38 max-w-none px-4 py-3 focus:outline-none',
        'data-placeholder': placeholder,
      },
    },
    onUpdate: ({ editor: instance }) => {
      const html = normalizeEditorHtml(instance.getHTML())
      if (html === lastSynced.current) {
        return
      }
      lastSynced.current = html
      onChangeRef.current(html)
    },
  })

  // 撤销/重做或切换简历会把外部内容换掉，编辑器要跟上，但不能反过来再触发一次 onChange
  useEffect(() => {
    if (!editor) {
      return
    }

    const incoming = normalizeEditorHtml(content)
    if (incoming === lastSynced.current || incoming === normalizeEditorHtml(editor.getHTML())) {
      lastSynced.current = incoming
      return
    }

    editor.commands.setContent(incoming, { emitUpdate: false })
    lastSynced.current = incoming
  }, [content, editor])

  if (!editor) {
    return null
  }

  const empty = !hasMeaningfulRichTextContent(editor.getHTML())

  const applyLink = () => {
    const href = normalizeLinkHref(linkDraft)
    if (href) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    }
    setLinkOpen(false)
  }

  return (
    <div
      className="border-border bg-card overflow-hidden rounded-lg border shadow-sm"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-0.5">
          <ToolbarButton
            icon={Bold}
            label={t('resume.richEditor.bold')}
            active={editor.isActive('bold')}
            disabled={empty && !editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            icon={Italic}
            label={t('resume.richEditor.italic')}
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            icon={UnderlineIcon}
            label={t('resume.richEditor.underline')}
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            icon={Strikethrough}
            label={t('resume.richEditor.strike')}
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton
            icon={List}
            label={t('resume.richEditor.bulletList')}
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            icon={ListOrdered}
            label={t('resume.richEditor.orderedList')}
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton
            icon={AlignLeft}
            label={t('resume.richEditor.alignLeft')}
            active={editor.isActive({ textAlign: 'left' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          />
          <ToolbarButton
            icon={AlignCenter}
            label={t('resume.richEditor.alignCenter')}
            active={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          />
          <ToolbarButton
            icon={AlignRight}
            label={t('resume.richEditor.alignRight')}
            active={editor.isActive({ textAlign: 'right' })}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          />
          <ToolbarButton
            icon={AlignJustify}
            label={t('resume.richEditor.alignJustify')}
            active={editor.isActive({ textAlign: 'justify' })}
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          />

          <Separator orientation="vertical" className="mx-1 h-5" />

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={t('resume.richEditor.textColor')}
                aria-label={t('resume.richEditor.textColor')}
                onMouseDown={(e) => e.preventDefault()}
              >
                <span
                  className="size-4 rounded-sm border"
                  style={{
                    backgroundColor: String(
                      editor.getAttributes('textStyle').color || 'transparent',
                    ),
                  }}
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
              <div className="flex flex-wrap gap-1.5">
                <ToolbarButton
                  icon={Highlighter}
                  label={t('resume.richEditor.resetColor')}
                  onClick={() => editor.chain().focus().unsetColor().run()}
                />
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    className="size-6 rounded-md border"
                    style={{ backgroundColor: color }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor.chain().focus().setColor(color).run()}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['#000000', '#4b5563', '#9ca3af', '#0047ab', '#8b0000', '#2e8b57'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    className="size-6 rounded-md border"
                    style={{ backgroundColor: color }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor.chain().focus().setColor(color).run()}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <ToolbarButton
            icon={Highlighter}
            label={t('resume.richEditor.highlight')}
            active={editor.isActive('highlight')}
            onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
          />

          <Popover open={linkOpen} onOpenChange={setLinkOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={t('resume.richEditor.link')}
                aria-label={t('resume.richEditor.link')}
                className={cn(editor.isActive('link') && 'bg-accent')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setLinkDraft(editor.getAttributes('link').href || '')}
              >
                <Link2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3">
              <Input
                autoFocus
                value={linkDraft}
                placeholder="https://"
                aria-label={t('resume.richEditor.linkPlaceholder')}
                onChange={(event) => setLinkDraft(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && applyLink()}
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="flex-1" onClick={applyLink}>
                  {t('resume.richEditor.apply')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    editor.chain().focus().extendMarkRange('link').unsetLink().run()
                    setLinkOpen(false)
                  }}
                >
                  {t('resume.richEditor.remove')}
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton
            icon={Undo}
            label={t('resume.richEditor.undo')}
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolbarButton
            icon={Redo}
            label={t('resume.richEditor.redo')}
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          />
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  )
}
