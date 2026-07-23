import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Location, Order, Restaurant } from '../types';
import { Bike, MapPin, Navigation, Clock, ShieldCheck, Box } from 'lucide-react';
import { getDistanceFromLatLonInKm, calculateTime, formatDistance, formatTime } from '../utils/geo';

interface Props {
  order: Order;
  restaurant: Restaurant | null;
}

// Helper to recenter map to show all relevant points and fits bounds
const FitBounds = ({ points }: { points: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    const validPoints = points.filter(p => !isNaN(p[0]) && !isNaN(p[1]));
    if (validPoints.length > 0) {
      const bounds = L.latLngBounds(validPoints);
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    }
  }, [points, map]);
  return null;
};

export const DeliveryTrackingMap: React.FC<Props> = ({ order, restaurant }) => {
  const [deliveryPos, setDeliveryPos] = useState<Location | null>(null);
  const [progress, setProgress] = useState(0);

  const isPrivateCourier = useMemo(() => {
    return order.items?.[0]?.isPrivateCourier === true;
  }, [order.items]);

  // Destination point coordinates
  const destination = useMemo(() => {
    if (order.deliveryLocation?.lat && order.deliveryLocation?.lng) {
      return { lat: order.deliveryLocation.lat, lng: order.deliveryLocation.lng };
    }
    return { lat: -11.6644, lng: 27.4795 }; // Fallback coordinates
  }, [order.deliveryLocation?.lat, order.deliveryLocation?.lng]);

  // Starting point coordinates (Restaurant or Pickup)
  const start = useMemo(() => {
    if (isPrivateCourier && order.deliveryLocation) {
      const loc: any = order.deliveryLocation;
      if (loc.pickupLat && loc.pickupLng) {
        return { latitude: loc.pickupLat, longitude: loc.pickupLng };
      }
    }
    return restaurant 
      ? { latitude: restaurant.latitude, longitude: restaurant.longitude } 
      : { latitude: -11.6580, longitude: 27.4720 }; // Fallback
  }, [restaurant, isPrivateCourier, order.deliveryLocation]);

  // Real-time tracking coordinator
  useEffect(() => {
    if (order.status !== 'delivering') {
      // If order is delivered or completed, set delivery person to 100% destination
      if (order.status === 'delivered' || order.status === 'completed') {
        setProgress(1);
        setDeliveryPos({ latitude: destination.lat, longitude: destination.lng });
      } else {
        // Not delivering yet, place delivery person at the start point
        setProgress(0);
        setDeliveryPos({ latitude: start.latitude, longitude: start.longitude });
      }
      return;
    }
    
    // If we have real-time GPS coordinates from database, use them
    if (order.delivery_lat && order.delivery_lng) {
      setDeliveryPos({ latitude: order.delivery_lat, longitude: order.delivery_lng });
      
      // Calculate visual progress percentage along the line
      const totalDist = getDistanceFromLatLonInKm(start.latitude, start.longitude, destination.lat, destination.lng);
      const remainingDist = getDistanceFromLatLonInKm(order.delivery_lat, order.delivery_lng, destination.lat, destination.lng);
      if (totalDist > 0) {
        const calculatedProgress = Math.max(0, Math.min(1, 1 - (remainingDist / totalDist)));
        setProgress(calculatedProgress);
      }
      return;
    }

    // Fallback Simulated delivery movement if no live coordinates exist yet
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 1) return 1;
        return prev + 0.01; // 1% every 2 seconds
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [order.status, order.delivery_lat, order.delivery_lng, start, destination]);

  useEffect(() => {
    // Interpolate position only if we are using the simulation (no real GPS lat/lng)
    if (order.status === 'delivering' && (!order.delivery_lat || !order.delivery_lng)) {
      const lat = start.latitude + (destination.lat - start.latitude) * progress;
      const lng = start.longitude + (destination.lng - start.longitude) * progress;
      setDeliveryPos({ latitude: lat, longitude: lng });
    }
  }, [progress, order.status, order.delivery_lat, order.delivery_lng, start, destination]);

  // Calculated Real-Time Metrics based on coordinates
  const metrics = useMemo(() => {
    if (!deliveryPos) {
      return { remainingDistance: 0, remainingTimeMinutes: 0 };
    }
    const remainingDistance = getDistanceFromLatLonInKm(
      deliveryPos.latitude,
      deliveryPos.longitude,
      destination.lat,
      destination.lng
    );
    // Average delivery speed: 30 km/h (MOTO)
    const remainingTimeMinutes = calculateTime(remainingDistance, 30);
    return { remainingDistance, remainingTimeMinutes };
  }, [deliveryPos, destination]);

  // Leaflet Custom Icons
  const startIcon = L.divIcon({
    className: 'custom-start-icon',
    html: isPrivateCourier 
      ? `<div class="bg-orange-500 p-2 rounded-full border-2 border-white shadow-lg text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg></div>`
      : `<div class="bg-orange-600 p-2 rounded-full border-2 border-white shadow-lg text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const customerIcon = L.divIcon({
    className: 'custom-customer-icon',
    html: `<div class="bg-blue-600 p-2 rounded-full border-2 border-white shadow-lg text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const deliveryIcon = L.divIcon({
    className: 'custom-delivery-icon',
    html: `<div class="bg-brand-600 p-2 rounded-full border-2 border-white shadow-xl text-white animate-bounce"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  // Fit bounds to show start, destination, and current delivery coordinates if available
  const boundsPoints: [number, number][] = useMemo(() => {
    const pts: [number, number][] = [
      [start.latitude, start.longitude],
      [destination.lat, destination.lng]
    ];
    if (deliveryPos) {
      pts.push([deliveryPos.latitude, deliveryPos.longitude]);
    }
    return pts;
  }, [start, destination, deliveryPos]);

  // Full Route Polyline Points (Itinerary)
  const routePoints: [number, number][] = useMemo(() => [
    [start.latitude, start.longitude],
    [destination.lat, destination.lng]
  ], [start, destination]);

  // Traversed Route Polyline Points (Start to Livreur)
  const traversedPoints: [number, number][] = useMemo(() => {
    if (!deliveryPos) return [];
    return [
      [start.latitude, start.longitude],
      [deliveryPos.latitude, deliveryPos.longitude]
    ];
  }, [start, deliveryPos]);

  return (
    <div className="relative w-full h-72 rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-lg bg-gray-100 dark:bg-gray-900 mb-4 z-0">
      <MapContainer 
        center={[start.latitude, start.longitude]} 
        zoom={14} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={boundsPoints} />

        {/* Dynamic Route Polyline (Dashed background itinerary) */}
        <Polyline 
          positions={routePoints} 
          color="#ea580c" 
          weight={4} 
          opacity={0.4} 
          dashArray="5, 10" 
        />

        {/* Traversed Path (Solid line representing actual transit path) */}
        {traversedPoints.length > 1 && (
          <Polyline 
            positions={traversedPoints} 
            color="#10b981" 
            weight={4} 
            opacity={0.8} 
          />
        )}

        {/* Start Point (Restaurant or Pickup) */}
        <Marker position={[start.latitude, start.longitude]} icon={startIcon}>
          <Popup>
            <div className="text-xs font-semibold p-1">
              {isPrivateCourier ? (
                <>
                  <span className="text-orange-600 font-bold block">📦 Point de Retrait</span>
                  <span>{order.items?.[0]?.pickupAddress || "Départ de la course"}</span>
                </>
              ) : (
                <>
                  <span className="text-orange-600 font-bold block">🍔 Restaurant</span>
                  <span>{restaurant?.name || 'Départ'}</span>
                </>
              )}
            </div>
          </Popup>
        </Marker>

        {/* Customer / Destination Point */}
        <Marker position={[destination.lat, destination.lng]} icon={customerIcon}>
          <Popup>
            <div className="text-xs font-semibold p-1">
              <span className="text-blue-600 font-bold block">🏁 Point de Livraison</span>
              <span>{order.deliveryLocation?.address || 'Destination'}</span>
            </div>
          </Popup>
        </Marker>

        {/* Live Delivery Person Marker */}
        {deliveryPos && (
          <Marker position={[deliveryPos.latitude, deliveryPos.longitude]} icon={deliveryIcon}>
            <Popup>
              <div className="text-xs font-semibold p-1">
                <span className="text-brand-600 font-bold block">🛵 Livreur DashMeals</span>
                {order.status === 'delivering' ? (
                  <span>En mouvement vers la destination</span>
                ) : (
                  <span>Livreur assigné</span>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Overlay Info Card (Dynamic calculations) */}
      <div className="absolute bottom-3 left-3 right-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-white/20 dark:border-white/5 z-[400] flex items-center justify-between transition-colors">
          <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 bg-brand-100 dark:bg-brand-900/20 rounded-full flex items-center justify-center text-brand-600 dark:text-brand-400">
                  <Bike size={22} className="animate-pulse" />
              </div>
              <div className="text-left">
                  <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none mb-1">
                    {order.status === 'delivered' || order.status === 'completed' ? 'Course Terminée' : 'Livreur en route'}
                  </p>
                  <p className="text-sm font-black text-gray-900 dark:text-white leading-tight">
                    {order.status === 'delivered' || order.status === 'completed' ? (
                      'Arrivé à destination !'
                    ) : (
                      `Arrivée dans ~${formatTime(metrics.remainingTimeMinutes)}`
                    )}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-0.5">
                    Distance restante : {formatDistance(metrics.remainingDistance)}
                  </p>
              </div>
          </div>
          <div className="flex flex-col items-end">
              <div className="flex items-center text-green-600 dark:text-green-400 text-[9px] font-black uppercase bg-green-50 dark:bg-green-500/10 px-2 py-1 rounded-lg">
                  <ShieldCheck size={12} className="mr-1" /> Sécurisé
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-bold font-mono">
                {order.status === 'delivered' || order.status === 'completed' ? '100%' : `${Math.round(progress * 100)}%`} du trajet
              </p>
          </div>
      </div>

      {/* Dynamic Progress Bar at top of map */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-800 z-[400]">
          <div 
            className="h-full bg-brand-500 transition-all duration-1000 ease-linear"
            style={{ width: `${order.status === 'delivered' || order.status === 'completed' ? 100 : progress * 100}%` }}
          ></div>
      </div>
    </div>
  );
};
