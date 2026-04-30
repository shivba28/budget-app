/**
 * Safely evaluates simple arithmetic expressions like "50+20", "100*1.1", "200/3".
 * Returns null for empty, invalid, or unsafe input.
 */
export function evaluateExpression(input: string): number | null {
  const s = input.replace(/\s/g, '')
  if (!s) return null

  let pos = 0

  function parseExpr(): number {
    let left = parseTerm()
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++]
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function parseTerm(): number {
    let left = parseFactor()
    while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
      const op = s[pos++]
      const right = parseFactor()
      if (op === '/') {
        if (right === 0) throw new Error('division by zero')
        left = left / right
      } else {
        left = left * right
      }
    }
    return left
  }

  function parseFactor(): number {
    if (s[pos] === '-') {
      pos++
      return -parseFactor()
    }
    if (s[pos] === '(') {
      pos++
      const val = parseExpr()
      if (s[pos] !== ')') throw new Error('expected )')
      pos++
      return val
    }
    return parseNumber()
  }

  function parseNumber(): number {
    const start = pos
    while (pos < s.length && /[0-9.]/.test(s[pos])) pos++
    if (pos === start) throw new Error('expected number at ' + pos)
    const n = parseFloat(s.slice(start, pos))
    if (isNaN(n)) throw new Error('invalid number')
    return n
  }

  try {
    const result = parseExpr()
    if (pos !== s.length) return null
    if (!isFinite(result)) return null
    return result
  } catch {
    return null
  }
}

/** True when the string contains arithmetic (not just a plain number). */
export function isArithmeticExpression(s: string): boolean {
  const trimmed = s.trim()
  if (!trimmed) return false
  // Strip a leading minus then check for any operator
  return /[+\-*/]/.test(trimmed.replace(/^-/, ''))
}

/** Format a number result — up to 2 decimals, no trailing zeros. */
export function formatExpressionResult(n: number): string {
  if (n % 1 === 0) return String(n)
  return parseFloat(n.toFixed(2)).toString()
}
