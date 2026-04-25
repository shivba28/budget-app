import { eq } from 'drizzle-orm'

import { db } from '../client'
import { app_meta } from '../schema'

export function getMeta(key: string): string | undefined {
  const row = db.select().from(app_meta).where(eq(app_meta.key, key)).get()
  return row?.value
}

export function setMeta(key: string, value: string): void {
  db.insert(app_meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: app_meta.key, set: { value } })
    .run()
}

export function deleteMeta(key: string): void {
  db.delete(app_meta).where(eq(app_meta.key, key)).run()
}
