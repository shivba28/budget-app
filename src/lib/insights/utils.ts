export function monthKeyFromParts(y: number, m1to12: number): string {
  return `${y}-${String(m1to12).padStart(2, '0')}`
}

export function monthKeyFromIsoDate(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string' || iso.length < 7) return null
  return iso.slice(0, 7)
}

export function shiftMonth(
  y: number,
  m1to12: number,
  delta: number,
): { y: number; m: number } {
  const d = new Date(y, m1to12 - 1 + delta, 1)
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

export function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0
  const m = mean(nums)
  const v = mean(nums.map((x) => (x - m) ** 2))
  return Math.sqrt(v)
}

export function normalizeMerchant(description: string): string {
  return description.trim().toLowerCase().slice(0, 120) || '(unknown)'
}

export function parseUtcDay(iso: string): number {
  const s = iso.length >= 10 ? iso.slice(0, 10) : iso
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : NaN
}

/** YYYY-MM-DD from transaction date / effective_date (first 10 chars). */
export function effectiveDayKey(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string' || iso.length < 10) return null
  const d = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return d
}

export function monthCalendarRange(
  year: number,
  month1to12: number,
): { start: string; end: string } {
  const start = `${year}-${String(month1to12).padStart(2, '0')}-01`
  const dim = daysInMonth(year, month1to12)
  const end = `${year}-${String(month1to12).padStart(2, '0')}-${String(dim).padStart(2, '0')}`
  return { start, end }
}

export function dayKeyCompare(a: string, b: string): number {
  return a.localeCompare(b)
}

export function formatSpendRangeLabel(start: string, end: string): string {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, (m ?? 1) - 1, d ?? 1)
  }
  const a = parse(start)
  const b = parse(end)
  const sameMonth =
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
  const opt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  if (start === end) return a.toLocaleDateString(undefined, opt)
  if (sameMonth) {
    const monthShort = a.toLocaleString(undefined, { month: 'short' })
    return `${monthShort} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}`
  }
  return `${a.toLocaleDateString(undefined, opt)} – ${b.toLocaleDateString(undefined, opt)}`
}

