export interface KeyEventInput {
  key: string
  code: string
  keyCode?: number
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

export interface KeyInfo {
  key: string
  code: string
  /** 未知时为 -1（keyCode 已废弃，部分环境可能不提供） */
  keyCode: number
  /** 修饰键名，固定顺序 alt/ctrl/meta/shift */
  modifiers: string[]
}

/** 修饰键输出顺序（稳定），与 i18n 的 mod-* 键对应 */
export const modifierKeys = ['alt', 'ctrl', 'meta', 'shift'] as const

export interface CommonKey {
  key: string
  code: string
  keyCode: number
}

/** 内置常见按键表：key / code / keyCode（按 KeyboardEvent.keyCode 的传统约定值） */
export const commonKeys: readonly CommonKey[] = [
  { key: 'Enter', code: 'Enter', keyCode: 13 },
  { key: 'Tab', code: 'Tab', keyCode: 9 },
  { key: ' ', code: 'Space', keyCode: 32 },
  { key: 'Escape', code: 'Escape', keyCode: 27 },
  { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  { key: 'Delete', code: 'Delete', keyCode: 46 },
  { key: 'Insert', code: 'Insert', keyCode: 45 },
  { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  { key: 'Home', code: 'Home', keyCode: 36 },
  { key: 'End', code: 'End', keyCode: 35 },
  { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  { key: 'a', code: 'KeyA', keyCode: 65 },
  { key: 'z', code: 'KeyZ', keyCode: 90 },
  { key: '0', code: 'Digit0', keyCode: 48 },
  { key: '1', code: 'Digit1', keyCode: 49 },
  { key: 'Shift', code: 'ShiftLeft', keyCode: 16 },
  { key: 'Control', code: 'ControlLeft', keyCode: 17 },
  { key: 'Alt', code: 'AltLeft', keyCode: 18 },
  { key: 'Meta', code: 'MetaLeft', keyCode: 91 },
  { key: 'F1', code: 'F1', keyCode: 112 },
  { key: 'F5', code: 'F5', keyCode: 116 },
]

/** 从按键事件字段提取展示信息：keyCode 缺失记为 -1，修饰键按固定顺序输出 */
export function buildKeyInfo(event: KeyEventInput): KeyInfo {
  return {
    key: event.key,
    code: event.code,
    keyCode: event.keyCode ?? -1,
    modifiers: modifierKeys.filter((modifier) => {
      const flag = {
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey,
      }[modifier]
      return flag === true
    }),
  }
}
