import { query } from './pool.js'

export async function upsertEnrollment(params: {
  userId: string
  enrollmentId: string
  accessToken: string
  institutionName: string | null
}): Promise<void> {
  await query(
    `INSERT INTO teller_enrollments (user_id, enrollment_id, access_token, institution_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, enrollment_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       institution_name = EXCLUDED.institution_name`,
    [
      params.userId,
      params.enrollmentId,
      params.accessToken,
      params.institutionName,
    ],
  )
}

export async function deleteEnrollment(
  userId: string,
  enrollmentId: string,
): Promise<void> {
  await query(
    `DELETE FROM teller_enrollments WHERE user_id = $1 AND enrollment_id = $2`,
    [userId, enrollmentId],
  )
}

export async function clearEnrollmentsForUser(userId: string): Promise<void> {
  await query(`DELETE FROM teller_enrollments WHERE user_id = $1`, [userId])
}

export async function listEnrollmentsForUser(
  userId: string,
): Promise<Map<string, string>> {
  const { rows } = await query<{ enrollment_id: string; access_token: string }>(
    `SELECT enrollment_id, access_token FROM teller_enrollments WHERE user_id = $1`,
    [userId],
  )
  const m = new Map<string, string>()
  for (const r of rows) m.set(r.enrollment_id, r.access_token)
  return m
}
