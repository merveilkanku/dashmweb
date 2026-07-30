import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Restaurant, Location } from '../types';
import { Navigation, Bike, Footprints, Star, X, ExternalLink, MapPin, Zap, Compass } from 'lucide-react';
import { formatTime, getEstimatedRoadDistanceInKm, calculateRealisticTime } from '../utils/geo';
import { getRoute } from '../utils/routing';

interface Props {
  restaurants: Restaurant[];
  userLocation: Location | null;
  onSelect: (r: Restaurant) => void;
  onLocationChange?: (loc: Location) => void;
  selectedRestaurant?: Restaurant | null;
  onClose?: () => void;
}

// Composant utilitaire pour recentrer la carte
const RecenterMap = ({ center }: { center: Location }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.latitude, center.longitude], 15, {
      animate: true,
      duration: 1.5
    });
  }, [center, map]);
  return null;
};

// Composant utilitaire pour ajuster la vue sur l'itinéraire (utilisateur + restaurant)
const FitRouteBounds = ({ userLoc, restoLoc }: { userLoc: Location; restoLoc: { latitude: number; longitude: number } }) => {
  const map = useMap();
  useEffect(() => {
    if (userLoc && restoLoc) {
      const bounds = L.latLngBounds([
        [userLoc.latitude, userLoc.longitude],
        [restoLoc.latitude, restoLoc.longitude]
      ]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
    }
  }, [userLoc?.latitude, userLoc?.longitude, restoLoc?.latitude, restoLoc?.longitude, map]);
  return null;
};

// Composant pour gérer le clic sur la carte
const MapClickHandler = ({ onLocationChange }: { onLocationChange?: (loc: Location) => void }) => {
  useMapEvents({
    click(e) {
      if (onLocationChange) {
        onLocationChange({ latitude: e.latlng.lat, longitude: e.latlng.lng });
      }
    },
  });
  return null;
};

export const MapView: React.FC<Props> = ({ 
  restaurants, 
  userLocation, 
  onSelect, 
  onLocationChange,
  selectedRestaurant,
  onClose
}) => {
  const [mapCenter, setMapCenter] = useState<Location>({ latitude: -4.301, longitude: 15.301 });
  const [activeResto, setActiveResto] = useState<Restaurant | null>(selectedRestaurant || null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distKm: number; timeMoto: number; timeWalk: number } | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);

  useEffect(() => {
    if (userLocation) {
      setMapCenter(userLocation);
    }
  }, [userLocation]);

  useEffect(() => {
    if (selectedRestaurant) {
      setActiveResto(selectedRestaurant);
    }
  }, [selectedRestaurant]);

  // Calcul d'itinéraire dès qu'un restaurant est actif
  useEffect(() => {
    let isMounted = true;
    if (!activeResto || !userLocation) {
      setRouteGeometry([]);
      setRouteInfo(null);
      return;
    }

    const computeFastRoute = async () => {
      setIsCalculatingRoute(true);
      const uLat = userLocation.latitude;
      const uLng = userLocation.longitude;
      const rLat = activeResto.latitude;
      const rLng = activeResto.longitude;

      // Distance théorique routière
      const estRoadKm = getEstimatedRoadDistanceInKm(uLat, uLng, rLat, rLng);
      const estMoto = calculateRealisticTime(estRoadKm, 'moto');
      const estWalk = calculateRealisticTime(estRoadKm, 'pieton');

      try {
        const res = await getRoute({ lat: uLat, lng: uLng }, { lat: rLat, lng: rLng }, 'moto');
        if (isMounted) {
          if (res && res.geometry && res.geometry.length > 0) {
            setRouteGeometry(res.geometry);
            setRouteInfo({
              distKm: res.distanceKm,
              timeMoto: res.durationMin,
              timeWalk: calculateRealisticTime(res.distanceKm, 'pieton')
            });
          } else {
            // Fallback ligne directe
            setRouteGeometry([[uLat, uLng], [rLat, rLng]]);
            setRouteInfo({ distKm: estRoadKm, timeMoto: estMoto, timeWalk: estWalk });
          }
        }
      } catch (e) {
        if (isMounted) {
          setRouteGeometry([[uLat, uLng], [rLat, rLng]]);
          setRouteInfo({ distKm: estRoadKm, timeMoto: estMoto, timeWalk: estWalk });
        }
      } finally {
        if (isMounted) setIsCalculatingRoute(false);
      }
    };

    computeFastRoute();

    return () => { isMounted = false; };
  }, [activeResto, userLocation]);

  // Icône Utilisateur (Point bleu pulsant)
  const userIcon = L.divIcon({
    className: 'custom-user-icon',
    html: `
      <div class="relative flex items-center justify-center w-7 h-7">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-5 w-5 bg-blue-600 border-2 border-white shadow-xl"></span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  // Icône Restaurant (Pin Orange SVG)
  const createRestoIcon = (resto: Restaurant) => {
    const isSelected = activeResto?.id === resto.id;
    const isOpen = resto.isOpen;
    return L.divIcon({
      className: 'custom-resto-icon',
      html: `
        <div class="relative w-9 h-9 flex flex-col items-center justify-center transition-all ${isSelected ? 'scale-125 z-50' : 'hover:scale-110'}">
          <svg viewBox="0 0 24 24" fill="${isSelected ? '#2563eb' : (isOpen ? '#ea580c' : '#9ca3af')}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-9 h-9 drop-shadow-lg">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3" fill="white"></circle>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36]
    });
  };

  // URL de navigation externe Google Maps
  const googleMapsUrl = activeResto && userLocation
    ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation.latitude},${userLocation.longitude}&destination=${activeResto.latitude},${activeResto.longitude}&travelmode=driving`
    : activeResto
    ? `https://www.google.com/maps/search/?api=1&query=${activeResto.latitude},${activeResto.longitude}`
    : '#';

  return (
    <div className="relative w-full h-[calc(100vh-180px)] rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 z-0 shadow-lg">
      
      <MapContainer 
        center={[mapCenter.latitude, mapCenter.longitude]} 
        zoom={14} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterMap center={mapCenter} />
        
        {userLocation && activeResto && (
          <FitRouteBounds userLoc={userLocation} restoLoc={{ latitude: activeResto.latitude, longitude: activeResto.longitude }} />
        )}

        <MapClickHandler onLocationChange={onLocationChange} />

        {/* Tracé de l'itinéraire (Chemin rapide OSRM / Google Maps style) */}
        {routeGeometry.length > 1 && (
          <>
            {/* Ligne d'arrière-plan avec lueur/ombre */}
            <Polyline 
              positions={routeGeometry} 
              color="#1d4ed8" 
              weight={8} 
              opacity={0.3} 
            />
            {/* Ligne principale de navigation */}
            <Polyline 
              positions={routeGeometry} 
              color="#2563eb" 
              weight={5} 
              opacity={0.9} 
            />
          </>
        )}

        {/* Marqueur Utilisateur */}
        {userLocation && (
          <Marker position={[userLocation.latitude, userLocation.longitude]} icon={userIcon}>
             <Popup closeButton={false} offset={[0, -10]}>
                <span className="font-bold text-blue-600 text-xs">Votre Position Actuelle</span>
             </Popup>
          </Marker>
        )}

        {/* Marqueurs Restaurants (uniquement en ligne et actifs) */}
        {restaurants.filter(r => r.isActive !== false && r.isOnline !== false).map((resto) => (
          <Marker 
            key={resto.id} 
            position={[resto.latitude, resto.longitude]} 
            icon={createRestoIcon(resto)}
            eventHandlers={{
              click: () => setActiveResto(resto),
            }}
          >
            <Popup className="rounded-xl overflow-hidden p-0 shadow-lg">
              <div 
                className="w-52 cursor-pointer"
                onClick={() => {
                  setActiveResto(resto);
                }}
              >
                 <div className="relative h-24 bg-gray-200">
                    <img src={resto.coverImage} className="w-full h-full object-cover rounded-t-lg" alt={resto.name} />
                    <div className="absolute top-2 left-2 flex gap-1">
                        {resto.isVerified && (
                            <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm flex items-center">
                                <Star size={8} className="mr-0.5 fill-white" /> Premium
                            </span>
                        )}
                    </div>
                    <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${resto.isOpen ? 'bg-green-500' : 'bg-red-500'}`}>
                        {resto.isOpen ? 'Ouvert' : 'Fermé'}
                    </span>
                 </div>
                 <div className="p-3">
                    <h3 className="font-bold text-gray-800 text-sm mb-1">{resto.name}</h3>
                    <div className="flex justify-between items-center text-xs text-gray-500">
                        {resto.timeMoto && (
                            <span className="flex items-center text-orange-600 font-bold">
                                <Bike size={12} className="mr-1"/> {formatTime(resto.timeMoto)}
                            </span>
                        )}
                        <span className="flex items-center font-bold text-amber-500">
                            ★ {resto.rating}
                        </span>
                    </div>
                 </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Boutons d'action flottants en haut à droite */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col space-y-2.5">
        {onClose && (
          <button 
            onClick={onClose}
            className="bg-white dark:bg-gray-800 p-3 rounded-full shadow-2xl text-gray-700 dark:text-gray-200 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all active:scale-95 border border-gray-200 dark:border-gray-700 flex items-center justify-center group"
            title="Fermer la carte"
            aria-label="Fermer la carte"
          >
            <X size={20} className="stroke-[2.5] group-hover:scale-110 transition-transform" />
          </button>
        )}

        <button 
          onClick={() => {
            if (userLocation) setMapCenter(userLocation);
          }}
          className="bg-white dark:bg-gray-800 p-3 rounded-full shadow-xl text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-gray-750 transition-all active:scale-95 border border-gray-200 dark:border-gray-700 flex items-center justify-center"
          title="Ma position"
          aria-label="Ma position"
        >
          <Navigation size={18} className={userLocation ? "fill-current" : ""} />
        </button>
      </div>

      {/* Légende rapide en haut à gauche */}
      <div className="absolute top-4 left-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-md z-[400] text-xs border border-gray-100 dark:border-gray-800 pointer-events-none">
          <div className="flex items-center space-x-2 mb-1">
              <span className="w-3 h-3 rounded-full bg-blue-600 border border-white shadow-sm"></span>
              <span className="text-gray-800 dark:text-gray-200 font-bold">Moi</span>
          </div>
          <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-orange-600 border border-white shadow-sm"></span>
              <span className="text-gray-800 dark:text-gray-200 font-bold">Restaurant</span>
          </div>
          {routeGeometry.length > 1 && (
            <div className="flex items-center space-x-2 mt-1 pt-1 border-t border-gray-100 dark:border-gray-800">
                <span className="w-4 h-1 rounded-full bg-blue-600"></span>
                <span className="text-blue-600 dark:text-blue-400 font-extrabold text-[10px]">Itinéraire Rapide</span>
            </div>
          )}
      </div>

      {/* CARTE D'ITINÉRAIRE RAPIDE FLOATTANTE STYLE GOOGLE MAPS */}
      {activeResto && (
        <div className="absolute bottom-4 left-4 right-4 md:left-6 md:right-auto md:w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-4 z-[500] animate-in slide-in-from-bottom duration-300">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center space-x-3 min-w-0">
              <img 
                src={activeResto.coverImage} 
                alt={activeResto.name} 
                className="w-12 h-12 rounded-xl object-cover shrink-0 border border-gray-100 dark:border-gray-800 shadow-sm"
              />
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-sm text-gray-900 dark:text-white truncate">{activeResto.name}</h3>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 text-white ${activeResto.isOpen ? 'bg-emerald-500' : 'bg-red-500'}`}>
                    {activeResto.isOpen ? 'Ouvert' : 'Fermé'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center mt-0.5">
                  <MapPin size={12} className="mr-1 shrink-0 text-orange-500" />
                  {activeResto.city || 'Kinshasa'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                setActiveResto(null);
                setRouteGeometry([]);
                setRouteInfo(null);
              }}
              className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* TEMPS ET DISTANCE D'ITINÉRAIRE EN TEMPS RÉEL */}
          <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-3 my-3 border border-gray-100 dark:border-gray-750">
            {isCalculatingRoute ? (
              <div className="flex items-center justify-center py-2 text-xs font-bold text-gray-500">
                <Compass size={16} className="animate-spin mr-2 text-brand-500" />
                Calcul du chemin le plus rapide...
              </div>
            ) : routeInfo ? (
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-center text-xs font-black text-orange-600 dark:text-orange-400">
                    <Bike size={14} className="mr-1" /> Moto
                  </div>
                  <p className="text-base font-black text-gray-900 dark:text-white mt-0.5">
                    {formatTime(routeInfo.timeMoto)}
                  </p>
                  <p className="text-[10px] text-gray-400 font-semibold">{routeInfo.distKm} km</p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-center text-xs font-black text-blue-600 dark:text-blue-400">
                    <Footprints size={14} className="mr-1" /> À pied
                  </div>
                  <p className="text-base font-black text-gray-900 dark:text-white mt-0.5">
                    {formatTime(routeInfo.timeWalk)}
                  </p>
                  <p className="text-[10px] text-gray-400 font-semibold">{routeInfo.distKm} km</p>
                </div>
              </div>
            ) : null}
          </div>

          {/* BOUTONS D'ACTION (GOOGLE MAPS & VOIR LE MENU) */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 text-center"
            >
              <ExternalLink size={14} className="mr-1.5" /> Google Maps
            </a>
            <button
              onClick={() => onSelect(activeResto)}
              className="flex items-center justify-center py-2.5 px-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 text-center"
            >
              Voir le Menu
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
