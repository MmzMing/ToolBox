import { useState } from 'react'

import { DISH_IMAGES } from '../data/dish-images'

/**
 * 菜品缩略图。图是 AI 生成的静态文件，放在 public/food 下、由 data/dish-images.ts 登记，
 * 没登记到或加载失败就退回首字占位，不联网、不兜第三方图床。
 */
export function DishThumb({ id, name }: { id: string; name: string }) {
  const image = DISH_IMAGES[id]
  const [failed, setFailed] = useState(false)

  if (!image || failed) {
    return (
      <span
        aria-hidden
        className="bg-muted text-muted-foreground grid size-14 shrink-0 place-items-center rounded-md text-base font-semibold"
      >
        {name.trim().slice(0, 1) || '·'}
      </span>
    )
  }

  return (
    <img
      src={image.src}
      alt=""
      title={image.license}
      loading="lazy"
      decoding="async"
      width={56}
      height={56}
      onError={() => setFailed(true)}
      className="bg-muted size-14 shrink-0 rounded-md object-cover"
    />
  )
}
