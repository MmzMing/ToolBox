/**
 * 表达式包的注册器。
 *
 * `reg('cam', key, def)` 与直接写对象字面量的区别只有一处：这里让 `plan` 的返回字面量类型
 * 成为 `get(env, p)` / `draw(env, p)` / `apply(env, it, p)` 里 `p` 的类型。于是部件的几何代码里
 * `p.a * 2`、`p.path === 'search'` 都是原生类型，不必对每个字段再收窄一次。
 *
 * 没有 `plan` 的回调仍拿 `Params`；`layout` 一族的参数从 `env.cut.params` 读，不走这里。
 */
import type {
  AnimDef,
  BgDef,
  CamDef,
  CamState,
  DecorDef,
  Env,
  FxDef,
  GroupKey,
  LayoutDef,
  PackParts,
  Params,
  Rng,
  StylePack,
  TextItem,
  TransDef,
  TransInfo,
  TreatDef,
} from './types'

/** 把 plan 的产物接到主回调上的三组（各自只差主回调的名字与返回类型） */
type CamWith<P extends Params> = Omit<CamDef, 'get' | 'plan'> & {
  plan?: (rng: Rng, st: StylePack) => P
  get: (env: Env, p: P) => CamState
}
type BgWith<P extends Params> = Omit<BgDef, 'draw' | 'plan'> & {
  plan?: (rng: Rng, st: StylePack) => P
  draw: (env: Env, p: P) => void
}
type TreatWith<P extends Params> = Omit<TreatDef, 'apply' | 'plan'> & {
  plan?: (rng: Rng, st: StylePack) => P
  apply: (env: Env, it: TextItem, p: P) => void
}
type TransWith<P extends Params> = Omit<TransDef, 'draw' | 'plan'> & {
  plan?: (rng: Rng, st: StylePack) => P
  draw: (
    ctx: CanvasRenderingContext2D,
    a: HTMLCanvasElement,
    b: HTMLCanvasElement,
    p: number,
    info: TransInfo & { P: P },
  ) => void
}

/** 一个包用的注册器 */
export type PartsReg = {
  <P extends Params>(g: 'cam', key: string, def: CamWith<P>): void
  <P extends Params>(g: 'bg', key: string, def: BgWith<P>): void
  <P extends Params>(g: 'treat', key: string, def: TreatWith<P>): void
  <P extends Params>(g: 'trans', key: string, def: TransWith<P>): void
  (g: 'layout', key: string, def: LayoutDef): void
  (g: 'enter' | 'hold' | 'exit', key: string, def: AnimDef): void
  (g: 'decor', key: string, def: DecorDef): void
  (g: 'fx', key: string, def: FxDef): void
  (g: GroupKey, key: string, def: unknown): void
}

/** 取一个包的注册器：调用形式与 `J.register` 一致 `reg('cam', key, def)` */
export function packOf(out: PackParts): PartsReg {
  return function reg(g: GroupKey, key: string, def: unknown): void {
    const box = (out[g] ?? (out[g] = {})) as Record<string, unknown>
    box[key] = def
  } as PartsReg
}

/** 只注册构图的包用这个（省得每次写分组名） */
export function layoutsOf(out: PackParts): (key: string, def: LayoutDef) => void {
  const reg = packOf(out)
  return (key, def) => reg('layout', key, def)
}
