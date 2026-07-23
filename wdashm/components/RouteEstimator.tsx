import React from 'react';
import { useRoute } from '../hooks/useRoute';

interface Point {
  lat: number;
  lng: number;
}

interface Props {
  from: Point | null | undefined;
  to: Point | null | undefined;
  vehicleType?: string;
  fallbackDistance: number;
  fallbackMinutes: number;
}

export const RouteEstimator: React.FC<Props> = ({
  from,
  to,
  vehicleType = 'moto',
  fallbackDistance,
  fallbackMinutes,
}) => {
  const { route, loading } = useRoute(from, to, vehicleType);

  const displayDistance = route ? route.distanceKm : fallbackDistance;
  const displayMinutes = route ? route.durationMin : fallbackMinutes;
  const isReal = !!route;

  return (
    <div className="flex items-center gap-2 bg-slate-50 dark:bg-gray-800 border border-slate-100 dark:border-gray-700 p-2.5 rounded-xl mb-4 text-xs transition-colors">
      <span className="text-brand-600 shrink-0">
        {vehicleType === 'pieton' ? '🚶' : vehicleType === 'velo' ? '🚲' : vehicleType === 'voiture' ? '🚗' : '🛵'}
      </span>
      <div className="flex-1 flex justify-between items-center">
        <span className="font-semibold text-gray-600 dark:text-gray-400">
          Distance : <strong className="text-gray-900 dark:text-white">{displayDistance} km {isReal && <span className="text-[10px] text-brand-600 font-bold font-sans">(réel)</span>}</strong>
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
          ⏱️ ~<strong className="text-brand-600 dark:text-brand-400">{displayMinutes} min {isReal && <span className="text-[10px] text-brand-600 font-bold">(itinéraire)</span>}</strong> en {vehicleType || 'moto'}
          {loading && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-ping inline-block ml-1" />}
        </span>
      </div>
    </div>
  );
};
