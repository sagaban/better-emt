export type LngLat = { lat: number; lon: number }

export type Place = LngLat & {
  label: string
  source: 'gps' | 'map' | 'search' | 'favorite'
}

export type Stop = LngLat & { name: string; stopId?: string }

export type WalkStep = { streetName: string; distance: number; absoluteDirection?: string; relativeDirection?: string }

export type Leg = {
  mode: 'WALK' | 'BUS' | string
  route?: string
  routeColor?: string
  headsign?: string
  numIntermediateStops: number
  start: Date
  end: Date
  durationMs: number
  distance: number
  from: Stop
  to: Stop
  geometry: [number, number][]
  intermediateStops: Stop[]
  steps: WalkStep[]
}

export type Itinerary = {
  start: Date
  end: Date
  durationMs: number
  walkDistance: number
  walkTimeMs: number
  waitingTimeMs: number
  transfers: number
  legs: Leg[]
}

export type Optimize = 'QUICK' | 'TRANSFERS'

export type PlanRequest = {
  from: LngLat
  to: LngLat
  /** null = salir ahora */
  when: Date | null
  arriveBy: boolean
  optimize: Optimize
  maxWalkDistance: number
}
