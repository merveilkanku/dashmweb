import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Order, User, Restaurant, OrderStatus } from '../types';
import { RouteEstimator } from './RouteEstimator';
import { APP_LOGO_URL } from '../constants';
import { 
  Bike, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  Navigation, 
  Phone, 
  MessageSquare,
  LogOut,
  User as UserIcon,
  Package,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Wallet,
  Store,
  Star,
  Settings,
  Briefcase,
  Car,
  Footprints,
  Info,
  Check,
  X,
  Bell,
  Building,
  UserCheck,
  Camera,
  Globe,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { requestNotificationPermission } from '../utils/notifications';
import { analytics } from '../utils/analytics';
import { sendPrivateCourierStatusEmail } from '../lib/email';
import { CITIES_RDC } from '../constants';

import { ChatWindow } from './ChatWindow';
import { useTranslation } from '../lib/i18n';
import { HelpCenter } from './HelpCenter';
import { LegalModal } from './LegalModal';
import { AppSettings } from '../types';
import { HelpCircle } from 'lucide-react';

const getDistanceInKm = (lat1?: number, lon1?: number, lat2?: number, lon2?: number) => {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return null;
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return parseFloat(d.toFixed(1));
};

const getTravelTimeInMinutes = (distance: number, vehicleType: string) => {
  let speed = 25; // km/h for moto default
  if (vehicleType === 'velo') speed = 15;
  else if (vehicleType === 'voiture') speed = 20; // slow due to traffic
  else if (vehicleType === 'pieton') speed = 5;
  const hours = distance / speed;
  const minutes = Math.round(hours * 60);
  return Math.max(minutes, 3); // min 3 minutes
};

const PROOF_PHOTO_PRESETS = [
  { id: 'delivered_to_door', label: 'Déposé devant la porte 🚪', url: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=300&h=200&q=80' },
  { id: 'handed_to_customer', label: 'Remis en main propre 🤝', url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=300&h=200&q=80' },
  { id: 'placed_on_reception', label: 'Déposé à la réception 🏢', url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=300&h=200&q=80' },
];

interface Props {
  user: User;
  onLogout: () => void;
  onUpdateUser?: (updated: User) => void;
}

type TabType = 'orders' | 'wallet' | 'restaurants' | 'profile';

export const DeliveryView: React.FC<Props> = ({ user, onLogout, onUpdateUser }) => {
  const t = useTranslation(user.preferences?.language || 'fr');
  const fetchAssignedOrdersRequestId = useRef(0);
  const [activeTab, setActiveTab] = useState<TabType>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [availableCouriers, setAvailableCouriers] = useState<Order[]>([]);
  const [timeTick, setTimeTick] = useState(Date.now());

  // Advanced features state variables
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dashmeals_sound_alerts') !== 'false';
    } catch {
      return true;
    }
  });
  
  const [simulatingOrderId, setSimulatingOrderId] = useState<string | null>(null);
  const [simulationProgress, setSimulationProgress] = useState<number>(0);
  const [simulationCoords, setSimulationCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [showProofModal, setShowProofModal] = useState<boolean>(false);
  const [proofOrderId, setProofOrderId] = useState<string | null>(null);
  const [selectedProofPhoto, setSelectedProofPhoto] = useState<string>('');

  const [walletFilter, setWalletFilter] = useState<'all' | 'today' | 'week'>('all');
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false);
  const [legalView, setLegalView] = useState<'terms' | 'privacy' | 'contact' | null>(null);

  useEffect(() => {
    const fetchAppSettings = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('id', 'global')
          .single();
        if (data?.value) {
          const parsedVal = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          setAppSettings(parsedVal);
        }
      } catch (err) {
        console.error("Error fetching app settings in DeliveryView:", err);
      }
    };
    fetchAppSettings();

    const appSettingsSubscription = supabase
      .channel('public:app_settings_delivery')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_settings',
        filter: 'id=eq.global'
      }, (payload) => {
        if (payload.new && (payload.new as any).value) {
          const rawVal = (payload.new as any).value;
          const parsedVal = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
          setAppSettings(parsedVal);
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(appSettingsSubscription);
    };
  }, []);

  const toggleSoundAlerts = () => {
    const nextVal = !soundAlertsEnabled;
    setSoundAlertsEnabled(nextVal);
    try {
      localStorage.setItem('dashmeals_sound_alerts', String(nextVal));
    } catch (e) {
      console.warn("localStorage write blocked:", e);
    }
    toast.success(nextVal ? "Alertes sonores activées 🔊" : "Alertes sonores coupées 🔇");
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const unacceptedReminders = orders.filter(o => 
    o.delivery_acceptance_status === 'pending' && 
    (timeTick - new Date(o.createdAt).getTime()) > 60000
  );

  const undeliveredReminders = orders.filter(o => 
    o.delivery_acceptance_status === 'accepted' && 
    ['preparing', 'ready', 'delivering'].includes(o.status) && 
    (timeTick - new Date(o.createdAt).getTime()) > 15 * 60000
  );

  useEffect(() => {
    if (!soundAlertsEnabled) return;
    if (unacceptedReminders.length > 0 || undeliveredReminders.length > 0) {
      const playReminderSynth = () => {
        try {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContext) return;
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(unacceptedReminders.length > 0 ? 880 : 587.33, ctx.currentTime);
          
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + 0.15);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
          
          gain.gain.setValueAtTime(0, ctx.currentTime + 0.35);
          gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.4);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + 0.5);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.55);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start();
          osc.stop(ctx.currentTime + 0.6);
        } catch (e) {
          console.warn("Audio context beep skipped: ", e);
        }
      };
      
      playReminderSynth();
      
      const beepInterval = setInterval(() => {
        playReminderSynth();
      }, 30000);
      
      return () => clearInterval(beepInterval);
    }
  }, [unacceptedReminders.length, undeliveredReminders.length, soundAlertsEnabled]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  
  // Profile inputs states
  const [name, setName] = useState(user.name || '');
  const [city, setCity] = useState(user.city || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [address, setAddress] = useState(user.deliveryInfo?.address || '');

  // States for accepting delivery order with estimation popup
  const [acceptingOrder, setAcceptingOrder] = useState<Order | null>(null);
  const [estRestoMins, setEstRestoMins] = useState<number>(10);
  const [estClientMins, setEstClientMins] = useState<number>(15);
  
  // Chat state
  const [activeChatRestaurant, setActiveChatRestaurant] = useState<Order | null>(null);
  const [activeChatCustomer, setActiveChatCustomer] = useState<Order | null>(null);
  const [selectedContactResto, setSelectedContactResto] = useState<Restaurant | null>(null);
  
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target || typeof target.scrollTop !== 'number') return;
      
      const currentScrollY = target.scrollTop;
      
      if (Math.abs(currentScrollY - lastScrollY.current) < 10) return;
      
      if (currentScrollY <= 20) {
        setIsNavVisible(true);
      } else if (currentScrollY > lastScrollY.current) {
        setIsNavVisible(false); // scrolling down
      } else {
        setIsNavVisible(true); // scrolling up
      }
      
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

   // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [vehicleType, setVehicleType] = useState(user.deliveryInfo?.vehicleType || 'moto');
  const [bio, setBio] = useState(user.deliveryInfo?.bio || '');
  const [isAvailable, setIsAvailable] = useState(user.deliveryInfo?.isAvailable ?? true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    setName(user.name || '');
    setCity(user.city || '');
    setPhoneNumber(user.phoneNumber || '');
    setAvatarUrl(user.avatarUrl || '');
    setAddress(user.deliveryInfo?.address || '');
    setVehicleType(user.deliveryInfo?.vehicleType || 'moto');
    setBio(user.deliveryInfo?.bio || '');
    setIsAvailable(user.deliveryInfo?.isAvailable ?? true);
  }, [user]);

  // Synchronisation avec les actions de clic de notification push
  useEffect(() => {
    const handleNavigate = () => {
      console.log("🚀 [DeliveryView] Changement de vue vers les commandes via notification push");
      setActiveTab('orders');
    };
    window.addEventListener('navigate_to_order', handleNavigate);
    return () => window.removeEventListener('navigate_to_order', handleNavigate);
  }, []);



  useEffect(() => {
    fetchAssignedOrders();
    fetchRestaurants();

    const subscription = supabase
      .channel('delivery_orders_and_restaurants')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders'
      }, () => {
        fetchAssignedOrders();
      })
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'restaurants'
      }, () => {
        fetchRestaurants();
      })
      .subscribe();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'dashmeals_mock_orders') {
        fetchAssignedOrders();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const fallbackInterval = setInterval(() => {
      fetchAssignedOrders();
      fetchRestaurants();
    }, 15000);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(fallbackInterval);
      if (watchId !== null && typeof navigator !== 'undefined' && navigator && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (err) {
          console.error('Error clearing geolocation watch:', err);
        }
      }
    };
  }, [user.id]);

  const fetchAssignedOrders = async () => {
    const requestId = ++fetchAssignedOrdersRequestId.current;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          restaurant:restaurants(name, phone_number, latitude, longitude, city, owner_id),
          customer:profiles!user_id(full_name, phone_number, email)
        `)
        .eq('delivery_person_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      let allOrders = data || [];

      // Logic to fetch mock orders in DeliveryView
      const localOrdersStr = localStorage.getItem("dashmeals_mock_orders");
      if (localOrdersStr) {
        try {
          const localOrders = JSON.parse(localOrdersStr);
          const assignedLocalOrders = localOrders.filter(
            (o: any) => o.delivery_person_id === user.id
          );
          
          const merged = [...allOrders];
          assignedLocalOrders.forEach((lOrder: any) => {
            if (!merged.some((o: any) => o.id === lOrder.id)) {
              merged.push(lOrder);
            }
          });
          allOrders = merged;
        } catch (e) {
          console.error("Error parsing local orders in DeliveryView", e);
        }
      }

      // Automatically seed demo orders for demo-delivery driver if completely empty
      if (allOrders.length === 0 && (user.id.includes('demo') || user.email?.includes('demo') || user.role === 'delivery')) {
        const generatedDemoOrders = [
          {
            id: 'mock-order-101',
            user_id: 'demo-client-101',
            userId: 'demo-client-101',
            restaurant_id: 'resto-101',
            restaurantId: 'resto-101',
            status: 'preparing',
            paymentMethod: 'mobile_money',
            paymentStatus: 'paid',
            totalAmount: 18.5,
            exchangeRate: 2800,
            delivery_person_id: user.id,
            delivery_acceptance_status: 'pending',
            created_at: new Date().toISOString(),
            restaurant: {
              name: 'La Chaumière Kinshasa',
              phone_number: '+243899991111',
              latitude: -4.325,
              longitude: 15.305,
              city: 'Kinshasa',
              owner_id: 'owner-chaumiere'
            },
            customer: {
              full_name: 'Merveille Kabamba',
              phone_number: '+243822223333'
            },
            delivery_location: {
              address: 'Boulevard du 30 Juin, Gombe, Kinshasa',
              lat: -4.312,
              lng: 15.297
            },
            items: [
              {
                id: 'm-1',
                name: 'Poulet Mayo Grand Format 🇨🇩',
                description: 'Le célèbre poulet mayo de Kinshasa avec frites et bananes plantains',
                price: 15.0,
                category: 'plat',
                quantity: 1,
                restaurantId: 'resto-101',
                restaurantName: 'La Chaumière Kinshasa'
              },
              {
                id: 'm-2',
                name: 'Coca-Cola 33cl',
                description: 'La boisson rafraîchissante',
                price: 3.5,
                category: 'boisson',
                quantity: 1,
                restaurantId: 'resto-101',
                restaurantName: 'La Chaumière'
              }
            ]
          },
          {
            id: 'mock-order-102',
            user_id: 'demo-client-102',
            userId: 'demo-client-102',
            restaurant_id: 'resto-102',
            restaurantId: 'resto-102',
            status: 'ready',
            paymentMethod: 'cash',
            paymentStatus: 'pending',
            totalAmount: 42.0,
            exchangeRate: 2800,
            delivery_person_id: user.id,
            delivery_acceptance_status: 'accepted',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            restaurant: {
              name: 'Escale Gourmande 🍢',
              phone_number: '+243811112222',
              latitude: -4.341,
              longitude: 15.312,
              city: 'Kinshasa',
              owner_id: 'owner-escale'
            },
            customer: {
              full_name: 'Patrick Mwamba',
              phone_number: '+243855554444'
            },
            delivery_location: {
              address: 'Avenue de la Justice, Gombe, Kinshasa',
              lat: -4.318,
              lng: 15.289
            },
            items: [
              {
                id: 'm-3',
                name: 'Maboké de Capitaine',
                description: 'Poisson capitaine cuit en papillote de feuilles de bananier',
                price: 22.0,
                category: 'plat',
                quantity: 1,
                restaurantId: 'resto-102',
                restaurantName: 'Escale Gourmande 🍢'
              },
              {
                id: 'm-4',
                name: 'Brochettes de Chèvre de Kin (x5)',
                description: 'Kamundele rôti à merveille',
                price: 20.0,
                category: 'plat',
                quantity: 1,
                restaurantId: 'resto-102',
                restaurantName: 'Escale Gourmande 🍢'
              }
            ]
          }
        ];
        
        let existingLocal = [];
        const localOrdersStr = localStorage.getItem("dashmeals_mock_orders");
        if (localOrdersStr) {
          try {
            existingLocal = JSON.parse(localOrdersStr);
          } catch (e) {}
        }
        
        const mergedLocal = [...existingLocal];
        generatedDemoOrders.forEach((demoO: any) => {
          if (!mergedLocal.some((o: any) => o.id === demoO.id)) {
            mergedLocal.push(demoO);
          }
        });
        
        localStorage.setItem("dashmeals_mock_orders", JSON.stringify(mergedLocal));
        allOrders = generatedDemoOrders;
      }

      const mappedOrders = allOrders.map((o: any) => {
        let parsedItems = o.items;
        if (typeof o.items === 'string') {
          try {
            parsedItems = JSON.parse(o.items);
          } catch (e) {
            parsedItems = [];
          }
        }
        
        const fallbackName = parsedItems && parsedItems.length > 0 ? parsedItems[0].customerName : null;
        const fallbackPhone = parsedItems && parsedItems.length > 0 ? parsedItems[0].customerPhone : null;
        
        const fallbackResto = (parsedItems && parsedItems.length > 0) ? {
          name: parsedItems[0].restaurantName || 'Restaurant',
          phone_number: '',
          latitude: undefined,
          longitude: undefined,
          city: '',
          owner_id: ''
        } : undefined;

        return {
          ...o,
          items: parsedItems,
          userId: o.user_id,
          restaurantId: o.restaurant_id,
          createdAt: o.created_at,
          deliveryLocation: o.delivery_location || (parsedItems && parsedItems.length > 0 ? parsedItems[0].deliveryLocation : undefined),
          restaurant: {
            name: o.restaurant?.name || fallbackResto?.name || 'Restaurant',
            phone_number: o.restaurant?.phone_number || '',
            latitude: o.restaurant?.latitude,
            longitude: o.restaurant?.longitude,
            city: o.restaurant?.city || '',
            owner_id: o.restaurant?.owner_id || ''
          },
          customer: {
            full_name: o.customer?.full_name || fallbackName || 'Client Inconnu',
            phone_number: o.customer?.phone_number || fallbackPhone || ''
          }
        };
      });
      // Fetch available unassigned private couriers
      let availableCouriersRaw: any[] = [];
      try {
        const { data: availableData, error: availableError } = await supabase
          .from('orders')
          .select(`
            *,
            restaurant:restaurants(name, phone_number, latitude, longitude, city, owner_id),
            customer:profiles!user_id(full_name, phone_number, email)
          `)
          .is('delivery_person_id', null)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!availableError && availableData) {
          availableCouriersRaw = availableData;
        }
      } catch (err) {
        console.warn("Failed fetching database available couriers:", err);
      }

      // Merge with localStorage unassigned private couriers
      const localOrdersStrForCouriers = localStorage.getItem("dashmeals_mock_orders");
      if (localOrdersStrForCouriers) {
        try {
          const localOrders = JSON.parse(localOrdersStrForCouriers);
          const availableLocal = localOrders.filter(
            (o: any) => (!o.delivery_person_id)
          );
          availableLocal.forEach((lOrder: any) => {
            if (!availableCouriersRaw.some((o: any) => o.id === lOrder.id)) {
              availableCouriersRaw.push(lOrder);
            }
          });
        } catch (e) {
          console.error("Error parsing local orders for couriers:", e);
        }
      }

      // Map and filter specifically for private courier orders
      const mappedAvailableCouriers = availableCouriersRaw
        .map((o: any) => {
          let parsedItems = o.items;
          if (typeof parsedItems === 'string') {
            try {
              parsedItems = JSON.parse(parsedItems);
            } catch {
              parsedItems = [];
            }
          }
          
          const fallbackName = parsedItems && parsedItems.length > 0 ? parsedItems[0].customerName : null;
          const fallbackPhone = parsedItems && parsedItems.length > 0 ? parsedItems[0].customerPhone : null;
          
          return {
            ...o,
            items: parsedItems,
            userId: o.user_id,
            restaurantId: o.restaurant_id,
            createdAt: o.created_at,
            deliveryLocation: o.delivery_location || (parsedItems && parsedItems.length > 0 ? parsedItems[0].deliveryLocation : undefined),
            restaurant: {
              name: o.restaurant?.name || 'Course Privée 📦',
              phone_number: o.restaurant?.phone_number || '',
              latitude: o.restaurant?.latitude,
              longitude: o.restaurant?.longitude,
              city: o.restaurant?.city || '',
              owner_id: o.restaurant?.owner_id || ''
            },
            customer: {
              full_name: o.customer?.full_name || fallbackName || 'Client Inconnu',
              phone_number: o.customer?.phone_number || fallbackPhone || ''
            }
          };
        })
        .filter((o: any) => o.items && o.items[0]?.isPrivateCourier === true);

      if (requestId !== fetchAssignedOrdersRequestId.current) return;
      setOrders(mappedOrders);
      setAvailableCouriers(mappedAvailableCouriers);
      
      const delivering = mappedOrders.find(o => o.status === 'delivering');
      if (delivering) startTracking(delivering.id);
    } catch (error) {
      if (requestId !== fetchAssignedOrdersRequestId.current) return;
      console.error('Error fetching orders:', error);
    } finally {
      if (requestId === fetchAssignedOrdersRequestId.current) {
        setLoading(false);
      }
    }
  };

  const fetchRestaurants = async () => {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .order('is_open', { ascending: false })
        .limit(30);
      if (error) throw error;
      setRestaurants(data || []);
    } catch (error) {
      console.error('Error fetching restaurants:', error);
    }
  };

  const startTracking = (orderId: string) => {
    if (!navigator.geolocation || isTracking) return;

    try {
      setIsTracking(true);
      const id = navigator.geolocation.watchPosition(
        async (position) => {
          if (position?.coords) {
            const { latitude, longitude } = position.coords;
            if (orderId.startsWith('mock-')) {
              const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
              if (localOrdersStr) {
                const localOrders = JSON.parse(localOrdersStr);
                const updatedOrders = localOrders.map((o: any) => o.id === orderId ? { ...o, delivery_lat: latitude, delivery_lng: longitude } : o);
                localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updatedOrders));
              }
            } else {
              await supabase
                .from('orders')
                .update({ delivery_lat: latitude, delivery_lng: longitude })
                .eq('id', orderId);
            }
          }
        },
        (error) => console.error('Geolocation error:', error),
        { enableHighAccuracy: false, maximumAge: 15000, timeout: 10000 }
      );
      setWatchId(id);
    } catch (err) {
      console.error('Synchronous watchPosition error caught:', err);
      setIsTracking(false);
    }
  };

  const stopTracking = () => {
    if (watchId !== null) {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch (err) {
        console.error('Error clearing watch:', err);
      }
      setWatchId(null);
    }
    setIsTracking(false);
  };

  // GPS Simulation Handler Effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (simulatingOrderId) {
      const order = orders.find(o => o.id === simulatingOrderId);
      if (order && order.restaurant?.latitude && order.restaurant?.longitude && order.deliveryLocation?.lat && order.deliveryLocation?.lng) {
        const startLat = order.restaurant.latitude;
        const startLng = order.restaurant.longitude;
        const endLat = order.deliveryLocation.lat;
        const endLng = order.deliveryLocation.lng;

        interval = setInterval(() => {
          setSimulationProgress(prev => {
            const nextProgress = prev + 10;
            if (nextProgress >= 100) {
              clearInterval(interval!);
              setSimulatingOrderId(null);
              setSimulationProgress(0);
              
              toast.success("Simulation GPS terminée ! Vous êtes arrivé à destination.", { icon: '📍' });
              
              // Trigger final update of coordinates
              updateGPSCoordsLocalOrDB(simulatingOrderId, endLat, endLng);
              return 100;
            }
            
            // Interpolate coordinates
            const ratio = nextProgress / 100;
            const currentLat = startLat + (endLat - startLat) * ratio;
            const currentLng = startLng + (endLng - startLng) * ratio;
            
            updateGPSCoordsLocalOrDB(simulatingOrderId, currentLat, currentLng);
            return nextProgress;
          });
        }, 1200); // step every 1.2s
      } else {
        setSimulatingOrderId(null);
        toast.error("Coordonnées de livraison ou de restaurant manquantes pour simuler.");
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [simulatingOrderId, orders]);

  const updateGPSCoordsLocalOrDB = async (orderId: string, lat: number, lng: number) => {
    setSimulationCoords({ lat, lng });

    if (orderId.startsWith('mock-')) {
      const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
      if (localOrdersStr) {
        const localOrders = JSON.parse(localOrdersStr);
        const updated = localOrders.map((o: any) => o.id === orderId ? { ...o, delivery_lat: lat, delivery_lng: lng } : o);
        localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updated));
      }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, delivery_lat: lat, delivery_lng: lng } : o));
    } else {
      try {
        await supabase
          .from('orders')
          .update({ delivery_lat: lat, delivery_lng: lng })
          .eq('id', orderId);
        fetchAssignedOrders();
      } catch (err) {
        console.warn("DB GPS coordinate update failed, updating locally only:", err);
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, delivery_lat: lat, delivery_lng: lng } : o));
      }
    }
  };

  const openProofOfDeliveryModal = (orderId: string) => {
    setProofOrderId(orderId);
    setSelectedProofPhoto(PROOF_PHOTO_PRESETS[0].url);
    setShowProofModal(true);
  };

  const handleConfirmProofAndDeliver = () => {
    if (!proofOrderId) return;
    
    // Complete the order with delivered status
    updateOrderStatus(proofOrderId, 'delivered');
    
    // Optionally save the proof photo inside the mock order in localStorage
    if (proofOrderId.startsWith('mock-')) {
      const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
      if (localOrdersStr) {
        const localOrders = JSON.parse(localOrdersStr);
        const updated = localOrders.map((o: any) => o.id === proofOrderId ? { ...o, proof_of_delivery_photo: selectedProofPhoto } : o);
        localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updated));
      }
    }

    toast.success("Preuve de livraison enregistrée avec succès ! Le client a été averti.", { icon: '📸' });
    setShowProofModal(false);
    setProofOrderId(null);
  };

  const DELIVERY_FEE_USD = 2.5; // Gain fixe par course

  const updateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      if (orderId?.startsWith('mock-')) {
        const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
        if (localOrdersStr) {
          const localOrders = JSON.parse(localOrdersStr);
          const updatedOrders = localOrders.map((o: any) => o.id === orderId ? { ...o, status: newStatus } : o);
          localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updatedOrders));
        }
        
        if (newStatus === 'delivering') {
          startTracking(orderId);
        } else if (newStatus === 'delivered' || newStatus === 'completed' || newStatus === 'cancelled') {
          stopTracking();
        }
        
        toast.success(`Statut mis à jour: ${newStatus} (Mock)`);
        fetchAssignedOrders();
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) {
        console.error("DEBUG: orders update error:", error);
        throw new Error(`Order update error: ${error.message}`);
      }

      // Update delivery profile stats if delivered
      if (newStatus === 'delivered' || newStatus === 'completed') {
        const currentCount = user.deliveryInfo?.completedOrders || 0;
        const { error: profError } = await supabase.from('profiles').update({
          delivery_info: {
            ...user.deliveryInfo,
            completedOrders: currentCount + 1
          }
        }).eq('id', user.id);
        
        if (profError) {
          console.error("DEBUG: profiles update error:", profError);
        }
      }

      // Insert notification for the customer
      const order = orders.find(o => o.id === orderId);
      if (order) {
          const isPrivateCourier = order.items?.[0]?.isPrivateCourier === true;
          const userEmail = order.customer?.email || 'irmerveilkanku@gmail.com';

          if (isPrivateCourier) {
              try {
                  await sendPrivateCourierStatusEmail(order, userEmail, newStatus);
                  console.log(`Private courier status email sent to ${userEmail} for status ${newStatus}`);
              } catch (mailErr) {
                  console.error("Error sending private courier status email:", mailErr);
              }
          }

          if (order.user_id) {
              const statusLabels: Record<string, string> = {
                  'delivering': 'en cours de livraison',
                  'delivered': 'livrée',
                  'completed': 'terminée',
                  'cancelled': 'annulée'
              };
              const { error: notifError } = await supabase.from('notifications').insert({
                  user_id: order.user_id,
                  title: isPrivateCourier ? `Course Privée #${orderId.slice(0, 4)}` : `Commande #${orderId.slice(0, 4)}`,
                  message: isPrivateCourier 
                      ? `Votre course privée est maintenant ${statusLabels[newStatus] || newStatus}.`
                      : `Votre commande est maintenant ${statusLabels[newStatus] || newStatus}.`,
                  type: 'order_status',
                  data: { order_id: orderId, status: newStatus }
              });
              
              if (notifError) {
                console.error("DEBUG: notifications insert error:", notifError);
              }
          }
      }

      if (newStatus === 'delivering') {
        startTracking(orderId);
      } else if (newStatus === 'delivered' || newStatus === 'completed' || newStatus === 'cancelled') {
        stopTracking();
      }

      toast.success(`Statut mis à jour: ${newStatus}`);
      fetchAssignedOrders();
    } catch (error: any) {
      console.warn("⚠️ [Delivery] Fallback de secours local activé pour l'état:", error?.message || error);
      toast.success(`Statut mis à jour (Démo): ${newStatus}`);
      
      // Trigger email notification for local demo mode if private courier
      const fallbackOrder = orders.find(o => o.id === orderId);
      if (fallbackOrder && fallbackOrder.items?.[0]?.isPrivateCourier === true) {
        const userEmail = fallbackOrder.customer?.email || 'irmerveilkanku@gmail.com';
        sendPrivateCourierStatusEmail(fallbackOrder, userEmail, newStatus).catch(err => {
          console.error("Local mode private courier email error:", err);
        });
      }

      // Update local state memory immediately
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));

      // Update in localStorage
      const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
      const localOrders = localOrdersStr ? JSON.parse(localOrdersStr) : [];
      let found = false;
      const updatedMockDirs = localOrders.map((o: any) => {
        if (o.id === orderId) {
          found = true;
          return { ...o, status: newStatus };
        }
        return o;
      });
      if (!found) {
        const orderToSave = orders.find(o => o.id === orderId);
        if (orderToSave) {
          updatedMockDirs.push({ ...orderToSave, status: newStatus });
        }
      }
      localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updatedMockDirs));

      if (newStatus === 'delivering') {
        startTracking(orderId);
      } else if (newStatus === 'delivered' || newStatus === 'completed' || newStatus === 'cancelled') {
        stopTracking();
      }
    }
  };

  const handleUpdateProfile = async () => {
    setIsSavingProfile(true);
    try {
      const newDeliveryInfo = {
        ...user.deliveryInfo,
        vehicleType,
        bio,
        isAvailable,
        address
      };

      const { error } = await supabase
        .from('profiles')
        .update({ 
          delivery_info: newDeliveryInfo,
          full_name: name,
          city: city,
          phone_number: phoneNumber,
          avatar_url: avatarUrl
        })
        .eq('id', user.id);

      if (error) throw error;
      
      if (onUpdateUser) {
        onUpdateUser({
          ...user,
          name,
          city,
          phoneNumber,
          avatarUrl,
          deliveryInfo: newDeliveryInfo
        });
      }

      toast.success("Profil professionnel mis à jour avec succès !");
      setIsEditingProfile(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAcceptProposal = async (orderId: string, arrivalRestoMins: number, arrivalClientMins: number) => {
    analytics.logEvent('accept_delivery_proposal', { orderId, arrivalRestoMins, arrivalClientMins });
    const now = new Date();
    const timeResto = new Date(now.getTime() + arrivalRestoMins * 60000);
    const restoHours = String(timeResto.getHours()).padStart(2, '0');
    const restoMinutes = String(timeResto.getMinutes()).padStart(2, '0');
    const estRestoText = `${restoHours}:${restoMinutes} (dans ${arrivalRestoMins} min)`;

    const timeClient = new Date(now.getTime() + (arrivalRestoMins + arrivalClientMins) * 60000);
    const clientHours = String(timeClient.getHours()).padStart(2, '0');
    const clientMinutes = String(timeClient.getMinutes()).padStart(2, '0');
    const estClientText = `${clientHours}:${clientMinutes} (dans ${arrivalRestoMins + arrivalClientMins} min)`;

    try {
      if (orderId?.startsWith('mock-') || !navigator.onLine) {
        throw new Error("Local/Offline/Demo mode");
      }

      const { error } = await supabase
        .from('orders')
        .update({ 
          delivery_acceptance_status: 'accepted',
          estimated_arrival_restaurant: estRestoText,
          estimated_arrival_customer: estClientText
        })
        .eq('id', orderId);

      if (error) throw error;
      toast.success("Mission acceptée ! Estimations de livraison enregistrées.");

      // If it's a mock order, update localStorage
      if (orderId && orderId.startsWith('mock-')) {
        const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
        if (localOrdersStr) {
          const localOrders = JSON.parse(localOrdersStr);
          const updatedOrders = localOrders.map((o: any) => o.id === orderId ? { 
            ...o, 
            delivery_acceptance_status: 'accepted',
            estimated_arrival_restaurant: estRestoText,
            estimated_arrival_customer: estClientText
          } : o);
          localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updatedOrders));
        }
      } else {
        // Query details to notify restaurant and customer
        const { data: orderData } = await supabase
          .from('orders')
          .select('restaurant_id, user_id')
          .eq('id', orderId)
          .single();

        if (orderData) {
          if (orderData.restaurant_id) {
            // Get owner profile of restaurant
            const { data: memoResto } = await supabase
              .from('restaurants')
              .select('owner_id')
              .eq('id', orderData.restaurant_id)
              .single();

            await supabase.from('notifications').insert({
              restaurant_id: orderData.restaurant_id,
              user_id: memoResto?.owner_id || null,
              title: "Livreur Assigné ! 🛵",
              message: `Le livreur ${user.name} a accepté la commande. Estimations : au resto vers ${estRestoText}, chez le client vers ${estClientText}.`,
              type: 'delivery_acceptance',
              data: { 
                order_id: orderId, 
                result: 'accepted',
                estimated_arrival_restaurant: estRestoText,
                estimated_arrival_customer: estClientText
              }
            });
          }

          if (orderData.user_id) {
            await supabase.from('notifications').insert({
              user_id: orderData.user_id,
              title: "Livreur en route ! 🛵💨",
              message: `Bonne nouvelle ! Le livreur ${user.name} a accepté votre commande. Arrivée estimée au resto : ${estRestoText}. Livraison estimée chez vous : ${estClientText}.`,
              type: 'delivery_acceptance',
              data: { 
                order_id: orderId, 
                result: 'accepted',
                estimated_arrival_restaurant: estRestoText,
                estimated_arrival_customer: estClientText
              }
            });
          }
        }
      }

      setAcceptingOrder(null);
      fetchAssignedOrders();
    } catch (error: any) {
      console.warn("⚠️ [Delivery] Fallback local d'acceptation activé:", error?.message || error);
      toast.success("Mission acceptée ! (Démo locale)");
      
      // Update local state memory immediately so UI reacts instantly
      setOrders(prev => prev.map(o => o.id === orderId ? { 
        ...o, 
        delivery_acceptance_status: 'accepted',
        estimated_arrival_restaurant: estRestoText,
        estimated_arrival_customer: estClientText
      } : o));

      // Update local copy inside localStorage
      const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
      const localOrders = localOrdersStr ? JSON.parse(localOrdersStr) : [];
      let found = false;
      const updatedMockDirs = localOrders.map((o: any) => {
        if (o.id === orderId) {
          found = true;
          return { 
            ...o, 
            delivery_acceptance_status: 'accepted',
            estimated_arrival_restaurant: estRestoText,
            estimated_arrival_customer: estClientText 
          };
        }
        return o;
      });
      if (!found) {
        const orderToSave = orders.find(o => o.id === orderId);
        if (orderToSave) {
          updatedMockDirs.push({ 
            ...orderToSave, 
            delivery_acceptance_status: 'accepted',
            estimated_arrival_restaurant: estRestoText,
            estimated_arrival_customer: estClientText 
          });
        }
      }
      localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updatedMockDirs));

      setAcceptingOrder(null);
    }
  };

  const handleAcceptPrivateCourier = async (orderId: string) => {
    try {
      const targetCourier = availableCouriers.find(c => c.id === orderId);
      if (!targetCourier) {
        toast.error("Course introuvable.");
        return;
      }

      let dbUpdated = false;
      try {
        const { error } = await supabase
          .from('orders')
          .update({
            delivery_person_id: user.id,
            delivery_acceptance_status: 'accepted',
            status: 'preparing'
          })
          .eq('id', orderId);

        if (!error) {
          dbUpdated = true;
        }
      } catch (err) {
        console.warn("DB update skipped or failed, fallback to local memory", err);
      }

      const localOrdersStr = localStorage.getItem("dashmeals_mock_orders") || "[]";
      let localOrders = [];
      try {
        localOrders = JSON.parse(localOrdersStr);
      } catch {
        localOrders = [];
      }

      const existingIndex = localOrders.findIndex((o: any) => o.id === orderId);
      if (existingIndex >= 0) {
        localOrders[existingIndex] = {
          ...localOrders[existingIndex],
          delivery_person_id: user.id,
          delivery_acceptance_status: 'accepted',
          status: 'preparing'
        };
      } else {
        localOrders.push({
          ...targetCourier,
          delivery_person_id: user.id,
          delivery_acceptance_status: 'accepted',
          status: 'preparing'
        });
      }
      localStorage.setItem("dashmeals_mock_orders", JSON.stringify(localOrders));

      try {
        await supabase.from('notifications').insert({
          user_id: targetCourier.userId || null,
          title: "Livreur trouvé pour votre Course Privée ! 📦🛵",
          message: `Le livreur ${user.name} a accepté votre course privée et est en route pour le retrait.`,
          type: 'delivery_acceptance',
          data: { order_id: orderId, result: 'accepted' }
        });
      } catch (e) {
        console.warn("Notification insert skipped:", e);
      }

      toast.success("Course privée acceptée avec succès !");
      fetchAssignedOrders();
    } catch (err: any) {
      console.error("Error accepting private courier:", err);
      toast.error("Erreur lors de l'acceptation: " + err.message);
    }
  };

  const handleDeclineProposal = async (orderId: string) => {
    analytics.logEvent('decline_delivery_proposal', { orderId });
    try {
      if (orderId?.startsWith('mock-') || !navigator.onLine) {
        throw new Error("Local/Offline Mode");
      }

      const { error } = await supabase
        .from('orders')
        .update({ 
          delivery_person_id: null,
          delivery_acceptance_status: 'rejected'
        })
        .eq('id', orderId);

      if (error) throw error;
      toast.info("Mission refusée");

      // Notify the restaurant
      if (orderId && !orderId.startsWith('mock-')) {
          const { data: orderData } = await supabase.from('orders').select('restaurant_id').eq('id', orderId).single();
          if (orderData?.restaurant_id) {
              await supabase.from('notifications').insert({
                  restaurant_id: orderData.restaurant_id,
                  title: "Mission refusée",
                  message: `Le livreur ${user.name} a refusé la livraison de la commande #${orderId.slice(0, 4)}.`,
                  type: 'delivery_acceptance',
                  data: { order_id: orderId, result: 'rejected' }
              });
          }
      }

      fetchAssignedOrders();
    } catch (error) {
      console.warn("⚠️ Refus local opéré:", error);
      toast.info("Mission refusée (Démo locale)");

      // Remove from memory state immediately
      setOrders(prev => prev.filter(o => o.id !== orderId));

      const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
      if (localOrdersStr) {
        const localOrders = JSON.parse(localOrdersStr);
        const updatedOrders = localOrders.filter((o: any) => o.id !== orderId);
        localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updatedOrders));
      }
    }
  };

  const toggleAvailability = async () => {
    const nextValue = !isAvailable;
    setIsAvailable(nextValue);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          delivery_info: {
            ...user.deliveryInfo,
            isAvailable: nextValue,
            lastStatusUpdate: new Date().toISOString()
          }
        })
        .eq('id', user.id);

      if (error) throw error;
      toast.success(nextValue ? "Vous êtes maintenant disponible" : "Vous êtes maintenant en pause");
    } catch (err) {
      console.error("Error updating availability:", err);
      toast.error("Échec de la mise à jour du statut");
      // Revert local state on error
      setIsAvailable(!nextValue);
    }
  };

  const renderOrders = () => (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Disponibilité</h2>
          <button 
            onClick={toggleAvailability}
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center transition-colors ${isAvailable ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}
          >
            <div className={`w-2 h-2 rounded-full mr-2 ${isAvailable ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            {isAvailable ? 'Disponible' : 'Indisponible'}
          </button>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          {isAvailable 
            ? "Vous êtes visible par les restaurants. Vous recevrez des notifications pour les nouvelles commandes."
            : "Vous êtes en pause. Les restaurants ne peuvent pas vous assigner de nouvelles commandes."}
        </p>
      </div>

      {/* DIRECT DRIVER REMINDERS BANNER */}
      {(unacceptedReminders.length > 0 || undeliveredReminders.length > 0) && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col space-y-3 shadow-xs">
          <div className="flex items-center space-x-1.5 text-rose-700">
            <AlertTriangle className="animate-bounce shrink-0" size={18} />
            <span className="font-extrabold text-xs uppercase tracking-wider">Rappels de Missions Urgentes</span>
          </div>
          <div className="flex flex-col space-y-2">
            {unacceptedReminders.map(order => {
              const diffMins = Math.floor((timeTick - new Date(order.createdAt).getTime()) / 60000);
              return (
                <div key={order.id} className="bg-white border border-rose-100 rounded-xl p-3 flex items-center justify-between shadow-xxs">
                  <div className="min-w-0 flex-1 text-left">
                    <span className="font-bold text-xs text-gray-900 block truncate font-sans">Proposition #{order.id.slice(0, 6)}</span>
                    <span className="text-[10px] text-rose-600 font-bold block mt-1 uppercase font-sans">⏱️ En attente depuis {diffMins} min !</span>
                  </div>
                  <button
                    onClick={() => {
                      setAcceptingOrder(order);
                    }}
                    className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[10px] font-black uppercase shadow-xs transition-all cursor-pointer relative z-20"
                  >
                    Accepter vite
                  </button>
                </div>
              );
            })}
            {undeliveredReminders.map(order => {
              const diffMins = Math.floor((timeTick - new Date(order.createdAt).getTime()) / 60000);
              return (
                <div key={order.id} className="bg-white border border-amber-200 rounded-xl p-3 flex items-center justify-between shadow-xxs">
                  <div className="min-w-0 flex-1 text-left">
                    <span className="font-bold text-xs text-gray-900 block truncate font-sans">Commande #{order.id.slice(0, 6)}</span>
                    <span className="text-[10px] text-amber-600 font-bold block mt-1 uppercase font-sans">🛵 Non livrée depuis {diffMins} min</span>
                  </div>
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded font-bold uppercase shrink-0 font-sans">
                    {order.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AVAILABLE PRIVATE COURIERS */}
      {availableCouriers.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex flex-col space-y-3 shadow-xs">
          <div className="flex items-center space-x-1.5 text-orange-700">
            <Package className="animate-pulse shrink-0 text-orange-500" size={18} />
            <span className="font-extrabold text-xs uppercase tracking-wider">📦 Courses Privées Disponibles</span>
          </div>
          <div className="flex flex-col space-y-3">
            {availableCouriers.map(courier => (
              <div key={courier.id} className="bg-white border border-orange-100 rounded-xl p-3 text-left space-y-2.5 shadow-xxs">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] bg-orange-100 text-orange-850 px-2 py-0.5 rounded font-black uppercase">
                      Forfait : $5.00
                    </span>
                    <h4 className="font-bold text-xs text-gray-900 mt-1">Course #{courier.id.slice(0, 6)}</h4>
                  </div>
                  <button
                    onClick={() => handleAcceptPrivateCourier(courier.id)}
                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-[10px] font-black uppercase shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    Accepter
                  </button>
                </div>
                <div className="space-y-1.5 text-xs text-gray-600 border-t border-gray-100 pt-2">
                  <div className="flex items-start">
                    <span className="font-bold text-gray-700 mr-1.5 shrink-0">Départ:</span>
                    <span className="truncate">{courier.items[0]?.pickupAddress || 'Non spécifié'}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-bold text-gray-700 mr-1.5 shrink-0">Destination:</span>
                    <span className="truncate">{courier.items[0]?.deliveryAddress || 'Non spécifié'}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-bold text-gray-700 mr-1.5 shrink-0">Colis:</span>
                    <span className="truncate text-orange-600 font-semibold">{courier.items[0]?.description || 'Colis général'}</span>
                  </div>
                  {courier.items[0]?.recipientName && (
                    <div className="flex items-start">
                      <span className="font-bold text-gray-700 mr-1.5 shrink-0">Destinataire:</span>
                      <span className="truncate">{courier.items[0]?.recipientName} {courier.items[0]?.recipientPhone && `(${courier.items[0]?.recipientPhone})`}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TABLEAU DE BORD COURSES PRIVÉES LIVREUR */}
      <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl font-sans"></div>
        <div className="relative z-10 font-sans">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-xs uppercase tracking-wider flex items-center">
              <Package size={16} className="mr-2 animate-bounce text-white" />
              Tableau de Bord : Courses Privées (Livreur)
            </h3>
            <span className="text-[9px] bg-white/20 px-2.5 py-1 rounded-full font-black uppercase">
              Mes Stats 📊
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center bg-white/10 p-3.5 rounded-xl backdrop-blur-xs mb-4">
            <div>
              <p className="text-[9px] opacity-80 font-bold uppercase">Livrées</p>
              <p className="text-xl font-black">{orders.filter(o => o.items && o.items[0]?.isPrivateCourier && ['delivered', 'completed'].includes(o.status)).length}</p>
            </div>
            <div className="border-x border-white/20 font-sans">
              <p className="text-[9px] opacity-80 font-bold uppercase">En cours</p>
              <p className="text-xl font-black">{orders.filter(o => o.items && o.items[0]?.isPrivateCourier && !['delivered', 'completed', 'cancelled'].includes(o.status)).length}</p>
            </div>
            <div>
              <p className="text-[9px] opacity-80 font-bold uppercase font-sans">Mes Gains</p>
              <p className="text-xl font-black">${(orders.filter(o => o.items && o.items[0]?.isPrivateCourier && ['delivered', 'completed'].includes(o.status)).length * 5).toFixed(2)}</p>
            </div>
          </div>
          
          <p className="text-[10px] opacity-90 leading-relaxed font-sans">
            Vous touchez un forfait garanti de <strong className="font-extrabold">$5.00</strong> par course privée livrée avec succès. Assurez-vous d'appeler le destinataire dès l'arrivée.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-black text-gray-900 flex items-center">
          <Package size={20} className="mr-2 text-brand-600" />
          Commandes en cours
        </h2>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-500 font-medium">Chargement...</p>
          </div>
        ) : orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
              <AlertCircle size={32} />
            </div>
            <h3 className="font-bold text-gray-900">Aucune mission</h3>
            <p className="text-sm text-gray-500 mt-2">Attendez qu'un restaurant vous assigne une commande.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').map((order) => {
              const distance = getDistanceInKm(
                order.restaurant?.latitude,
                order.restaurant?.longitude,
                order.deliveryLocation?.lat,
                order.deliveryLocation?.lng
              ) || 2.4; // default visual fallback
              const estimatedMinutes = getTravelTimeInMinutes(distance, vehicleType || 'moto');
              const isCurrentSimulating = simulatingOrderId === order.id;

              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-2xl overflow-hidden border ${
                    order.status === 'delivering' ? 'border-brand-500 ring-1 ring-brand-500' : 'border-gray-100'
                  } shadow-sm`}
                >
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                          order.status === 'delivering' ? 'bg-brand-100 text-brand-600' :
                          order.status === 'ready' ? 'bg-green-100 text-green-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {order.status}
                        </span>
                        <h3 className="text-lg font-black text-gray-900 mt-1.5">#{order.id.slice(0, 8)}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-brand-600">{order.totalAmount} {order.items[0]?.restaurantName ? 'USD' : 'CDF'}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{new Date(order.createdAt).toLocaleTimeString()}</p>
                      </div>
                    </div>

                    {/* Distance & Time Estimation Badge */}
                    <RouteEstimator
                      from={
                        order.restaurant?.latitude && order.restaurant?.longitude
                          ? { lat: order.restaurant.latitude, lng: order.restaurant.longitude }
                          : null
                      }
                      to={
                        order.deliveryLocation?.lat && order.deliveryLocation?.lng
                          ? { lat: order.deliveryLocation.lat, lng: order.deliveryLocation.lng }
                          : null
                      }
                      vehicleType={vehicleType || 'moto'}
                      fallbackDistance={distance}
                      fallbackMinutes={estimatedMinutes}
                    />

                    {/* GPS Live Trajectory Simulation Panel for Delivering status */}
                    {order.status === 'delivering' && (
                      <div className="bg-slate-900 text-slate-100 p-4 rounded-xl mb-4 space-y-3 shadow-inner">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <span className={`inline-block w-2 h-2 rounded-full ${isCurrentSimulating ? 'bg-brand-500 animate-ping' : 'bg-orange-500'}`} />
                            {isCurrentSimulating ? "Simulation GPS Active" : "Simulateur de Trajet"}
                          </span>
                          {isCurrentSimulating && (
                            <span className="text-[10px] font-mono text-brand-400 font-black">
                              {simulationProgress}%
                            </span>
                          )}
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-brand-500 h-full transition-all duration-1000 ease-out"
                            style={{ width: `${isCurrentSimulating ? simulationProgress : 0}%` }}
                          />
                        </div>

                        {/* Current action step description */}
                        <p className="text-xs text-slate-300 italic">
                          {isCurrentSimulating ? (
                            simulationProgress < 30 ? "🚲 Départ du restaurant, en route..." :
                            simulationProgress < 70 ? "🚦 Passage par le Boulevard principal..." :
                            "🏡 Approche de la zone de livraison !"
                          ) : "Prêt à simuler l'itinéraire GPS en direct sur la carte client."}
                        </p>

                        <button
                          onClick={() => {
                            if (isCurrentSimulating) {
                              setSimulatingOrderId(null);
                              toast.info("Simulation de trajet mise en pause.");
                            } else {
                              setSimulationProgress(0);
                              setSimulatingOrderId(order.id);
                              toast.success("Démarrage du simulateur d'itinéraire GPS...");
                            }
                          }}
                          className={`w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            isCurrentSimulating 
                              ? 'bg-red-600 hover:bg-red-700 text-white' 
                              : 'bg-brand-600 hover:bg-brand-700 text-white'
                          }`}
                        >
                          {isCurrentSimulating ? "Arrêter la simulation" : "Démarrer la simulation GPS 📍"}
                        </button>
                      </div>
                    )}

                    {/* Addresses & Destination Details */}
                    {order.items[0]?.isPrivateCourier ? (
                      <div className="space-y-3 mb-6">
                        <div className="flex items-start space-x-3 text-left">
                          <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 shrink-0">
                            <MapPin size={16} />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Point de Retrait 📦</p>
                            <p className="text-sm font-black text-gray-900">{order.items[0]?.pickupAddress || 'Retrait non spécifié'}</p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3 text-left">
                          <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-600 shrink-0">
                            <UserIcon size={16} />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Destinataire & Point de Livraison</p>
                            <p className="text-sm font-black text-gray-950">{order.items[0]?.recipientName || 'Destinataire'}</p>
                            {order.items[0]?.recipientPhone && (
                              <p className="text-xs text-gray-500 font-bold mt-0.5">📞 {order.items[0]?.recipientPhone}</p>
                            )}
                            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                              <div className="flex items-center space-x-1 mb-1 text-amber-800">
                                <MapPin size={12} className="shrink-0" />
                                <span className="text-[10px] font-black uppercase tracking-wider">Adresse de Livraison :</span>
                              </div>
                              <p className="text-sm font-black text-amber-950 leading-snug">
                                {order.items[0]?.deliveryAddress || 'Adresse non spécifiée'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3 text-left">
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 shrink-0">
                            <Package size={16} />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Détails du colis</p>
                            <p className="text-sm font-bold text-orange-600 leading-snug">
                              {order.items[0]?.description || 'Colis général'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 mb-6">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 shrink-0">
                            <MapPin size={16} />
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Restaurant</p>
                                <p className="text-sm font-bold text-gray-800">{order.restaurant?.name || 'Restaurant'}</p>
                              </div>
                              {order.restaurant?.latitude && order.restaurant?.longitude && (
                                <a 
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${order.restaurant.latitude},${order.restaurant.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 bg-gray-50 text-gray-500 hover:text-brand-600 rounded-lg transition-colors"
                                >
                                  <Navigation size={14} />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-600 shrink-0">
                            <UserIcon size={16} />
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <div className="w-full">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Client</p>
                                <p className="text-sm font-black text-gray-950">{order.customer?.full_name || 'Client Inconnu'}</p>
                                {order.customer?.phone_number && (
                                  <p className="text-xs text-gray-500 font-bold mt-0.5">📞 {order.customer.phone_number}</p>
                                )}
                                
                                {/* ADRESSE EN EVIDENCE MAXIMUM POUR LE LIVREUR */}
                                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                  <div className="flex items-center space-x-1 mb-1 text-amber-800">
                                    <MapPin size={12} className="shrink-0" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Adresse de Livraison :</span>
                                  </div>
                                  <p className="text-sm font-black text-amber-950 leading-snug">
                                    {order.deliveryLocation?.address || 'Adresse non spécifiée'}
                                  </p>
                                  {order.delivery_instructions && (
                                    <p className="text-xs text-gray-500 mt-1.5 italic font-medium">
                                      Note: {order.delivery_instructions}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {order.deliveryLocation?.lat && order.deliveryLocation?.lng && (
                                <a 
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${order.deliveryLocation.lat},${order.deliveryLocation.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-xl transition-all shadow-sm ml-2 self-start flex items-center justify-center"
                                  title="Itinéraire Maps"
                                >
                                  <Navigation size={16} className="animate-pulse" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {order.delivery_acceptance_status === 'pending' ? (
                        <>
                          <button
                            onClick={() => {
                              setAcceptingOrder(order);
                              setEstRestoMins(10);
                              setEstClientMins(15);
                            }}
                            className="bg-brand-600 text-white py-3 rounded-xl font-black text-sm shadow-lg flex items-center justify-center space-x-2"
                          >
                            <Check size={18} />
                            <span>Accepter</span>
                          </button>
                          <button
                            onClick={() => handleDeclineProposal(order.id)}
                            className="bg-red-50 text-red-600 py-3 rounded-xl font-black text-sm border border-red-100 flex items-center justify-center space-x-2"
                          >
                            <X size={18} />
                            <span>Refuser</span>
                          </button>
                          <button
                            onClick={() => {
                              console.log("Opening chat for order:", order.id, "restaurant owner:", order.restaurant?.owner_id);
                              if (!order.restaurant?.owner_id) {
                                toast.error("Impossible de contacter ce restaurant (ID propriétaire manquant)");
                              }
                              setActiveChatRestaurant(order);
                            }}
                            className="col-span-2 bg-blue-50 text-blue-600 py-3 rounded-xl font-black text-sm flex items-center justify-center space-x-2 border border-blue-100 hover:bg-blue-100 transition-colors relative z-20"
                          >
                            <MessageSquare size={18} />
                            <span>Discuter avec le resto</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              console.log("Opening chat for order:", order.id, "restaurant owner:", order.restaurant?.owner_id);
                              if (!order.restaurant?.owner_id) {
                                toast.error("Impossible de contacter ce restaurant (ID propriétaire manquant)");
                              }
                              setActiveChatRestaurant(order);
                            }}
                            className="col-span-2 bg-blue-50 text-blue-600 py-3 rounded-xl font-black text-sm flex items-center justify-center space-x-2 border border-blue-100 hover:bg-blue-100 transition-colors mb-2 relative z-20"
                          >
                            <MessageSquare size={18} />
                            <span>Contacter le Restaurant</span>
                          </button>

                          {order.status !== 'delivering' && order.status !== 'delivered' && order.status !== 'completed' && (
                            <div className="col-span-2 space-y-2.5">
                              {order.items[0]?.isPrivateCourier ? (
                                <button
                                  onClick={() => updateOrderStatus(order.id, 'delivering')}
                                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center space-x-2 transition-all relative z-20 cursor-pointer"
                                >
                                  <Package size={16} className="animate-bounce" />
                                  <span>Colis Récupéré • Commencer la Course 🛵</span>
                                </button>
                              ) : (
                                <>
                                  {order.status !== 'ready' && (
                                    <button
                                      onClick={() => updateOrderStatus(order.id, 'ready')}
                                      className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center space-x-2 transition-all relative z-20 cursor-pointer"
                                    >
                                      <Check size={16} />
                                      <span>Marquer comme Prête 🛍️</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => updateOrderStatus(order.id, 'delivering')}
                                    className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-brand-200 flex items-center justify-center space-x-2 transition-all relative z-20 cursor-pointer"
                                  >
                                    <Bike size={16} />
                                    <span>Commencer la livraison 🛵</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          
                          {order.status === 'delivering' && (
                            <>
                              <button
                                onClick={() => openProofOfDeliveryModal(order.id)}
                                className="col-span-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-green-200 flex items-center justify-center space-x-2 mb-2 transition-all relative z-20 cursor-pointer"
                              >
                                <CheckCircle2 size={16} />
                                <span>Marquer comme livré (Preuve photo) ✅</span>
                              </button>
                              <div className="col-span-2 grid grid-cols-2 gap-2">
                                  <a
                                    href={`tel:${order.customer?.phone_number}`}
                                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-xl font-black text-sm flex items-center justify-center space-x-2 transition-all relative z-20 cursor-pointer"
                                  >
                                    <Phone size={18} />
                                    <span>Appeler Client</span>
                                  </a>
                                  <button
                                    onClick={() => setActiveChatCustomer(order)}
                                    className="bg-brand-50 hover:bg-brand-100 text-brand-600 py-3 rounded-xl font-black text-sm flex items-center justify-center space-x-2 border border-brand-100 transition-all relative z-20 cursor-pointer"
                                  >
                                    <MessageSquare size={18} />
                                    <span>Chat Client</span>
                                  </button>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderWallet = () => {
    const isRestaurantDriver = user.role === 'staff' && user.staffRole === 'delivery';
    const completedOrders = orders.filter(o => ['delivered', 'completed'].includes(o.status));
    
    // Sum up the delivery fee of completed orders, defaulting to 2.5
    const computedTotalFee = completedOrders.reduce((sum, o) => sum + (o.delivery_fee || DELIVERY_FEE_USD), 0);
    
    // Filter logic for dashboard
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    // Start of current week (Sunday)
    const sundayDate = new Date(now);
    sundayDate.setDate(now.getDate() - now.getDay());
    const startOfWeek = new Date(sundayDate.getFullYear(), sundayDate.getMonth(), sundayDate.getDate()).getTime();

    const filteredCompletedOrders = completedOrders.filter(o => {
      const orderTime = new Date(o.createdAt).getTime();
      if (walletFilter === 'today') {
        return orderTime >= startOfToday;
      } else if (walletFilter === 'week') {
        return orderTime >= startOfWeek;
      }
      return true;
    });

    const filteredCompletedOrdersCount = filteredCompletedOrders.length;
    const filteredTotalFee = filteredCompletedOrders.reduce((sum, o) => sum + (o.delivery_fee || DELIVERY_FEE_USD), 0);
    
    // Independent Driver gets personal earnings, Staff Driver does not (goes to restaurant account)
    const personalEarnings = isRestaurantDriver ? 0 : filteredTotalFee;
    const restaurantDeliveryEarnings = isRestaurantDriver ? filteredTotalFee : 0;

    // Mock weekly activity statistics
    const weeklyData = [
      { day: "Lun", count: 4, amount: 10.0 },
      { day: "Mar", count: 7, amount: 17.5 },
      { day: "Mer", count: 5, amount: 12.5 },
      { day: "Jeu", count: 9, amount: 22.5 },
      { day: "Ven", count: 12, amount: 30.0 },
      { day: "Sam", count: 14, amount: 35.0 },
      { day: "Dim", count: 8, amount: 20.0 }
    ];
    const maxAmount = Math.max(...weeklyData.map(d => d.amount));

    return (
    <div className="space-y-6">
      {/* Driver status card */}
      <div className="bg-gray-50 border border-gray-150 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-brand-50 text-brand-600">
            {isRestaurantDriver ? <Building size={20} /> : <UserCheck size={20} />}
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase leading-none">Statut de livraison</p>
            <h4 className="font-extrabold text-sm text-gray-800 mt-1">
              {isRestaurantDriver ? "Livreur Interne (Restaurant)" : "Livreur Indépendant"}
            </h4>
          </div>
        </div>
        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
          isRestaurantDriver ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
        }`}>
          {isRestaurantDriver ? "Salarié" : "Freelance"}
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="flex p-1 bg-gray-100 rounded-xl">
        {(['all', 'today', 'week'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setWalletFilter(filter)}
            className={`flex-1 py-2 text-xs font-black rounded-lg transition-all uppercase ${
              walletFilter === filter 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {filter === 'all' ? "Tout" : filter === 'today' ? "Aujourd'hui" : "Cette semaine"}
          </button>
        ))}
      </div>

      <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        {/* Abstract background glow */}
        <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full blur-2xl transform translate-x-10 -translate-y-10"></div>
        
        <div className="flex justify-between items-start mb-8 relative z-10">
          <div>
            <p className="text-brand-100 text-xs font-semibold uppercase tracking-wider">
              {isRestaurantDriver ? "Revenus de Livraison Collectés" : "Gains cumulés (Mes Comptes)"}
            </p>
            <h2 className="text-4.5xl font-black mt-1.5 font-mono">
              {(isRestaurantDriver ? restaurantDeliveryEarnings : personalEarnings).toFixed(2)} USD
            </h2>
            {isRestaurantDriver && (
              <p className="text-[10px] text-brand-100 flex items-center gap-1 mt-2 bg-white/10 px-2 py-1 rounded-lg">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse"></span>
                Transféré sur le Compte de Livraison du restaurant.
              </p>
            )}
          </div>
          <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
            <Wallet size={24} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
            <p className="text-[9px] font-bold text-brand-200 uppercase tracking-wide">Courses effectuées</p>
            <p className="text-xl font-black">{filteredCompletedOrdersCount}</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
            <p className="text-[9px] font-bold text-brand-200 uppercase tracking-wide">Frais moyen / Course</p>
            <p className="text-xl font-black">
              {DELIVERY_FEE_USD} USD
            </p>
          </div>
        </div>
      </div>

      {/* Weekly Activity Chart */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider flex items-center justify-between">
          <span>Activité hebdomadaire</span>
          <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full">
            Moy. {weeklyData.reduce((sum, d) => sum + d.amount, 0) / 7} $ / jour
          </span>
        </h4>
        <div className="flex justify-between items-end h-24 pt-2 relative">
          {weeklyData.map((data, idx) => {
            const heightPercent = (data.amount / maxAmount) * 100;
            return (
              <div key={idx} className="flex flex-col items-center flex-1 group relative">
                {/* Micro tooltip */}
                <div className="absolute bottom-full mb-1 bg-slate-950 text-white text-[8px] font-black px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all z-20 pointer-events-none shadow">
                  {data.amount}$
                </div>
                <div className="w-5 bg-slate-50 hover:bg-slate-100 rounded-md h-16 flex items-end overflow-hidden relative cursor-pointer">
                  <div 
                    className="bg-brand-600 w-full rounded-b-md transition-all duration-750 ease-out"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-400 font-bold mt-1.5">{data.day}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-black text-gray-900 flex items-center justify-between">
          <span>Historique des courses</span>
          <span className="text-[10px] text-gray-400 font-bold bg-gray-100 px-2.5 py-1 rounded-md uppercase">
            Courses ({filteredCompletedOrdersCount})
          </span>
        </h3>
        <div className="space-y-3">
          {filteredCompletedOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-150 rounded-2xl">
              <p className="text-xs">Aucune livraison trouvée pour ce filtre.</p>
            </div>
          ) : (
            filteredCompletedOrders.map(order => {
              const orderFee = order.delivery_fee || DELIVERY_FEE_USD;
              return (
                <div key={order.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isRestaurantDriver ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'
                    }`}>
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <p className="font-bold text-gray-900 text-sm">{order.restaurant?.name || 'Restaurant'}</p>
                        {isRestaurantDriver && (
                          <span className="text-[8px] bg-orange-100 text-orange-700 font-black px-1.5 py-0.5 rounded uppercase">
                            Interne
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()} • Commande #{order.id.slice(0, 4).toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black font-mono text-sm ${isRestaurantDriver ? 'text-orange-600' : 'text-green-600'}`}>
                      +{orderFee.toFixed(2)} USD
                    </p>
                    <p className="text-[9px] text-gray-400 font-bold mt-0.5 uppercase">
                      {isRestaurantDriver ? "Compte Livraison Resto" : "Crédité sur votre portefeuille"}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    );
  };

  const renderRestaurants = () => (
    <div className="space-y-6">
      <div className="bg-brand-50 p-4 rounded-2xl border border-brand-100">
        <div className="flex items-center space-x-3 mb-2">
          <Store className="text-brand-600" size={20} />
          <h3 className="font-bold text-brand-900">Marché des Restaurants</h3>
        </div>
        <p className="text-xs text-brand-700 leading-relaxed">
          Voici les restaurants actifs dans votre zone. Ils peuvent vous assigner des commandes si vous êtes à proximité et disponible.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {restaurants.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white rounded-3xl border border-gray-100 shadow-xs">
            <div className="w-16 h-16 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Store size={28} />
            </div>
            <h4 className="font-black text-gray-900 text-sm">Oups ! Aucun restaurant trouvé</h4>
            <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1.5 leading-relaxed">
              La liste est actuellement vide. Essayez de recharger ou de vous assurer que des partenaires sont enregistrés.
            </p>
            <button
              onClick={fetchRestaurants}
              className="mt-5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Rafraîchir la Liste
            </button>
          </div>
        ) : (
          restaurants.map(resto => (
            <div 
              key={resto.id} 
              onClick={() => setSelectedContactResto(resto)}
              className="bg-white p-4 rounded-2xl border border-gray-100 hover:border-brand-200 hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer flex items-center justify-between text-left group"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gray-100 rounded-xl overflow-hidden shrink-0 group-hover:scale-105 transition-transform duration-300">
                  {resto.cover_image ? (
                    <img src={resto.cover_image} alt={resto.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <Store size={20} />
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center flex-wrap gap-1.5">
                    <h4 className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors">{resto.name}</h4>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${
                      resto.is_open 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' 
                        : 'bg-gray-50 text-gray-500 border border-gray-150'
                    }`}>
                      {resto.is_open ? 'Ouvert 🟢' : 'Fermé 🔴'}
                    </span>
                  </div>
                  <div className="flex items-center text-xs text-gray-500 space-x-2 mt-1">
                    <span className="flex items-center"><Star size={10} className="mr-1 fill-yellow-400 text-yellow-400" /> {resto.rating}</span>
                    <span>•</span>
                    <span>{resto.city}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 shrink-0">
                {/* direct chat trigger */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const syntheticOrder: Order = {
                      id: resto.id,
                      userId: user.id,
                      restaurantId: resto.id,
                      status: 'pending',
                      paymentMethod: 'cash',
                      paymentStatus: 'pending',
                      totalAmount: 0,
                      items: [],
                      createdAt: new Date().toISOString(),
                      restaurant: {
                        name: resto.name,
                        owner_id: resto.owner_id || '',
                        phone_number: resto.phone_number || ''
                      }
                    };
                    setActiveChatRestaurant(syntheticOrder);
                  }}
                  className="p-2.5 text-brand-600 hover:bg-brand-50 rounded-full transition-all active:scale-95 cursor-pointer"
                  title="Chatter en direct"
                >
                  <MessageSquare size={18} />
                </button>

                {/* direct phone trigger */}
                {resto.phone_number && (
                  <a 
                    href={`tel:${resto.phone_number}`}
                    onClick={(e) => e.stopPropagation()}
                    className="p-2.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-all active:scale-95 cursor-pointer"
                    title="Appeler par téléphone"
                  >
                    <Phone size={18} />
                  </a>
                )}

                <button className="p-1.5 text-gray-300 group-hover:text-brand-600 group-hover:translate-x-1 transition-all">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderProfile = () => {
    const avatarPresets = [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80",
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80",
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80"
    ];

    return (
      <div className="space-y-6">
        {/* Profile Card Summary */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-50 rounded-full -mr-12 -mt-12 opacity-50"></div>
          
          <div className="relative inline-block mb-4">
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt={name} 
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md mx-auto"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-brand-500 to-brand-700 rounded-full flex items-center justify-center text-white text-3xl font-black shadow-md mx-auto">
                {name ? name.charAt(0).toUpperCase() : 'L'}
              </div>
            )}
            
            {isEditingProfile && (
              <div className="absolute bottom-0 right-0 w-8 h-8 bg-brand-600 rounded-full shadow-lg flex items-center justify-center text-white border-2 border-white">
                <Camera size={14} />
              </div>
            )}
          </div>
          
          {!isEditingProfile ? (
            <>
              <h2 className="text-xl font-black text-gray-900">{name || "Livreur"}</h2>
              <p className="text-xs text-gray-500 font-medium flex items-center justify-center gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${isAvailable ? 'bg-green-500' : 'bg-red-500'}`}></span>
                {isAvailable ? "Disponible en ligne" : "Hors ligne"} • {city}
              </p>
            </>
          ) : (
            <div className="space-y-3 max-w-xs mx-auto text-left mt-2">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
                Choisissez une photo de profil professionnelle
              </label>
              <div className="flex justify-center gap-2 mb-3">
                {avatarPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatarUrl(preset)}
                    className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-transform hover:scale-105 ${
                      avatarUrl === preset ? 'border-brand-600 scale-110' : 'border-gray-200'
                    }`}
                  >
                    <img src={preset} alt={`Preset ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Ou Lien URL d'une photo de profil</label>
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://exemple.com/ma-photo.jpg"
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
            <div className="text-center">
              <p className="text-lg font-black text-gray-900">4.9</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Note</p>
            </div>
            <div className="text-center border-x border-gray-100">
              <p className="text-lg font-black text-gray-900">{orders.filter(o => ['delivered', 'completed'].includes(o.status)).length}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Courses</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-gray-900">100%</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Fiabilité</p>
            </div>
          </div>
        </div>

        {/* Edit Form & Delivery Info */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-gray-900 flex items-center">
              <UserIcon size={18} className="mr-2 text-brand-600" />
              {isEditingProfile ? "Modifier mon Profil" : "Informations Personnelles"}
            </h3>
            <button 
              onClick={() => isEditingProfile ? handleUpdateProfile() : setIsEditingProfile(true)}
              className="text-brand-600 text-sm font-bold hover:underline"
              disabled={isSavingProfile}
            >
              {isSavingProfile ? 'Enregistrement...' : isEditingProfile ? 'Enregistrer' : 'Modifier'}
            </button>
          </div>

          <div className="space-y-4">
            {isEditingProfile ? (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Nom Complet</label>
                  <div className="relative">
                    <UserIcon size={16} className="absolute left-3 top-3.5 text-gray-400" />
                    <input 
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="Votre nom"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Numéro de Téléphone</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-3.5 text-gray-400" />
                    <input 
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="Ex: +243812345678"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Ville d'activité</label>
                  <div className="relative">
                    <Globe size={16} className="absolute left-3 top-3.5 text-gray-400" />
                    <select
                      value={city || "Kinshasa"}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none appearance-none"
                    >
                      {CITIES_RDC.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Adresse de résidence ou d'attache</label>
                  <div className="relative">
                    <MapPin size={16} className="absolute left-3 top-3.5 text-gray-400" />
                    <input 
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="Ex: 12, Av. de la Libération, Gombe"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Disponibilité du Livreur</label>
                  <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-sm font-medium text-gray-700">Je suis disponible en ligne</span>
                    <button
                      type="button"
                      onClick={() => setIsAvailable(!isAvailable)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isAvailable ? 'bg-brand-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isAvailable ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <Phone size={16} className="text-brand-600 shrink-0" />
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase leading-none">Numéro de Téléphone</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">{phoneNumber || "Non défini"}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <Globe size={16} className="text-brand-600 shrink-0" />
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase leading-none">Ville d'activité</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">{city || "Kinshasa"}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <MapPin size={16} className="text-brand-600 shrink-0" />
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase leading-none">Adresse d'attache / Garage Physique</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">{address || "Non définie"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Services & Vehicle Section */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
          <h3 className="font-black text-gray-900 flex items-center">
            <Briefcase size={18} className="mr-2 text-brand-600" />
            Services & Véhicule
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Type de véhicule</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'moto', icon: Bike, label: 'Moto' },
                  { id: 'velo', icon: Bike, label: 'Vélo' },
                  { id: 'voiture', icon: Car, label: 'Auto' },
                  { id: 'pieton', icon: Footprints, label: 'Pied' }
                ].map(v => (
                  <button
                    key={v.id}
                    disabled={!isEditingProfile}
                    onClick={() => setVehicleType(v.id as any)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      vehicleType === v.id 
                        ? 'border-brand-600 bg-brand-50 text-brand-600' 
                        : 'border-gray-100 text-gray-400 hover:border-gray-200'
                    } ${!isEditingProfile && 'opacity-80'}`}
                  >
                    <v.icon size={20} />
                    <span className="text-[10px] font-bold mt-1">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Bio / Présentation</label>
              {isEditingProfile ? (
                <textarea 
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none min-h-[100px]"
                  placeholder="Décrivez votre expérience, votre zone de livraison..."
                />
              ) : (
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl leading-relaxed">
                  {bio || "Aucune description définie. Ajoutez-en une pour attirer plus de restaurants !"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {isEditingProfile && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setIsEditingProfile(false);
                // Reset inputs to match user prop
                setName(user.name || '');
                setCity(user.city || '');
                setPhoneNumber(user.phoneNumber || '');
                setAvatarUrl(user.avatarUrl || '');
                setAddress(user.deliveryInfo?.address || '');
                setVehicleType(user.deliveryInfo?.vehicleType || 'moto');
                setBio(user.deliveryInfo?.bio || '');
                setIsAvailable(user.deliveryInfo?.isAvailable ?? true);
              }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 rounded-2xl text-center text-sm transition-colors"
            >Annuler</button>
            <button
              type="button"
              onClick={handleUpdateProfile}
              disabled={isSavingProfile}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-2xl text-center text-sm shadow-md shadow-brand-200 transition-colors"
            >
              {isSavingProfile ? 'Enregistrement...' : 'Sauvegarder'}
            </button>
          </div>
        )}

        {/* Support & Assistance Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h3 className="font-black text-gray-900 flex items-center">
            <HelpCircle size={18} className="mr-2 text-orange-500" />
            Support & Assistance Administration
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Besoin d'aide, d'une assistance directe ou de poser une question à l'administration DashMeals ?
          </p>
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => setIsHelpCenterOpen(true)}
              className="w-full py-3 px-4 bg-orange-50 hover:bg-orange-100 text-orange-600 font-bold rounded-2xl text-xs transition-colors flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <HelpCircle size={16} />
                Ouvrir le Centre d'Aide 📖
              </span>
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => setLegalView('contact')}
              className="w-full py-3 px-4 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold rounded-2xl text-xs transition-colors flex items-center justify-between border border-gray-100"
            >
              <span className="flex items-center gap-2">
                <Phone size={16} className="text-brand-600" />
                Coordonnées de l'Administration
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <button 
          onClick={onLogout}
          className="w-full bg-red-50 text-red-600 font-bold py-4 rounded-2xl flex items-center justify-center space-x-2 hover:bg-red-100 transition-colors shadow-sm"
        >
          <LogOut size={20} />
          <span>Se déconnecter</span>
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-200 border-2 border-white/50 overflow-hidden">
              <img src={APP_LOGO_URL} alt="DashMeals Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900">{user.name}</h1>
              <div className="flex items-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isAvailable ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                {isAvailable ? (
                  <span className="flex items-center">
                    EN LIGNE
                  </span>
                ) : 'Hors ligne'}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsHelpCenterOpen(true)}
              className="p-2 bg-orange-50 text-orange-600 rounded-full hover:bg-orange-100 transition-colors flex items-center gap-1 text-xs font-bold"
              title="Centre d'Aide & Support Admin"
            >
              <HelpCircle size={18} />
              <span className="hidden sm:inline">Aide</span>
            </button>
            <button className="p-2 bg-gray-50 text-gray-400 rounded-full hover:text-brand-600 transition-colors">
              <Bell size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'orders' && renderOrders()}
            {activeTab === 'wallet' && renderWallet()}
            {activeTab === 'restaurants' && renderRestaurants()}
            {activeTab === 'profile' && renderProfile()}
          </motion.div>
        </AnimatePresence>
      </main>



      {/* Bottom Navigation */}
      <nav className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 z-50 transition-all duration-300 ${isNavVisible ? 'translate-y-0 opacity-100' : 'translate-y-[110%] opacity-0 pointer-events-none'}`}>
        <div className="max-w-md mx-auto flex justify-between items-center">
          <button 
            onClick={() => setActiveTab('orders')}
            className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === 'orders' ? 'text-brand-600' : 'text-gray-400'}`}
          >
            <Package size={22} className={activeTab === 'orders' ? 'fill-brand-600/10' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Missions</span>
          </button>
          <button 
            onClick={() => setActiveTab('wallet')}
            className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === 'wallet' ? 'text-brand-600' : 'text-gray-400'}`}
          >
            <Wallet size={22} className={activeTab === 'wallet' ? 'fill-brand-600/10' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Gains</span>
          </button>
          <button 
            onClick={() => setActiveTab('restaurants')}
            className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === 'restaurants' ? 'text-brand-600' : 'text-gray-400'}`}
          >
            <Store size={22} className={activeTab === 'restaurants' ? 'fill-brand-600/10' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Marché</span>
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === 'profile' ? 'text-brand-600' : 'text-gray-400'}`}
          >
            <UserIcon size={22} className={activeTab === 'profile' ? 'fill-brand-600/10' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Profil</span>
          </button>
        </div>
      </nav>

      {/* Estimation Modal Popup when accepting order */}
      {acceptingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-950 rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-800"
          >
            {/* Header banner */}
            <div className="bg-brand-600 p-6 text-white text-center relative">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-md">
                <Clock size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-black">Estimations d'Arrivée</h3>
              <p className="text-[10px] text-brand-100 mt-1">Saisissez vos prévisions pour informer le restaurant et le client</p>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5">
              {/* Est 1: Temps pour aller au Resto */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase text-gray-500 dark:text-gray-400 flex items-center justify-between">
                  <span>🚗 Arriving at Restaurant</span>
                  <span className="text-brand-600 font-bold font-mono bg-brand-50 dark:bg-brand-900/30 px-2.5 py-0.5 rounded text-xs">
                    {estRestoMins} min
                  </span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 15, 20].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setEstRestoMins(mins)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        estRestoMins === mins 
                          ? 'bg-brand-600 text-white shadow-md shadow-brand-100' 
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
                <input 
                  type="range" 
                  min="2" 
                  max="45" 
                  value={estRestoMins}
                  onChange={(e) => setEstRestoMins(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600 dark:bg-gray-700"
                />
              </div>

              {/* Est 2: Temps de livraison du resto chez le client */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase text-gray-500 dark:text-gray-400 flex items-center justify-between">
                  <span>🏠 Delivery to Customer</span>
                  <span className="text-orange-600 font-bold font-mono bg-orange-50 dark:bg-orange-950/30 px-2.5 py-0.5 rounded text-xs">
                    {estClientMins} min
                  </span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 15, 20, 30].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setEstClientMins(mins)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        estClientMins === mins 
                          ? 'bg-orange-500 text-white shadow-md shadow-orange-100' 
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="60" 
                  value={estClientMins}
                  onChange={(e) => setEstClientMins(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500 dark:bg-gray-700"
                />
                <p className="text-[9px] text-gray-400 dark:text-gray-500 italic text-center leading-snug">
                  Temps estimé pour faire le trajet du restaurant jusqu'à l'adresse de livraison.
                </p>
              </div>

              {/* Recapitulation summary */}
              <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-2 text-xs">
                <p className="flex justify-between font-medium text-gray-600 dark:text-gray-400">
                  <span>Arrivée resto :</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {(() => {
                      const d = new Date(Date.now() + estRestoMins * 60000);
                      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    })()}
                  </span>
                </p>
                <p className="flex justify-between font-medium text-gray-600 dark:text-gray-400">
                  <span>Livraison client :</span>
                  <span className="font-bold text-brand-600 dark:text-brand-400">
                    {(() => {
                      const d = new Date(Date.now() + (estRestoMins + estClientMins) * 60000);
                      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} (Total : ${estRestoMins + estClientMins} min)`;
                    })()}
                  </span>
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAcceptingOrder(null)}
                className="py-3 rounded-2xl border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-805 text-xs font-bold transition-all text-center dark:text-gray-400"
              >Annuler</button>
              <button
                type="button"
                onClick={() => handleAcceptProposal(acceptingOrder.id, estRestoMins, estClientMins)}
                className="py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-black shadow-md shadow-brand-100 transition-all flex items-center justify-center space-x-1"
              >
                <span>Accepter la mission</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Chat avec le restaurant */}
      {activeChatRestaurant && (
        <ChatWindow 
          orderId={activeChatRestaurant.id}
          currentUser={{
            id: user.id,
            role: 'delivery',
            name: user.full_name || 'Livreur'
          }}
          otherUserId={activeChatRestaurant.restaurant?.owner_id || (activeChatRestaurant.restaurant as any)?.ownerId || ''}
          otherUserName={activeChatRestaurant.restaurant?.name || 'Restaurant'}
          otherUserPhone={activeChatRestaurant.restaurant?.phone_number || ''}
          restaurantId={activeChatRestaurant.restaurantId}
          onClose={() => setActiveChatRestaurant(null)}
        />
      )}

      {/* Chat avec le client */}
      {activeChatCustomer && (
        <ChatWindow 
          orderId={activeChatCustomer.id}
          currentUser={{
            id: user.id,
            role: 'delivery',
            name: user.full_name || 'Livreur'
          }}
          otherUserId={activeChatCustomer.userId}
          otherUserName={activeChatCustomer.customer?.full_name || 'Client'}
          otherUserPhone={activeChatCustomer.customer?.phone_number || ''}
          otherUserRole="client"
          restaurantId={activeChatCustomer.restaurantId}
          onClose={() => setActiveChatCustomer(null)}
        />
      )}

      {/* Modal de Contact Restaurant depuis le Marché */}
      {selectedContactResto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-850"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-brand-600 to-brand-700 p-6 text-white text-left flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Store size={24} />
                <div>
                  <h3 className="font-extrabold text-base">{selectedContactResto.name}</h3>
                  <p className="text-xs text-brand-100">{selectedContactResto.city || 'Kinshasa'}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedContactResto(null)}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Options Body */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-left">
                Comment souhaitez-vous contacter ou interagir avec cet établissement ?
              </p>

              {/* Option 1: Live Chat */}
              <button
                onClick={() => {
                  const syntheticOrder: Order = {
                    id: selectedContactResto.id, // uses unique restaurant UUID
                    userId: user.id,
                    restaurantId: selectedContactResto.id,
                    status: 'pending',
                    paymentMethod: 'cash',
                    paymentStatus: 'pending',
                    totalAmount: 0,
                    items: [],
                    createdAt: new Date().toISOString(),
                    restaurant: {
                      name: selectedContactResto.name,
                      owner_id: selectedContactResto.owner_id || '',
                      phone_number: selectedContactResto.phone_number || ''
                    }
                  };
                  setActiveChatRestaurant(syntheticOrder);
                  setSelectedContactResto(null);
                }}
                className="w-full flex items-center justify-between bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/20 dark:hover:bg-brand-900/30 text-brand-900 dark:text-brand-300 p-4 rounded-2xl border border-brand-100 dark:border-brand-900/40 cursor-pointer transition-all text-left"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="bg-brand-600 p-2.5 rounded-xl text-white">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <span className="font-extrabold text-sm block">Chat en direct (In-App)</span>
                    <span className="text-[10px] text-brand-700 dark:text-brand-400 font-medium">Discutez en temps réel avec le restaurant</span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-brand-600" />
              </button>

              {/* Option 2: Phone Call */}
              {selectedContactResto.phone_number && (
                <a
                  href={`tel:${selectedContactResto.phone_number}`}
                  className="w-full flex items-center justify-between bg-green-50 hover:bg-green-100 dark:bg-green-950/20 dark:hover:bg-green-900/30 text-green-950 dark:text-green-300 p-4 rounded-2xl border border-green-100 dark:border-green-900/40 cursor-pointer transition-all text-left block"
                >
                  <div className="flex items-center space-x-3.5">
                    <div className="bg-green-600 p-2.5 rounded-xl text-white">
                      <Phone size={20} />
                    </div>
                    <div>
                      <span className="font-extrabold text-sm block">Appeler par Téléphone</span>
                      <span className="text-[10px] text-green-700 dark:text-green-400 font-medium">{selectedContactResto.phone_number}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-green-600" />
                </a>
              )}

              {/* Option 3: WhatsApp Chat */}
              {selectedContactResto.phone_number && (
                <a
                  href={`https://wa.me/${selectedContactResto.phone_number.replace(/\s+/g, '').replace('+', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-between bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-950 dark:text-emerald-300 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 cursor-pointer transition-all text-left block"
                >
                  <div className="flex items-center space-x-3.5">
                    <div className="bg-emerald-600 p-2.5 rounded-xl text-white">
                      <Globe size={20} />
                    </div>
                    <div>
                      <span className="font-extrabold text-sm block">Message WhatsApp</span>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium font-mono">Discuter sur WhatsApp</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-emerald-600" />
                </a>
              )}

              {!selectedContactResto.phone_number && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-xs rounded-2xl border border-amber-100 dark:border-amber-900/30 text-left">
                  ⚠️ Cet établissement n'a pas configuré de numéro de téléphone. Vous pouvez utiliser le <strong>Chat en direct</strong> sécurisé ci-dessus pour le contacter instantanément.
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-end">
              <button
                onClick={() => setSelectedContactResto(null)}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >Fermer</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Proof of Delivery Photo Modal */}
      {showProofModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-gray-100"
          >
            {/* Header banner */}
            <div className="bg-green-600 p-6 text-white text-center relative">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-md">
                <Camera size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-black">Preuve de Livraison</h3>
              <p className="text-[10px] text-green-100 mt-1">Veuillez joindre une preuve photo pour finaliser la course</p>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Sélectionner une situation de preuve</label>
              
              <div className="space-y-2.5">
                {PROOF_PHOTO_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedProofPhoto(preset.url)}
                    className={`w-full flex items-center space-x-3 p-3 rounded-xl border transition-all text-left ${
                      selectedProofPhoto === preset.url 
                        ? 'border-green-600 bg-green-50 text-green-900 font-bold' 
                        : 'border-gray-100 hover:border-gray-200 text-gray-700'
                    }`}
                  >
                    <span className="text-sm">{preset.label}</span>
                  </button>
                ))}
              </div>

              {/* Preview image */}
              {selectedProofPhoto && (
                <div className="mt-2 space-y-1">
                  <span className="block text-[9px] font-bold text-gray-400 uppercase">Aperçu de la photo de preuve :</span>
                  <div className="w-full h-32 rounded-xl overflow-hidden border border-gray-200 relative">
                    <img 
                      src={selectedProofPhoto} 
                      alt="Proof preview" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 right-2 bg-green-600 text-white text-[9px] px-2 py-0.5 rounded-full font-black shadow-sm uppercase">
                      Prêt
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowProofModal(false);
                  setProofOrderId(null);
                }}
                className="py-3 rounded-2xl border border-gray-200 text-gray-500 hover:bg-gray-100 text-xs font-bold transition-all text-center cursor-pointer"
              >Annuler</button>
              <button
                type="button"
                onClick={handleConfirmProofAndDeliver}
                className="py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-xs font-black shadow-md shadow-green-100 transition-all flex items-center justify-center space-x-1 cursor-pointer"
              >
                <span>Confirmer la livraison 📸</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* HELP CENTER OVERLAY */}
      {isHelpCenterOpen && (
        <HelpCenter 
          user={user} 
          onClose={() => setIsHelpCenterOpen(false)} 
          appSettings={appSettings} 
        />
      )}

      {/* LEGAL / CONTACT MODAL */}
      <LegalModal 
        type={legalView} 
        onClose={() => setLegalView(null)} 
        appSettings={appSettings} 
      />
    </div>
  );
};
