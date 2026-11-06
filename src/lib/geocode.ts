import type { LngLat } from './types'

const NOMINATIM = 'https://nominatim.openstreetmap.org'
// Área metropolitana de València (lon izq, lat sup, lon der, lat inf)
const VIEWBOX = '-0.55,39.58,-0.27,39.36'

export type SearchResult = LngLat & { label: string; detail: string }

type NominatimItem = {
  lat: string
  lon: string
  display_name: string
  name?: string
  address?: Record<string, string>
}

function shortLabel(item: NominatimItem): { label: string; detail: string } {
  const a = item.address ?? {}
  const street = a.road ?? a.pedestrian ?? a.square ?? a.footway
  const main = item.name || (street ? `${street}${a.house_number ? ' ' + a.house_number : ''}` : undefined)
  const area = a.suburb ?? a.city_district ?? a.neighbourhood ?? a.city ?? a.town ?? a.village
  return {
    label: main || item.display_name.split(',')[0],
    detail: [main && street && main !== street ? street : null, area].filter(Boolean).join(', '),
  }
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const url = new URL(`${NOMINATIM}/search`)
  url.search = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    viewbox: VIEWBOX,
    bounded: '1',
    'accept-language': 'es',
    countrycodes: 'es',
  }).toString()
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Error buscando la dirección')
  const items: NominatimItem[] = await res.json()
  return items.map((it) => ({ lat: Number(it.lat), lon: Number(it.lon), ...shortLabel(it) }))
}

export async function reverseGeocode(p: LngLat, signal?: AbortSignal): Promise<string | null> {
  const url = new URL(`${NOMINATIM}/reverse`)
  url.search = new URLSearchParams({
    lat: String(p.lat),
    lon: String(p.lon),
    format: 'jsonv2',
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'es',
  }).toString()
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const item: NominatimItem & { error?: string } = await res.json()
    if (item.error) return null
    return shortLabel(item).label
  } catch {
    return null
  }
}
