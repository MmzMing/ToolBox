import type { Ingredient, Recipe } from '../types'
import { CN_INGREDIENTS, CN_MARINADES, CN_SEASONINGS } from './chinese'
import { JP_INGREDIENTS, JP_RECIPES } from './japanese'
import { KR_INGREDIENTS, KR_RECIPES } from './korean'
import { US_INGREDIENTS, US_RECIPES } from './american'
import { STREET_INGREDIENTS } from './street'

export const INGREDIENTS: Ingredient[] = [
  ...CN_INGREDIENTS,
  ...STREET_INGREDIENTS,
  ...JP_INGREDIENTS,
  ...KR_INGREDIENTS,
  ...US_INGREDIENTS,
]

export const RECIPES: Recipe[] = [
  ...CN_MARINADES,
  ...CN_SEASONINGS,
  ...JP_RECIPES,
  ...KR_RECIPES,
  ...US_RECIPES,
]

export const INGREDIENT_BY_ID: Record<string, Ingredient> = Object.fromEntries(
  INGREDIENTS.map((item) => [item.id, item]),
)

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(
  RECIPES.map((item) => [item.id, item]),
)

/** 菜品选择器按采购分组呈现，这个顺序就是分组顺序（调料与耗材不算"菜"） */
export const DISH_GROUP_ORDER = [
  'mammal',
  'poultry',
  'seafood',
  'vegetable',
  'soy',
  'staple',
] as const

export * from './shared'
export * from './equipment'
export * from './safety'
export * from './timeline'
export * from './supplies'
