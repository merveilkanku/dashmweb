import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { useLiveDeliveryLocation } from '../hooks/useLiveDeliveryLocation';
import { useRoute } from '../hooks/useRoute';

// Icônes personnalisées élégantes
const createSvgIcon = (svgPath: string, bg: string, ringColor: string = 'white') =>
  L.divIcon({
    html: `<div class="flex items-center justify-center rounded-full border-2 shadow-lg animate-in zoom-in duration-300" style="background:${bg}; border-color:${ringColor}; width:36px; height:36px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg></div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

const restaurantIcon = createSvgIcon('<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>', '#ea580c', '#ffedd5'); // Restaurant SVG
const customerIcon = createSvgIcon('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', '#2563eb', '#dbeafe'); // Map pin SVG
const bikeIcon = createSvgIcon('<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>', '#10b981', '#ecfdf5'); // Bike SVG

// Interpolation linéaire entre l'ancienne et la nouvelle position (anti-saccade)
function useSmoothPosition(target: { lat: number; lng: number } | null) {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number>();
  const fromRef = useRef(target);

  useEffect(() => {
    if (!target) return;
    
    // Si nous n'avons pas encore de position d'affichage, nous l'initialisons immédiatement
    if (!display) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current || display;
    const start = performance.now();
    const duration = 1500; // durée de l'animation en ms (1.5 secondes pour s'ajuster)

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const lat = from.lat + (target.lat - from.lat) * t;
      const lng = from.lng + (target.lng - from.lng) * t;
      
      setDisplay({ lat, lng });

      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target?.lat, target?.lng]);

  return display;
}

// Recadre automatiquement la carte pour englober tous les points
const AutoFitBounds: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    const validPoints = points.filter(p => p && !isNaN(p[0]) && !isNaN(p[1]));
    if (validPoints.length < 2) return;
    const bounds = L.latLngBounds(validPoints);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: true });
  }, [JSON.stringify(points), map]);
  return null;
};

interface Props {
  orderId: string;
  restaurantCoords?: { lat: number; lng: number };
  customerCoords?: { lat: number; lng: number };
  fallbackLat?: number;
  fallbackLng?: number;
  heightClass?: string;
  isPrivateCourier?: boolean;
}

export const LiveDeliveryMap: React.FC<Props> = ({
  orderId,
  restaurantCoords,
  customerCoords,
  fallbackLat,
  fallbackLng,
  heightClass = 'h-72',
  isPrivateCourier = false,
}) => {
  const { location, isLive } = useLiveDeliveryLocation(orderId, fallbackLat, fallbackLng);
  const smoothed = useSmoothPosition(location);

  // Calcul d'itinéraire réel en voiture/moto entre le point actuel du livreur (ou du départ) et la destination
  const routeOrigin = useMemo(() => smoothed || restaurantCoords, [smoothed, restaurantCoords]);
  const { route, loading: routeLoading } = useRoute(routeOrigin, customerCoords, 'driving');

  // Définir le centre de la carte
  const center = useMemo(() => {
    if (smoothed) return smoothed;
    if (restaurantCoords) return restaurantCoords;
    if (customerCoords) return customerCoords;
    return { lat: -4.325, lng: 15.322 }; // Fallback par défaut (Kinshasa Gombe)
  }, [smoothed, restaurantCoords, customerCoords]);

  // Points à inclure dans le calcul du cadrage automatique
  const boundsPoints: [number, number][] = useMemo(() => {
    const pts: [number, number][] = [];
    if (restaurantCoords) pts.push([restaurantCoords.lat, restaurantCoords.lng]);
    if (customerCoords) pts.push([customerCoords.lat, customerCoords.lng]);
    if (smoothed) pts.push([smoothed.lat, smoothed.lng]);
    return pts;
  }, [restaurantCoords, customerCoords, smoothed]);

  // Tracé de l'itinéraire global à vol d'oiseau si le calcul OSRM échoue
  const fallbackItineraryPoints: [number, number][] = useMemo(() => {
    if (restaurantCoords && customerCoords && !route) {
      return [
        [restaurantCoords.lat, restaurantCoords.lng],
        [customerCoords.lat, customerCoords.lng],
      ];
    }
    return [];
  }, [restaurantCoords, customerCoords, route]);

  return (
    <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden shadow-lg border border-gray-150 dark:border-gray-800 z-0`}>
      {/* Badge indicateur de statut en direct */}
      <div
        className={`absolute top-3 right-3 z-[400] px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md flex items-center space-x-1.5 transition-colors ${
          isLive 
            ? 'bg-emerald-500 text-white animate-pulse-fast' 
            : 'bg-gray-600 text-white dark:bg-gray-800 dark:text-gray-300'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full bg-white ${isLive ? 'animate-ping' : ''}`} />
        <span>{isLive ? 'En Direct' : 'Dernier signal'}</span>
      </div>

      {/* Overlay d'informations d'itinéraire réel d'OSRM */}
      {route && (
        <div className="absolute bottom-3 left-3 z-[400] bg-white/95 dark:bg-gray-900/95 backdrop-blur px-3 py-2 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 text-xs font-bold text-gray-800 dark:text-gray-200 animate-in fade-in duration-300 flex flex-col space-y-0.5">
          <span className="text-[10px] uppercase font-black tracking-widest text-brand-600 dark:text-brand-400">Temps réel estimé</span>
          <span className="text-sm font-extrabold text-gray-900 dark:text-white">
            {route.distanceKm} km • ~{route.durationMin} min
          </span>
        </div>
      )}

      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />

        <AutoFitBounds points={boundsPoints} />

        {/* Tracé de l'itinéraire principal réel d'OSRM si disponible */}
        {route && route.geometry.length > 0 && (
          <Polyline 
            positions={route.geometry} 
            color="#3b82f6" 
            weight={4} 
            opacity={0.8} 
          />
        )}

        {/* Tracé de l'itinéraire à vol d'oiseau en pointillé si OSRM non dispo */}
        {fallbackItineraryPoints.length > 1 && (
          <Polyline 
            positions={fallbackItineraryPoints} 
            color="#ea580c" 
            weight={3} 
            opacity={0.4} 
            dashArray="5, 10" 
          />
        )}

        {/* Marqueur Point de Départ (Restaurant ou Point de retrait) */}
        {restaurantCoords && (
          <Marker position={[restaurantCoords.lat, restaurantCoords.lng]} icon={restaurantIcon}>
            <Popup>
              <div className="text-xs p-1">
                <span className="font-bold text-orange-600 block">
                  {isPrivateCourier ? 'Point de Retrait' : 'Restaurant'}
                </span>
                <span className="text-gray-500">Point de départ de la livraison</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Marqueur Client / Destination */}
        {customerCoords && (
          <Marker position={[customerCoords.lat, customerCoords.lng]} icon={customerIcon}>
            <Popup>
              <div className="text-xs p-1">
                <span className="font-bold text-blue-600 block">Destination</span>
                <span className="text-gray-500">Adresse de livraison de la commande</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Marqueur Livreur Mobile */}
        {smoothed && (
          <Marker position={[smoothed.lat, smoothed.lng]} icon={bikeIcon}>
            <Popup>
              <div className="text-xs p-1 text-center">
                <span className="font-bold text-emerald-600 block">Votre Livreur</span>
                {isLive ? (
                  <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-bold uppercase">Actif</span>
                ) : (
                  <span className="text-gray-400">Dernière position GPS transmise</span>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};
