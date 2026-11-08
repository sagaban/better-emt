import { decodePolyline } from './polyline'
import type { Itinerary, Leg, PlanRequest, Stop, WalkStep } from './types'

const OTP_URL = 'https://geoportal.emtvalencia.es/opentripplanner-api-webapp/ws/plan'

// El OTP de EMT serializa XML a JSON: listas de un solo elemento llegan como objeto y
// todos los valores llegan como cadenas.
const toArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v))

const pad = (n: number) => String(n).padStart(2, '0')

export class PlanError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any

function mapStop(raw: Raw): Stop {
  return {
    name: raw?.name ?? '',
    stopId: raw?.stopId || undefined,
    lat: num(raw?.lat),
    lon: num(raw?.lon),
  }
}

function mapLeg(raw: Raw): Leg {
  const steps: WalkStep[] = toArray<Raw>(raw.steps?.walkSteps).map((s) => ({
    streetName: s.streetName,
    distance: num(s.distance),
    absoluteDirection: s.absoluteDirection,
    relativeDirection: s.relativeDirection,
  }))
  return {
    mode: raw['@mode'],
    route: raw['@route'] || undefined,
    routeColor: raw['@routeColor'] ? `#${raw['@routeColor']}` : undefined,
    headsign: raw['@headsign'] || undefined,
    numIntermediateStops: num(raw['@numIntermediateStops']),
    start: new Date(raw.startTime),
    end: new Date(raw.endTime),
    durationMs: num(raw.duration),
    distance: num(raw.distance),
    from: mapStop(raw.from),
    to: mapStop(raw.to),
    geometry: raw.legGeometry?.points ? decodePolyline(raw.legGeometry.points) : [],
    intermediateStops: toArray<Raw>(raw.intermediateStops?.stop).map(mapStop),
    steps,
  }
}

function mapItinerary(raw: Raw): Itinerary {
  return {
    start: new Date(raw.startTime),
    end: new Date(raw.endTime),
    durationMs: num(raw.duration),
    walkDistance: num(raw.walkDistance),
    walkTimeMs: num(raw.walkTime),
    waitingTimeMs: num(raw.waitingTime),
    transfers: num(raw.transfers),
    legs: toArray<Raw>(raw.legs?.leg).map(mapLeg),
  }
}

export async function fetchPlan(req: PlanRequest, signal?: AbortSignal): Promise<Itinerary[]> {
  const d = req.when ?? new Date()
  const yy = pad(d.getFullYear() % 100)
  const params = [
    `fromPlace=${req.from.lat.toFixed(6)}%2C${req.from.lon.toFixed(6)}`,
    `toPlace=${req.to.lat.toFixed(6)}%2C${req.to.lon.toFixed(6)}`,
    `time=${pad(d.getHours())}:${pad(d.getMinutes())}`,
    `date=${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${yy}`,
    `dateEnglish=${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${yy}`,
    `mode=${req.mode === 'bike' ? 'BICYCLE' : 'BUSISH,WALK'}`,
    `arriveBy=${req.arriveBy}`,
    'wheelchair=false',
    `optimize=${req.optimize}`,
    `maxWalkDistance=${req.maxWalkDistance}`,
    'intermediatePlaces',
  ].join('&')

  const res = await fetch(`${OTP_URL}?${params}`, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) throw new PlanError('El servidor de EMT ha respondido con un error.')
  const data: Raw = await res.json()
  if (data.error) {
    throw new PlanError(
      data.error.msg?.replace(/\s+/g, ' ').trim() ||
        'No se ha encontrado ninguna ruta. Prueba con otro punto o más distancia a pie.',
    )
  }
  const its = toArray<Raw>(data.plan?.itineraries?.itinerary ?? data.plan?.itinerary).map(mapItinerary)
  if (its.length === 0) throw new PlanError('No se ha encontrado ninguna ruta.')
  return its
}
