export const tokens = {
  color: {
    bg: '#F5F0E8',
    fg: '#111111',
    border: '#111111',
    accent: '#F5E642',
    debit: '#E63946',
    credit: '#8DB580',
    muted: '#D8D1C7',
    card: '#FFFFFF',
  },
  radius: {
    sm: 4,
    md: 6,
  },
  border: {
    w2: 2,
    w3: 3,
    w4: 4,
  },
  shadow: {
    offsetX: 4,
    offsetY: 4,
  },
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
  },
  font: {
    display: 'System',
    mono: 'System',
  },
} as const

export type Tokens = typeof tokens

