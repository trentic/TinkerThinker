import { useEffect, useRef } from 'react'
import {
  Map as MLMap,
  Marker,
  NavigationControl,
  type StyleSpecification,
  type MapMouseEvent,
  type GeoJSONSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection } from 'geojson'
import type { LatLng } from '../lib/geo'

// Esri World Imagery: free satellite tiles, no API key/signup required for
// this kind of app usage. Attribution is included per their terms.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
}

export interface MapPin {
  id: string
  position: LatLng
  label?: string
  color?: string
}

export interface MapOutline {
  id: string
  coordinates: LatLng[]
  color?: string
}

interface SatelliteMapProps {
  center: LatLng
  zoom?: number
  pins?: MapPin[]
  outlines?: MapOutline[]
  onMapClick?: (pos: LatLng) => void
  className?: string
}

const OUTLINES_SOURCE_ID = 'fairway-outlines'

export function SatelliteMap({
  center,
  zoom = 17,
  pins = [],
  outlines = [],
  onMapClick,
  className = '',
}: SatelliteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const onClickRef = useRef(onMapClick)
  onClickRef.current = onMapClick

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MLMap({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: { compact: true },
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('click', (e: MapMouseEvent) => {
      onClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // Map is only created once; center changes after mount are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recenter (e.g. moving to the next hole) without tearing down the map.
  useEffect(() => {
    mapRef.current?.setCenter([center.lng, center.lat])
  }, [center.lat, center.lng])

  useEffect(() => {
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    if (!mapRef.current) return

    for (const pin of pins) {
      const el = document.createElement('div')
      el.style.cssText = `
        width: 28px; height: 28px; border-radius: 9999px;
        background: ${pin.color ?? '#16a34a'}; color: white;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 13px; border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.5);
      `
      el.textContent = pin.label ?? ''
      const marker = new Marker({ element: el })
        .setLngLat([pin.position.lng, pin.position.lat])
        .addTo(mapRef.current)
      markersRef.current.push(marker)
    }
  }, [pins])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyOutlines = () => {
      const geojson: FeatureCollection = {
        type: 'FeatureCollection',
        features: outlines.map((o) => ({
          type: 'Feature',
          properties: { color: o.color ?? '#f59e0b' },
          geometry: {
            type: 'LineString',
            coordinates: o.coordinates.map((p) => [p.lng, p.lat]),
          },
        })),
      }

      const existing = map.getSource(OUTLINES_SOURCE_ID) as GeoJSONSource | undefined
      if (existing) {
        existing.setData(geojson)
        return
      }
      map.addSource(OUTLINES_SOURCE_ID, { type: 'geojson', data: geojson })
      map.addLayer({
        id: OUTLINES_SOURCE_ID,
        type: 'line',
        source: OUTLINES_SOURCE_ID,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': 0.9,
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' },
      })
    }

    if (map.isStyleLoaded()) applyOutlines()
    else map.once('load', applyOutlines)
  }, [outlines])

  return <div ref={containerRef} className={`w-full h-full ${className}`} />
}
