import { query } from './pool.js'

export type DbCategoryRow = {
  user_id: string
  id: string
  label: string
  color: string
  source: string
  created_at: string
}

export type Category = {
  id: string
  label: string
  color: string
  source: 'teller' | 'user'
}

export function slugifyId(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'category'
}

export function tellerCategoryIdFromLabel(label: string): string {
  return `teller:${slugifyId(label)}`
}

export function userCategoryIdFromLabel(label: string): string {
  return `user:${slugifyId(label)}`
}

export async function upsertCategory(params: {
  userId: string
  id: string
  label: string
  color?: string | null
  source: 'teller' | 'user'
}): Promise<void> {
  const color = (params.color ?? '').trim() || '#94a3b8'
  await query(
    `INSERT INTO categories (user_id, id, label, color, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, id) DO UPDATE SET
       label = EXCLUDED.label,
       color = COALESCE(NULLIF(categories.color, ''), EXCLUDED.color)`,
    [params.userId, params.id, params.label, color, params.source],
  )
}

export async function listCategoriesForUser(userId: string): Promise<Category[]> {
  const { rows } = await query<DbCategoryRow>(
    `SELECT user_id, id, label, color, source, created_at
     FROM categories
     WHERE user_id = $1
     ORDER BY label ASC`,
    [userId],
  )
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    color: r.color,
    source: r.source === 'user' ? 'user' : 'teller',
  }))
}

export async function deleteCategoryForUser(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM categories WHERE user_id = $1 AND id = $2`,
    [userId, id],
  )
  return (rowCount ?? 0) > 0
}

export async function updateCategoryColorForUser(params: {
  userId: string
  id: string
  color: string
}): Promise<boolean> {
  const color = params.color.trim()
  const { rowCount } = await query(
    `UPDATE categories SET color = $3 WHERE user_id = $1 AND id = $2`,
    [params.userId, params.id, color],
  )
  return (rowCount ?? 0) > 0
}

