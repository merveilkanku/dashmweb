// Standard Google Maps benchmark speed constants in km/h for urban conditions
export const SPEED_WALKING = 5.0; // 5.0 km/h (exact Google Maps walking pace: 12 min / km)
export const SPEED_MOTO = 32.0;    // 32.0 km/h urban
export const SPEED_CAR = 30.0;     // 30.0 km/h urban average

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Normalise les coordonnées GPS. Si lat/lng sont inversées (ex: lat ~ 15 et lng ~ -4 pour Kinshasa), 
 * les remet automatiquement dans le bon ordre.
 */
export function normalizeCoords(lat: number, lon: number): { lat: number; lon: number } {
  let cleanLat = Number(lat);
  let cleanLon = Number(lon);

  if (isNaN(cleanLat) || isNaN(cleanLon)) {
    return { lat: -4.325, lon: 15.322 }; // Centre Kinshasa par défaut
  }

  // Si lat est positif (~15) et lon est négatif (~ -4), ils ont été inversés lors de l'enregistrement
  if (cleanLat > 0 && cleanLon < 0) {
    const temp = cleanLat;
    cleanLat = cleanLon;
    cleanLon = temp;
  }

  // Si lat est positif en RDC/Kinshasa (ex: +4.32 au lieu de -4.32)
  if (cleanLat > 0 && cleanLat < 10 && cleanLon > 10 && cleanLon < 30) {
    cleanLat = -Math.abs(cleanLat);
  }

  return { lat: cleanLat, lon: cleanLon };
}

/**
 * Calculates straight line distance between two coordinates in Kilometers using Haversine formula
 */
export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const c1 = normalizeCoords(lat1, lon1);
  const c2 = normalizeCoords(lat2, lon2);

  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(c2.lat - c1.lat);
  const dLon = deg2rad(c2.lon - c1.lon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(c1.lat)) * Math.cos(deg2rad(c2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return Number(d.toFixed(2));
}

/**
 * Estimates real road network distance in km applying urban grid factor (~1.20x over straight line, matching Google Maps)
 */
export function getEstimatedRoadDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const straightLine = getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2);
  return Number((straightLine * 1.20).toFixed(2));
}

/**
 * Returns estimated time in minutes for a given speed
 */
export function calculateTime(distanceKm: number, speedKmh: number): number {
  if (!distanceKm || distanceKm <= 0) return 0;
  const timeHours = distanceKm / speedKmh;
  return Math.ceil(timeHours * 60);
}

/**
 * Calculates realistic Google Maps aligned travel time
 */
export function calculateRealisticTime(distanceRoadKm: number, vehicleType: 'moto' | 'pieton' | 'voiture' | 'velo' = 'moto'): number {
  if (!distanceRoadKm || distanceRoadKm <= 0) return 0;
  
  if (vehicleType === 'pieton') {
    // Walking ~5.0 km/h (12 mins per km, matching Google Maps)
    return Math.max(1, Math.round((distanceRoadKm / SPEED_WALKING) * 60));
  } else if (vehicleType === 'velo') {
    // Bicycle ~15 km/h
    return Math.max(1, Math.round((distanceRoadKm / 15) * 60));
  } else if (vehicleType === 'voiture') {
    // Urban car ~30 km/h
    return Math.max(1, Math.round((distanceRoadKm / SPEED_CAR) * 60));
  } else {
    // Moto ~32 km/h
    return Math.max(1, Math.round((distanceRoadKm / SPEED_MOTO) * 60));
  }
}

export function formatDistance(km: number | undefined | null): string {
  if (km === undefined || km === null) return '--';
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)} km`;
}

export function formatTime(minutes: number | undefined | null): string {
  if (minutes === undefined || minutes === null) return '--';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${minutes} min`;
}