import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Download, Pencil, Plus, Trash2, Upload, Wand2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

import {
  parseSkillMarkdown,
  readSkillFiles,
  serializeSkillMarkdown,
  serializeSkillZip,
  type Skill,
} from '../skills'
import { useAiImageGenStore } from '../store'

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

const emptyDraft = (): Skill => ({
  id: '',
  name: '',
  description: '',
  markdown: '',
  references: [],
  builtin: false,
  enabled: true,
})

type SkillPickerProps = {
  skillId: string
  onSkillIdChange: (id: string) => void
}

/** 反推 skill 按钮：选择 + 管理（新建/编辑/启停/导入导出）合一 */
export function SkillPicker({ skillId, onSkillIdChange }: SkillPickerProps) {
  const { t } = useTranslation('tools-images')
  const skills = useAiImageGenStore((state) => state.skills)
  const setSkills = useAiImageGenStore((state) => state.setSkills)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Skill | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const enabledSkills = skills.filter((skill) => skill.enabled)
  const active = skills.find((skill) => skill.id === skillId) ?? enabledSkills[0]
  const skillLabel = (skill: Skill) =>
    skill.builtin
      ? t(`ai-image-gen.skills.${skill.name}.name`, { defaultValue: skill.name })
      : skill.name
  const skillDescription = (skill: Skill) =>
    skill.builtin
      ? t(`ai-image-gen.skills.${skill.name}.description`, { defaultValue: skill.description })
      : skill.description

  const handleImport = async (files: FileList | null) => {
    if (!files?.length) {
      return
    }
    try {
      const imported = await readSkillFiles(Array.from(files))
      if (!imported.length) {
        throw new Error('no skills found')
      }
      const byId = new Map(skills.map((skill) => [skill.id, skill]))
      for (const skill of imported) {
        byId.set(skill.id, skill)
      }
      setSkills([...byId.values()])
      toast.success(t('ai-image-gen.skillManager.importOk', { count: imported.length }))
    } catch {
      toast.error(t('ai-image-gen.skillManager.importError'))
    }
    if (importRef.current) {
      importRef.current.value = ''
    }
  }

  const handleExport = async () => {
    const blob = await serializeSkillZip(skills)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'ai-image-gen-skills.zip'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setEditing(null)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 max-w-44 gap-1.5 rounded-full px-3 text-xs"
        >
          <Wand2 className="size-3.5 shrink-0" />
          <span className="truncate">
            {active ? skillLabel(active) : t('ai-image-gen.reverse.skill')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start" side="top">
        {editing ? (
          <SkillEditor
            skill={editing}
            onChange={setEditing}
            onSave={(skill) => {
              const exists = skills.some((item) => item.id === skill.id)
              setSkills(
                exists
                  ? skills.map((item) => (item.id === skill.id ? skill : item))
                  : [...skills, skill],
              )
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {enabledSkills.map((skill) => (
                <div
                  key={skill.id}
                  className={
                    skill.id === active?.id
                      ? 'bg-secondary flex items-center gap-2 rounded-md px-2 py-1.5'
                      : 'hover:bg-muted/60 flex items-center gap-2 rounded-md px-2 py-1.5'
                  }
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      onSkillIdChange(skill.id)
                      setOpen(false)
                    }}
                  >
                    {skill.id === active?.id && (
                      <Check className="text-primary size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs">{skillLabel(skill)}</span>
                      <span className="text-muted-foreground block truncate text-[10px]">
                        {skillDescription(skill)}
                      </span>
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    aria-label={t('ai-image-gen.skillManager.edit')}
                    onClick={() => setEditing(skill)}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  {!skill.builtin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      aria-label={t('ai-image-gen.skillManager.delete')}
                      onClick={() => setSkills(skills.filter((item) => item.id !== skill.id))}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              ))}
              {!enabledSkills.length && (
                <p className="text-muted-foreground p-3 text-center text-xs">
                  {t('ai-image-gen.skillManager.empty')}
                </p>
              )}
            </div>
            <Separator className="my-2" />
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setEditing(emptyDraft())}
              >
                <Plus className="size-3.5" />
                {t('ai-image-gen.skillManager.add')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => importRef.current?.click()}
              >
                <Upload className="size-3.5" />
                {t('ai-image-gen.skillManager.import')}
              </Button>
              <input
                ref={importRef}
                type="file"
                accept=".md,.zip"
                multiple
                className="hidden"
                onChange={(event) => void handleImport(event.target.files)}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => void handleExport()}
              >
                <Download className="size-3.5" />
                {t('ai-image-gen.skillManager.export')}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function SkillEditor({
  skill,
  onChange,
  onSave,
  onCancel,
}: {
  skill: Skill
  onChange: (skill: Skill) => void
  onSave: (skill: Skill) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('tools-images')
  const nameValid = NAME_PATTERN.test(skill.name)
  const canSave = skill.markdown.trim() && (skill.builtin || nameValid)

  const handleSave = () => {
    if (skill.builtin) {
      onSave(skill)
      return
    }
    try {
      onSave(parseSkillMarkdown(serializeSkillMarkdown(skill)))
    } catch {
      toast.error(t('ai-image-gen.skillManager.invalidName'))
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-xs">{t('ai-image-gen.skillManager.name')}</Label>
        <Input
          value={skill.name}
          disabled={skill.builtin}
          placeholder="my-skill"
          spellCheck={false}
          className="h-8 text-xs"
          onChange={(event) =>
            onChange({ ...skill, name: event.target.value, id: event.target.value })
          }
        />
        {!skill.builtin && skill.name && !nameValid && (
          <p className="text-destructive text-xs">{t('ai-image-gen.skillManager.invalidName')}</p>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t('ai-image-gen.skillManager.description')}</Label>
        <Input
          value={skill.description}
          disabled={skill.builtin}
          className="h-8 text-xs"
          onChange={(event) => onChange({ ...skill, description: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t('ai-image-gen.skillManager.markdown')}</Label>
        <Textarea
          className="field-sizing-fixed h-64 max-h-[45vh] min-h-0 resize-none overflow-y-auto font-mono text-xs"
          value={skill.markdown}
          spellCheck={false}
          onChange={(event) => onChange({ ...skill, markdown: event.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('ai-image-gen.skillManager.cancel')}
        </Button>
        <Button size="sm" disabled={!canSave} onClick={handleSave}>
          {t('ai-image-gen.skillManager.save')}
        </Button>
      </div>
    </div>
  )
}
