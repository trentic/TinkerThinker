interface TrendChartProps {
  points: number[] // oldest to newest
  zeroLineLabel?: string
}

/** Compact inline SVG line chart — no charting library needed for a single
 * sparkline-style trend. Draws a "par" reference line at 0 since this is
 * built specifically for to-par-over-time. */
export function TrendChart({ points, zeroLineLabel = 'Par' }: TrendChartProps) {
  if (points.length < 2) return null

  const width = 320
  const height = 100
  const padX = 8
  const padY = 16
  const min = Math.min(0, ...points)
  const max = Math.max(0, ...points)
  const range = max - min || 1

  const x = (i: number) => padX + (i / (points.length - 1)) * (width - padX * 2)
  const y = (v: number) => padY + (1 - (v - min) / range) * (height - padY * 2)
  const zeroY = y(0)

  const linePath = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1)} ${zeroY} L ${x(0)} ${zeroY} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Score trend">
      <line
        x1={padX}
        x2={width - padX}
        y1={zeroY}
        y2={zeroY}
        stroke="var(--ink-muted)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <text x={width - padX} y={zeroY - 4} textAnchor="end" fontSize="9" fill="var(--ink-muted)">
        {zeroLineLabel}
      </text>
      <path d={areaPath} fill="var(--color-green)" opacity={0.15} />
      <path d={linePath} fill="none" stroke="var(--color-green)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="var(--color-green)" />
      ))}
    </svg>
  )
}
