import { getEstimatedRoadDistanceInKm, calculateRealisticTime } from './geo';

interface RouteResult {
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][]; // [lat, lng][]
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

/**
 * Calcule l'itinéraire réel entre deux points GPS en utilisant l'API OSRM (réseau routier réel).
 * En cas d'échec de l'API, bascule sur une estimation basée sur la distance routière urbaine réelle (~1.38x).
 * vehicleType: 'moto', 'voiture', 'pieton', 'velo'
 */
export async function getRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  vehicleType: string = 'moto'
): Promise<RouteResult | null> {
  if (!from || !to || isNaN(from.lat) || isNaN(from.lng) || isNaN(to.lat) || isNaN(to.lng)) {
    return null;
  }
  
  // Mapping vers les profils OSRM
  let profile = 'driving';
  if (vehicleType === 'pieton' || vehicleType === 'foot') profile = 'foot';
  if (vehicleType === 'velo') profile = 'bike';
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const url = `${OSRM_BASE}/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]) {
        const route = data.routes[0];
        const geometry: [number, number][] = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
        );

        // Distance réelle sur route en km (depuis OSRM)
        const realDistanceKm = Number((route.distance / 1000).toFixed(2));

        // Durée réelle sur route en minutes (depuis OSRM avec ajustement selon véhicule)
        const baseDurationMin = route.duration / 60;
        let durationMin = Math.round(baseDurationMin);

        if (vehicleType === 'pieton' || vehicleType === 'foot') {
          durationMin = Math.max(1, Math.round(baseDurationMin));
        } else if (vehicleType === 'moto') {
          // Moto en ville : déplacement fluide mais 2 min de battement démarrage/recherche
          durationMin = Math.max(2, Math.round(baseDurationMin * 1.05 + 2));
        } else if (vehicleType === 'voiture') {
          // Voiture : embouteillages urbains + 3 min stationnement/circulation
          durationMin = Math.max(3, Math.round(baseDurationMin * 1.3 + 3));
        } else if (vehicleType === 'velo') {
          durationMin = Math.max(2, Math.round(baseDurationMin * 1.1 + 1));
        }

        return {
          distanceKm: realDistanceKm,
          durationMin,
          geometry,
        };
      }
    }
  } catch (err) {
    console.warn('Erreur ou timeout itinéraire OSRM, bascule sur calcul routier estimé:', err);
  }

  // Fallback : Estimation routière urbaine réaliste (distance + détour + vitesse réseau)
  const roadDistanceKm = getEstimatedRoadDistanceInKm(from.lat, from.lng, to.lat, to.lng);
  const normalizedVehicle = (vehicleType === 'pieton' || vehicleType === 'foot') ? 'pieton'
    : (vehicleType === 'voiture') ? 'voiture'
    : (vehicleType === 'velo') ? 'velo'
    : 'moto';

  const durationMin = calculateRealisticTime(roadDistanceKm, normalizedVehicle);

  return {
    distanceKm: roadDistanceKm,
    durationMin,
    geometry: [
      [from.lat, from.lng],
      [to.lat, to.lng]
    ],
  };
}


