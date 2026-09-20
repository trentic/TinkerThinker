export function toParLabel(n: number | null): string {
  if (n === null) return '—'
  const rounded = Math.round(n * 10) / 10
  if (rounded === 0) return 'E'
  return rounded > 0 ? `+${rounded}` : String(rounded)
}
