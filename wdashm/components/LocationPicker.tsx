import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Crosshair, Loader, AlertCircle, Navigation } from 'lucide-react';
import { toast } from 'sonner';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Location {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  country?: string;
}

interface Props {
  onLocationSelect: (location: Location) => void;
  initialLocation?: Location;
  defaultCenter?: [number, number];
  defaultZoom?: number;
}

// Coordonnées exactes de Lubumbashi
const LUBUMBASHI_COORDS: [number, number] = [-11.6644, 27.4795];

// Coordonnées des grandes villes de RDC
const CITY_COORDINATES: Record<string, [number, number]> = {
  'Kinshasa': [-4.4419, 15.2663],
  'Lubumbashi': LUBUMBASHI_COORDS,
  'Goma': [-1.6741, 29.2342],
  'Bukavu': [-2.4978, 28.8529],
  'Kisangani': [0.5153, 25.1875],
  'Matadi': [-5.8167, 13.45],
  'Kananga': [-5.895, 22.4175],
  'Mbuji-Mayi': [-6.121, 23.603],
  'Kolwezi': [-10.7167, 25.4667],
  'Likasi': [-10.9833, 26.7333],
  'Boma': [-5.85, 13.05],
  'Kikwit': [-5.0333, 18.8167],
  'Mbandaka': [0.05, 18.2667],
  'Butembo': [0.1333, 29.2833],
  'Beni': [0.5, 29.4667]
};

const getDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
};

const getNearestCity = (lat: number, lng: number): string => {
  let nearestCity = 'Lubumbashi';
  let minDistance = Infinity;
  
  for (const [cityName, coords] of Object.entries(CITY_COORDINATES)) {
    const dist = getDistanceInKm(lat, lng, coords[0], coords[1]);
    if (dist < minDistance) {
      minDistance = dist;
      nearestCity = cityName;
    }
  }
  return nearestCity;
};

