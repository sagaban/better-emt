import { useEffect, useRef, useState } from 'react'
import { deleteFavorite, FAVORITE_ICONS, saveFavorite, type Favorite } from '../lib/favorites'
import type { LngLat } from '../lib/types'

export type FavoriteDraft = LngLat & { id?: string; name: string; icon: string; address: string }

type Props = {
  draft: FavoriteDraft
  onClose: () => void
}

const SUGGESTIONS: [string, string][] = [
  ['🏠', 'Casa'],
  ['💼', 'Trabajo'],
  ['👪', 'Familia'],
  ['🎓', 'Universidad'],
]

export function FavoriteDialog({ draft, onClose }: Props) {
  const [name, setName] = useState(draft.name)
  const [icon, setIcon] = useState(draft.icon)
  const inputRef = useRef<HTMLInputElement>(null)
  const editing = !!draft.id

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      return
    }
    saveFavorite({ id: draft.id, lat: draft.lat, lon: draft.lon, address: draft.address, name: trimmed, icon } satisfies Omit<Favorite, 'id'> & { id?: string })
    onClose()
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fav-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="fav-title">{editing ? 'Editar favorito' : 'Guardar como favorito'}</h2>
        <p className="muted small dialog-address">{draft.address}</p>

        {!editing && (
          <div className="fav-suggestions">
            {SUGGESTIONS.map(([i, n]) => (
              <button
                key={n}
                type="button"
                className={`chip ${name === n ? 'selected' : ''}`}
                onClick={() => {
                  setName(n)
                  setIcon(i)
                }}
              >
                {i} {n}
              </button>
            ))}
          </div>
        )}

        <label className="field">
          Nombre
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Casa de Ana, gimnasio…"
            maxLength={40}
            autoFocus={editing}
          />
        </label>

        <fieldset className="icon-picker">
          <legend>Ícono</legend>
          {FAVORITE_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              className={i === icon ? 'selected' : ''}
              aria-pressed={i === icon}
              onClick={() => setIcon(i)}
            >
              {i}
            </button>
          ))}
        </fieldset>

        <div className="dialog-actions">
          {editing && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                deleteFavorite(draft.id!)
                onClose()
              }}
            >
              Borrar
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}
