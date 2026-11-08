import type { Itinerary, LngLat } from './types'

// BRouter (https://brouter.de): enrutador ciclista sobre OpenStreetMap. El perfil "safety"
// prioriza carriles bici y vías tranquilas, que es lo que el OTP de EMT no permite.
const BROUTER_URL = 'https://brouter.de/brouter'
/** Velocidad media urbana para estimar la duración (BRouter es optimista en ciudad). */
const BIKE_KMH = 15

type Feature = GeoJSON.Feature<GeoJSON.LineString, { 'track-length': string }>

async function fetchAlternative(from: LngLat, to: LngLat, idx: number, signal?: AbortSignal) {
  const url =
    `${BROUTER_URL}?lonlats=${from.lon.toFixed(6)},${from.lat.toFixed(6)}|${to.lon.toFixed(6)},${to.lat.toFixed(6)}` +
    `&profile=safety&alternativeidx=${idx}&format=geojson`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`BRouter respondió ${res.status}`)
  const data: GeoJSON.FeatureCollection = await res.json()
  const f = data.features?.[0] as Feature | undefined
  if (!f?.geometry?.coordinates?.length) throw new Error('BRouter no encontró ruta')
  return f
}

function toItinerary(f: Feature, from: LngLat, to: LngLat, when: Date | null, arriveBy: boolean): Itinerary {
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

/** Ruta principal y, si existe y es distinta, una alternativa. */
export async function fetchBikeRoutes(
  from: LngLat,
  to: LngLat,
  when: Date | null,
  arriveBy: boolean,
  signal?: AbortSignal,
): Promise<Itinerary[]> {
  const [main, alt] = await Promise.allSettled([0, 1].map((i) => fetchAlternative(from, to, i, signal)))
  if (main.status === 'rejected') throw main.reason
  const routes = [main.value]
  if (alt.status === 'fulfilled') {
    const a = Number(main.value.properties['track-length'])
    const b = Number(alt.value.properties['track-length'])
    if (Math.abs(a - b) / a > 0.03) routes.push(alt.value)
  }
  return routes.map((f) => toItinerary(f, from, to, when, arriveBy))
}
