import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

interface LivePoint {
  lat: number;
  lng: number;
  heading?: number;
}

export function useLiveDeliveryLocation(
  orderId: string | null,
  fallbackLat?: number,
  fallbackLng?: number
) {
  const [location, setLocation] = useState<LivePoint | null>(null);
  const [isLive, setIsLive] = useState(false);
  const liveTimeoutRef = useRef<any>(null);

  // Sync state if fallback coordinates change and we are not live
  useEffect(() => {
    if (fallbackLat && fallbackLng && !isLive) {
      setLocation({ lat: fallbackLat, lng: fallbackLng });
    }
  }, [fallbackLat, fallbackLng, isLive]);

  useEffect(() => {
    if (!orderId) return;

    // Initial value if available
    if (fallbackLat && fallbackLng) {
      setLocation({ lat: fallbackLat, lng: fallbackLng });
    }

    const channel = supabase.channel(`tracking-${orderId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'location' }, (payload: any) => {
        if (payload && payload.payload) {
          const { lat, lng, heading } = payload.payload;
          if (lat && lng) {
            setLocation({ lat, lng, heading });
            setIsLive(true);

            if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current);
            liveTimeoutRef.current = setTimeout(() => setIsLive(false), 25000);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current);
    };
  }, [orderId]);

  return { location, isLive };
}
