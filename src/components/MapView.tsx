import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap, MapMouseEvent, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// maplibre v6 resuelve el worker relativo a import.meta.url, lo que se rompe al empaquetar.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

maplibregl.setWorkerUrl(workerUrl)
import type { Itinerary, LngLat, Place } from '../lib/types'

export type Target = 'from' | 'to'

type Props = {
  from: Place | null
  to: Place | null
  userLocation: LngLat | null
  itinerary: Itinerary | null
  pickTarget: Target | null
  onPick: (target: Target, p: LngLat) => void
}

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const VALENCIA: [number, number] = [-0.3763, 39.4699]
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function pinElement(kind: Target) {
  const el = document.createElement('div')
  el.className = `pin pin-${kind}`
  el.innerHTML = `<span>${kind === 'from' ? 'A' : 'B'}</span>`
  return el
}

export function MapView({ from, to, userLocation, itinerary, pickTarget, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markers = useRef<Partial<Record<Target, Marker>>>({})
  const userMarker = useRef<Marker | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  // Refs para que los handlers del mapa vean siempre el último valor
  const pickRef = useRef(pickTarget)
  const onPickRef = useRef(onPick)
  pickRef.current = pickTarget
  const endpointsRef = useRef({ from, to })
  endpointsRef.current = { from, to }
  onPickRef.current = onPick

  // Inicializar mapa
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE,
      center: VALENCIA,
      zoom: 13,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        filter: ['==', ['get', 'mode'], 'BUS'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fff', 'line-width': 9 },
      })
      map.addLayer({
        id: 'route-bus',
        type: 'line',
        source: 'route',
        filter: ['==', ['get', 'mode'], 'BUS'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 5 },
      })
      map.addLayer({
        id: 'route-walk',
        type: 'line',
        source: 'route',
        filter: ['!=', ['get', 'mode'], 'BUS'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#555', 'line-width': 4, 'line-dasharray': [0.1, 2] },
      })
      map.addSource('stops', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'stops',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-radius': ['case', ['get', 'main'], 7, 3.5],
          'circle-color': '#fff',
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': ['case', ['get', 'main'], 3, 2],
        },
      })
      map.addLayer({
        id: 'stop-labels',
        type: 'symbol',
        source: 'stops',
        filter: ['get', 'main'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': '#222', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      })
    })

    map.on('click', (e: MapMouseEvent) => {
      const p = { lat: e.lngLat.lat, lon: e.lngLat.lng }
      if (pickRef.current) {
        onPickRef.current(pickRef.current, p)
        return
      }
      // Sin modo selección: menú "Salir desde aquí / Ir aquí"
      popupRef.current?.remove()
      const el = document.createElement('div')
      el.className = 'map-menu'
      for (const [target, label] of [
        ['from', 'Salir desde aquí'],
        ['to', 'Ir aquí'],
      ] as const) {
        const btn = document.createElement('button')
        btn.textContent = label
        btn.className = `map-menu-btn map-menu-${target}`
        btn.onclick = () => {
          popupRef.current?.remove()
          onPickRef.current(target, p)
        }
        el.appendChild(btn)
      }
      popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 6 })
        .setLngLat(e.lngLat)
        .setDOMContent(el)
        .addTo(map)
    })

    return () => map.remove()
  }, [])

  // Cursor en modo selección
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = pickTarget ? 'crosshair' : ''
    if (pickTarget) popupRef.current?.remove()
  }, [pickTarget])

  // Marcadores de origen/destino (arrastrables)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const [target, place] of [
      ['from', from],
      ['to', to],
    ] as const) {
      const existing = markers.current[target]
      if (!place) {
        existing?.remove()
        delete markers.current[target]
        continue
      }
      if (existing) {
        existing.setLngLat([place.lon, place.lat])
      } else {
        const m = new maplibregl.Marker({ element: pinElement(target), anchor: 'bottom', draggable: true })
          .setLngLat([place.lon, place.lat])
          .addTo(map)
        m.on('dragend', () => {
          const ll = m.getLngLat()
          onPickRef.current(target, { lat: ll.lat, lon: ll.lng })
        })
        markers.current[target] = m
      }
    }
    // Si sólo hay un punto y no hay ruta, centrar en él
    const only = from && !to ? from : to && !from ? to : null
    if (only) map.easeTo({ center: [only.lon, only.lat], zoom: Math.max(map.getZoom(), 15) })
  }, [from, to])

  // Punto azul con mi ubicación
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation) return
    if (!userMarker.current) {
      const el = document.createElement('div')
      el.className = 'user-dot'
      userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([userLocation.lon, userLocation.lat]).addTo(map)
    } else {
      userMarker.current.setLngLat([userLocation.lon, userLocation.lat])
    }
  }, [userLocation])

  // Dibujar itinerario seleccionado
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      const route = map.getSource('route') as GeoJSONSource | undefined
      const stops = map.getSource('stops') as GeoJSONSource | undefined
      if (!route || !stops) return
      if (!itinerary) {
        route.setData(EMPTY)
        stops.setData(EMPTY)
        return
      }
      const lines: GeoJSON.Feature[] = []
      const points: GeoJSON.Feature[] = []
      for (const leg of itinerary.legs) {
        const color = leg.routeColor ?? '#c60c30'
        if (leg.geometry.length > 1) {
          lines.push({
            type: 'Feature',
            properties: { mode: leg.mode, color },
            geometry: { type: 'LineString', coordinates: leg.geometry },
          })
        }
        if (leg.mode === 'BUS') {
          for (const [s, main] of [
            [leg.from, true],
            [leg.to, true],
          ] as const) {
            points.push({
              type: 'Feature',
              properties: { color, main, name: s.name },
              geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
            })
          }
          for (const s of leg.intermediateStops.slice(1)) {
            points.push({
              type: 'Feature',
              properties: { color, main: false, name: s.name },
              geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
            })
          }
        }
      }
      route.setData({ type: 'FeatureCollection', features: lines })
      stops.setData({ type: 'FeatureCollection', features: points })

      const bounds = new maplibregl.LngLatBounds()
      for (const f of lines) for (const c of (f.geometry as GeoJSON.LineString).coordinates) bounds.extend(c as [number, number])
      for (const p of [endpointsRef.current.from, endpointsRef.current.to]) if (p) bounds.extend([p.lon, p.lat])
      if (!bounds.isEmpty()) {
        // Dejar hueco para el panel (abajo en móvil, a la izquierda en escritorio)
        const panel = document.querySelector('.panel')?.getBoundingClientRect()
        const mobile = window.innerWidth < 800
        map.fitBounds(bounds, {
          padding: mobile
            ? { top: 70, bottom: (panel?.height ?? window.innerHeight * 0.6) + 40, left: 40, right: 50 }
            : { top: 100, bottom: 100, left: (panel?.right ?? 430) + 60, right: 80 },
          maxZoom: 17,
        })
      }
    }
    if (map.isStyleLoaded() && map.getSource('route')) draw()
    else map.once('load', draw)
  }, [itinerary])

  return <div ref={containerRef} className="map" />
}
