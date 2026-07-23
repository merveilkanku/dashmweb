// Speed constants in km/h for realistic urban conditions
export const SPEED_WALKING = 4.5;
export const SPEED_MOTO = 24;
export const SPEED_CAR = 18;

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculates distance between two coordinates in Kilometers using Haversine formula (straight line)
 */
export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

/**
 * Estimates realistic road network distance in km applying an urban road detour factor (~1.38x)
 */
export function getEstimatedRoadDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const straightLine = getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2);
  return Number((straightLine * 1.38).toFixed(2));
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
 * Calculates realistic urban transport time considering vehicle type and startup/traffic margins
 */
export function calculateRealisticTime(distanceRoadKm: number, vehicleType: 'moto' | 'pieton' | 'voiture' | 'velo' = 'moto'): number {
  if (!distanceRoadKm || distanceRoadKm <= 0) return 0;
  
  if (vehicleType === 'pieton') {
    // Walking ~4.5 km/h
    return Math.max(1, Math.round((distanceRoadKm / SPEED_WALKING) * 60));
  } else if (vehicleType === 'velo') {
    // Bicycle ~14 km/h
    return Math.max(1, Math.round((distanceRoadKm / 14) * 60) + 1);
  } else if (vehicleType === 'voiture') {
    // Urban car traffic ~18 km/h + 3 min traffic overhead
    return Math.max(3, Math.round((distanceRoadKm / SPEED_CAR) * 60) + 3);
  } else {
    // Moto ~24 km/h average in urban conditions + 2 min startup/prep
    return Math.max(2, Math.round((distanceRoadKm / SPEED_MOTO) * 60) + 2);
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
    return `${h}h ${m}min`;
  }
  return `${minutes} min`;
}