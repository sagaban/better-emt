const SAE_URL = 'https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php'

export type Arrival = { line: string; destination: string; minutes: string; time?: string }
export type EstimatesResult = { arrivals: Arrival[]; unavailable?: string }

/** Llegadas en tiempo real a una parada (puede estar desactivado por EMT). */
export async function fetchEstimates(stopId: string, signal?: AbortSignal): Promise<EstimatesResult> {
  const url = `${SAE_URL}?sec=getSAE&parada=${encodeURIComponent(stopId)}&adaptados=false&idioma=es&nocache=${Math.random()}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Error consultando llegadas')
  const xml = new DOMParser().parseFromString(await res.text(), 'text/xml')

  const errorNode = xml.querySelector('error')
  const buses = [...xml.querySelectorAll('solo_parada > bus, parada_linea > bus')]
  const text = (el: Element, tag: string) => el.querySelector(tag)?.textContent?.trim() ?? ''

  const arrivals = buses
    .map((b) => ({ line: text(b, 'linea'), destination: text(b, 'destino'), minutes: text(b, 'minutos'), time: text(b, 'horaLlegada') || undefined }))
    .filter((a) => a.line)

  if (arrivals.length === 0 && errorNode?.textContent) {
    const tmp = document.createElement('div')
    tmp.innerHTML = errorNode.textContent
    return { arrivals, unavailable: (tmp.textContent ?? '').replace(/\s+/g, ' ').split('.')[0].trim() || 'No disponible' }
  }
  return { arrivals }
}
