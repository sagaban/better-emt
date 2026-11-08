import type { LaneRun } from './types'

// Red ciclista del Ajuntament de València (capa "Itinerarios Ciclistas" del geoportal municipal,
// la misma que usa el visor de EMT).
const LANES_URL =
  'https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/189/query' +
  '?where=1%3D1&outFields=estado&outSR=4326&geometryPrecision=5&f=geojson'

export type LaneKind = 'protegido' | 'compartido' | 'peatonal' | 'obras'

/** Códigos del campo `estado` → categoría para pintar. */
const KIND_BY_CODE: Record<string, LaneKind> = {
  '1': 'protegido', // Carril bici
  '4': 'protegido', // Carril bici Jardín del Túria
  '6': 'protegido', // Senda ciclable
  '8': 'protegido', // Red ciclista fuera del término municipal
  '2': 'compartido', // Ciclocalle
  '7': 'compartido', // Carril bus-bici
  '9': 'compartido', // Ciclobarrio
  '3': 'peatonal', // Calles peatonales
  '5': 'obras', // Cortado por obras
}

export const LANE_LEGEND: { kind: LaneKind; label: string; color: string }[] = [
  { kind: 'protegido', label: 'Carril bici / senda', color: '#16a34a' },
  { kind: 'compartido', label: 'Ciclocalle / bus-bici', color: '#2563eb' },
  { kind: 'peatonal', label: 'Calle peatonal', color: '#a855f7' },
  { kind: 'obras', label: 'Cortado por obras', color: '#dc2626' },
]

export type BikeLanes = GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString, { kind: LaneKind }>

export async function fetchBikeLanes(signal?: AbortSignal): Promise<BikeLanes> {
  const res = await fetch(LANES_URL, { signal })
  if (!res.ok) throw new Error('No se pudo cargar la red ciclista')
  const raw: GeoJSON.FeatureCollection = await res.json()
  return {
    type: 'FeatureCollection',
    features: raw.features
      .filter((f) => f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'))
      .map((f) => ({
        type: 'Feature',
        geometry: f.geometry as GeoJSON.LineString | GeoJSON.MultiLineString,
        properties: { kind: KIND_BY_CODE[String(f.properties?.estado)] ?? 'compartido' },
      })),
  }
}

// --- Índice espacial para saber si un punto de la ruta va por la red ciclista ---

type Pt = [number, number]
type Seg = [Pt, Pt]
const CELL = 0.002 // ~170 m
const M_PER_DEG = 111_320

export type LaneIndex = { grid: Map<string, Seg[]> }

export function buildLaneIndex(lanes: BikeLanes): LaneIndex {
  const grid = new Map<string, Seg[]>()
  for (const f of lanes.features) {
    // Las calles peatonales y los tramos en obras no cuentan como "carril bici"
    if (f.properties.kind === 'peatonal' || f.properties.kind === 'obras') continue
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates]
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1] as Pt
        const b = line[i] as Pt
        const seg: Seg = [a, b]
        for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++)
          for (let y = Math.floor(Math.min(a[1], b[1]) / CELL); y <= Math.floor(Math.max(a[1], b[1]) / CELL); y++) {
            const k = `${x},${y}`
            const list = grid.get(k)
            if (list) list.push(seg)
            else grid.set(k, [seg])
          }
      }
    }
  }
  return { grid }
}

function distToSeg(p: Pt, [a, b]: Seg): number {
  const k = Math.cos((p[1] * Math.PI) / 180) * M_PER_DEG
  const px = p[0] * k, py = p[1] * M_PER_DEG
  const ax = a[0] * k, ay = a[1] * M_PER_DEG
  const dx = b[0] * k - ax, dy = b[1] * M_PER_DEG - ay
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

function onLane(index: LaneIndex, p: Pt, tolerance = 15): boolean {
  const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
  for (let x = cx - 1; x <= cx + 1; x++)
    for (let y = cy - 1; y <= cy + 1; y++)
      for (const s of index.grid.get(`${x},${y}`) ?? []) if (distToSeg(p, s) < tolerance) return true
  return false
}

function meters(a: Pt, b: Pt) {
  const k = Math.cos((a[1] * Math.PI) / 180) * M_PER_DEG
  return Math.hypot((b[0] - a[0]) * k, (b[1] - a[1]) * M_PER_DEG)
}


/** Parte una ruta en tramos por carril bici / fuera de carril y calcula la proporción. */
export function splitByLanes(coords: Pt[], index: LaneIndex, step = 8): { runs: LaneRun[]; share: number } {
  // densificar para no saltarse tramos cortos
  const pts: Pt[] = []
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i]
    const n = Math.max(1, Math.floor(meters(a, b) / step))
    for (let j = 0; j < n; j++) pts.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n])
  }
  if (coords.length) pts.push(coords[coords.length - 1])
  if (pts.length < 2) return { runs: [], share: 0 }

  const flags = pts.map((p) => onLane(index, p))
  // suavizar: huecos de un solo punto no rompen el tramo
  for (let i = 1; i < flags.length - 1; i++) if (flags[i - 1] === flags[i + 1] && flags[i] !== flags[i - 1]) flags[i] = flags[i - 1]

  const runs: LaneRun[] = []
  let laneLen = 0, total = 0
  for (let i = 1; i < pts.length; i++) {
    const d = meters(pts[i - 1], pts[i])
    const flag = flags[i - 1] && flags[i]
    total += d
    if (flag) laneLen += d
    const last = runs[runs.length - 1]
    if (last && last.onLane === flag) last.coords.push(pts[i])
    else runs.push({ coords: [pts[i - 1], pts[i]], onLane: flag })
  }
  return { runs, share: total ? laneLen / total : 0 }
}