const fetchAddress = async (lat: number, lng: number): Promise<{ address: string; city: string; country: string }> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&email=contact@dashmeals.app`
    );
    if (!res.ok) throw new Error("Erreur de géocodage");
    const data = await res.json();
    
    let city = data.address?.city || 
               data.address?.town || 
               data.address?.village || 
               data.address?.state;
    
    if (city) {
      const matchedCity = Object.keys(CITY_COORDINATES).find(
        c => c.toLowerCase().trim() === city.toLowerCase().trim()
      );
      if (matchedCity) {
        city = matchedCity;
      } else {
        city = getNearestCity(lat, lng);
      }
    } else {
      city = getNearestCity(lat, lng);
    }
    
    const country = data.address?.country || 'République Démocratique du Congo';
    const displayName = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    
    return {
      address: displayName,
      city: city,
      country: country
    };
  } catch (error) {
    console.error("Reverse geocoding failed", error);
    return {
      address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      city: getNearestCity(lat, lng),
      country: 'RDC'
    };
  }
};

const LocationMarker = ({ 
  position, 
  onPositionChange
}: { 
  position: Location | null; 
  onPositionChange: (lat: number, lng: number) => void;
}) => {
  const map = useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    if (position) {
      map.flyTo([position.lat, position.lng], map.getZoom());
    }
  }, [position?.lat, position?.lng, map]);

  const markerRef = useRef<any>(null);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          onPositionChange(latLng.lat, latLng.lng);
        }
      },
    }),
    [onPositionChange],
  );

  return position === null ? null : (
    <Marker 
      draggable={true}
      eventHandlers={eventHandlers}
      position={[position.lat, position.lng]} 
      ref={markerRef}
    />
  );
};

export const LocationPicker: React.FC<Props> = ({ 
  onLocationSelect, 
  initialLocation,
  defaultCenter = LUBUMBASHI_COORDS,
  defaultZoom = 12
}) => {
  const [position, setPosition] = useState<Location | null>(initialLocation || null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(defaultCenter);
  const [locationStatus, setLocationStatus] = useState<string>('');
  
  // Saisie manuelle des coordonnées
  const [manualLat, setManualLat] = useState<string>(initialLocation?.lat.toString() || defaultCenter[0].toString());
  const [manualLng, setManualLng] = useState<string>(initialLocation?.lng.toString() || defaultCenter[1].toString());

  // Sélectionner Lubumbashi par défaut
  const selectLubumbashi = () => {
    const lubumbashiLocation = {
      lat: LUBUMBASHI_COORDS[0],
      lng: LUBUMBASHI_COORDS[1],
      address: "Lubumbashi, Haut-Katanga, République Démocratique du Congo",
      city: "Lubumbashi",
      country: "RDC"
    };
    
    setPosition(lubumbashiLocation);
    setMapCenter(LUBUMBASHI_COORDS);
    setManualLat(LUBUMBASHI_COORDS[0].toString());
    setManualLng(LUBUMBASHI_COORDS[1].toString());
    setLocationStatus("📍 Lubumbashi sélectionné");
    onLocationSelect(lubumbashiLocation);
    toast.success("📍 Lubumbashi sélectionné comme position");
    setError(null);
  };

  const applyPosition = async (lat: number, lng: number) => {
    setManualLat(lat.toString());
    setManualLng(lng.toString());
    const { address, city, country } = await fetchAddress(lat, lng);
    const locationData = { lat, lng, address, city, country };
    setPosition(locationData);
    setMapCenter([lat, lng]);
    onLocationSelect(locationData);
    setLocationStatus(`📍 Position définie : ${city || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}`);
    toast.success(`📍 Position définie : ${city || 'Position personnalisée'}`);
  };

  // Fonction pour détecter la position GPS avec gestion d'erreur améliorée
  const locateUser = () => {
    setIsLocating(true);
    setError(null);
    setLocationStatus('🔍 Activation du GPS...');
    
    if (!('geolocation' in navigator)) {
      const errorMsg = "❌ GPS non supporté. Veuillez sélectionner manuellement sur la carte.";
      setError(errorMsg);
      setLocationStatus(errorMsg);
      toast.error(errorMsg);
      setIsLocating(false);
      return;
    }
    
    // Options
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };
    
    try {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (pos && pos.coords) {
            const { latitude, longitude, accuracy } = pos.coords;
            
            console.log("📍 Position GPS détectée:", latitude, longitude);
            await applyPosition(latitude, longitude);
            setLocationStatus(`✅ Position GPS déterminée (Précision: ${Math.round(accuracy)}m)`);
            setIsLocating(false);
          } else {
            throw new Error("Invalid position object");
          }
        },
        (err) => {
          let errorMessage = "";
          switch (err.code) {
            case err.PERMISSION_DENIED:
              errorMessage = "❌ Permission GPS refusée. Activez la localisation dans vos paramètres.";
              break;
            case err.POSITION_UNAVAILABLE:
              errorMessage = "❌ Signal GPS indisponible. Positionnez-vous près d'une fenêtre.";
              break;
            case err.TIMEOUT:
              errorMessage = "⏱️ Délai GPS dépassé. Veuillez réessayer ou entrer vos coordonnées.";
              break;
            default:
              errorMessage = `❌ Erreur GPS: ${err.message || "cause inconnue"}`;
          }
          console.error("Geo error:", errorMessage);
          setError(errorMessage);
          setLocationStatus(errorMessage);
          toast.error(errorMessage);
          setIsLocating(false);
        },
        options
      );
    } catch (syncError: any) {
      console.error("Location picker synchronous GPS error caught:", syncError);
      const errorMessage = "❌ Échec de l'accès au service de position.";
      setError(errorMessage);
      setLocationStatus(errorMessage);
      toast.error(errorMessage);
      setIsLocating(false);
    }
  };

  // Saisie manuelle de coordonnées personnalisées
  const handleManualApply = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error("Coordonnées invalides. Entrez des nombres réels (ex: -11.66, 27.48).");
      return;
    }
    applyPosition(lat, lng);
  };

  // Fonction pour aller à une ville spécifique
  const goToCity = (cityName: string) => {
    const coords = CITY_COORDINATES[cityName];
    if (coords) {
      setMapCenter(coords);
      setManualLat(coords[0].toString());
      setManualLng(coords[1].toString());
      if (cityName === 'Lubumbashi') {
        selectLubumbashi();
      } else {
        const customLocation = {
          lat: coords[0],
          lng: coords[1],
          address: `${cityName}, République Démocratique du Congo`,
          city: cityName,
          country: "RDC"
        };
        setPosition(customLocation);
        onLocationSelect(customLocation);
        setLocationStatus(`📍 Carte centrée sur ${cityName}`);
        toast.info(`Affichage de ${cityName}`);
      }
    }
  };

  // Initialiser ou mettre à jour avec l'emplacement initial si fourni
  useEffect(() => {
    if (!initialLocation) {
      selectLubumbashi();
    } else {
      setPosition(initialLocation);
      setMapCenter([initialLocation.lat, initialLocation.lng]);
      setManualLat(initialLocation.lat.toString());
      setManualLng(initialLocation.lng.toString());
    }
  }, [initialLocation?.lat, initialLocation?.lng]);

  return (
    <div className="space-y-4">
      {/* Barre de contrôle */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* BOUTON LUBUMBASHI - PRINCIPAL */}
        <button
          type="button"
          onClick={selectLubumbashi}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-orange-600 transition-colors shadow-md"
        >
          <MapPin size={18} />
          📍 Lubumbashi
        </button>
        
        {/* Bouton GPS - visible uniquement sur mobile */}
        <button
          type="button"
          onClick={locateUser}
          disabled={isLocating}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-brand-700 transition-colors disabled:opacity-50 md:opacity-70"
          title="Utiliser le GPS (recommandé sur mobile)"
        >
          {isLocating ? (
            <Loader size={18} className="animate-spin" />
          ) : (
            <Navigation size={18} />
          )}
          {isLocating ? 'Recherche...' : '📍 GPS'}
        </button>

        {/* Sélecteur rapide de villes */}
        <select
          onChange={(e) => goToCity(e.target.value)}
          value=""
          className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
        >
          <option value="">🏙️ Autres villes...</option>
          {Object.keys(CITY_COORDINATES).map(city => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </div>

      {/* Saisie manuelle des coordonnées */}
      <div className="bg-gray-50 dark:bg-gray-850/40 p-4 rounded-xl border border-gray-150 dark:border-gray-800 space-y-3">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Saisie manuelle des coordonnées GPS
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">
              Latitude
            </label>
            <input
              type="text"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              placeholder="-11.6644"
              className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-mono outline-none focus:border-orange-500 dark:focus:border-orange-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">
              Longitude
            </label>
            <input
              type="text"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              placeholder="27.4795"
              className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-mono outline-none focus:border-orange-500 dark:focus:border-orange-500 transition-colors"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleManualApply}
          className="w-full py-2 bg-gray-200 dark:bg-gray-700 hover:bg-orange-500 hover:text-white dark:hover:bg-orange-600 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-all active:scale-95"
        >
          Appliquer ces coordonnées
        </button>
      </div>

      {/* Statut de localisation */}
      {locationStatus && (
        <div className={`text-xs p-2 rounded-lg flex items-center gap-2 ${
          locationStatus.includes('Lubumbashi') || locationStatus.includes('✅')
            ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400' 
            : locationStatus.includes('❌') || error
            ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400'
        }`}>
          {locationStatus.includes('Lubumbashi') ? <MapPin size={14} /> : 
           locationStatus.includes('✅') ? <MapPin size={14} /> :
           locationStatus.includes('❌') ? <AlertCircle size={14} /> :
           <Loader size={14} className="animate-spin" />}
          {locationStatus}
        </div>
      )}

      {/* Carte */}
      <div className="relative w-full h-80 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-lg">
        <MapContainer 
          key={`${mapCenter[0]}-${mapCenter[1]}`}
          center={mapCenter} 
          zoom={defaultZoom} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker 
            position={position} 
            onPositionChange={applyPosition} 
          />
        </MapContainer>

        {/* Message d'info */}
        {!position && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/5">
            <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-sm font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <MapPin size={16} className="text-brand-600" />
              Cliquez sur la carte pour définir votre position
            </div>
          </div>
        )}
        
        {/* Indicateur Lubumbashi */}
        {position?.city === 'Lubumbashi' && (
          <div className="absolute top-2 left-2 z-[400] bg-orange-500 text-white text-xs px-2 py-1 rounded-full shadow-md flex items-center gap-1">
            <MapPin size={12} />
            🇨🇩 Lubumbashi
          </div>
        )}
      </div>

      {/* Affichage de la position sélectionnée */}
      {position && (
        <div className={`p-4 rounded-xl border ${
          position.city === 'Lubumbashi' 
            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
            : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        }`}>
          <div className="flex items-start gap-3">
            <MapPin size={20} className={`${
              position.city === 'Lubumbashi' 
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-green-600 dark:text-green-400'
            } mt-0.5`} />
            <div className="flex-1">
              <p className={`font-bold ${
                position.city === 'Lubumbashi' 
                  ? 'text-orange-800 dark:text-orange-300'
                  : 'text-green-800 dark:text-green-300'
              }`}>
                {position.city || 'Position sélectionnée'}
                {position.city === 'Lubumbashi' && ' 🇨🇩'}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {position.address || `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 font-mono">
                📍 {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Message d'erreur */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={selectLubumbashi}
                className="mt-2 text-xs text-red-600 dark:text-red-400 underline hover:no-underline"
              >
                📍 Sélectionner Lubumbashi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-xs text-gray-500 dark:text-gray-400 text-center">
        💡 <strong>Lubumbashi</strong> est sélectionné par défaut.<br />
        📱 Sur mobile, utilisez le bouton <strong>GPS</strong> pour votre position réelle.<br />
        🖱️ Sur ordinateur, cliquez directement sur la carte pour sélectionner un point.
      </div>
    </div>
  );
};