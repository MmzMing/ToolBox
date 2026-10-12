import type { FluidOrbProps } from '@/components/fluid-orb/types'
import type { TourKey } from '@/modules/page-tour/targets'
import type { VoiceLine } from '@/modules/page-tour/tour-voice'

/**
 * AI 悬浮球的产品级配置。
 *
 * `enabled` 是代码级 kill switch：false 时入口完全不渲染、不创建 WebGL 上下文。
 * 这是这颗球唯一的开关——它目前不发任何请求，所以不挂 `toolbox.ai` 那道用户总开关
 * （那道门守的是数据流向，管不着一个装饰效果）。接上 AI 动作后再把门加回来。
 *
 * `orb` 直接展开成 FluidOrb 的 props，未列出的项走 orbDefaults（= 参数表默认值）。
 * 调效果就改这里，改完刷新即可，没有运行时调参界面。
 */
export type AIOrbConfig = {
  enabled: boolean
  dock: {
    side: 'left' | 'right'
    /** 桌面档直径（px） */
    size: number
    /** 手机档直径：右侧竖边空间窄，收小一档免得压到内容 */
    mobileSize: number
  }
  orb: Partial<FluidOrbProps>
  tour: {
    /** 配音总开关：false 时不建 AudioContext、不请求任何音效；气泡右上角那枚是重播键 */
    sound: boolean
    /** 每一步用哪套人声。想手调某句的语气，给它显式 clips 数组即可 */
    lines: Record<TourKey, VoiceLine>
  }
}

export const aiOrbConfig: AIOrbConfig = {
  enabled: true,
  dock: {
    // 桌面 dock 在左、手机 dock 在底且折到右下时有折叠键，右侧垂直居中是唯一不撞的位置
    side: 'right',
    size: 76,
    mobileSize: 60,
  },
  orb: {
    colors: ['#ff006e', '#8338ec', '#3a86ff', '#06ffa5'],
    /** 轮廓摆动幅度：参考图几乎是正圆，多了就成水母 */
    wobble: 0.25,
    /** 玻璃罩折射强度：越大边缘弯折越狠，立体感越强 */
    refraction: 1.35,
    /** 贴边那条焦散 / 色散带的宽度 */
    shellWidth: 1.15,
    halo: 1.4,
    glowIntensity: 0.9,
    /** 眼睛：颜色走主题 foreground 令牌，暗底近白、亮底近黑，并跟随鼠标 */
    eyes: true,
    mood: 'idle',
    /** 多久换一张脸（ms，区间内随机）。一分钟一档：常驻装饰，换太快就从"有生命"变成"在闪" */
    eyeHoldMs: [45000, 75000],
    /** 多久眨一次眼（ms）。比换脸勤得多——十几秒不眨就已经看着像死物了 */
    eyeBlinkMs: [4000, 9000],
  },
  tour: {
    sound: true,
    lines: {
      // 不写 clips 就按正文一字一音推导（同一句话永远同一个调）。
      // 想手调某句的语气，给它一个 clips 数组即可，见 tour-voice.ts 的 VoiceLine。
      dock: { emotion: 'normal' },
      search: { emotion: 'determined' },
      topNav: { emotion: 'normal' },
      circuit: { emotion: 'surprised' },
    },
  },
}
