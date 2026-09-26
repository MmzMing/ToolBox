import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { sniffInputKind } from '../curl-generator.service'

interface ImportDialogProps {
  onApply: (text: string) => void
  trigger: React.ReactNode
}

/** 导入 cURL / 原始 HTTP 报文：粘贴后自动嗅探类型，再回填表单 */
export function ImportDialog({ onApply, trigger }: ImportDialogProps) {
  const { t } = useTranslation('tools-development')
  const ns = (key: string) => t(`curl-generator.${key}`)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const kind = sniffInputKind(text)

  const submit = () => {
    if (text.trim() === '') return
    onApply(text)
    setText('')
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setText('')
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ns('importTitle')}</DialogTitle>
          <DialogDescription>{ns('importHintDetail')}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={ns('importPlaceholder')}
          className="min-h-52 font-mono text-xs"
          spellCheck={false}
          autoFocus
        />
        {text.trim() !== '' && (
          <p className="text-muted-foreground text-xs">{ns(`detect.${kind}`)}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {ns('shareCancel')}
          </Button>
          <Button onClick={submit} disabled={text.trim() === '' || kind === 'unknown'}>
            {ns('importApply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
