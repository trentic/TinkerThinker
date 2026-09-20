import { useEffect, useRef } from 'react'
import {
  Map as MLMap,
  Marker,
  NavigationControl,
  type StyleSpecification,
  type MapMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
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

interface SatelliteMapProps {
  center: LatLng
  zoom?: number
  pins?: MapPin[]
  onMapClick?: (pos: LatLng) => void
  className?: string
}

export function SatelliteMap({ center, zoom = 17, pins = [], onMapClick, className = '' }: SatelliteMapProps) {
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
    // Map is only created once; center/zoom changes after mount are handled
    // by flyTo in a separate effect so we don't tear down the map on every pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  return <div ref={containerRef} className={`w-full h-full ${className}`} />
}
