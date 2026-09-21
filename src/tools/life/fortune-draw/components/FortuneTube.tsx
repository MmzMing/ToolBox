import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

/** 抽签阶段：idle 静置轻摆 → shaking 摇签 → flying 中签条飞出（随后由父组件切出结果卡） */
export type DrawPhase = 'idle' | 'shaking' | 'flying'

type FortuneTubeProps = {
  phase: DrawPhase
  label: string
}

/** 筒内 9 根签条：角度 / 水平位置 / 高度 / 错峰延迟 / 抖动幅度（静态配置，渲染期无计算） */
const STICKS = [
  { left: '12%', rotate: -16, height: 'h-20', delay: '0ms', rattle: '6px' },
  { left: '22%', rotate: -12, height: 'h-24', delay: '30ms', rattle: '9px' },
  { left: '32%', rotate: -8, height: 'h-[5.5rem]', delay: '60ms', rattle: '5px' },
  { left: '42%', rotate: -3, height: 'h-24', delay: '15ms', rattle: '10px' },
  { left: '50%', rotate: 0, height: 'h-28', delay: '45ms', rattle: '7px' },
  { left: '58%', rotate: 3, height: 'h-24', delay: '75ms', rattle: '10px' },
  { left: '68%', rotate: 8, height: 'h-[5.5rem]', delay: '25ms', rattle: '5px' },
  { left: '78%', rotate: 12, height: 'h-24', delay: '55ms', rattle: '9px' },
  { left: '88%', rotate: 16, height: 'h-20', delay: '85ms', rattle: '6px' },
] as const

/** 中签飞出的签条固定取正中间最高那根 */
const CHOSEN_INDEX = 4

/** 摇签时筒口喷出的小粒子（水平漂移量各不相同） */
const PUFFS = [
  { left: '38%', delay: '0ms', x: '-10px' },
  { left: '50%', delay: '200ms', x: '2px' },
  { left: '62%', delay: '400ms', x: '12px' },
] as const

/** 运势签筒：红头签 + 筒口纵深 + 印章纹筒身，三阶段动画全由 CSS 类驱动（index.css fortune 节） */
export function FortuneTube({ phase, label }: FortuneTubeProps) {
  return (
    <div
      className={cn(
        'fortune-tube relative mx-auto h-60 w-44',
        phase === 'idle' && 'fortune-tube--idle',
        phase === 'shaking' && 'fortune-tube--shaking',
      )}
      aria-hidden
    >
      {/* 签条：红头白身，底部探入筒口；flying 阶段中签条旋转飞出 */}
      {STICKS.map((stick, index) => (
        <div
          key={index}
          className={cn(
            'fortune-stick absolute bottom-36 flex w-2 -translate-x-1/2 flex-col',
            stick.height,
            phase === 'flying' && index === CHOSEN_INDEX && 'fortune-stick--chosen',
            phase === 'flying' && index !== CHOSEN_INDEX && 'opacity-50',
          )}
          style={
            {
              left: stick.left,
              rotate: `${stick.rotate}deg`,
              animationDelay: stick.delay,
              '--rattle': stick.rattle,
            } as CSSProperties
          }
        >
          <span className="bg-fortune-good h-3 w-full shrink-0 rounded-t-full" />
          <span
            className={cn(
              'border-border min-h-0 w-full flex-1 border-x border-b',
              index === CHOSEN_INDEX && phase === 'flying' ? 'bg-primary/20' : 'bg-card',
            )}
          />
        </div>
      ))}

      {/* 摇晃时筒口喷出的小粒子 */}
      {phase === 'shaking' &&
        PUFFS.map((puff, index) => (
          <span
            key={index}
            className="fortune-puff bg-fortune-normal absolute bottom-40 size-1.5 rounded-full"
            style={
              { left: puff.left, animationDelay: puff.delay, '--puff-x': puff.x } as CSSProperties
            }
          />
        ))}

      {/* 筒口：外沿托环 + 深色内孔，签条底部没入孔中 */}
      <div className="bg-muted border-border absolute bottom-[8.25rem] left-1/2 h-7 w-40 -translate-x-1/2 rounded-[50%] border" />
      <div className="bg-background border-border absolute bottom-[8.45rem] left-1/2 h-5 w-[8.75rem] -translate-x-1/2 rounded-[50%] border" />

      {/* 筒身：上下双沿 + 正面双环印章 */}
      <div className="bg-secondary border-border absolute bottom-0 left-1/2 flex h-36 w-44 -translate-x-1/2 items-center justify-center rounded-t-2xl rounded-b-[2rem] border-2 shadow-sm">
        <div className="bg-muted/70 border-border absolute inset-x-0 top-0 h-2.5 rounded-t-2xl border-b" />
        <div className="bg-muted/70 border-border absolute inset-x-2 bottom-0 h-2.5 rounded-b-[1.75rem] border-t" />
        <div className="border-fortune-good/30 flex size-[4.5rem] items-center justify-center rounded-full border">
          <div className="border-fortune-good/60 bg-card flex size-14 items-center justify-center rounded-full border-2">
            <span className="text-fortune-good text-2xl font-bold select-none">{label}</span>
          </div>
        </div>
      </div>

      {/* 底座托 */}
      <div className="bg-muted border-border absolute -bottom-1.5 left-1/2 h-3 w-48 -translate-x-1/2 rounded-full border" />
    </div>
  )
}
