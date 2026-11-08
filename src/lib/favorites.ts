import { useSyncExternalStore } from 'react'
import type { LngLat } from './types'

export type Favorite = LngLat & {
  id: string
  name: string
  icon: string
  /** Dirección legible del punto guardado */
  address: string
}

export const FAVORITE_ICONS = ['🏠', '💼', '❤️', '👪', '🎓', '🏋️', '🛒', '🍽️', '🏥', '⭐']

const KEY = 'better-emt:favorites:v1'
const listeners = new Set<() => void>()
let cache: Favorite[] | null = null

function read(): Favorite[] {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    cache = Array.isArray(parsed) ? parsed : []
  } catch {
    cache = []
  }
  return cache
}

function write(next: Favorite[]) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // modo privado o almacenamiento lleno: se mantienen en memoria
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  // sincronizar entre pestañas
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    cache = null
    cb()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

export function useFavorites() {
  return useSyncExternalStore(subscribe, read, () => [] as Favorite[])
}

export function saveFavorite(fav: Omit<Favorite, 'id'> & { id?: string }) {
  const list = read()
  if (fav.id && list.some((f) => f.id === fav.id)) {
    write(list.map((f) => (f.id === fav.id ? { ...f, ...fav, id: f.id } : f)))
  } else {
    write([...list, { ...fav, id: fav.id ?? crypto.randomUUID() }])
  }
}

export function deleteFavorite(id: string) {
  write(read().filter((f) => f.id !== id))
}

/** Distancia aproximada en metros (suficiente para distancias cortas). */
function distance(a: LngLat, b: LngLat) {
  const dLat = (a.lat - b.lat) * 111_320
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/** Favorito que coincide con un punto (a menos de 30 m). */
export function findFavorite(list: Favorite[], p: LngLat | null): Favorite | undefined {
  if (!p) return undefined
  return list.find((f) => distance(f, p) < 30)
}
