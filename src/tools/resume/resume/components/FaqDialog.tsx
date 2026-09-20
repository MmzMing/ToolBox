import { HelpCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const FAQ_IDS = ['storage', 'pagedExport', 'templateSwitch', 'remotePhoto'] as const

/**
 * 使用问答。
 *
 * 旧版这里是一颗带轨道光点的"魔法玻璃球"（200 多行装饰 SVG），
 * 只保留功能：一个帮助按钮 + 折叠问答。
 */
export function FaqDialog() {
  const { t } = useTranslation('tools-resume')

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 rounded-full"
          aria-label={t('resume.faq.title')}
        >
          <HelpCircle className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('resume.faq.title')}</DialogTitle>
          <DialogDescription>{t('resume.faq.description')}</DialogDescription>
        </DialogHeader>

        <Accordion type="single" collapsible className="w-full">
          {FAQ_IDS.map((id) => (
            <AccordionItem key={id} value={id}>
              <AccordionTrigger>{t(`resume.faq.items.${id}.q`)}</AccordionTrigger>
              <AccordionContent>{t(`resume.faq.items.${id}.a`)}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </DialogContent>
    </Dialog>
  )
}
