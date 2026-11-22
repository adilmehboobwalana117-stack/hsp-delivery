import { useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMap,
  MapMouseEvent,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Bike, Crosshair, MapPin, Navigation, Store } from 'lucide-react';
import { LatLng } from '../types';

export interface RouteMetrics {
  distanceKm: number;
  durationMin: number;
  steps: string[];
}

interface RouteOverlayProps {
  origin: LatLng;
  destination: LatLng;
  travelMode: 'DRIVING' | 'TWO_WHEELER';
  onRouteComputed?: (metrics: RouteMetrics) => void;
}

const USAGE_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

function RouteOverlay({ origin, destination, travelMode, onRouteComputed }: RouteOverlayProps) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<Array<{ setMap: (m: unknown) => void }>>([]);
  const onRouteComputedRef = useRef(onRouteComputed);
  onRouteComputedRef.current = onRouteComputed;

  useEffect(() => {
    if (!routesLib || !map || !origin || !destination) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    let cancelled = false;

    const compute = async () => {
      try {
        // Modern Routes API via Maps JS SDK wrapper (replaces legacy DirectionsService)
        // Doc: https://developers.google.com/maps/documentation/javascript/routes?utm_campaign=gmp_mcp_codeassist_v1_aistudio
        const RouteClass = (routesLib as unknown as { Route?: { computeRoutes: (req: unknown) => Promise<{ routes?: unknown[] }> } }).Route;
        if (!RouteClass || typeof RouteClass.computeRoutes !== 'function') {
          return;
        }

        const request = {
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          travelMode,
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
        };

        const response = await RouteClass.computeRoutes(request);
        if (cancelled) return;

        const routes = response?.routes as Array<{
          distanceMeters?: number;
          durationMillis?: number;
          viewport?: unknown;
          legs?: Array<{ steps?: Array<{ navigationInstruction?: { instructions?: string } }> }>;
          createPolylines?: () => Array<{
            setOptions: (opts: Record<string, unknown>) => void;
            setMap: (m: unknown) => void;
          }>;
        }>;

        const primaryRoute = routes?.[0];
        if (!primaryRoute) return;

        if (typeof primaryRoute.createPolylines === 'function') {
          const newPolylines = primaryRoute.createPolylines();
          newPolylines.forEach((polyline) => {
            polyline.setOptions({
              strokeColor: '#eab308',
              strokeOpacity: 0.95,
              strokeWeight: 6,
            });
            polyline.setMap(map);
          });
          polylinesRef.current = newPolylines;
        }

        if (primaryRoute.viewport && typeof map.fitBounds === 'function') {
          map.fitBounds(primaryRoute.viewport as never);
        }

        const distanceKm = Number(((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(1));
        const durationMin = Math.max(2, Math.round((primaryRoute.durationMillis ?? 0) / 60000));
        const steps: string[] = [];
        const firstLegSteps = primaryRoute.legs?.[0]?.steps ?? [];
        firstLegSteps.forEach((s) => {
          const text = s.navigationInstruction?.instructions;
          if (text) steps.push(text);
        });

        onRouteComputedRef.current?.({
          distanceKm: distanceKm > 0 ? distanceKm : 3.2,
          durationMin: durationMin > 0 ? durationMin : 12,
          steps:
            steps.length > 0
              ? steps.slice(0, 6)
              : [
                  'Head out from restaurant pickup point toward main boulevard',
                  'Continue along primary urban corridor avoiding traffic bottlenecks',
                  'Turn onto customer neighborhood street',
                  'Arrive at pinned delivery gate',
                ],
        });
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429') ||
          msg.includes('Quota')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        // Graceful fallback calculation using Haversine distance
        const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
        const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((origin.lat * Math.PI) / 180) *
            Math.cos((destination.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const distKm = Number((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.25).toFixed(1));
        const eta = Math.max(4, Math.round((distKm / 26) * 60));
        onRouteComputedRef.current?.({
          distanceKm: distKm,
          durationMin: eta,
          steps: [
            'Depart pickup zone and merge onto main avenue',
            'Follow fastest two-wheeler corridor toward destination sector',
            'Proceed to customer pinned delivery coordinates',
          ],
        });
      }
    };

    compute();

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, origin.lat, origin.lng, destination.lat, destination.lng, travelMode]);

  return null;
}

function MapPanToTarget({ target }: { target: LatLng }) {
  const map = useMap();
  const lastTargetRef = useRef<LatLng | null>(null);

  useEffect(() => {
    if (!map) return;
    const prev = lastTargetRef.current;
    if (
      prev &&
      Math.abs(prev.lat - target.lat) < 0.00001 &&
      Math.abs(prev.lng - target.lng) < 0.00001
    ) {
      return;
    }
    lastTargetRef.current = { lat: target.lat, lng: target.lng };
    if (prev) {
      map.panTo({ lat: target.lat, lng: target.lng });
    }
  }, [map, target.lat, target.lng]);

  return null;
}

interface PinPickerMapProps {
  center: LatLng;
  pinnedLocation: LatLng;
  onPinChange: (coords: LatLng) => void;
  heightClass?: string;
}

export function PinPickerMap({
  center,
  pinnedLocation,
  onPinChange,
  heightClass = 'h-64',
}: PinPickerMapProps) {
  const [locating, setLocating] = useState(false);

  const handleMapClick = (ev: MapMouseEvent) => {
    const latLng = ev.detail?.latLng;
    if (latLng) {
      onPinChange({ lat: Number(latLng.lat.toFixed(6)), lng: Number(latLng.lng.toFixed(6)) });
    }
  };

  const handleUseMyGps = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onPinChange({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className={`relative w-full ${heightClass} rounded-xl overflow-hidden border border-amber-500/30 bg-zinc-900`}>
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={pinnedLocation || center}
          defaultZoom={14}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          onClick={handleMapClick}
          internalUsageAttributionIds={USAGE_ATTRIBUTION_IDS}
          style={{ width: '100%', height: '100%' }}
        >
          <MapPanToTarget target={pinnedLocation} />
          <AdvancedMarker position={pinnedLocation} title="Delivery Pin">
            <div className="flex flex-col items-center -translate-y-2">
              <div className="w-9 h-9 rounded-full bg-yellow-400 text-zinc-950 shadow-lg border-2 border-zinc-950 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="w-2.5 h-2.5 bg-yellow-400 rotate-45 -mt-1.5 border-r border-b border-zinc-950" />
            </div>
          </AdvancedMarker>
        </GoogleMap>

        <button
          type="button"
          onClick={handleUseMyGps}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-950 text-yellow-400 text-xs font-extrabold shadow-md border border-amber-500/40 hover:bg-zinc-900 transition-colors"
        >
          <Crosshair className={`w-3.5 h-3.5 text-yellow-400 ${locating ? 'animate-spin' : ''}`} />
          {locating ? 'Locating...' : 'Use GPS'}
        </button>
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>Tap anywhere on the map to pin exact doorstep location</span>
        <span className="font-mono-tabular text-yellow-400">
          {pinnedLocation.lat.toFixed(4)}, {pinnedLocation.lng.toFixed(4)}
        </span>
      </div>
    </div>
  );
}

interface LiveTrackingMapProps {
  restaurantPos: LatLng;
  restaurantName: string;
  customerPos: LatLng;
  riderPos: LatLng;
  showRiderLocation?: boolean;
  travelMode?: 'DRIVING' | 'TWO_WHEELER';
  heightClass?: string;
  onRouteComputed?: (metrics: RouteMetrics) => void;
}

export function LiveTrackingMap({
  restaurantPos,
  restaurantName,
  customerPos,
  riderPos,
  showRiderLocation = true,
  travelMode = 'DRIVING',
  heightClass = 'h-[360px] lg:h-[440px]',
  onRouteComputed,
}: LiveTrackingMapProps) {
  const center: LatLng = {
    lat: (restaurantPos.lat + customerPos.lat) / 2,
    lng: (restaurantPos.lng + customerPos.lng) / 2,
  };

  return (
    <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-amber-500/30 bg-zinc-900`}>
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={center}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        internalUsageAttributionIds={USAGE_ATTRIBUTION_IDS}
        style={{ width: '100%', height: '100%' }}
      >
        <RouteOverlay
          origin={showRiderLocation ? riderPos : restaurantPos}
          destination={customerPos}
          travelMode={travelMode}
          onRouteComputed={onRouteComputed}
        />

        {/* Restaurant Pickup Pin */}
        <AdvancedMarker position={restaurantPos} title={restaurantName}>
          <div className="flex flex-col items-center">
            <div className="px-2 py-0.5 rounded bg-zinc-950 text-yellow-400 border border-amber-500/50 text-[11px] font-bold mb-1 shadow whitespace-nowrap">
              {restaurantName}
            </div>
            <div className="w-8 h-8 rounded-full bg-zinc-950 text-yellow-400 border-2 border-yellow-400 shadow-md flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
        </AdvancedMarker>

        {/* Live Rider Marker (Unlocked strictly after pickup for customers) */}
        {showRiderLocation && (
          <AdvancedMarker position={riderPos} title="Rider Live GPS">
            <div className="flex flex-col items-center">
              <div className="px-2 py-0.5 rounded bg-yellow-400 text-zinc-950 text-[11px] font-extrabold mb-1 shadow whitespace-nowrap">
                Rider GPS
              </div>
              <div className="w-9 h-9 rounded-full bg-yellow-400 text-zinc-950 border-2 border-zinc-950 shadow-lg flex items-center justify-center">
                <Bike className="w-5 h-5" />
              </div>
            </div>
          </AdvancedMarker>
        )}

        {/* Customer Drop-off Pin */}
        <AdvancedMarker position={customerPos} title="Customer Drop-off">
          <div className="flex flex-col items-center">
            <div className="px-2 py-0.5 rounded bg-amber-500 text-zinc-950 text-[11px] font-extrabold mb-1 shadow whitespace-nowrap">
              Drop-off Pin
            </div>
            <div className="w-9 h-9 rounded-full bg-amber-500 text-zinc-950 border-2 border-zinc-950 shadow-lg flex items-center justify-center">
              <Navigation className="w-4 h-4" />
            </div>
          </div>
        </AdvancedMarker>
      </GoogleMap>
    </div>
  );
}
