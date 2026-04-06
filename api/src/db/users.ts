import { query } from './pool.js'

export async function upsertUser(params: {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
}): Promise<void> {
  await query(
    `INSERT INTO users (id, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       avatar_url = EXCLUDED.avatar_url`,
    [params.id, params.email, params.name, params.avatarUrl],
  )
}
