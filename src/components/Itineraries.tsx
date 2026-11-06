import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEstimates } from '../lib/estimates'
import { contrastText, fmtDistance, fmtDuration, fmtTime, minutesFromNow } from '../lib/format'
import type { Itinerary, Leg } from '../lib/types'

function LineBadge({ leg, large }: { leg: Leg; large?: boolean }) {
  const bg = leg.routeColor ?? '#c60c30'
  return (
    <span className={`line-badge ${large ? 'large' : ''}`} style={{ background: bg, color: contrastText(bg) }}>
      {leg.route}
    </span>
  )
}

function WalkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-label="A pie">
      <path
        fill="currentColor"
        d="M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 13v-2a5 5 0 0 1-4.3-2.4l-1-1.6a2 2 0 0 0-1.7-1c-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"
      />
    </svg>
  )
}

function relative(d: Date) {
  const m = minutesFromNow(d)
  if (m < -1) return null
  if (m <= 0) return 'ahora'
  if (m < 60) return `en ${m} min`
  return null
}

function firstBus(it: Itinerary) {
  return it.legs.find((l) => l.mode === 'BUS')
}

function Summary({ it }: { it: Itinerary }) {
  const bus = firstBus(it)
  const rel = bus && relative(bus.start)
  return (
    <>
      <div className="it-head">
        <span className="it-times">
          {fmtTime(it.start)} – {fmtTime(it.end)}
        </span>
        <span className="it-duration">{fmtDuration(it.durationMs)}</span>
      </div>
      <div className="it-chain">
        {it.legs.map((l, i) => (
          <span key={i} className="chain-item">
            {i > 0 && <span className="chain-sep">›</span>}
            {l.mode === 'BUS' ? (
              <LineBadge leg={l} />
            ) : (
              <span className="walk">
                <WalkIcon />
                {Math.max(1, Math.round(l.durationMs / 60000))}
              </span>
            )}
          </span>
        ))}
      </div>
      {bus ? (
        <p className="it-board">
          Coge el <strong>{bus.route}</strong> en <strong>{bus.from.name}</strong>
          {bus.from.stopId && <span className="muted"> (parada {bus.from.stopId})</span>} a las{' '}
          <strong>{fmtTime(bus.start)}</strong>
          {rel && <span className="rel"> · {rel}</span>}
        </p>
      ) : (
        <p className="it-board">Mejor ir andando ({fmtDistance(it.walkDistance)})</p>
      )}
    </>
  )
}

function LiveArrivals({ stopId, route }: { stopId: string; route?: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['estimates', stopId],
    queryFn: ({ signal }) => fetchEstimates(stopId, signal),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  if (isLoading) return <div className="live muted">Consultando llegadas en tiempo real…</div>
  if (isError) return <div className="live muted">No se pudieron consultar las llegadas.</div>
  if (data?.unavailable) return <div className="live muted">Tiempo real: {data.unavailable}.</div>
  const arrivals = data?.arrivals ?? []
  const sorted = [...arrivals].sort((a, b) => Number(b.line === route) - Number(a.line === route))
  return (
    <div className="live">
      <div className="live-title">
        Llegadas en tiempo real
        <button type="button" className="link" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? '…' : 'Actualizar'}
        </button>
      </div>
      {sorted.length === 0 && <div className="muted">Sin estimaciones ahora mismo.</div>}
      <ul>
        {sorted.map((a, i) => (
          <li key={i} className={a.line === route ? 'mine' : ''}>
            <strong>{a.line}</strong> {a.destination} — {a.minutes}
          </li>
        ))}
      </ul>
    </div>
  )
}

function LegDetail({ leg, isLast }: { leg: Leg; isLast: boolean }) {
  const [showStops, setShowStops] = useState(false)
  const [showLive, setShowLive] = useState(false)

  if (leg.mode !== 'BUS') {
    const dest = isLast ? 'tu destino' : leg.to.name
    return (
      <li className="step step-walk">
        <div className="step-time">{fmtTime(leg.start)}</div>
        <div className="step-body">
          <div className="step-title">
            <WalkIcon /> Camina {fmtDuration(leg.durationMs)} ({fmtDistance(leg.distance)}) hasta <strong>{dest}</strong>
          </div>
          {leg.steps.length > 0 && (
            <div className="muted small">
              Por {[...new Set(leg.steps.map((s) => s.streetName).filter((s) => s && !/^(path|way|street transit link)$/i.test(s)))].join(', ')}
            </div>
          )}
        </div>
      </li>
    )
  }

  const stops = leg.intermediateStops.slice(1)
  return (
    <li className="step step-bus" style={{ ['--line' as string]: leg.routeColor ?? '#c60c30' }}>
      <div className="step-time">{fmtTime(leg.start)}</div>
      <div className="step-body">
        <div className="step-title">
          <LineBadge leg={leg} large /> dirección <strong>{leg.headsign}</strong>
        </div>
        <div>
          Sube en <strong>{leg.from.name}</strong>
          {leg.from.stopId && <span className="muted"> · parada {leg.from.stopId}</span>}
        </div>
        <div className="step-actions">
          <button type="button" className="link" onClick={() => setShowStops((s) => !s)}>
            {(n => `${n} ${n === 1 ? 'parada' : 'paradas'}`)(leg.numIntermediateStops || stops.length)} · {fmtDuration(leg.durationMs)} {showStops ? '▲' : '▼'}
          </button>
          {leg.from.stopId && (
            <button type="button" className="link" onClick={() => setShowLive((s) => !s)}>
              {showLive ? 'Ocultar tiempo real' : 'Ver tiempo real'}
            </button>
          )}
        </div>
        {showLive && leg.from.stopId && <LiveArrivals stopId={leg.from.stopId} route={leg.route} />}
        {showStops && (
          <ol className="stop-list">
            {stops.map((s, i) => (
              <li key={i}>{s.name}</li>
            ))}
          </ol>
        )}
        <div>
          Baja en <strong>{leg.to.name}</strong> a las {fmtTime(leg.end)}
          {leg.to.stopId && <span className="muted"> · parada {leg.to.stopId}</span>}
        </div>
      </div>
    </li>
  )
}

type Props = {
  itineraries: Itinerary[]
  selected: number
  onSelect: (i: number) => void
}

export function Itineraries({ itineraries, selected, onSelect }: Props) {
  return (
    <div className="itineraries">
      {itineraries.map((it, i) => {
        const open = i === selected
        return (
          <article key={i} className={`itinerary ${open ? 'open' : ''}`}>
            <button type="button" className="it-summary" onClick={() => onSelect(i)} aria-expanded={open}>
              <Summary it={it} />
            </button>
            {open && (
              <ol className="steps">
                {it.legs.map((l, j) => (
                  <LegDetail key={j} leg={l} isLast={j === it.legs.length - 1} />
                ))}
                <li className="step step-end">
                  <div className="step-time">{fmtTime(it.end)}</div>
                  <div className="step-body">
                    <strong>Llegada</strong>
                    {it.transfers > 0 && <span className="muted"> · {it.transfers} transbordo(s)</span>}
                  </div>
                </li>
              </ol>
            )}
          </article>
        )
      })}
    </div>
  )
}
