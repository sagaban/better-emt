import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchPlaces, type SearchResult } from '../lib/geocode'
import type { Favorite } from '../lib/favorites'
import type { Place } from '../lib/types'

type Props = {
  kind: 'from' | 'to'
  value: Place | null
  picking: boolean
  locating: boolean
  onSelect: (r: SearchResult) => void
  onClear: () => void
  onUseLocation: () => void
  onPickOnMap: () => void
  favorites: Favorite[]
  /** Favorito que coincide con el valor actual */
  favorite?: Favorite
  onSelectFavorite: (f: Favorite) => void
  onFavoriteClick: () => void
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function PlaceInput({
  kind,
  value,
  picking,
  locating,
  onSelect,
  onClear,
  onUseLocation,
  onPickOnMap,
  favorites,
  favorite,
  onSelectFavorite,
  onFavoriteClick,
}: Props) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const q = useDebounced(text.trim(), 600)

  // Cuando cambia el valor desde fuera (mapa, GPS), mostrar su etiqueta
  useEffect(() => {
    setText(value?.label ?? '')
  }, [value])
  // El blur se resuelve con retraso: leer el valor más reciente, no el del render en que ocurrió
  const valueRef = useRef(value)
  valueRef.current = value

  const editing = focused && text !== (value?.label ?? '')
  const { data, isFetching } = useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => searchPlaces(q, signal),
    enabled: editing && q.length >= 3,
    staleTime: 5 * 60_000,
  })

  const favMatches = !focused
    ? []
    : editing && text.trim()
      ? favorites.filter((f) => norm(f.name).includes(norm(text.trim())))
      : favorites
  const showSearch = editing && q.length >= 3
  const blur = () => {
    setFocused(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  const placeholder = kind === 'from' ? 'Origen: dirección, lugar…' : 'Destino: dirección, lugar…'

  return (
    <div className={`place-input ${picking ? 'is-picking' : ''}`}>
      <span className={`place-dot place-dot-${kind}`}>{kind === 'from' ? 'A' : 'B'}</span>
      <div className="place-field">
        <input
          type="search"
          value={picking ? '' : text}
          placeholder={picking ? 'Toca un punto en el mapa…' : placeholder}
          aria-label={kind === 'from' ? 'Origen' : 'Destino'}
          enterKeyHint="search"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            setFocused(true)
            e.target.select()
          }}
          onBlur={() =>
            // retraso para permitir el click en un resultado
            setTimeout(() => {
              setFocused(false)
              setText(valueRef.current?.label ?? '')
            }, 200)
          }
        />
        {(favMatches.length > 0 || showSearch) && (
          <ul className="suggestions" role="listbox">
            {favMatches.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="suggestion-fav"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectFavorite(f)
                    blur()
                  }}
                >
                  <strong>
                    {f.icon} {f.name}
                  </strong>
                  <small>{f.address}</small>
                </button>
              </li>
            ))}
            {showSearch && isFetching && !data && <li className="muted">Buscando…</li>}
            {showSearch && data?.length === 0 && <li className="muted">Sin resultados en València</li>}
            {showSearch && data?.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(r)
                    blur()
                  }}
                >
                  <strong>{r.label}</strong>
                  {r.detail && <small>{r.detail}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value && !picking && (
        <button
          type="button"
          className={`icon-btn star ${favorite ? 'on' : ''}`}
          title={favorite ? `Favorito: ${favorite.name}` : 'Guardar como favorito'}
          aria-label={favorite ? `Editar favorito ${favorite.name}` : 'Guardar como favorito'}
          onClick={onFavoriteClick}
        >
          {favorite ? '★' : '☆'}
        </button>
      )}
      {value && !picking && (
        <button type="button" className="icon-btn" title="Borrar" aria-label="Borrar" onClick={onClear}>
          ✕
        </button>
      )}
      <button
        type="button"
        className={`icon-btn ${locating ? 'spin' : ''}`}
        title="Usar mi ubicación"
        aria-label="Usar mi ubicación"
        onClick={onUseLocation}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <button
        type="button"
        className={`icon-btn ${picking ? 'active' : ''}`}
        title="Elegir en el mapa"
        aria-label="Elegir en el mapa"
        aria-pressed={picking}
        onClick={onPickOnMap}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path
            d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  )
}
