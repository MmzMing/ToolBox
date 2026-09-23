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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type WorkspaceCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, description: string) => void
}

const NAME_LIMIT = 60
const DESCRIPTION_LIMIT = 200

/** 新建工作区：名称与描述填完才创建，创建成功即进入该工作区的画布 */
export function WorkspaceCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: WorkspaceCreateDialogProps) {
  const { t } = useTranslation('tools-images')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleClose = () => {
    setName('')
    setDescription('')
    onOpenChange(false)
  }

  const submit = () => {
    onCreate(name.trim(), description.trim())
    setName('')
    setDescription('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('ai-image-gen.workspace.createTitle')}</DialogTitle>
          <DialogDescription>{t('ai-image-gen.workspace.createHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="workspace-name">{t('ai-image-gen.workspace.nameLabel')}</Label>
          <Input
            id="workspace-name"
            value={name}
            maxLength={NAME_LIMIT}
            placeholder={t('ai-image-gen.workspace.namePlaceholder')}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="workspace-description">{t('ai-image-gen.workspace.descLabel')}</Label>
          <Textarea
            id="workspace-description"
            value={description}
            maxLength={DESCRIPTION_LIMIT}
            placeholder={t('ai-image-gen.workspace.descPlaceholder')}
            className="max-h-32 min-h-16 resize-none"
            onChange={(event) => setDescription(event.target.value)}
          />
          <p className="text-muted-foreground text-[10px]">
            {description.length} / {DESCRIPTION_LIMIT}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose}>
            {t('ai-image-gen.workspace.cancel')}
          </Button>
          <Button type="button" onClick={submit}>
            {t('ai-image-gen.workspace.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
