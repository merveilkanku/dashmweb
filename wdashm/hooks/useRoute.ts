import { useEffect, useState } from 'react';
import { getRoute } from '../utils/routing';

interface Point {
  lat: number;
  lng: number;
}

interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
}

export function useRoute(
  from: Point | null | undefined,
  to: Point | null | undefined,
  vehicleType: string = 'moto'
) {
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!from || !to || !from.lat || !from.lng || !to.lat || !to.lng) {
      setRoute(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getRoute(from, to, vehicleType)
      .then((result) => {
        if (!cancelled) {
          setRoute(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("useRoute error:", err);
        if (!cancelled) {
          setRoute(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [from?.lat, from?.lng, to?.lat, to?.lng, vehicleType]);

  return { route, loading };
}
