import { Extension } from '@tiptap/core'

/**
 * 连续空格时补一个不换行空格。
 *
 * 中文简历里常用空格对齐（如「主修课程：  数据结构」），HTML 会把连续空白折叠掉，
 * 编辑器里看着对齐、纸张里就散了。
 */
export const BetterSpace = Extension.create({
  name: 'betterSpace',

  addKeyboardShortcuts() {
    return {
      Space: ({ editor }) => {
        const { selection } = editor.state
        const previousChar = selection.$from.nodeBefore?.text?.slice(-1)

        if (previousChar !== ' ') {
          return false
        }

        editor.view.dispatch(editor.state.tr.insertText('\u00A0'))
        return true
      },
    }
  },
})
