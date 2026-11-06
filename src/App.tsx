import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapView, type Target } from './components/MapView'
import { PlaceInput } from './components/PlaceInput'
import { Itineraries } from './components/Itineraries'
import { reverseGeocode } from './lib/geocode'
import { fetchPlan, PlanError } from './lib/otp'
import type { LngLat, Optimize, Place } from './lib/types'

type TimeMode = 'now' | 'depart' | 'arrive'

const fmtCoords = (p: LngLat) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

function geoErrorMessage(err: GeolocationPositionError) {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.'
    case err.POSITION_UNAVAILABLE:
      return 'No se pudo determinar tu ubicación.'
    default:
      return 'Se agotó el tiempo buscando tu ubicación.'
  }
}

export default function App() {
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  const [pickTarget, setPickTarget] = useState<Target | null>(null)
  const [locating, setLocating] = useState<Target | null>(null)
  const [userLocation, setUserLocation] = useState<LngLat | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [timeMode, setTimeMode] = useState<TimeMode>('now')
  const [dateTime, setDateTime] = useState(() => toLocalInput(new Date()))
  const [optimize, setOptimize] = useState<Optimize>('QUICK')
  const [maxWalk, setMaxWalk] = useState(1000)
  const [showOptions, setShowOptions] = useState(false)
  const [selected, setSelected] = useState(0)

  const setters = { from: setFrom, to: setTo }

  /** Fija un punto y, en segundo plano, le pone nombre de calle. */
  const setPoint = useCallback((target: Target, p: LngLat, source: Place['source'], label?: string) => {
    const set = target === 'from' ? setFrom : setTo
    const initial = label ?? (source === 'gps' ? 'Mi ubicación' : fmtCoords(p))
    set({ ...p, label: initial, source })
    if (!label && source === 'map') {
      reverseGeocode(p).then((name) => {
        if (!name) return
        set((cur) => (cur && cur.lat === p.lat && cur.lon === p.lon ? { ...cur, label: name } : cur))
      })
    }
  }, [])

  const locate = useCallback(
    (target: Target) => {
      if (!('geolocation' in navigator)) {
        setNotice('Tu navegador no permite obtener la ubicación.')
        return
      }
      setPickTarget(null)
      setLocating(target)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lon: pos.coords.longitude }
          setUserLocation(p)
          setPoint(target, p, 'gps')
          setLocating(null)
        },
        (err) => {
          setNotice(geoErrorMessage(err))
          setLocating(null)
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      )
    },
    [setPoint],
  )

  // Al abrir: si ya hay permiso de ubicación, usarla como origen
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((st) => {
        if (st.state === 'granted') locate('from')
      })
      .catch(() => {})
  }, [locate])

  // Seguir mi posición (sólo el punto azul) cuando hay permiso
  useEffect(() => {
    if (!userLocation || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 },
    )
    return () => navigator.geolocation.clearWatch(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation !== null])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  const when = timeMode === 'now' ? null : new Date(dateTime)
  const plan = useQuery({
    queryKey: ['plan', from?.lat, from?.lon, to?.lat, to?.lon, timeMode, timeMode === 'now' ? null : dateTime, optimize, maxWalk],
    queryFn: ({ signal }) =>
      fetchPlan({ from: from!, to: to!, when, arriveBy: timeMode === 'arrive', optimize, maxWalkDistance: maxWalk }, signal),
    enabled: !!from && !!to,
    staleTime: timeMode === 'now' ? 60_000 : Infinity,
    refetchInterval: timeMode === 'now' ? 60_000 : false,
    retry: (count, err) => !(err instanceof PlanError) && count < 2,
  })

  useEffect(() => setSelected(0), [plan.data])

  const itinerary = plan.data?.[selected] ?? null

  const swap = () => {
    setFrom(to)
    setTo(from)
  }

  return (
    <div className={`app ${pickTarget ? 'picking' : ''}`}>
      <MapView
        from={from}
        to={to}
        userLocation={userLocation}
        itinerary={itinerary}
        pickTarget={pickTarget}
        onPick={(target, p) => {
          setPoint(target, p, 'map')
          setPickTarget(null)
        }}
      />

      {pickTarget && (
        <div className="pick-banner">
          Toca el mapa para elegir el <strong>{pickTarget === 'from' ? 'origen' : 'destino'}</strong>
          <button type="button" onClick={() => setPickTarget(null)}>
            Cancelar
          </button>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      <section className="panel">
        <header className="panel-header">
          <h1>
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="24" height="24" /> ¿Qué bus cojo?
          </h1>
        </header>

        <div className="form">
          <div className="places">
            {(['from', 'to'] as const).map((k) => (
              <PlaceInput
                key={k}
                kind={k}
                value={k === 'from' ? from : to}
                picking={pickTarget === k}
                locating={locating === k}
                onSelect={(r) => setPoint(k, r, 'search', r.label)}
                onClear={() => setters[k](null)}
                onUseLocation={() => locate(k)}
                onPickOnMap={() => setPickTarget((t) => (t === k ? null : k))}
              />
            ))}
            <button type="button" className="swap" onClick={swap} title="Intercambiar" aria-label="Intercambiar origen y destino">
              ⇅
            </button>
          </div>

          <div className="when">
            <select value={timeMode} onChange={(e) => setTimeMode(e.target.value as TimeMode)} aria-label="Cuándo">
              <option value="now">Salir ahora</option>
              <option value="depart">Salir a las…</option>
              <option value="arrive">Llegar a las…</option>
            </select>
            {timeMode !== 'now' && (
              <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} aria-label="Fecha y hora" />
            )}
            <button type="button" className="link" onClick={() => setShowOptions((s) => !s)}>
              Opciones {showOptions ? '▲' : '▼'}
            </button>
          </div>

          {showOptions && (
            <div className="options">
              <label>
                Preferir
                <select value={optimize} onChange={(e) => setOptimize(e.target.value as Optimize)}>
                  <option value="QUICK">Ruta más rápida</option>
                  <option value="TRANSFERS">Menos transbordos</option>
                </select>
              </label>
              <label>
                Caminar como máximo
                <select value={maxWalk} onChange={(e) => setMaxWalk(Number(e.target.value))}>
                  <option value={300}>300 m</option>
                  <option value={500}>500 m</option>
                  <option value={1000}>1 km</option>
                  <option value={2000}>2 km</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="results">
          {!from || !to ? (
            <div className="hint">
              <p>
                Elige origen y destino: escribe una dirección, usa <strong>tu ubicación</strong> o <strong>toca el mapa</strong>.
              </p>
            </div>
          ) : plan.isPending ? (
            <div className="hint">Buscando rutas…</div>
          ) : plan.isError ? (
            <div className="error">
              <p>{plan.error instanceof PlanError ? plan.error.message : 'No se pudo conectar con EMT. Revisa tu conexión.'}</p>
              <button type="button" onClick={() => plan.refetch()}>
                Reintentar
              </button>
            </div>
          ) : (
            <Itineraries itineraries={plan.data} selected={selected} onSelect={setSelected} />
          )}
        </div>

        <footer className="credits">
          Datos: EMT València · Mapa: OpenFreeMap, © OpenStreetMap. App no oficial.
        </footer>
      </section>
    </div>
  )
}
