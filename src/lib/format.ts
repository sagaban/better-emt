const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

export const fmtTime = (d: Date) => timeFmt.format(d)

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

export function minutesFromNow(d: Date): number {
  return Math.round((d.getTime() - Date.now()) / 60000)
}

/** Color de texto legible sobre un fondo hex. */
export function contrastText(hex?: string): string {
  if (!hex) return '#fff'
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff'
}
