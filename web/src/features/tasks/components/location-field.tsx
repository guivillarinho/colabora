import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Place = {
  id: string
  label: string
  latitude: number
  longitude: number
}

type LocationFieldProps = {
  id: string
  value: string
  onChange: (value: string) => void
}

export function LocationField({ id, value, onChange }: LocationFieldProps) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<Place[]>([])
  const [selected, setSelected] = useState<Place | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    if (selected && query === selected.label) {
      return
    }

    if (query.trim().length < 2) {
      setResults([])
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchPlaces(query, controller.signal)
        .then((places) => {
          setResults(places)
          setSearchError(null)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') {
            return
          }

          setResults([])
          setSearchError('Não foi possível buscar endereços.')
        })
    }, 150)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, selected])

  function choosePlace(place: Place) {
    setSelected(place)
    setQuery(place.label)
    setResults([])
    onChange(place.label.slice(0, 200))
  }

  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>Localização</Label>
      {selected ? (
        <div className="min-w-0 overflow-hidden rounded-xl border">
          <iframe
            className="block h-48 w-full max-w-full min-w-0"
            loading="lazy"
            src={mapUrl(selected)}
            title={`Mapa de ${selected.label}`}
          />
          <p className="px-3 py-2 text-sm font-medium">{selected.label}</p>
        </div>
      ) : null}
      {searchError ? (
        <p className="text-sm text-destructive">{searchError}</p>
      ) : null}
      {results.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border">
          {results.map((place) => (
            <li key={place.id}>
              <button
                className="w-full min-w-0 px-3 py-2 text-left text-sm wrap-break-word hover:bg-muted"
                type="button"
                onClick={() => {
                  choosePlace(place)
                }}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        autoComplete="off"
        id={id}
        placeholder="Busque um endereço"
        value={query}
        onChange={(event) => {
          const next = event.target.value
          setQuery(next)
          setSelected(null)
          onChange(next.trim().slice(0, 200))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
          }
        }}
      />
    </div>
  )
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    street?: string
    housenumber?: string
    city?: string
    state?: string
    country?: string
  }
}

async function searchPlaces(
  query: string,
  signal: AbortSignal,
): Promise<Place[]> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '5')

  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error('Falha ao buscar endereços.')
  }

  const body = (await response.json()) as {
    features?: PhotonFeature[]
  }

  return (body.features ?? []).map((feature, index) => ({
    id: `${feature.geometry.coordinates.join(',')}-${index}`,
    label: placeLabel(feature.properties),
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
  }))
}

function placeLabel(properties: PhotonFeature['properties']): string {
  const street = [properties.street, properties.housenumber]
    .filter(Boolean)
    .join(' ')
  const parts = [
    properties.name,
    street,
    properties.city,
    properties.state,
    properties.country,
  ].filter((part): part is string => Boolean(part))

  return [...new Set(parts)].join(', ')
}

function mapUrl(place: Place): string {
  const latitudeSpan = 0.01
  const longitudeSpan = 0.01
  const bbox = [
    place.longitude - longitudeSpan,
    place.latitude - latitudeSpan,
    place.longitude + longitudeSpan,
    place.latitude + latitudeSpan,
  ].join(',')

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${place.latitude}%2C${place.longitude}`
}
