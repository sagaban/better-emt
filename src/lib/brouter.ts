import type { Itinerary, LngLat } from './types'
import carrilProfile from './brouter-carril.brf?raw'

// BRouter (https://brouter.de): enrutador ciclista sobre OpenStreetMap.
// - "safety" prioriza carriles bici y vías tranquilas sin alargar mucho la ruta.
// - Perfil propio "máximo carril bici": penaliza mucho lo que no es infraestructura ciclista
//   dedicada y acepta rodeos (ver brouter-carril.brf).
const BROUTER_URL = 'https://brouter.de/brouter'
/** Velocidad media urbana para estimar la duración (BRouter es optimista en ciudad). */
const BIKE_KMH = 15

type Feature = GeoJSON.Feature<GeoJSON.LineString, { 'track-length': string }>

// El servidor guarda los perfiles subidos de forma temporal: se sube una vez por sesión
// y se vuelve a subir si deja de existir.
let carrilProfileId: Promise<string> | null = null
function uploadCarrilProfile(): Promise<string> {
  carrilProfileId ??= fetch(`${BROUTER_URL}/profile`, { method: 'POST', body: carrilProfile })
    .then((r) => r.json())
    .then((d: { profileid?: string; error?: string }) => {
      if (!d.profileid) throw new Error(d.error ?? 'No se pudo subir el perfil')
      return d.profileid
    })
    .catch((e) => {
      carrilProfileId = null
      throw e
    })
  return carrilProfileId
}

async function fetchRoute(from: LngLat, to: LngLat, profile: string, idx: number, signal?: AbortSignal) {
  const url =
    `${BROUTER_URL}?lonlats=${from.lon.toFixed(6)},${from.lat.toFixed(6)}|${to.lon.toFixed(6)},${to.lat.toFixed(6)}` +
    `&profile=${profile}&alternativeidx=${idx}&format=geojson`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`BRouter respondió ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const data: GeoJSON.FeatureCollection = await res.json()
  const f = data.features?.[0] as Feature | undefined
  if (!f?.geometry?.coordinates?.length) throw new Error('BRouter no encontró ruta')
  return f
}

async function fetchCarrilRoute(from: LngLat, to: LngLat, signal?: AbortSignal) {
  try {
    return await fetchRoute(from, to, await uploadCarrilProfile(), 0, signal)
  } catch (e) {
    if (signal?.aborted) throw e
    // Puede que el servidor haya borrado el perfil: subirlo de nuevo y reintentar una vez
    carrilProfileId = null
    return fetchRoute(from, to, await uploadCarrilProfile(), 0, signal)
  }
}

function toItinerary(f: Feature, label: string, from: LngLat, to: LngLat, when: Date | null, arriveBy: boolean): Itinerary {
  const distance = Number(f.properties['track-length'])
  const durationMs = (distance / 1000 / BIKE_KMH) * 3_600_000
  const ref = when ?? new Date()
  const start = arriveBy ? new Date(ref.getTime() - durationMs) : ref
  const end = new Date(start.getTime() + durationMs)
  const geometry = f.geometry.coordinates.map((c) => [c[0], c[1]] as [number, number])
  return {
    start,
    end,
    durationMs,
    walkDistance: 0,
    walkTimeMs: 0,
    waitingTimeMs: 0,
    transfers: 0,
    source: 'brouter',
    label,
    legs: [
      {
        mode: 'BICYCLE',
        numIntermediateStops: 0,
        start,
        end,
        durationMs,
        distance,
        from: { ...from, name: '' },
        to: { ...to, name: '' },
        geometry,
        intermediateStops: [],
        steps: [],
      },
    ],
  }
}

const trackLength = (f: Feature) => Number(f.properties['track-length'])

/** ¿Son prácticamente la misma ruta? (misma longitud y mismos puntos intermedios) */
function sameRoute(a: Feature, b: Feature) {
  if (Math.abs(trackLength(a) - trackLength(b)) / trackLength(a) > 0.02) return false
  const pa = a.geometry.coordinates, pb = b.geometry.coordinates
  const sample = (p: number[][], t: number) => p[Math.floor((p.length - 1) * t)]
  return [0.25, 0.5, 0.75].every((t) => {
    const x = sample(pa, t), y = sample(pb, t)
    return Math.abs(x[0] - y[0]) < 0.0015 && Math.abs(x[1] - y[1]) < 0.0015
  })
}

/** Variantes en bici: equilibrada, máximo carril bici y alternativa (sin duplicados). */
export async function fetchBikeRoutes(
  from: LngLat,
  to: LngLat,
  when: Date | null,
  arriveBy: boolean,
  signal?: AbortSignal,
): Promise<Itinerary[]> {
  const [safety, carril, alt] = await Promise.allSettled([
    fetchRoute(from, to, 'safety', 0, signal),
    fetchCarrilRoute(from, to, signal),
    fetchRoute(from, to, 'safety', 1, signal),
  ])
  const found: [Feature, string][] = []
  if (safety.status === 'fulfilled') found.push([safety.value, 'Equilibrada'])
  if (carril.status === 'fulfilled') {
    const dup = found.find(([f]) => sameRoute(f, carril.value))
    if (dup) dup[1] = 'Equilibrada · máximo carril bici'
    else found.push([carril.value, 'Máximo carril bici'])
  }
  if (alt.status === 'fulfilled' && !found.some(([f]) => sameRoute(f, alt.value))) found.push([alt.value, 'Alternativa'])
  if (!found.length) throw safety.status === 'rejected' ? safety.reason : new Error('BRouter no encontró ruta')
  return found.map(([f, label]) => toItinerary(f, label, from, to, when, arriveBy))
}
