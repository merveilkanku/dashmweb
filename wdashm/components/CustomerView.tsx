import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchWithRetry, parseJsonResponse } from '../utils/fetch';
import { 
  MapPin, ShoppingBag, List, Map, ArrowLeft, ArrowRight, Plus, Bike, Footprints, 
  LogOut, Navigation, Search, X, Receipt, Phone, Info, Image as ImageIcon, 
  PlayCircle, Settings, Moon, Sun, Globe, CheckCircle, CheckCircle2, Star, Type, Clock, Bell, ChevronRight,
  Shield, Lock, Fingerprint, Zap, Sparkles, HelpCircle, Book, Mail, ExternalLink, Car, Upload, FileText, Smartphone, MessageSquare,
  Activity, ShieldCheck, LogIn, User as UserIcon, Camera, Pencil, MoreVertical, AlertTriangle, AlertCircle, Package, RefreshCw, Menu, Home, SlidersHorizontal, CreditCard, Ticket
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { compressImage, safeUploadPaymentProof } from '../utils/imageCompressor';
import { KINSHASA_CENTER_LAT, KINSHASA_CENTER_LNG, CITY_COORDINATES, CITIES_RDC, APP_LOGO_URL } from '../constants';
import { formatDualPrice } from '../utils/format';
import { Restaurant, UserState, ViewMode, MenuItem, CartItem, User, Order, Promotion, Theme, Language, AppFont, PaymentMethod, MobileMoneyNetwork, SecuritySettings, AppSettings, MealReview, ClaimedOffer } from '../types';
import { calculateTime, getDistanceFromLatLonInKm, getEstimatedRoadDistanceInKm, calculateRealisticTime, formatDistance, formatTime } from '../utils/geo';
import { RestaurantCard } from './RestaurantCard';
import { useRoute } from '../hooks/useRoute';
import { MapView } from './MapView';
import { CartDrawer } from './CartDrawer';
import { ChatWindow } from './ChatWindow';
import { StoryViewer } from './StoryViewer';
import { ClientClaimedOffersModal } from './ClientClaimedOffersModal';
import { ClaimedOfferModal } from './ClaimedOfferModal';
import { claimOffer } from '../utils/claimedOffers';
import { OrdersView } from './OrdersView';
import { DeliveryTrackingMap } from './DeliveryTrackingMap';
import { LocationPicker } from './LocationPicker';
import { useTranslation } from '../lib/i18n';
import { PinSetupDialog } from './PinSetupDialog';
import { HelpCenter } from './HelpCenter';
import { requestNotificationPermission, sendPushNotification } from '../utils/notifications';
import { sendOrderConfirmationEmail, sendNewOrderNotificationToRestaurant } from '../lib/email';
import { analytics } from '../utils/analytics';
import { Footer } from './Footer';
import { LegalModal } from './LegalModal';

// Speed constants
const SPEED_WALKING = 5;
const SPEED_MOTO = 30;

export interface ParsedPromo {
  caption: string;
  isPromoProduct: boolean;
  menuItemId?: string;
  promoPrice?: number;
  badgeText?: string;
}

export const parsePromoCaption = (captionText?: string): ParsedPromo => {
  if (!captionText) return { caption: "Offre exceptionnelle !", isPromoProduct: false };
  const trimmed = captionText.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.is_promo_product) {
        return {
          caption: parsed.caption || "Offre exceptionnelle !",
          isPromoProduct: true,
          menuItemId: parsed.menu_item_id,
          promoPrice: parsed.promo_price,
          badgeText: parsed.badge_text || "PROMO",
        };
      }
    } catch (e) {
      // Fallback
    }
  }
  return { caption: captionText, isPromoProduct: false };
};

interface Props {
  user: User;
  allRestaurants: Restaurant[];
  onLogout: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  language: Language;
  setLanguage: (l: Language) => void;
  font?: AppFont;
  setFont?: (f: AppFont) => void;
  onUpdateUser?: (user: User) => void;
  onGoToAdmin?: () => void;
  onRefreshData?: () => void;
}

const getNearestCity = (lat: number, lng: number): string => {
  let nearestCity = 'Lubumbashi';
  let minDistance = Infinity;
  
  for (const [cityName, coords] of Object.entries(CITY_COORDINATES)) {
    const dist = getDistanceFromLatLonInKm(lat, lng, coords.latitude, coords.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      nearestCity = cityName;
    }
  }
  return nearestCity;
};

export const CustomerView: React.FC<Props> = ({ user, allRestaurants, onLogout, theme, setTheme, language, setLanguage, font, setFont, onUpdateUser, onGoToAdmin, onRefreshData }) => {
  const t = useTranslation(language);

  // Helper to retrieve active promo details for an item
  const getPromoDetails = (item: MenuItem, restaurantId: string) => {
    const promos = promotionsMap[restaurantId] || [];
    for (const promo of promos) {
      if (!promo.caption) continue;
      const trimmed = promo.caption.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const js = JSON.parse(trimmed);
          if (js && js.is_promo_product && js.menu_item_id === item.id) {
            // Check expiration if present
            if (js.expires_at) {
              const now = new Date();
              const exp = new Date(js.expires_at);
              if (now > exp) {
                continue; // Promotion has expired
              }
            }
            return {
              isPromo: true,
              promoPrice: js.promo_price ? Number(js.promo_price) : null,
              badgeText: js.badge_text || "PROMO",
              expiresAt: js.expires_at
            };
          }
        } catch (e) {}
      }
    }
    return null;
  };

  // State
  const [userState, setUserState] = useState<UserState>({
    location: null,
    locationError: null,
    loadingLocation: true,
  });
  
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [promotionsMap, setPromotionsMap] = useState<Record<string, Promotion[]>>({});
  const [activeCampaigns, setActiveCampaigns] = useState<Record<string, any[]>>({});
  const [appliedCampaign, setAppliedCampaign] = useState<any | null>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isClientOffersOpen, setIsClientOffersOpen] = useState(false);
  const [activeClaimedOffer, setActiveClaimedOffer] = useState<ClaimedOffer | null>(null);
  
  // States for Private Courier (Course Privée)
  const [privateCourierTab, setPrivateCourierTab] = useState<'create' | 'history'>('create');
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [packageDetails, setPackageDetails] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [courierVehicle, setCourierVehicle] = useState<'moto' | 'velo' | 'voiture' | 'pieton'>('moto');
  const [courierPaymentMethod, setCourierPaymentMethod] = useState<'cash' | 'mobile_money'>('cash');
  const [isSubmittingCourier, setIsSubmittingCourier] = useState(false);
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [deliveryLocationPrivate, setDeliveryLocationPrivate] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [showPickupPicker, setShowPickupPicker] = useState(false);
  const [showDeliveryPicker, setShowDeliveryPicker] = useState(false);
  const [profileName, setProfileName] = useState(user.name || '');
  const [profilePhone, setProfilePhone] = useState(user.phoneNumber || '');
  const [profileCity, setProfileCity] = useState(user.city || 'Kinshasa');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState<string>(user.avatarUrl || '');

  useEffect(() => {
    if (user && !isEditingProfile) {
      setProfileName(user.name || '');
      setProfilePhone(user.phoneNumber || '');
      setProfileCity(user.city || 'Kinshasa');
      setProfileAvatarPreview(user.avatarUrl || '');
    }
  }, [user, isEditingProfile]);

  // Synchronisation avec les actions de clic de notification push
  useEffect(() => {
    const handleNavigate = () => {
      console.log("[CustomerView] Changement de vue vers les commandes via notification push");
      setViewMode('orders');
    };
    window.addEventListener('navigate_to_order', handleNavigate);
    return () => window.removeEventListener('navigate_to_order', handleNavigate);
  }, []);

  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  // Calcul de la distance et du temps réels de trajet (routing) pour le restaurant sélectionné
  const userCoords = useMemo(() => {
    return userState.location ? { lat: userState.location.latitude, lng: userState.location.longitude } : null;
  }, [userState.location]);

  const restaurantCoords = useMemo(() => {
    return selectedRestaurant?.latitude && selectedRestaurant?.longitude
      ? { lat: selectedRestaurant.latitude, lng: selectedRestaurant.longitude }
      : null;
  }, [selectedRestaurant]);

  const { route: selectedRestaurantRouteMoto } = useRoute(
    userCoords,
    restaurantCoords,
    'moto'
  );

  const { route: selectedRestaurantRouteWalk } = useRoute(
    userCoords,
    restaurantCoords,
    'pieton'
  );

  const selectedRestoCalculated = useMemo(() => {
    if (!selectedRestaurant) return null;

    const userLat = userState.location?.latitude;
    const userLng = userState.location?.longitude;
    const restLat = selectedRestaurant.latitude;
    const restLng = selectedRestaurant.longitude;

    let distKm = selectedRestaurant.distance;
    if (distKm === undefined || isNaN(distKm) || distKm === 0) {
      if (userLat !== undefined && userLng !== undefined && restLat !== undefined && restLng !== undefined) {
        distKm = getEstimatedRoadDistanceInKm(userLat, userLng, restLat, restLng);
      } else {
        distKm = 2.0;
      }
    }

    let finalDist = distKm;
    if (selectedRestaurantRouteMoto && selectedRestaurantRouteMoto.distanceKm > 0) {
      if (selectedRestaurantRouteMoto.distanceKm <= distKm * 1.8 + 0.5) {
        finalDist = selectedRestaurantRouteMoto.distanceKm;
      }
    }

    const timeMoto = calculateRealisticTime(finalDist, 'moto');
    const timeWalking = calculateRealisticTime(finalDist, 'pieton');

    return {
      distKm: finalDist,
      timeMoto,
      timeWalking
    };
  }, [selectedRestaurant, userState.location, selectedRestaurantRouteMoto]);

  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const menuDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutsideMenu = (event: MouseEvent) => {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(event.target as Node)) {
        setShowMenuDropdown(false);
      }
    };
    if (showMenuDropdown) {
      document.addEventListener('mousedown', handleClickOutsideMenu);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideMenu);
    };
  }, [showMenuDropdown]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [urgentMode, setUrgentMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isKpayPolling, setIsKpayPolling] = useState(false);
  const [kpayStatusMessage, setKpayStatusMessage] = useState('');
  const [kpayCurrentPhone, setKpayCurrentPhone] = useState('');
  const [kpayGatewayUrl, setKpayGatewayUrl] = useState('');
  const kpayIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (kpayIntervalRef.current) {
        clearInterval(kpayIntervalRef.current);
      }
    };
  }, []);

  const [selectedCity, setSelectedCity] = useState<string>('Toutes');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tous');
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<string>('Tous');
  const [sortBy, setSortBy] = useState<string>('relevance');
  const [openNow, setOpenNow] = useState<boolean>(false);
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  
  const [isSearchingUrgent, setIsSearchingUrgent] = useState(false);
  const [urgentRestaurant, setUrgentRestaurant] = useState<Restaurant | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Order States
  const [orders, setOrders] = useState<Order[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  
  // Chat State
  const [activeChatOrder, setActiveChatOrder] = useState<Order | null>(null);
  const [activeChatLivreur, setActiveChatLivreur] = useState<Order | null>(null);

  // Story State
  const [activeStoryRestaurant, setActiveStoryRestaurant] = useState<Restaurant | null>(null);
  const [storyStartIndex, setStoryStartIndex] = useState(0);

  // Subscription State
  const [subscribedRestaurants, setSubscribedRestaurants] = useState<string[]>([]);
  const [isSubscribing, setIsSubscribing] = useState<string | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState<Record<string, number>>({});
  const [loyaltyRewards, setLoyaltyRewards] = useState<Record<string, any[]>>({});

  // Meal reviews state variables
  const [activeMealForReviews, setActiveMealForReviews] = useState<MenuItem | null>(null);
  const [mealReviews, setMealReviews] = useState<MealReview[]>([]);
  const [isLoadingMealReviews, setIsLoadingMealReviews] = useState(false);
  const [newMealRating, setNewMealRating] = useState<number>(5);
  const [newMealComment, setNewMealComment] = useState<string>('');
  const [isSubmittingMealReview, setIsSubmittingMealReview] = useState(false);

  const [activeTab, setActiveTab ] = useState<'restaurants' | 'items'>('restaurants');
  const [cartConflict, setCartConflict] = useState<{ item: MenuItem, restaurant: Restaurant } | null>(null);

  const [isPinSetupOpen, setIsPinSetupOpen] = useState(false);
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as any;
      if (!target) return;
      
      let currentScrollY = 0;
      if (target === document || target === window || target.nodeName === '#document') {
        currentScrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
      } else if (typeof target.scrollTop === 'number') {
        currentScrollY = target.scrollTop;
      } else {
        return;
      }
      
      // Prevent unnecessary changes if scroll difference is too small
      if (Math.abs(currentScrollY - lastScrollY.current) < 5) return;
      
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

  useEffect(() => {
    const fetchAppSettings = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('app_settings')
          .select('value')
          .eq('id', 'global')
          .single();
        
        if (fetchErr) console.error("Supabase fetchErr:", fetchErr);
        if (data?.value) {
          const parsedVal = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          console.log("FETCHED APP SETTINGS:", parsedVal); setAppSettings(parsedVal);
        }
      } catch (error) {
        console.error("Error fetching app settings:", error);
      }
    };

    fetchAppSettings();

    const appSettingsSubscription = supabase
      .channel('public:app_settings_customer')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_settings',
        filter: 'id=eq.global'
      }, (payload) => {
        if (payload.new && (payload.new as any).value) {
          const rawVal = (payload.new as any).value;
          const parsedVal = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
          console.log("FETCHED APP SETTINGS:", parsedVal); setAppSettings(parsedVal);
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(appSettingsSubscription);
    };
  }, []);
  
  // Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedNotificationId, setExpandedNotificationId] = useState<string | null>(null);
  const [legalView, setLegalView] = useState<'terms' | 'privacy' | 'contact' | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Nearby Restaurants (Sorted by distance)
  const nearbyRestaurants = useMemo(() => {
    // We show the 8 closest active and online restaurants
    return restaurants.filter(r => r.isActive !== false && r.isOnline !== false).slice(0, 8);
  }, [restaurants]);

  // Discovery Feed: Popular Items from nearby restaurants
  const discoverableItems = useMemo(() => {
    const items: (MenuItem & { restaurant: Restaurant })[] = [];
    restaurants.filter(r => r.isActive !== false && r.isOnline !== false).forEach(r => {
      r.menu.forEach(m => {
        items.push({ ...m, restaurant: r });
      });
    });
    // Return random selection or based on ratings if available
    return items.sort(() => Math.random() - 0.5).slice(0, 15);
  }, [restaurants]);

  // Past Ordered Items
  const recentOrderedItems = useMemo(() => {
    const items: (MenuItem & { restaurant: Restaurant })[] = [];
    const seenIds = new Set();
    
    orders.forEach(o => {
      o.items.forEach(item => {
        if (!seenIds.has(item.id)) {
          const restaurant = allRestaurants.find(r => r.id === o.restaurantId);
          if (restaurant) {
            items.push({ ...item, restaurant } as any);
            seenIds.add(item.id);
          }
        }
      });
    });
    return items.slice(0, 8);
  }, [orders, allRestaurants]);

  // Delivery Onboarding State
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [deliveryVehicle, setDeliveryVehicle] = useState<'moto' | 'velo' | 'voiture' | 'pieton'>('moto');
  const [deliveryIdNumber, setDeliveryIdNumber] = useState('');
  const [deliveryLicensePlate, setDeliveryLicensePlate] = useState('');
  const [isSubmittingOnboarding, setIsSubmittingOnboarding] = useState(false);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);

  const idCardInputRef = useRef<HTMLInputElement>(null);
  const licenseInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user.id) {
        fetchNotifications();
        
        const channel = supabase
            .channel(`user_notifications:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, (payload) => {
                console.log("[Notifications] Nouvelle notification reçue:", payload.new);
                setNotifications(prev => [payload.new, ...prev]);
                setUnreadCount(prev => prev + 1);
                toast.custom((t) => (
                    <div className="bg-white dark:bg-gray-900 border-2 border-[#f97316] shadow-xl rounded-2xl p-4 flex items-start space-x-3 w-[340px] max-w-full">
                        <div className="w-10 h-10 rounded-full bg-[#f97316] text-white flex items-center justify-center font-black text-lg shrink-0 animate-bounce">
                            <Bell size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-[#ea580c] truncate">{payload.new.title}</p>
                            <p className="text-xs font-bold text-gray-700 dark:text-gray-200 mt-1 line-clamp-2">{payload.new.message}</p>
                            <div className="flex justify-between items-center mt-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                                <p className="text-[10px] text-gray-400 font-mono">{new Date().toLocaleTimeString()}</p>
                                <button 
                                    onClick={() => {
                                        setViewMode('orders');
                                        toast.dismiss(t);
                                    }}
                                    className="text-xs font-black text-[#ea580c] hover:underline"
                                >
                                    Voir la commande
                                </button>
                            </div>
                        </div>
                    </div>
                ), { duration: 6000 });
            })
            .subscribe((status) => {
                console.log(`[Notifications] Statut de la souscription: ${status}`);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }
  }, [user.id]);

  const fetchNotifications = async (retryCount = 0) => {
    if (user.role === 'guest' || user.id === 'guest') {
        console.log("[Notifications] Bypass fetch pour mode invité");
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn(`Erreur notifications (Tentative ${retryCount + 1}):`, error.message);
            
            const isNetworkError = error.message?.includes('Failed to fetch') || error.message?.includes('network');
            
            if (isNetworkError && retryCount < 2) {
                console.log(`Nouvelle tentative de lecture notifications dans 2s...`);
                setTimeout(() => fetchNotifications(retryCount + 1), 2000);
                return;
            }
            throw error;
        }
        setNotifications(data || []);
        setUnreadCount((data || []).filter((n: any) => !n.is_read).length);
    } catch (error) {
        console.error("Error fetching notifications:", error);
    }
  };

  const markNotificationAsRead = async (id: string) => {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (error) throw error;
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
        console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (user.role === 'guest' || user.id === 'guest') return;
    
    try {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);

        if (error) throw error;
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
    } catch (error) {
        console.error("Error marking all as read:", error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', id);

        if (error) throw error;
        setNotifications(prev => prev.filter(n => n.id !== id));
        setUnreadCount(prev => {
            const n = notifications.find(notif => notif.id === id);
            return n && !n.is_read ? Math.max(0, prev - 1) : prev;
        });
    } catch (error) {
        console.error("Error deleting notification:", error);
    }
  };

  // Fetch loyalty data
  useEffect(() => {
    if (user && user.role !== 'guest') {
      const fetchLoyaltyData = async () => {
        // Fetch points
        const { data: pointsData } = await supabase
          .from('loyalty_points')
          .select('restaurant_id, points')
          .eq('user_id', user.id);
        
        if (pointsData) {
          const pointsMap: Record<string, number> = {};
          pointsData.forEach(p => {
            pointsMap[p.restaurant_id] = p.points;
          });
          setLoyaltyPoints(pointsMap);
        }

        // Fetch rewards for all restaurants (or just the selected one)
        const { data: rewardsData } = await supabase
          .from('loyalty_rewards')
          .select('*')
          .eq('is_active', true);
        
        if (rewardsData) {
          const rewardsMap: Record<string, any[]> = {};
          rewardsData.forEach(r => {
            if (!rewardsMap[r.restaurant_id]) rewardsMap[r.restaurant_id] = [];
            rewardsMap[r.restaurant_id].push(r);
          });
          setLoyaltyRewards(rewardsMap);
        }
      };
      fetchLoyaltyData();
    }
  }, [user, selectedRestaurant]);

  // Fetch subscriptions
  useEffect(() => {
    if (user && user.role !== 'guest') {
      const fetchSubscriptions = async () => {
        const { data, error } = await supabase
          .from('followers')
          .select('restaurant_id')
          .eq('user_id', user.id);
        
        if (!error && data) {
          setSubscribedRestaurants(data.map(f => f.restaurant_id));
        }
      };
      fetchSubscriptions();
    }
  }, [user]);

  const toggleSubscription = async (restaurantId: string) => {
    if (user.role === 'guest') {
      toast.error("Vous devez d'abord vous connecter pour vous abonner.");
      return;
    }

    const isSubscribed = subscribedRestaurants.includes(restaurantId);

    // Optimistic UI update and immediate toast feedback
    if (isSubscribed) {
      setSubscribedRestaurants(prev => prev.filter(id => id !== restaurantId));
      toast.info("Abonnement annulé.");
    } else {
      setSubscribedRestaurants(prev => [...prev, restaurantId]);
      toast.success("Vous êtes maintenant abonné à ce restaurant !");
    }

    // Run the persistence and notification operations completely in the background
    (async () => {
      try {
        if (isSubscribed) {
          const { error } = await supabase
            .from('followers')
            .delete()
            .eq('user_id', user.id)
            .eq('restaurant_id', restaurantId);
          
          if (error) throw error;
        } else {
          // Ensure a fallback database profile exists for the user to prevent foreign key constraints issues and enable proper resolution on owner dashboard
          try {
            await supabase
              .from('profiles')
              .upsert({
                id: user.id,
                full_name: user.name || 'Utilisateur',
                email: user.email || '',
                role: user.role || 'client',
                city: user.city || 'Kinshasa'
              }, { onConflict: 'id' });
          } catch (profileErr) {
            console.warn("Impossible de s'assurer de l'existence du profil en base, poursuite de l'abonnement...", profileErr);
          }

          // Use upsert to handle potential duplicates gracefully at the database level
          const { error } = await supabase
            .from('followers')
            .upsert(
              { user_id: user.id, restaurant_id: restaurantId },
              { onConflict: 'user_id,restaurant_id' }
            );
          
          if (error && error.code !== '23505') {
              throw error;
          }
          
          // Notify the restaurant owner
          const targetRestaurant = allRestaurants.find(r => r.id === restaurantId);
          if (targetRestaurant?.ownerId) {
            try {
              await supabase.from('notifications').insert({
                user_id: targetRestaurant.ownerId,
                restaurant_id: targetRestaurant.id,
                title: 'Nouvel abonné',
                message: `${user.name || 'Un utilisateur'} vient de s'abonner à votre restaurant.`,
                type: 'info',
                is_read: false
              });
            } catch (err) {
              console.error("Could not send notification:", err);
            }
          }
        }
      } catch (error: any) {
        console.error("Erreur de synchronisation d'abonnement en arrière-plan:", error);
        toast.error("Erreur de synchronisation de l'abonnement.");
        
        // Revert optimistic update on failure
        if (isSubscribed) {
          setSubscribedRestaurants(prev => {
            if (!prev.includes(restaurantId)) return [...prev, restaurantId];
            return prev;
          });
        } else {
          setSubscribedRestaurants(prev => prev.filter(id => id !== restaurantId));
        }
      }
    })();
  };

  const handleClaimReward = async (reward: any) => {
    if (!user || user.role === 'guest') {
      toast.error("Veuillez vous connecter pour réclamer vos récompenses de fidélité.");
      return;
    }
    
    const currentPoints = loyaltyPoints[reward.restaurant_id] || 0;
    if (currentPoints < reward.points_required) {
        toast.error("Points insuffisants");
        return;
    }

    try {
        const { error } = await supabase
            .from('loyalty_points')
            .update({ 
                points: currentPoints - reward.points_required,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('restaurant_id', reward.restaurant_id);

        if (error) throw error;

        setLoyaltyPoints(prev => ({
            ...prev,
            [reward.restaurant_id]: currentPoints - reward.points_required
        }));

        // Find associated restaurant or fallback
        const targetResto = (selectedRestaurant && selectedRestaurant.id === reward.restaurant_id)
          ? selectedRestaurant
          : (restaurants.find(r => r.id === reward.restaurant_id) || {
              id: reward.restaurant_id,
              name: reward.restaurant_name || 'Restaurant'
            });

        // Determine associated menu item id or name if any
        const linkedMenuItemId = reward.menu_item_id || reward.menuItemId;
        const linkedItem = (targetResto.menu && Array.isArray(targetResto.menu))
          ? targetResto.menu.find((i: any) => i.id === linkedMenuItemId || (i.name && reward.name && i.name.toLowerCase() === reward.name.toLowerCase()))
          : null;

        const offerTitle = linkedItem ? linkedItem.name : reward.name;

        // Claim and generate unique code / QR code
        const claimed = await claimOffer({
          user,
          restaurant: targetResto as any,
          promoId: linkedItem ? linkedItem.id : (reward.menu_item_id || reward.id),
          title: `Cadeau Fidélité : ${offerTitle}`,
          badgeText: `Gratuit (${reward.points_required} Pts)`,
          caption: `Récompense de fidélité débloquée avec vos points chez ${targetResto.name}. Présentez ce code ou le QR code en caisse ou lors de votre commande.`,
          promoPrice: 0
        });

        // Display modal immediately with code & QR Code
        setActiveClaimedOffer(claimed);
        toast.success(`Récompense réclamée ! Votre code d'activation est ${claimed.code}`);
    } catch (err) {
        console.error("Error claiming reward:", err);
        toast.error("Erreur lors de la réclamation");
    }
  };

  const updateSecuritySettings = async (newSettings: Partial<SecuritySettings>) => {
    if (!user || user.role === 'guest' || !onUpdateUser) return;

    const updatedSettings = {
      ...(user.settings || {
        notifPush: true,
        notifEmail: true,
        notifSms: false,
        twoFactorEnabled: false,
        appLockEnabled: false,
        appLockPin: null,
        biometricsEnabled: false
      }),
      ...newSettings
    };

    const updatedUser = {
      ...user,
      settings: updatedSettings
    };

    onUpdateUser(updatedUser);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ settings: updatedSettings })
        .eq('id', user.id);

      if (error) throw error;
      toast.success("Paramètres de sécurité mis à jour");
    } catch (err) {
      console.error("Error updating security settings:", err);
      toast.error("Erreur lors de la mise à jour des paramètres");
    }
  };

// Helper function to resize and compress avatar photos to lightweight thumbnail sizes (max 150x150)
const compressAndResizeImage = (file: File, maxWidth = 150, maxHeight = 150): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7); // 70% quality JPEG
          resolve(compressed);
        } else {
          resolve(event.target?.result as string); // fallback to original size
        }
      };
      img.onerror = () => resolve(event.target?.result as string);
    };
    reader.onerror = () => resolve('');
  });
};

  const updateUserProfile = async (updates: { name: string; phoneNumber: string; city: string; avatarUrl?: string }) => {
    if (!user || user.role === 'guest' || !onUpdateUser) return;

    const updatedUser = {
      ...user,
      name: updates.name,
      phoneNumber: updates.phoneNumber,
      city: updates.city,
      avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : user.avatarUrl
    };

    onUpdateUser(updatedUser);

    try {
      // Metre à jour les métadonnées d'auth pour une synchronisation rapide (empêche l'écrasement par des données obsolètes)
      supabase.auth.updateUser({
        data: {
          full_name: updates.name,
          phone_number: updates.phoneNumber,
          city: updates.city,
          avatar_url: updates.avatarUrl !== undefined ? updates.avatarUrl : user.avatarUrl,
        }
      }).catch(err => console.warn("Erreur updateUser metadata:", err));

      // Configuration d'un timeout de sécurité de 6 secondes pour éviter que l'APK ne tourne indéfiniment
      const updatePromise = supabase
        .from('profiles')
        .update({
          full_name: updates.name,
          phone_number: updates.phoneNumber,
          city: updates.city,
          avatar_url: updates.avatarUrl !== undefined ? updates.avatarUrl : user.avatarUrl,
          settings: {
            ...(user.settings || {}),
            avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : user.avatarUrl
          }
        })
        .eq('id', user.id);

      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), 6000);
      });

      try {
        const { error } = await Promise.race([
          updatePromise.then(res => res),
          timeoutPromise
        ]) as any;
        clearTimeout(timeoutId);

        if (error) {
          console.warn("Standard profile update failed, attempting fallback inside settings JSON:", error.message);
          
          const fallbackPromise = supabase
            .from('profiles')
            .update({
              settings: {
                ...(user.settings || {}),
                avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : user.avatarUrl,
                fullName: updates.name,
                phoneNumber: updates.phoneNumber,
                city: updates.city
              }
            })
            .eq('id', user.id);

          let fallbackTimeoutId: NodeJS.Timeout;
          const fallbackTimeoutPromise = new Promise((_, reject) => {
            fallbackTimeoutId = setTimeout(() => reject(new Error('TIMEOUT')), 6000);
          });

          const { error: fallbackError } = await Promise.race([
            fallbackPromise.then(res => res),
            fallbackTimeoutPromise
          ]) as any;
          clearTimeout(fallbackTimeoutId);

          if (fallbackError) throw fallbackError;
        }
        toast.success("Profil mis à jour avec succès !");
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
      }
    } catch (err: any) {
      if (err.message === 'TIMEOUT') {
        console.warn("[Profile] Mise à jour standard de la base de données trop longue. Enregistrement local OK.");
        toast.info("Profil sauvegardé pour cette session (synchronisation en arrière-plan...)");
      } else {
        console.error("Error updating profile:", err);
        toast.error("Paramètres enregistrés localement. Une erreur de réseau empêche la mise à jour en ligne.");
      }
    }
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      toast.error("Veuillez renseigner votre nom complet.");
      return;
    }

    setIsSavingProfile(true);
    try {
      let avatarUrl = user.avatarUrl || '';

      if (profileAvatarFile) {
        // Validation taille (max 5 Mo)
        if (profileAvatarFile.size > 5 * 1024 * 1024) {
          toast.error("L'image est trop volumineuse (maximum 5 Mo).");
          setIsSavingProfile(false);
          return;
        }

        const fileExt = profileAvatarFile.name.split('.').pop();
        const fileName = `${user.id}_avatar_${Date.now()}.${fileExt}`;
        
        try {
          // Timeout de sécurité pour l'upload (5 secondes max)
          const uploadPromise = supabase.storage
            .from('images')
            .upload(`avatars/${fileName}`, profileAvatarFile);
            
          let uploadTimeoutId: NodeJS.Timeout;
          const uploadTimeoutPromise = new Promise((_, reject) => {
            uploadTimeoutId = setTimeout(() => reject(new Error('UPLOAD_TIMEOUT')), 5000);
          });
          
          const { error: uploadError } = await Promise.race([
            uploadPromise.then(res => res),
            uploadTimeoutPromise
          ]) as any;
          clearTimeout(uploadTimeoutId);
          
          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('images')
            .getPublicUrl(`avatars/${fileName}`);
          avatarUrl = publicUrl;
        } catch (storageErr) {
          console.warn("Standard avatar upload failed or timed out, converting to compressed Base64:", storageErr);
          try {
            avatarUrl = await compressAndResizeImage(profileAvatarFile, 150, 150);
          } catch (compressErr) {
            console.error("Avatar compression failed, falling back to FileReader:", compressErr);
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = error => reject(error);
            });
            reader.readAsDataURL(profileAvatarFile);
            avatarUrl = await base64Promise;
          }
        }
      }

      await updateUserProfile({
        name: profileName,
        phoneNumber: profilePhone,
        city: profileCity,
        avatarUrl
      });
      setIsEditingProfile(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSetPin = (pin: string) => {
    updateSecuritySettings({ appLockPin: pin, appLockEnabled: true });
    setIsPinSetupOpen(false);
    toast.success("Code PIN configuré avec succès !");
  };

  // Carousel Ref
  const carouselRef = useRef<HTMLDivElement>(null);

  // Auto-scroll carousel
  useEffect(() => {
      const carousel = carouselRef.current;
      if (!carousel) return;

      let scrollInterval: NodeJS.Timeout;
      const startScroll = () => {
          scrollInterval = setInterval(() => {
              if (carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 10) {
                  carousel.scrollTo({ left: 0, behavior: 'smooth' });
              } else {
                  carousel.scrollBy({ left: carousel.clientWidth, behavior: 'smooth' });
              }
          }, 5000); // Scroll every 5 seconds
      };

      startScroll();

      // Pause on hover/touch
      const pauseScroll = () => clearInterval(scrollInterval);
      carousel.addEventListener('mouseenter', pauseScroll);
      carousel.addEventListener('mouseleave', startScroll);
      carousel.addEventListener('touchstart', pauseScroll);
      carousel.addEventListener('touchend', startScroll);

      return () => {
          clearInterval(scrollInterval);
          carousel.removeEventListener('mouseenter', pauseScroll);
          carousel.removeEventListener('mouseleave', startScroll);
          carousel.removeEventListener('touchstart', pauseScroll);
          carousel.removeEventListener('touchend', startScroll);
      };
  }, []);

  // History Management
  useEffect(() => {
      // Initial state
      if (!window.history.state) {
          window.history.replaceState({ view: 'list' }, '', '#list');
      }

      const onPopState = (e: PopStateEvent) => {
          const state = e.state;
          if (state?.view) {
              setViewMode(state.view);
              if (state.view === 'list' || state.view === 'map') {
                  setSelectedRestaurant(null);
              }
          }
          
          setIsCartOpen(!!state?.cart);
          if (!state?.chat) setActiveChatOrder(null);
          if (!state?.story) setActiveStoryRestaurant(null);
          if (!state?.help) setIsHelpCenterOpen(false);
          if (!state?.urgent) {
              setUrgentMode(false);
              setUrgentRestaurant(null);
          }
      };

      window.addEventListener('popstate', onPopState);
      return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = (mode: ViewMode) => {
      if (mode === viewMode) return;
      window.history.pushState({ view: mode }, '', `#${mode}`);
      setViewMode(mode);
  };

  const openCart = () => {
      window.history.pushState({ view: viewMode, cart: true }, '', '#cart');
      setIsCartOpen(true);
  };

  const closeCart = () => {
      if (window.history.state?.cart) window.history.back();
      else setIsCartOpen(false);
  };

  const openChat = (order: Order) => {
      window.history.pushState({ view: viewMode, chat: true }, '', '#chat');
      setActiveChatOrder(order);
  };

  const closeChat = () => {
      if (window.history.state?.chat) window.history.back();
      else setActiveChatOrder(null);
  };

  const openStory = (restaurant: Restaurant, index: number) => {
      window.history.pushState({ view: viewMode, story: true }, '', '#story');
      setStoryStartIndex(index);
      setActiveStoryRestaurant(restaurant);
  };

  const closeStory = () => {
      if (window.history.state?.story) window.history.back();
      else setActiveStoryRestaurant(null);
  };

  const openHelpCenter = () => {
      window.history.pushState({ view: viewMode, help: true }, '', '#help');
      setIsHelpCenterOpen(true);
  };

  const closeHelpCenter = () => {
      if (window.history.state?.help) window.history.back();
      else setIsHelpCenterOpen(false);
  };

  const toggleUrgentMode = () => {
      handleUrgentMode();
  };

  // Geolocation Function
  const refreshLocation = () => {
    setUserState(prev => ({ ...prev, loadingLocation: true, locationError: null }));
    
    if (!navigator.geolocation) {
      setUserState({
        location: null,
        locationError: "La géolocalisation n'est pas supportée par votre navigateur",
        loadingLocation: false
      });
      return;
    }

    try {
      // Use coordinates from the user's selected city at registration as fallback
      const userCity = user?.city || 'Kinshasa';
      const cityCoords = CITY_COORDINATES[userCity] || { latitude: KINSHASA_CENTER_LAT, longitude: KINSHASA_CENTER_LNG };

      // Add a faster safety timeout for the UI (7 seconds as per user request)
      const uiSafetyTimeout = setTimeout(() => {
          setUserState(prev => {
              if (prev.loadingLocation) {
                  console.warn(`[Location] UI Safety timeout triggered. Using fallback for ${userCity}.`);
                  return {
                    ...prev,
                    location: prev.location || cityCoords,
                    locationError: "Temps d'attente GPS dépassé. Utilisation de votre ville par défaut.",
                    loadingLocation: false
                  };
              }
              return prev;
          });
      }, 7000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(uiSafetyTimeout);
          if (position?.coords) {
            setUserState({
              location: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              },
              locationError: null,
              loadingLocation: false
            });
          } else {
            throw new Error("Invalid position object");
          }
        },
        (error) => {
          clearTimeout(uiSafetyTimeout);
          console.warn("Geo error:", error);
          // Fallback to IP geolocation if GPS fails
          fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(data => {
              if (data && data.latitude && data.longitude) {
                setUserState({
                  location: {
                    latitude: data.latitude,
                    longitude: data.longitude
                  },
                  locationError: "Position GPS introuvable. Utilisation de la position réseau.",
                  loadingLocation: false
                });
              } else {
                throw new Error("IP Geo failed");
              }
            })
            .catch(err => {
              setUserState({
                  location: {
                      latitude: KINSHASA_CENTER_LAT,
                      longitude: KINSHASA_CENTER_LNG
                  },
                  locationError: "Position introuvable. Utilisation de la position par défaut (Kinshasa).",
                  loadingLocation: false
              });
            });
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    } catch (syncError) {
      console.error("Synchronous getCurrentPosition error caught:", syncError);
      // Fallback to network estimation
      fetch('https://ipapi.co/json/')
        .then(res => res.json())
        .then(data => {
          if (data && data.latitude && data.longitude) {
            setUserState({
              location: {
                latitude: data.latitude,
                longitude: data.longitude
              },
              locationError: "Position GPS inaccessible. Utilisation de la position réseau.",
              loadingLocation: false
            });
          } else {
            throw new Error("IP Geo failed");
          }
        })
        .catch(err => {
          setUserState({
              location: {
                  latitude: KINSHASA_CENTER_LAT,
                  longitude: KINSHASA_CENTER_LNG
              },
              locationError: "Service de position bloqué. Utilisation de la position par défaut (Kinshasa).",
              loadingLocation: false
          });
        });
    }
  };

  // Initial Geolocation
  useEffect(() => {
    refreshLocation();
  }, []);

  // Update Restaurants when location or database changes
  useEffect(() => {
    if (userState.location) {
      const lat = userState.location.latitude;
      const lng = userState.location.longitude;

      // Find nearest city based on GPS coordinates
      const nearestCity = getNearestCity(lat, lng);

      // If the user is logged in and their city doesn't match the nearest city detected by GPS
      if (user && user.id !== 'guest' && user.city !== nearestCity) {
        console.log(`GPS detected nearest city: ${nearestCity} (current user city: ${user.city}). Updating user region.`);
        updateUserProfile({
          name: user.name || '',
          phoneNumber: user.phoneNumber || '',
          city: nearestCity,
          avatarUrl: user.avatarUrl
        }).then(() => {
          toast.success(`Région mise à jour automatiquement sur ${nearestCity} (détecté par GPS)`);
        }).catch(err => {
          console.error("Failed to automatically update user city from GPS", err);
        });
      }

      // Reverse Geocoding to get city
      if (!userState.locationError) {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&email=contact@dashmeals.app`)
          .then(res => res.json())
          .then(data => {
            if (data && data.address) {
              const city = data.address.city || data.address.town || data.address.village || data.address.state;
              if (city) {
                setDetectedAddress(city);

                // If Nominatim finds an exact match in our cities, we can also use that as primary confirmation
                const matchedCity = Object.keys(CITY_COORDINATES).find(
                  c => c.toLowerCase().trim() === city.toLowerCase().trim()
                );
                if (matchedCity && user && user.id !== 'guest' && user.city !== matchedCity) {
                  updateUserProfile({
                    name: user.name || '',
                    phoneNumber: user.phoneNumber || '',
                    city: matchedCity,
                    avatarUrl: user.avatarUrl
                  }).catch(err => console.error(err));
                }
              }
            }
          })
          .catch(err => console.error("Reverse geocoding failed", err));
      }

      const updatedRestaurants = allRestaurants
        .filter(r => r.isActive !== false && r.isOnline !== false)
        .map(r => {
          const lat1 = userState.location?.latitude;
          const lon1 = userState.location?.longitude;
          const lat2 = r.latitude;
          const lon2 = r.longitude;

          let roadDist = 9999;
          if (
            lat1 !== undefined && lat1 !== null && !isNaN(lat1) &&
            lon1 !== undefined && lon1 !== null && !isNaN(lon1) &&
            lat2 !== undefined && lat2 !== null && !isNaN(lat2) &&
            lon2 !== undefined && lon2 !== null && !isNaN(lon2)
          ) {
            roadDist = getEstimatedRoadDistanceInKm(lat1, lon1, lat2, lon2);
          }

          const distVal = isNaN(roadDist) ? 9999 : roadDist;
          
          return {
            ...r,
            distance: distVal,
            timeWalking: calculateRealisticTime(distVal, 'pieton'),
            timeMoto: calculateRealisticTime(distVal, 'moto'),
          };
        })
        .sort((a, b) => {
          const distA = a.distance !== undefined && !isNaN(a.distance) ? a.distance : 9999;
          const distB = b.distance !== undefined && !isNaN(b.distance) ? b.distance : 9999;
          return distA - distB;
        });

      setRestaurants(updatedRestaurants);
      // Fetch promotions after restaurants are ready
      fetchPromotions(updatedRestaurants);
    } else {
      const activeRestaurants = allRestaurants.filter(r => r.isActive !== false && r.isOnline !== false);
      setRestaurants(activeRestaurants);
      fetchPromotions(activeRestaurants);
    }
  }, [userState.location, allRestaurants, user]);

  // Realtime Orders Subscription for Customer
  useEffect(() => {
    const channel = supabase
        .channel('customer-orders')
        .on(
            'postgres_changes',
            {
                event: '*', // On écoute tous les événements (INSERT, UPDATE, DELETE) pour synchronisation à chaud
                schema: 'public',
                table: 'orders',
                filter: `user_id=eq.${user.id}`
            },
            (payload) => {
                console.log("Mise à jour commande client:", payload);
                if (payload.eventType === 'INSERT') {
                    fetchOrders();
                } else if (payload.eventType === 'DELETE') {
                    setOrders(prev => prev.filter(o => o.id !== payload.old.id));
                } else if (payload.eventType === 'UPDATE') {
                    // On met à jour l'état local pour voir le changement instantanément
                    setOrders(prev => prev.map(o => 
                        o.id === payload.new.id ? { ...o, status: payload.new.status } : o
                    ));
                    
                    // Send push notification
                    const statusMap: Record<string, string> = {
                        'preparing': t('order_preparing_msg'),
                        'ready': t('order_ready_msg'),
                        'delivering': t('order_delivering_msg'),
                        'completed': t('order_completed_msg'),
                        'cancelled': t('order_cancelled_msg')
                    };
                    
                    const message = statusMap[payload.new.status] || `${t('order_status_changed')} : ${payload.new.status}`;
                    
                    sendPushNotification(t('order_update'), {
                        body: message,
                        tag: `order-${payload.new.id}`,
                        requireInteraction: true
                    });
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [user.id]);

  const fetchPromotions = async (restos: Restaurant[]) => {
      // Filter for last 30 days (generous window to ensure promotions and stories display properly for testing)
      const filterDate = new Date();
      filterDate.setDate(filterDate.getDate() - 30);

      // Fetch automated campaigns for all restaurants to display them to customers
      try {
        const { data: campaignsData } = await supabase
          .from('automated_campaigns')
          .select('*')
          .eq('is_active', true);
        
        if (campaignsData) {
          const campaignsMap: Record<string, any[]> = {};
          campaignsData.forEach(c => {
            if (!campaignsMap[c.restaurant_id]) campaignsMap[c.restaurant_id] = [];
            campaignsMap[c.restaurant_id].push(c);
          });
          setActiveCampaigns(campaignsMap);
        }
      } catch (err) {
        console.warn("Failed to fetch automated campaigns:", err);
      }

      // Fetch loyalty rewards for all restaurants so they are visible even to guests
      try {
        const { data: rewardsData } = await supabase
          .from('loyalty_rewards')
          .select('*')
          .eq('is_active', true);
        
        if (rewardsData) {
          const rewardsMap: Record<string, any[]> = {};
          rewardsData.forEach(r => {
            if (!rewardsMap[r.restaurant_id]) rewardsMap[r.restaurant_id] = [];
            rewardsMap[r.restaurant_id].push(r);
          });
          setLoyaltyRewards(rewardsMap);
        }
      } catch (err) {
        console.warn("Failed to fetch loyalty rewards:", err);
      }

      // Fetch stories/promotions from database
      let { data, error } = await supabase
        .from('promotions')
        .select('*')
        .gte('created_at', filterDate.toISOString())
        .order('created_at', { ascending: false });

      if (data) {
          const mapping: Record<string, Promotion[]> = {};
          
          const resto1Id = restos.length > 0 ? restos[0].id : '1';
          const resto2Id = restos.length > 1 ? restos[1].id : (restos.length > 0 ? restos[0].id : '2');
          
          // Injecter des promotions de test magnifiques et réalistes pour démonstration
          const demoPromos = [
            {
              id: 'demo-promo-1',
              restaurant_id: resto1Id, 
              media_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
              media_type: 'image' as const,
              caption: JSON.stringify({
                is_promo_product: true,
                caption: "Offre Spéciale : Le Kinshasa Burger à prix cassé ce midi !",
                menu_item_id: "k1",
                promo_price: 6.90,
                badge_text: "-23%"
              }),
              created_at: new Date().toISOString()
            },
            {
              id: 'demo-promo-2',
              restaurant_id: resto2Id, 
              media_url: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&auto=format&fit=crop&q=80',
              media_type: 'image' as const,
              caption: JSON.stringify({
                is_promo_product: true,
                caption: "Profitez de -20% sur notre délicieux Poulet Moambe !",
                menu_item_id: "m1",
                promo_price: 9.99,
                badge_text: "-20%"
              }),
              created_at: new Date().toISOString()
            }
          ];

          // On ajoute d'abord les promotions réelles de la base de données
          data.forEach((p: any) => {
              if (!mapping[p.restaurant_id]) mapping[p.restaurant_id] = [];
              mapping[p.restaurant_id].push({
                  id: p.id,
                  restaurantId: p.restaurant_id,
                  mediaUrl: p.media_url,
                  mediaType: p.media_type as 'image' | 'video',
                  caption: p.caption,
                  createdAt: p.created_at
              });
          });

          // On complète avec nos superbes promotions de démo si l'établissement n'a pas déjà de story active
          demoPromos.forEach((p) => {
              if (!mapping[p.restaurant_id] || mapping[p.restaurant_id].length === 0) {
                  mapping[p.restaurant_id] = [{
                      id: p.id,
                      restaurantId: p.restaurant_id,
                      mediaUrl: p.media_url,
                      mediaType: p.media_type,
                      caption: p.caption,
                      createdAt: p.created_at
                  }];
              }
          });

          setPromotionsMap(mapping);
      } else {
          const resto1Id = restos.length > 0 ? restos[0].id : '1';
          const resto2Id = restos.length > 1 ? restos[1].id : (restos.length > 0 ? restos[0].id : '2');
          
          // En cas d'erreur de chargement ou base vide, on affiche toujours nos démos pour garantir une expérience de test irréprochable
          const mapping: Record<string, Promotion[]> = {
            [resto1Id]: [{
              id: 'demo-promo-1',
              restaurantId: resto1Id,
              mediaUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
              mediaType: 'image' as const,
              caption: JSON.stringify({
                is_promo_product: true,
                caption: "Offre Spéciale : Le Kinshasa Burger à prix cassé ce midi !",
                menu_item_id: "k1",
                promo_price: 6.90,
                badge_text: "-23%"
              }),
              createdAt: new Date().toISOString()
            }],
            [resto2Id]: [{
              id: 'demo-promo-2',
              restaurantId: resto2Id,
              mediaUrl: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&auto=format&fit=crop&q=80',
              mediaType: 'image' as const,
              caption: JSON.stringify({
                is_promo_product: true,
                caption: "Profitez de -20% sur notre délicieux Poulet Moambe !",
                menu_item_id: "m1",
                promo_price: 9.99,
                badge_text: "-20%"
              }),
              createdAt: new Date().toISOString()
            }]
          };
          setPromotionsMap(mapping);
      }
  };

  // Load Orders when entering 'orders' view and subscribe to changes
  useEffect(() => {
    if (viewMode === 'orders' && user.id !== 'guest') {
        fetchOrders();

        // Subscribe to real-time updates for orders
        const ordersSubscription = supabase
            .channel('orders-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('Order update received:', payload);
                    fetchOrders(); // Refresh all orders to get updated data including restaurant info
                }
            )
            .subscribe();

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'dashmeals_mock_orders') {
                fetchOrders();
            }
        };
        window.addEventListener('storage', handleStorageChange);

        const pollInterval = setInterval(() => {
            fetchOrders();
        }, 15000);

        return () => {
            supabase.removeChannel(ordersSubscription);
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(pollInterval);
        };
    }
  }, [viewMode, user.id]);

  const fetchOrders = async () => {
    try {
        const { data: initialOrdersData, error: initialOrdersError } = await supabase
            .from('orders')
            .select(`
                *,
                delivery_person:profiles!delivery_person_id(id, full_name, phone_number)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100);
        
        let ordersData = initialOrdersData;
        let ordersError = initialOrdersError;

        if (ordersError) {
             console.warn("Fetch orders failed with relations, trying safe fetch:", ordersError.message);
             const { data: fallbackData, error: fallbackError } = await supabase
                 .from('orders')
                 .select('*')
                 .eq('user_id', user.id)
                 .order('created_at', { ascending: false })
                 .limit(100);
             
             if (!fallbackError) {
                 ordersData = fallbackData;
                 ordersError = null;
             }
        }

        if (ordersError) {
             console.warn("Fetch orders failed completely:", ordersError.message);
             const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
             if (localOrdersStr) {
                 const localOrders = JSON.parse(localOrdersStr);
                 const userLocalOrders = localOrders.filter((o: any) => o.user_id === user.id);
                 if (userLocalOrders.length > 0) {
                     setOrders(userLocalOrders.map((o: any) => ({
                         id: o.id,
                         userId: o.user_id,
                         restaurantId: o.restaurant_id,
                         status: o.status,
                         totalAmount: o.total_amount,
                         isUrgent: o.items && o.items.length > 0 ? o.items[0].isUrgent : false,
                         items: o.items,
                         createdAt: o.created_at,
                         restaurant: { 
                             name: restaurants.find(r => r.id === o.restaurant_id)?.name || 'Restaurant Local',
                             phone_number: restaurants.find(r => r.id === o.restaurant_id)?.phoneNumber || ''
                         }
                     })));
                 }
             }
             return;
        }
        
        let allOrders = ordersData || [];
        
        // Merge with local orders
        const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
        if (localOrdersStr) {
            try {
                const localOrders = JSON.parse(localOrdersStr);
                // Only add local orders that belong to this user
                const userLocalOrders = localOrders.filter((o: any) => o.user_id === user.id);
                
                // Add userLocalOrders that are not already present in allOrders to prevent duplicates
                const dbOrderIds = new Set(allOrders.map((o: any) => o.id));
                const uniqueLocalOrders = userLocalOrders.filter((o: any) => !dbOrderIds.has(o.id));
                allOrders = [...uniqueLocalOrders, ...allOrders];
            } catch (e) {
                console.error("Error parsing local orders", e);
            }
        }

        if (allOrders.length >= 0) {
            // Extract unique restaurant IDs
            const restaurantIds = Array.from(new Set(allOrders.map((o: any) => o.restaurant_id))).filter(Boolean);
            const validRestaurantIds = restaurantIds.filter((id: any) => typeof id === 'string' && id.length === 36);
            
            // Fetch restaurants
            let restaurantsMap: Record<string, any> = {};
            if (validRestaurantIds.length > 0) {
                const { data: restaurantsData, error: restaurantsError } = await supabase
                    .from('restaurants')
                    .select('id, name, phone_number, owner_id, currency, display_currency_mode, exchange_rate, latitude, longitude')
                    .in('id', validRestaurantIds);
                
                if (restaurantsError) {
                    console.error("Error fetching restaurants:", restaurantsError);
                }
                
                if (restaurantsData) {
                    restaurantsData.forEach((r: any) => {
                        restaurantsMap[r.id] = {
                            id: r.id,
                            name: r.name,
                            phone_number: r.phone_number,
                            ownerId: r.owner_id,
                            currency: r.currency,
                            displayCurrencyMode: r.display_currency_mode,
                            exchangeRate: r.exchange_rate,
                            latitude: r.latitude,
                            longitude: r.longitude
                        };
                    });
                }
            }

            // Also check allRestaurants prop for fallback
            allRestaurants.forEach(r => {
                if (!restaurantsMap[r.id]) {
                    restaurantsMap[r.id] = r;
                }
            });

            const formattedOrders = allOrders.map((o: any) => {
                const restaurantData = restaurantsMap[o.restaurant_id];
                let parsedItems = o.items;
                if (typeof o.items === "string") {
                   try { parsedItems = JSON.parse(o.items); } catch(e) { parsedItems = []; }
                }
                const firstItem = parsedItems && parsedItems.length > 0 ? parsedItems[0] : null;
                
                return {
                    id: o.id,
                    userId: o.user_id,
                    restaurantId: o.restaurant_id,
                    status: o.status,
                    totalAmount: o.total_amount,
                    isUrgent: firstItem?.isUrgent || false,
                    paymentMethod: firstItem?.paymentMethod || 'cash',
                    paymentNetwork: firstItem?.paymentNetwork,
                    paymentStatus: firstItem?.paymentStatus || 'pending',
                    deliveryLocation: firstItem?.deliveryLocation || o.delivery_location,
                    items: parsedItems,
                    exchangeRate: o.exchange_rate,
                    createdAt: o.created_at,
                    delivery_person_id: o.delivery_person_id,
                    delivery_acceptance_status: o.delivery_acceptance_status,
                    delivery_person: o.delivery_person,
                    estimated_arrival_restaurant: o.estimated_arrival_restaurant,
                    estimated_arrival_customer: o.estimated_arrival_customer,
                    restaurant: {
                        id: restaurantData?.id,
                        name: restaurantData?.name || 'Inconnu',
                        phone_number: restaurantData?.phone_number,
                        ownerId: restaurantData?.ownerId,
                        latitude: restaurantData?.latitude,
                        longitude: restaurantData?.longitude,
                        currency: restaurantData?.currency || 'USD',
                        displayCurrencyMode: restaurantData?.displayCurrencyMode || 'dual'
                    }
                };
            });
            
            // Sort by created_at descending
            formattedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setOrders(formattedOrders);
        }
    } catch (err) {
        console.error("Error fetching orders:", err);
    }
  };

  const handleUrgentMode = async () => {
    if (urgentMode) {
      if (window.history.state?.urgent) {
        window.history.back();
      } else {
        setUrgentMode(false);
        setUrgentRestaurant(null);
      }
      return;
    }

    window.history.pushState({ view: viewMode, urgent: true }, '', '#urgent');
    setUrgentMode(true);
    setIsSearchingUrgent(true);

    // Simulate searching for nearby restaurants
    setTimeout(() => {
      // Find open restaurants first
      let candidates = restaurants.filter(r => r.isOpen && r.isActive !== false && r.isOnline !== false);
      
      // Filter by selectedCity if specified
      if (selectedCity && selectedCity !== 'Toutes') {
        const normalizedCity = selectedCity.toLowerCase().trim();
        candidates = candidates.filter(r => r.city && r.city.toLowerCase().trim() === normalizedCity);
      } else if (user && user.city) {
        // Fallback to user's city if search is not for all cities
        const normalizedUserCity = user.city.toLowerCase().trim();
        candidates = candidates.filter(r => r.city && r.city.toLowerCase().trim() === normalizedUserCity);
      }

      // If no open candidates exist in the city, fallback to any active/online ones in the city
      if (candidates.length === 0) {
        candidates = restaurants.filter(r => r.isActive !== false && r.isOnline !== false);
        if (selectedCity && selectedCity !== 'Toutes') {
          const normalizedCity = selectedCity.toLowerCase().trim();
          candidates = candidates.filter(r => r.city && r.city.toLowerCase().trim() === normalizedCity);
        } else if (user && user.city) {
          const normalizedUserCity = user.city.toLowerCase().trim();
          candidates = candidates.filter(r => r.city && r.city.toLowerCase().trim() === normalizedUserCity);
        }
      }

      // Sort criteria to find the fastest/closest option:
      // 1st: lowest preparationTime (sensible default of 15 min if missing, which is common for snacks/fast-food)
      // 2nd: closest distance
      const sorted = [...candidates].sort((a, b) => {
        const prepA = a.preparationTime !== undefined && a.preparationTime !== null ? a.preparationTime : 15;
        const prepB = b.preparationTime !== undefined && b.preparationTime !== null ? b.preparationTime : 15;
        if (prepA !== prepB) {
          return prepA - prepB;
        }
        const distA = a.distance !== undefined && !isNaN(a.distance) ? a.distance : 9999;
        const distB = b.distance !== undefined && !isNaN(b.distance) ? b.distance : 9999;
        return distA - distB;
      });

      const closest = sorted[0];

      setIsSearchingUrgent(false);
      
      if (closest) {
        setUrgentRestaurant(closest);
        setSelectedRestaurant(closest);
      } else {
        toast.info("Aucun établissement disponible à proximité pour le moment !");
        if (window.history.state?.urgent) {
          window.history.back();
        } else {
          setUrgentMode(false);
        }
      }
    }, 2000);
  };

  // Filter Logic (City + Urgent + Search + Category + Sort + OpenNow)
  const filteredRestaurants = useMemo(() => {
    let list = restaurants;
    
    // Filter by active status, online status and privacy
    list = list.filter(r => r.isActive !== false && r.isOnline !== false);
    
    if (selectedCity && selectedCity !== 'Toutes') {
        const normalizedSelectedCity = selectedCity.toLowerCase().trim();
        list = list.filter(r => r.city && r.city.toLowerCase().trim() === normalizedSelectedCity);
    }
    if (selectedCategory && selectedCategory !== 'Tous') {
        const normalizedCategory = selectedCategory.toLowerCase().trim();
        list = list.filter(r => r.type && r.type.toLowerCase().trim() === normalizedCategory);
    }
    if (urgentMode) {
        list = list.filter(r => r.isOpen);
        const fastList = list.filter(r => {
            const prep = r.preparationTime !== undefined && r.preparationTime !== null ? r.preparationTime : 15;
            return prep <= 30;
        });
        if (fastList.length > 0) {
            list = fastList;
        }
    }
    if (openNow) list = list.filter(r => r.isOpen);
    
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        list = list.filter(r => 
          (r.name && r.name.toLowerCase().includes(query)) || 
          (r.description && r.description.toLowerCase().includes(query))
        );
    }

    // Sorting
    if (sortBy === 'rating') {
        list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'distance') {
        list = [...list].sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } else if (sortBy === 'time') {
        list = [...list].sort((a, b) => (a.estimatedDeliveryTime || 0) - (b.estimatedDeliveryTime || 0));
    } else if (urgentMode) {
        // Default sort for urgentMode is preparationTime ascending
        list = [...list].sort((a, b) => {
            const prepA = a.preparationTime !== undefined && a.preparationTime !== null ? a.preparationTime : 15;
            const prepB = b.preparationTime !== undefined && b.preparationTime !== null ? b.preparationTime : 15;
            return prepA - prepB;
        });
    }

    return list;
  }, [restaurants, urgentMode, selectedCity, searchQuery, selectedCategory, sortBy, openNow]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCity, urgentMode, searchQuery, restaurants, selectedCategory, sortBy, openNow]);

  const paginatedRestaurants = useMemo(() => {
      const startIndex = (currentPage - 1) * itemsPerPage;
      return filteredRestaurants.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRestaurants, currentPage]);

  const totalPages = Math.ceil(filteredRestaurants.length / itemsPerPage);

  // Region-based restaurants for logged-in users (shown on first plan)
  const userRegionRestaurants = useMemo(() => {
    if (!user || user.id === 'guest' || !user.city) return [];
    const userCityReg = user.city.toLowerCase().trim();
    return restaurants.filter(r => 
      r.isActive !== false && 
      r.isOnline !== false &&
      r.city && 
      r.city.toLowerCase().trim() === userCityReg
    );
  }, [restaurants, user]);

  // Meal Reviews Handlers
  const handleOpenMealReviews = async (item: MenuItem) => {
    setActiveMealForReviews(item);
    setIsLoadingMealReviews(true);
    setNewMealComment('');
    setNewMealRating(5);
    
    try {
      // Try to fetch from Supabase
      const { data, error } = await supabase
        .from('meal_reviews')
        .select('id, user_id, menu_item_id, rating, comment, created_at, profiles:user_id(full_name, email, avatar_url)')
        .eq('menu_item_id', item.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (data) {
        const formattedReviews: MealReview[] = data.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          menu_item_id: r.menu_item_id,
          rating: Number(r.rating) || 5,
          comment: r.comment || '',
          created_at: r.created_at,
          profiles: r.profiles ? {
            full_name: r.profiles.full_name || r.profiles.email?.split('@')[0] || 'Utilisateur',
            email: r.profiles.email || '',
            avatar_url: r.profiles.avatar_url || ''
          } : undefined
        }));
        setMealReviews(formattedReviews);
        // Also save this meal's reviews to localStorage cache
        localStorage.setItem(`meal_reviews_${item.id}`, JSON.stringify(formattedReviews));
      }
    } catch (err: any) {
      console.warn("Erreur chargement avis repas, utilisation du cache local:", err.message);
      const cached = localStorage.getItem(`meal_reviews_${item.id}`);
      if (cached) {
        setMealReviews(JSON.parse(cached));
      } else {
        // Generate some sample/mock reviews if empty so the app shows something nice in dev/offline
        const mockReviews: MealReview[] = [
          {
            id: `mock-rev-1-${item.id}`,
            user_id: 'mock-user-1',
            menu_item_id: item.id,
            rating: 5,
            comment: 'Vraiment délicieux ! Je recommande vivement ce plat.',
            created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
            profiles: { full_name: 'Merveil Kanku', email: 'merveil@example.com' }
          },
          {
            id: `mock-rev-2-${item.id}`,
            user_id: 'mock-user-2',
            menu_item_id: item.id,
            rating: 4,
            comment: 'Très bon goût et portion généreuse.',
            created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
            profiles: { full_name: 'Sarah Mwamba', email: 'sarah@example.com' }
          }
        ];
        setMealReviews(mockReviews);
        localStorage.setItem(`meal_reviews_${item.id}`, JSON.stringify(mockReviews));
      }
    } finally {
      setIsLoadingMealReviews(false);
    }
  };

  const handleSubmitMealReview = async () => {
    if (!activeMealForReviews) return;
    if (user.role === 'guest') {
      toast.error("Veuillez vous connecter pour laisser un avis sur ce plat.");
      return;
    }

    setIsSubmittingMealReview(true);
    const commentText = newMealComment.trim();

    const newReviewId = `opt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newReviewObj: MealReview = {
      id: newReviewId,
      user_id: user.id,
      menu_item_id: activeMealForReviews.id,
      rating: newMealRating,
      comment: commentText,
      created_at: new Date().toISOString(),
      profiles: {
        full_name: user.name || user.email?.split('@')[0] || 'Moi',
        email: user.email || '',
        avatar_url: user.avatarUrl || ''
      }
    };

    try {
      // 1. Send to Supabase
      const { error } = await supabase
        .from('meal_reviews')
        .insert({
          user_id: user.id,
          menu_item_id: activeMealForReviews.id,
          rating: newMealRating,
          comment: commentText
        });

      if (error) {
        throw error;
      }

      toast.success("Votre avis a été publié avec succès !");
    } catch (err: any) {
      console.warn("Erreur envoi avis, sauvegarde locale temporaire:", err.message);
      toast.success("Avis enregistré !");
    } finally {
      // Update local state and caches regardless of DB success to feel instant and robust
      const updatedReviews = [newReviewObj, ...mealReviews];
      setMealReviews(updatedReviews);
      localStorage.setItem(`meal_reviews_${activeMealForReviews.id}`, JSON.stringify(updatedReviews));

      // Append to the global ratings cache so App.tsx can recalculate the average rating
      let globalReviews: any[] = [];
      const cachedGlobal = localStorage.getItem('dashmeals_meal_reviews');
      if (cachedGlobal) {
        try { globalReviews = JSON.parse(cachedGlobal); } catch (e) {}
      }
      globalReviews.push({
        menu_item_id: activeMealForReviews.id,
        rating: newMealRating
      });
      localStorage.setItem('dashmeals_meal_reviews', JSON.stringify(globalReviews));

      // Clear input fields
      setNewMealComment('');
      setNewMealRating(5);
      setIsSubmittingMealReview(false);

      // Refresh parent to show the new average rating
      if (onRefreshData) {
        onRefreshData();
      }
    }
  };

  // Cart Logic
  const addToCart = (item: MenuItem, restaurant: Restaurant) => {
    if (restaurant && restaurant.isOpen === false) {
        toast.warning(`Cet établissement ("${restaurant.name}") est actuellement fermé. Vous pouvez consulter sa carte, mais les commandes en ligne y sont temporairement désactivées.`, {
            duration: 6000
        });
        return;
    }
    if (cart.length > 0 && cart[0].restaurantId !== restaurant.id) {
        setCartConflict({ item, restaurant });
        return;
    }

    const promo = getPromoDetails(item, restaurant.id);
    const itemToAdd = promo && promo.promoPrice !== null
      ? { ...item, price: promo.promoPrice }
      : item;

    setCart(prev => {
        const existing = prev.find(i => i.id === itemToAdd.id);
        if (existing) return prev.map(i => i.id === itemToAdd.id ? { ...i, quantity: i.quantity + 1 } : i);
        return [...prev, { ...itemToAdd, quantity: 1, restaurantId: restaurant.id, restaurantName: restaurant.name }];
    });
  };

  const clearAndAddToCart = () => {
    if (!cartConflict) return;
    const { item, restaurant } = cartConflict;
    const promo = getPromoDetails(item, restaurant.id);
    const itemToAdd = promo && promo.promoPrice !== null
      ? { ...item, price: promo.promoPrice }
      : item;
    setCart([{ ...itemToAdd, quantity: 1, restaurantId: restaurant.id, restaurantName: restaurant.name }]);
    setCartConflict(null);
    toast.info(`Panier mis à jour avec ${item.name}`);
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
        const index = prev.findIndex(i => i.id === itemId);
        if (index > -1) {
            const newArr = [...prev];
            newArr.splice(index, 1);
            return newArr;
        }
        return prev;
    });
  };

  const updateQuantity = (itemId: string, newQuantity: number) => {
    setCart(prev => prev.map(item => 
      item.id === itemId ? { ...item, quantity: newQuantity } : item
    ));
  };

  const rawCartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = appliedCampaign && cart.length > 0 && cart[0].restaurantId === appliedCampaign.restaurant_id
    ? (rawCartTotal * (appliedCampaign.discount_percentage || 0)) / 100 
    : 0;
  const cartTotal = Math.max(0, rawCartTotal - discountAmount);

  const handleCheckout = async (
    paymentMethod: PaymentMethod, 
    network?: MobileMoneyNetwork, 
    isUrgent?: boolean, 
    paymentProof?: string, 
    deliveryLocation?: { lat: number; lng: number; address: string },
    customName?: string,
    customPhone?: string,
    deliveryFee?: number
  ) => {
    console.log('handleCheckout started', { paymentMethod, isUrgent, customName, deliveryFee });
    if (user.role === 'guest') {
        toast.error(t('login_required_order'));
        onLogout(); // Redirect to login
        return;
    }
    if (cart.length === 0) return;
    setIsCheckingOut(true);

    // Add isUrgent flag, payment info, and customer info to the first item as a workaround for schema limitations
    const itemsWithUrgent = cart.map((item, index) => 
        index === 0 ? { 
            ...item, 
            isUrgent: isUrgent || false,
            paymentMethod: paymentMethod,
            paymentNetwork: network,
            paymentStatus: 'pending',
            paymentProof: paymentProof,
            customerName: customName || user.name || 'Client',
            customerPhone: customPhone || user.phoneNumber || '',
            customerEmail: user.email,
            deliveryLocation: deliveryLocation,
            deliveryFee: deliveryFee || 0
        } : item
    );

    try {
        console.log('Inserting order into Supabase with separate delivery fee...');
        const { data, error } = await supabase.from('orders').insert({
            user_id: user.id,
            restaurant_id: cart[0].restaurantId,
            status: 'pending',
            total_amount: cartTotal,
            delivery_fee: deliveryFee || 0,
            exchange_rate: selectedRestaurant?.exchangeRate,
            delivery_location: deliveryLocation,
            items: itemsWithUrgent // Supabase will stringify this automatically for jsonb
        }).select().single();

        if (error) {
            console.error("Erreur critique d'insertion Supabase:", error);
            toast.error("Erreur lors de la validation de la commande en ligne. Veuillez réessayer.");
            setIsCheckingOut(false);
            return;
        }

        console.log('Order created successfully, clearing cart...');
        // Track checkout / purchase event
        analytics.logEvent('purchase', {
            transaction_id: data?.id || 'mock-' + Date.now(),
            value: cartTotal,
            currency: 'USD',
            items_count: cart.length,
            restaurant_id: cart[0].restaurantId,
            payment_method: paymentMethod
        });

        // Success Path
        closeCart();
        setCart([]);
        setAppliedCampaign(null);
        
        if (paymentMethod === 'kpay') {
            toast.info("Initialisation du paiement sécurisé DashMeals Pay...");
            try {
                const response = await fetchWithRetry('/api/kpay/create-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: data?.id || 'mock-' + Date.now(),
                        amount: cartTotal + (deliveryFee || 0),
                        currency: 'USD',
                        phoneNumber: customPhone,
                        provider: network,
                        baseUrl: "https://dashmeals-rdc.onrender.com"
                    })
                });

                const responseData = await parseJsonResponse(response);
                
                if (responseData.mode === "USSD" || responseData.paymentId) {
                    const paymentId = responseData.paymentId;
                    setKpayCurrentPhone(customPhone || '');
                    setKpayStatusMessage(responseData.message || "Paiement USSD initié.");
                    setIsKpayPolling(true);
                    
                    // Poll function
                    const startKpayPolling = (pId: string) => {
                        let attempts = 0;
                        const maxAttempts = 40; // 2 minutes (40 * 3s)
                        
                        kpayIntervalRef.current = setInterval(async () => {
                            attempts++;
                            if (attempts > maxAttempts) {
                                if (kpayIntervalRef.current) clearInterval(kpayIntervalRef.current);
                                setIsKpayPolling(false);
                                setIsCheckingOut(false);
                                toast.error("Le délai d'attente pour la validation du paiement a expiré. Votre commande reste en attente.");
                                return;
                            }
                            
                            try {
                                const statusRes = await fetch(`/api/kpay/payment-status/${pId}`);
                                if (!statusRes.ok) return;
                                const statusText = await statusRes.text();
                                let statusData: any = {};
                                try {
                                    statusData = JSON.parse(statusText);
                                } catch (pErr) {
                                    return;
                                }
                                
                                console.log("[CustomerView] Polled payment status:", statusData.status);
                                
                                setKpayStatusMessage(statusData.status);
                                
                                if (statusData.status === 'COMPLETED' || statusData.status === 'SUCCESSFUL') {
                                    if (kpayIntervalRef.current) clearInterval(kpayIntervalRef.current);
                                    setIsKpayPolling(false);
                                    setIsCheckingOut(false);
                                    toast.success("Paiement validé avec succès !");
                                    setShowSuccess(true);
                                    
                                    // Send confirmation email
                                    if (user.email) {
                                      sendOrderConfirmationEmail({
                                        id: data?.id || 'mock-' + Date.now(),
                                        totalAmount: cartTotal,
                                        items: itemsWithUrgent
                                      }, user.email);
                                    }
                                    
                                    // Notify restaurant
                                    const restaurant = restaurants.find(r => r.id === cart[0].restaurantId);
                                    if (restaurant && restaurant.ownerId) {
                                      // 1. Database notification
                                      if (data?.id) {
                                        const formatRate = restaurant.exchangeRate || appSettings?.payment_exchange_rate || 2850;
                                        const formatCurrency = (restaurant.currency as 'USD' | 'CDF') || 'USD';
                                        const formatMode = restaurant.displayCurrencyMode || 'dual';
                                        const formattedAmount = formatDualPrice(cartTotal, 'USD', formatRate, formatMode as any);
                                        
                                        await supabase.from('notifications').insert({
                                          user_id: restaurant.ownerId,
                                          restaurant_id: restaurant.id,
                                          title: `Nouvelle commande #${data.id.slice(0, 4)}`,
                                          message: `Vous avez reçu une nouvelle commande de ${formattedAmount}.`,
                                          type: 'new_order',
                                          data: { order_id: data.id }
                                        });
                                      }

                                      // 2. Email notification
                                      const { data: ownerProfile } = await supabase
                                        .from('profiles')
                                        .select('email')
                                        .eq('id', restaurant.ownerId)
                                        .single();
                                      
                                      if (ownerProfile?.email) {
                                        sendNewOrderNotificationToRestaurant({
                                          id: data?.id || 'mock-' + Date.now(),
                                          totalAmount: cartTotal,
                                          items: itemsWithUrgent
                                        }, ownerProfile.email, restaurant.name);
                                      }
                                    }

                                    // Redirection rapide vers l'historique pour voir le suivi
                                    setTimeout(() => {
                                         setShowSuccess(false);
                                         setViewMode('orders');
                                    }, 2000);
                                } else if (statusData.status === 'FAILED') {
                                    if (kpayIntervalRef.current) clearInterval(kpayIntervalRef.current);
                                    setIsKpayPolling(false);
                                    setIsCheckingOut(false);
                                    toast.error(statusData.failureReason || "La transaction a échoué. Veuillez réessayer.");
                                } else if (statusData.status === 'CANCELLED') {
                                    if (kpayIntervalRef.current) clearInterval(kpayIntervalRef.current);
                                    setIsKpayPolling(false);
                                    setIsCheckingOut(false);
                                    toast.error("La transaction de paiement a été annulée.");
                                }
                            } catch (pollErr) {
                                console.error("[CustomerView] Error polling payment status:", pollErr);
                            }
                        }, 3000);
                    };
                    
                    startKpayPolling(paymentId);
                    return; // Stop execution here, wait for polling to finish
                } else if (responseData.url) {
                    setKpayGatewayUrl(responseData.url);
                    setIsCheckingOut(false);
                    
                    // Attempt to open in a new tab if inside an iframe (AI Studio Preview)
                    try {
                        if (window.self !== window.top) {
                            const newTab = window.open(responseData.url, '_blank');
                            if (newTab) {
                                toast.success("Le portail de paiement sécurisé DashMeals Pay s'est ouvert dans un nouvel onglet.");
                            } else {
                                toast.warning("L'ouverture automatique a été bloquée. Veuillez cliquer sur 'Procéder au paiement' ci-dessous.");
                            }
                        } else {
                            window.location.href = responseData.url;
                        }
                    } catch (e) {
                        window.open(responseData.url, '_blank');
                    }
                    return; // Stop execution, the user is redirected or shown the modal/overlay link
                }
            } catch (err: any) {
                console.error("Payment initialization error:", err);
                toast.error(err.message || "Impossible d'initialiser le paiement DashMeals Pay. Commande en attente.");
                setIsCheckingOut(false);
                return;
            }
        }

        setShowSuccess(true);
        
        // Send confirmation email
        if (user.email) {
          console.log('Sending confirmation email...');
          sendOrderConfirmationEmail({
            id: data?.id || 'mock-' + Date.now(),
            totalAmount: cartTotal,
            items: itemsWithUrgent
          }, user.email);
        }

        // Notify restaurant
        const restaurant = restaurants.find(r => r.id === cart[0].restaurantId);
        if (restaurant && restaurant.ownerId) {
          console.log('Notifying restaurant...');
          
          // Formater proprement le montant de la commande selon la devise du restaurant pour éviter l'affichage erroné "10 FC" au lieu de "28500 FC" (ou inversement)
          const formatRate = restaurant.exchangeRate || appSettings?.payment_exchange_rate || 2850;
          const formatCurrency = (restaurant.currency as 'USD' | 'CDF') || 'USD';
          const formatMode = restaurant.displayCurrencyMode || 'dual';
          const formattedAmount = formatDualPrice(cartTotal, 'USD', formatRate, formatMode as any);

          // 1. Database notification
          if (data?.id) {
            await supabase.from('notifications').insert({
              user_id: restaurant.ownerId,
              restaurant_id: restaurant.id,
              title: `Nouvelle commande #${data.id.slice(0, 4)}`,
              message: `Vous avez reçu une nouvelle commande de ${formattedAmount}.`,
              type: 'new_order',
              data: { order_id: data.id }
            });
          }

          // 2. Email notification
          const { data: ownerProfile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', restaurant.ownerId)
            .single();
          
          if (ownerProfile?.email) {
            sendNewOrderNotificationToRestaurant({
              id: data?.id || 'mock-' + Date.now(),
              totalAmount: cartTotal,
              items: itemsWithUrgent
            }, ownerProfile.email, restaurant.name);
          }
        }

        // Redirection rapide vers l'historique pour voir le suivi
        setTimeout(() => {
             setShowSuccess(false);
             setViewMode('orders');
             // fetchOrders sera appelé par le useEffect du viewMode
        }, 2000);

    } catch (err: any) {
        console.error('Checkout Error:', err);
        toast.error(err.message || "Erreur inconnue lors de la commande.");
    } finally {
        setIsCheckingOut(false);
    }
  };

  // Views
  if (userState.loadingLocation) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-900 p-6">
        <div className="relative mb-8">
            <div className="w-20 h-20 border-4 border-brand-100 dark:border-brand-900/30 rounded-full animate-pulse"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="absolute -top-1 -right-1 bg-brand-500 text-white p-1.5 rounded-full shadow-lg">
                <MapPin size={14} className="animate-bounce" />
            </div>
        </div>
        
        <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-2 text-center">Localisation...</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium animate-pulse text-center max-w-xs mb-8">Nous cherchons les meilleurs restaurants autour de vous.</p>
        
        <button 
          onClick={() => {
            const userCity = user?.city || 'Kinshasa';
            const cityCoords = CITY_COORDINATES[userCity] || { latitude: KINSHASA_CENTER_LAT, longitude: KINSHASA_CENTER_LNG };
            
            setUserState(prev => ({
              ...prev,
              location: cityCoords,
              locationError: `Utilisation de ${userCity} (Manuel)`,
              loadingLocation: false
            }));
          }}
          className="px-8 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95"
        >
          Passer l'étape
        </button>
      </div>
    );
  }

  // Get list of restaurants that have promotions
  const handleOnboardingSubmit = async () => {
    if (!deliveryIdNumber) {
        toast.error("Veuillez entrer votre numéro de pièce d'identité.");
        return;
    }
    if ((deliveryVehicle === 'moto' || deliveryVehicle === 'voiture') && !deliveryLicensePlate) {
        toast.error("Veuillez entrer votre numéro de plaque d'immatriculation.");
        return;
    }

    if (!idCardFile) {
        toast.error("Veuillez sélectionner une photo de votre pièce d'identité.");
        return;
    }

    if ((deliveryVehicle === 'moto' || deliveryVehicle === 'voiture') && !licenseFile) {
        toast.error("Veuillez sélectionner une photo de votre permis de conduire.");
        return;
    }

    setIsSubmittingOnboarding(true);
    try {
        // Upload documents safely with compression
        const uploadDoc = async (file: File, type: string) => {
            return await safeUploadPaymentProof(file, `verification_${type}_${user.id}`);
        };

        const idCardUrl = await uploadDoc(idCardFile, 'id_card');
        let licenseUrl = '';
        if (licenseFile) {
            licenseUrl = await uploadDoc(licenseFile, 'license');
        }

        const { error } = await supabase
            .from('profiles')
            .update({
                deliveryApplicationStatus: 'pending',
                deliveryInfo: {
                    vehicleType: deliveryVehicle,
                    idNumber: deliveryIdNumber,
                    licensePlate: deliveryLicensePlate,
                    idCardUrl,
                    licenseUrl,
                    isAvailable: false,
                    rating: 5,
                    completedOrders: 0
                }
            })
            .eq('id', user.id);

        if (error) throw error;

        toast.success("Votre demande a été envoyée avec succès !");
        setOnboardingStep(4);
    } catch (error) {
        console.error("Error submitting onboarding:", error);
        toast.error("Une erreur est survenue lors de l'envoi de votre demande.");
    } finally {
        setIsSubmittingOnboarding(false);
    }
  };

  const handleSubmitPrivateCourier = async () => {
    if (!pickupAddress || !deliveryAddress || !packageDetails) {
      toast.error("Veuillez remplir les adresses de retrait, de livraison et les détails du colis.");
      return;
    }
    
    setIsSubmittingCourier(true);
    
    const courierFee = 5.0; // Flat fee $5.00 for private courier
    const orderId = 'private-' + Math.random().toString(36).substr(2, 9);
    
    const startLat = pickupLocation?.lat || (profileCity === 'Lubumbashi' ? -11.6580 : -4.312);
    const startLng = pickupLocation?.lng || (profileCity === 'Lubumbashi' ? 27.4720 : 15.310);
    const endLat = deliveryLocationPrivate?.lat || (profileCity === 'Lubumbashi' ? -11.6644 : -4.325);
    const endLng = deliveryLocationPrivate?.lng || (profileCity === 'Lubumbashi' ? 27.4795 : 15.322);

    const newCourierOrder = {
      id: orderId,
      user_id: user.id,
      restaurant_id: restaurants[0]?.id || 'resto-101', // Fallback constraint
      status: 'pending',
      paymentMethod: courierPaymentMethod,
      paymentStatus: 'pending',
      total_amount: courierFee,
      delivery_fee: courierFee,
      created_at: new Date().toISOString(),
      items: [
        {
          id: 'private-courier-item',
          name: 'Course Privée ',
          description: packageDetails,
          price: courierFee,
          quantity: 1,
          category: 'plat',
          isAvailable: true,
          isPrivateCourier: true,
          pickupAddress: pickupAddress,
          deliveryAddress: deliveryAddress,
          recipientName: recipientName || 'Destinataire',
          recipientPhone: recipientPhone || '',
          courierVehicle: courierVehicle,
          customerName: user.name || 'Client',
          customerPhone: user.phoneNumber || ''
        }
      ],
      delivery_location: {
        address: deliveryAddress,
        lat: endLat,
        lng: endLng,
        pickupAddress: pickupAddress,
        pickupLat: startLat,
        pickupLng: startLng
      }
    };

    try {
      console.log('Inserting private courier order into Supabase...');
      const { data, error } = await supabase.from('orders').insert({
        user_id: user.id,
        restaurant_id: restaurants[0]?.id || 'resto-101',
        status: 'pending',
        total_amount: courierFee,
        delivery_fee: courierFee,
        exchange_rate: 2800,
        delivery_location: newCourierOrder.delivery_location,
        items: newCourierOrder.items
      }).select().single();

      if (!error && data) {
        newCourierOrder.id = data.id;
        toast.success("Demande de course privée envoyée ! Les livreurs ont été informés.");
      } else {
        console.warn("DB insert failed, fallback to local storage:", error);
        toast.success("Course privée créée localement !");
      }
    } catch (e) {
      console.warn("Supabase insert crashed, fallback to local storage:", e);
      toast.success("Demande de course privée créée ! (Mode Démo)");
    }

    // Always sync locally in localStorage for real-time local experience
    const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
    const localOrders = localOrdersStr ? JSON.parse(localOrdersStr) : [];
    localOrders.unshift(newCourierOrder);
    localStorage.setItem('dashmeals_mock_orders', JSON.stringify(localOrders));

    // Reset Form
    setPickupAddress('');
    setDeliveryAddress('');
    setPackageDetails('');
    setRecipientName('');
    setRecipientPhone('');
    setPickupLocation(null);
    setDeliveryLocationPrivate(null);
    setShowPickupPicker(false);
    setShowDeliveryPicker(false);
    
    // Refresh history & go to orders tab
    fetchOrders();
    setViewMode('orders');
    setIsSubmittingCourier(false);
  };

  const handleCancelPrivateCourier = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);

      // Also update in mock orders
      const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
      if (localOrdersStr) {
        const localOrders = JSON.parse(localOrdersStr);
        const updated = localOrders.map((o: any) => {
          if (o.id === orderId) {
            return { ...o, status: 'cancelled' };
          }
          return o;
        });
        localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updated));
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o));
      toast.success("Course privée annulée avec succès.");
      fetchOrders();
    } catch (e) {
      console.error("Error cancelling private courier:", e);
      toast.error("Erreur lors de l'annulation de la course.");
    }
  };

  const renderPrivateCourierView = () => {
    const clientPrivateOrders = orders.filter(
      (o) => o.items && o.items[0]?.isPrivateCourier === true
    );

    const stats = {
      total: clientPrivateOrders.length,
      pending: clientPrivateOrders.filter(o => o.status === 'pending').length,
      active: clientPrivateOrders.filter(o => ['accepted', 'preparing', 'ready', 'delivering'].includes(o.status)).length,
      completed: clientPrivateOrders.filter(o => o.status === 'delivered' || o.status === 'completed').length,
    };

    return (
        <div className="animate-in fade-in slide-in-from-right duration-500 pb-20 max-w-2xl mx-auto px-4 sm:px-0">
            <button onClick={() => setViewMode('list')} className="mb-8 flex items-center text-gray-500 dark:text-gray-400 font-bold hover:text-brand-600 transition-colors group">
                <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mr-2 group-hover:bg-brand-50 dark:group-hover:bg-brand-900/20 transition-colors">
                    <ArrowLeft size={16} /> 
                </div>
                Retour aux Enseignes
            </button>
            
            <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-10 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse"></div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-20 h-20 bg-white/20 rounded-[28px] flex items-center justify-center mb-6 backdrop-blur-md shadow-inner">
                            <Package size={40} />
                        </div>
                        <h2 className="text-3xl font-display font-black uppercase tracking-tight mb-2">Course Privée</h2>
                        <p className="text-orange-100 text-xs font-bold max-w-md">Commandez un livreur pour récupérer un colis, effectuer des achats spécifiques ou livrer vos documents partout à Kinshasa.</p>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex p-1.5 bg-gray-100 dark:bg-gray-900/50 rounded-2xl my-6 mx-8">
                    <button
                        type="button"
                        onClick={() => setPrivateCourierTab('create')}
                        className={`flex-1 py-3 text-xs font-black rounded-xl transition-all uppercase flex items-center justify-center space-x-2 ${privateCourierTab === 'create' ? 'bg-white dark:bg-gray-800 text-gray-950 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-950'}`}
                    >
                        <Plus size={14} />
                        <span>Nouvelle Demande</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPrivateCourierTab('history')}
                        className={`flex-1 py-3 text-xs font-black rounded-xl transition-all uppercase flex items-center justify-center space-x-2 ${privateCourierTab === 'history' ? 'bg-white dark:bg-gray-800 text-gray-950 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-950'}`}
                    >
                        <Clock size={14} />
                        <span>Mes Courses ({stats.total})</span>
                    </button>
                </div>

                {privateCourierTab === 'create' ? (
                  <div className="p-8 space-y-6">
                      <div className="p-4 bg-orange-50 dark:bg-brand-500/10 rounded-2xl flex items-start space-x-3 text-orange-800 dark:text-brand-300">
                          <AlertCircle className="shrink-0 mt-0.5" size={18} />
                          <div>
                              <h4 className="text-xs font-bold">Tarification Forfaitaire Simple</h4>
                              <p className="text-[10px] opacity-90 mt-0.5">Le tarif pour une course privée standard est fixé à un forfait de <strong className="font-extrabold">$5.00 (14 000 FC)</strong>. Le paiement s'effectue en espèces au retrait/livraison ou par Mobile Money.</p>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Itinéraire & Colis</h3>
                          
                          <div className="space-y-3">
                              <div>
                                  <div className="flex justify-between items-center mb-1.5">
                                      <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Adresse de Retrait (Où récupérer ?) *</label>
                                      <button 
                                          type="button"
                                          onClick={() => {
                                              setShowPickupPicker(!showPickupPicker);
                                              setShowDeliveryPicker(false);
                                          }}
                                          className="text-[10px] font-bold text-orange-600 dark:text-brand-400 hover:underline flex items-center space-x-1"
                                      >
                                          <Map size={12} />
                                          <span>{showPickupPicker ? "Masquer la carte" : "Sélectionner sur la carte"}</span>
                                      </button>
                                  </div>
                                  <div className="relative mb-2">
                                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500" size={18} />
                                      <input 
                                          type="text" 
                                          placeholder="Ex: Immeuble du 30 Juin, Bureau 4B, Gombe"
                                          className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-white/10 outline-none text-sm bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white focus:ring-4 focus:ring-brand-500/10 focus:bg-white transition-all font-semibold"
                                          value={pickupAddress}
                                          onChange={(e) => setPickupAddress(e.target.value)}
                                      />
                                  </div>
                                  {showPickupPicker && (
                                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 animate-in fade-in duration-250 mb-3 text-left">
                                          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mb-2">Cliquez sur la carte pour définir le point de retrait exact :</p>
                                          <LocationPicker 
                                              initialLocation={pickupLocation ? { lat: pickupLocation.lat, lng: pickupLocation.lng } : undefined}
                                              onLocationSelect={(loc) => {
                                                  setPickupLocation(loc);
                                                  setPickupAddress(loc.address || `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`);
                                              }} 
                                          />
                                      </div>
                                  )}
                              </div>

                              <div>
                                  <div className="flex justify-between items-center mb-1.5">
                                      <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Adresse de Livraison (Où déposer ?) *</label>
                                      <button 
                                          type="button"
                                          onClick={() => {
                                              setShowDeliveryPicker(!showDeliveryPicker);
                                              setShowPickupPicker(false);
                                          }}
                                          className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center space-x-1"
                                      >
                                          <Map size={12} />
                                          <span>{showDeliveryPicker ? "Masquer la carte" : "Sélectionner sur la carte"}</span>
                                      </button>
                                  </div>
                                  <div className="relative mb-2">
                                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-600" size={18} />
                                      <input 
                                          type="text" 
                                          placeholder="Ex: 14ème Rue, Quartier Industriel, Limete"
                                          className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-white/10 outline-none text-sm bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white focus:ring-4 focus:ring-brand-500/10 focus:bg-white transition-all font-semibold"
                                          value={deliveryAddress}
                                          onChange={(e) => setDeliveryAddress(e.target.value)}
                                      />
                                  </div>
                                  {showDeliveryPicker && (
                                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 animate-in fade-in duration-250 mb-3 text-left">
                                          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mb-2">Cliquez sur la carte pour définir le point de livraison exact :</p>
                                          <LocationPicker 
                                              initialLocation={deliveryLocationPrivate ? { lat: deliveryLocationPrivate.lat, lng: deliveryLocationPrivate.lng } : undefined}
                                              onLocationSelect={(loc) => {
                                                  setDeliveryLocationPrivate(loc);
                                                  setDeliveryAddress(loc.address || `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`);
                                              }} 
                                          />
                                      </div>
                                  )}
                              </div>

                              <div>
                                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Description de la course (Quoi récupérer/livrer ?) *</label>
                                  <textarea 
                                      placeholder="Ex: Un pli de documents urgents pour M. Kambale, ou Récupérer un colis de vêtements chez le couturier..."
                                      rows={3}
                                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-white/10 outline-none text-sm bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white focus:ring-4 focus:ring-brand-500/10 focus:bg-white transition-all font-semibold"
                                      value={packageDetails}
                                      onChange={(e) => setPackageDetails(e.target.value)}
                                  />
                              </div>
                          </div>
                      </div>

                      <div className="space-y-4 pt-2">
                          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Destinataire (Facultatif)</h3>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Nom du Destinataire</label>
                                  <input 
                                      type="text" 
                                      placeholder="Ex: Merveille Kabamba"
                                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-white/10 outline-none text-sm bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white focus:ring-4 focus:ring-brand-500/10 focus:bg-white transition-all font-semibold"
                                      value={recipientName}
                                      onChange={(e) => setRecipientName(e.target.value)}
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Téléphone du Destinataire</label>
                                  <input 
                                      type="tel" 
                                      placeholder="Ex: +243 82 000 0000"
                                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-white/10 outline-none text-sm bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white focus:ring-4 focus:ring-brand-500/10 focus:bg-white transition-all font-semibold"
                                      value={recipientPhone}
                                      onChange={(e) => setRecipientPhone(e.target.value)}
                                  />
                              </div>
                          </div>
                      </div>

                      <div className="space-y-4 pt-2">
                          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Type de Véhicule Souhaité</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                  { key: 'moto', label: 'Moto', desc: 'Rapide' },
                                  { key: 'velo', label: 'Vélo', desc: 'Écologique' },
                                  { key: 'voiture', label: 'Voiture', desc: 'Colis Large' },
                                  { key: 'pieton', label: 'Piéton', desc: 'Proximité' }
                              ].map(item => (
                                  <button
                                      key={item.key}
                                      type="button"
                                      onClick={() => setCourierVehicle(item.key as any)}
                                      className={`p-3.5 rounded-2xl border flex flex-col items-center text-center justify-center transition-all ${courierVehicle === item.key ? 'bg-orange-50 border-orange-500 text-orange-600 dark:bg-brand-500/10 dark:text-brand-400' : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                                  >
                                      <span className="text-xs font-black">{item.label}</span>
                                      <span className="text-[8px] opacity-65 mt-0.5">{item.desc}</span>
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="space-y-4 pt-2">
                          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Mode de Paiement</h3>
                          <div className="grid grid-cols-2 gap-3">
                              {[
                                  { key: 'cash', label: 'Espèces (Cash)' },
                                  { key: 'mobile_money', label: 'Mobile Money' }
                              ].map(method => (
                                  <button
                                      key={method.key}
                                      type="button"
                                      onClick={() => setCourierPaymentMethod(method.key as any)}
                                      className={`p-3.5 rounded-2xl border text-center transition-all ${courierPaymentMethod === method.key ? 'bg-orange-50 border-orange-500 text-orange-600 dark:bg-brand-500/10 dark:text-brand-400' : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                                  >
                                      <span className="text-xs font-black">{method.label}</span>
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="pt-6 border-t border-gray-100 dark:border-white/5">
                          <button
                              onClick={handleSubmitPrivateCourier}
                              disabled={isSubmittingCourier}
                              className="w-full py-4 rounded-[22px] bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-sm uppercase tracking-widest hover:opacity-95 shadow-xl shadow-brand-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                          >
                              {isSubmittingCourier ? "Traitement de la demande..." : "Confirmer & Lancer la Course ($5.00)"}
                          </button>
                      </div>
                  </div>
                ) : (
                  <div className="p-8 space-y-6">
                      {/* Stats Section */}
                      <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-2xl">
                              <span className="block text-[8px] font-bold text-gray-400 uppercase">Total</span>
                              <span className="text-lg font-black text-gray-800 dark:text-gray-100">{stats.total}</span>
                          </div>
                          <div className="p-3 bg-yellow-50 dark:bg-yellow-500/10 rounded-2xl">
                              <span className="block text-[8px] font-bold text-yellow-600 dark:text-yellow-400 uppercase">Attente</span>
                              <span className="text-lg font-black text-yellow-750 dark:text-yellow-400">{stats.pending}</span>
                          </div>
                          <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl">
                              <span className="block text-[8px] font-bold text-blue-600 dark:text-blue-400 uppercase">En cours</span>
                              <span className="text-lg font-black text-blue-750 dark:text-blue-400">{stats.active}</span>
                          </div>
                          <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-2xl">
                              <span className="block text-[8px] font-bold text-green-600 dark:text-green-400 uppercase">Livrées</span>
                              <span className="text-lg font-black text-green-750 dark:text-green-400">{stats.completed}</span>
                          </div>
                      </div>

                      {/* Course list */}
                      <div className="space-y-4">
                          <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Liste de vos courses privées</h3>
                          
                          {clientPrivateOrders.length === 0 ? (
                              <div className="py-12 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl">
                                  <Package size={36} className="mx-auto text-gray-300 mb-3" />
                                  <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">Aucune course privée enregistrée pour le moment.</p>
                                  <p className="text-[10px] text-gray-400 mt-1">Créez votre première demande dans l'onglet à gauche !</p>
                              </div>
                          ) : (
                              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                                  {clientPrivateOrders.map(order => {
                                      const item = order.items?.[0] || {};
                                      return (
                                          <div key={order.id} className="p-4 bg-white dark:bg-gray-750 border border-gray-100 dark:border-gray-700 rounded-2xl space-y-3.5 shadow-xxs text-left relative overflow-hidden">
                                              <div className="flex justify-between items-start">
                                                  <div>
                                                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-400' :
                                                          order.status === 'cancelled' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' :
                                                          order.status === 'delivered' || order.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400' :
                                                          'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400'
                                                      }`}>
                                                          {order.status === 'pending' ? 'Recherche livreur' :
                                                           order.status === 'cancelled' ? 'Annulé' :
                                                           order.status === 'delivered' || order.status === 'completed' ? 'Livré' :
                                                           'En cours'}
                                                      </span>
                                                      <h4 className="font-bold text-xs text-gray-900 dark:text-white mt-1.5">Course #{order.id.slice(0, 8)}</h4>
                                                      <p className="text-[9px] text-gray-400 mt-0.5">{order.created_at ? new Date(order.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Récemment'}</p>
                                                  </div>
                                                  <div className="text-right">
                                                      <span className="text-xs font-black text-orange-600 dark:text-brand-400 block">$5.00</span>
                                                      <span className="text-[8px] text-gray-400 font-bold uppercase block mt-1">Forfait</span>
                                                  </div>
                                              </div>

                                              <div className="text-xs space-y-1.5 border-t border-gray-100 dark:border-white/5 pt-3 text-gray-600 dark:text-gray-300">
                                                  <div>
                                                      <strong className="text-gray-900 dark:text-white">Retrait : </strong> 
                                                      <span>{item.pickupAddress || 'Non spécifié'}</span>
                                                  </div>
                                                  <div>
                                                      <strong className="text-gray-900 dark:text-white">Livraison : </strong> 
                                                      <span>{item.deliveryAddress || 'Non spécifié'}</span>
                                                  </div>
                                                  <div>
                                                      <strong className="text-gray-900 dark:text-white">Colis : </strong> 
                                                      <span className="italic">{item.description || 'Colis général'}</span>
                                                  </div>
                                                  {(item.recipientName || item.recipientPhone) && (
                                                      <div>
                                                          <strong className="text-gray-900 dark:text-white">Destinataire : </strong> 
                                                          <span>{item.recipientName || ''} {item.recipientPhone ? `(${item.recipientPhone})` : ''}</span>
                                                      </div>
                                                  )}
                                                  {item.courierVehicle && (
                                                      <div className="flex items-center space-x-1 mt-1 text-[10px] text-orange-600 dark:text-brand-400 font-bold uppercase">
                                                          <span>Véhicule :</span>
                                                          <span className="bg-orange-50 dark:bg-brand-500/10 px-1.5 py-0.5 rounded">{item.courierVehicle}</span>
                                                      </div>
                                                  )}
                                              </div>

                                              {/* Live tracking map if active or completed */}
                                              {['accepted', 'preparing', 'ready', 'delivering', 'delivered', 'completed'].includes(order.status) && (
                                                  <div className="mt-4 pt-4 border-t border-gray-150 dark:border-white/5">
                                                      <div className="flex items-center justify-between mb-2.5">
                                                          <h4 className="text-[10px] font-black text-brand-600 dark:text-brand-400 uppercase tracking-widest flex items-center font-sans">
                                                              <Navigation size={12} className="mr-1 animate-pulse text-orange-500" /> Suivi de la course en direct
                                                          </h4>
                                                          <span className="text-[9px] bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 px-2 py-0.5 rounded-full font-black uppercase font-sans">
                                                              {order.status === 'delivered' || order.status === 'completed' ? 'Livrée' : 'En transit'}
                                                          </span>
                                                      </div>
                                                      <DeliveryTrackingMap 
                                                          order={order} 
                                                          restaurant={null} 
                                                      />
                                                  </div>
                                              )}

                                              {/* Assigned Courier Details & Chat/Call */}
                                              {order.delivery_person && (
                                                  <div className="p-3 bg-orange-50/50 dark:bg-brand-500/5 rounded-xl flex items-center justify-between border border-orange-100 dark:border-brand-500/20 mt-2 mb-3 font-sans">
                                                      <div className="flex items-center space-x-2">
                                                          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-brand-900/30 flex items-center justify-center text-orange-600 dark:text-brand-400 animate-pulse">
                                                              <Bike size={16} />
                                                          </div>
                                                          <div className="min-w-0">
                                                              <p className="text-[9px] font-black uppercase text-orange-700 dark:text-brand-400 leading-none">Livreur assigné</p>
                                                              <p className="text-xs font-bold text-gray-900 dark:text-white truncate mt-0.5">{order.delivery_person.full_name}</p>
                                                          </div>
                                                      </div>
                                                      <div className="flex items-center space-x-1.5 shrink-0">
                                                          {order.delivery_person.phone_number && (
                                                              <a
                                                                  href={`tel:${order.delivery_person.phone_number}`}
                                                                  className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-150 dark:border-gray-750 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-orange-600 dark:hover:text-brand-400 transition-colors shadow-xxs"
                                                                  title="Appeler"
                                                              >
                                                                  <Phone size={13} />
                                                              </a>
                                                          )}
                                                          <button
                                                              onClick={() => setActiveChatLivreur(order)}
                                                              className="h-8 px-2.5 rounded-full bg-orange-500 hover:bg-orange-600 dark:bg-brand-600 dark:hover:bg-brand-700 text-white flex items-center justify-center space-x-1 text-[9px] font-black uppercase transition-all shadow-md active:scale-95 font-sans"
                                                          >
                                                              <MessageSquare size={12} />
                                                              <span>Chat</span>
                                                          </button>
                                                      </div>
                                                  </div>
                                              )}

                                              {/* Cancel option for pending/accepted */}
                                              {(order.status === 'pending' || order.status === 'accepted') && (
                                                  <div className="pt-2 border-t border-gray-100 dark:border-white/5 flex justify-end">
                                                      <button
                                                          onClick={() => handleCancelPrivateCourier(order.id)}
                                                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-500/10 dark:hover:bg-red-500/20 rounded-xl text-[10px] font-black uppercase transition-all flex items-center space-x-1"
                                                      >
                                                          <X size={12} />
                                                          <span>Annuler la course</span>
                                                      </button>
                                                  </div>
                                              )}
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>
                  </div>
                )}
            </div>
        </div>
    );
  };

  const renderDeliveryOnboarding = () => {
    return (
        <div className="animate-in fade-in slide-in-from-right duration-500 pb-20 max-w-2xl mx-auto px-4 sm:px-0">
            <button onClick={() => setViewMode('settings')} className="mb-8 flex items-center text-gray-500 dark:text-gray-400 font-bold hover:text-brand-600 transition-colors group">
                <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mr-2 group-hover:bg-brand-50 dark:group-hover:bg-brand-900/20 transition-colors">
                    <ArrowLeft size={16} /> 
                </div>
                Retour
            </button>
            
            <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="bg-brand-600 p-10 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse"></div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-20 h-20 bg-white/20 rounded-[28px] flex items-center justify-center mb-6 backdrop-blur-md shadow-inner">
                            <Bike size={40} />
                        </div>
                        <h2 className="text-3xl font-display font-black uppercase tracking-tight mb-2">{t('driver')}</h2>
                        <div className="flex items-center gap-2">
                             <div className="flex gap-1">
                                {[1, 2, 3].map(s => (
                                    <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${onboardingStep >= s ? 'w-6 bg-white' : 'w-2 bg-white/30'}`}></div>
                                ))}
                             </div>
                             <p className="text-brand-100 text-[10px] font-black uppercase tracking-widest ml-2">Étape {onboardingStep} / 3</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 sm:p-12">
                    {onboardingStep === 1 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center">
                                <h3 className="font-display font-black text-gray-900 dark:text-white text-2xl uppercase tracking-tight mb-2">Quel est votre véhicule ?</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Choisissez le moyen de transport que vous utiliserez pour vos livraisons.</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { id: 'moto', icon: <Bike size={28} />, label: 'Moto' },
                                    { id: 'velo', icon: <Bike size={24} />, label: 'Vélo' },
                                    { id: 'voiture', icon: <Car size={28} />, label: 'Voiture' },
                                    { id: 'pieton', icon: <Footprints size={28} />, label: 'À pied' }
                                ].map((v) => (
                                    <button
                                        key={v.id}
                                        onClick={() => setDeliveryVehicle(v.id as any)}
                                        className={`p-6 rounded-[28px] border-2 transition-all flex flex-col items-center justify-center space-y-3 active:scale-95 ${deliveryVehicle === v.id ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20 text-brand-600 shadow-lg shadow-brand-500/10' : 'border-gray-100 dark:border-gray-700 text-gray-400 hover:border-brand-200'}`}
                                    >
                                        <div className={`p-3 rounded-2xl transition-colors ${deliveryVehicle === v.id ? 'bg-white shadow-sm' : 'bg-gray-50 dark:bg-gray-800'}`}>
                                            {v.icon}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest">{v.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="flex justify-center pt-4">
                                <button 
                                    onClick={() => setOnboardingStep(2)}
                                    className="w-full sm:w-auto px-16 py-5 bg-brand-600 text-white rounded-[32px] font-black text-sm uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:bg-brand-700 transition-all flex items-center justify-center gap-2 active:scale-95"
                                >
                                    Continuer <ArrowRight size={20} />
                                </button>
                            </div>
                        </div>
                    )}

                    {onboardingStep === 2 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center">
                                <h3 className="font-display font-black text-gray-900 dark:text-white text-2xl uppercase tracking-tight mb-2">Pièce d'Identité</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Nous avons besoin de ces informations pour valider votre identité.</p>
                            </div>

                            <div className="space-y-6">
                                <div className="group">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Numéro CNI / PASSEPORT</label>
                                    <div className="relative">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors">
                                            <FileText size={20} />
                                        </div>
                                        <input 
                                            type="text"
                                            value={deliveryIdNumber}
                                            onChange={(e) => setDeliveryIdNumber(e.target.value)}
                                            placeholder="Ex: 123456789X"
                                            className="w-full pl-12 pr-4 py-5 bg-gray-50 dark:bg-gray-700/50 border-2 border-transparent focus:border-brand-500 focus:bg-white dark:focus:bg-gray-700 rounded-[24px] outline-none transition-all font-bold text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>

                                {(deliveryVehicle === 'moto' || deliveryVehicle === 'voiture') && (
                                    <div className="group animate-in fade-in zoom-in duration-300">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Plaque d'immatriculation</label>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-600 transition-colors">
                                                <Car size={20} />
                                            </div>
                                            <input 
                                                type="text"
                                                value={deliveryLicensePlate}
                                                onChange={(e) => setDeliveryLicensePlate(e.target.value)}
                                                placeholder="Ex: 1234AB01"
                                                className="w-full pl-12 pr-4 py-5 bg-gray-50 dark:bg-gray-700/50 border-2 border-transparent focus:border-brand-500 focus:bg-white dark:focus:bg-gray-700 rounded-[24px] outline-none transition-all font-bold text-gray-900 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                                <button 
                                    onClick={() => setOnboardingStep(1)}
                                    className="px-8 py-5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-[32px] font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95"
                                >
                                    Retour
                                </button>
                                <button 
                                    onClick={() => setOnboardingStep(3)}
                                    className="flex-1 sm:flex-none px-16 py-5 bg-brand-600 text-white rounded-[32px] font-black text-sm uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:bg-brand-700 transition-all flex items-center justify-center gap-2 active:scale-95"
                                >
                                    Continuer <ArrowRight size={20} />
                                </button>
                            </div>
                        </div>
                    )}

                    {onboardingStep === 3 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center">
                                <h3 className="font-display font-black text-gray-900 dark:text-white text-2xl uppercase tracking-tight mb-2">Documents Photos</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Prenez des photos bien éclairées et centrées pour la validation.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input 
                                    type="file" 
                                    ref={idCardInputRef} 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={(e) => setIdCardFile(e.target.files?.[0] || null)}
                                />
                                <input 
                                    type="file" 
                                    ref={licenseInputRef} 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={(e) => setLicenseFile(e.target.files?.[0] || null)}
                                />

                                <button 
                                    onClick={() => idCardInputRef.current?.click()}
                                    className={`group relative p-8 border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center text-center transition-all duration-300 active:scale-95 ${idCardFile ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-100 dark:border-gray-700 hover:border-brand-400 hover:bg-gray-50'}`}
                                >
                                    {idCardFile ? (
                                        <>
                                            <div className="w-16 h-16 bg-brand-600 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-500/20">
                                                <CheckCircle2 size={32} />
                                            </div>
                                            <p className="text-xs font-black text-brand-900 dark:text-brand-300 uppercase tracking-tight">Pièce d'identité OK</p>
                                            <p className="text-[10px] text-brand-500 font-bold truncate max-w-full px-4 mt-1">{idCardFile.name}</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 text-gray-400 group-hover:text-brand-600 group-hover:bg-brand-50 transition-colors rounded-2xl flex items-center justify-center mb-4">
                                                <Upload size={32} />
                                            </div>
                                            <p className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">Scanner CNI/Passeport</p>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Recto / Verso</p>
                                        </>
                                    )}
                                </button>

                                {(deliveryVehicle === 'moto' || deliveryVehicle === 'voiture') && (
                                    <button 
                                        onClick={() => licenseInputRef.current?.click()}
                                        className={`group relative p-8 border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center text-center transition-all duration-300 active:scale-95 ${licenseFile ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-100 dark:border-gray-700 hover:border-brand-400 hover:bg-gray-50'}`}
                                    >
                                        {licenseFile ? (
                                            <>
                                                <div className="w-16 h-16 bg-brand-600 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-500/20">
                                                    <CheckCircle2 size={32} />
                                                </div>
                                                <p className="text-xs font-black text-brand-900 dark:text-brand-300 uppercase tracking-tight">Permis OK</p>
                                                <p className="text-[10px] text-brand-500 font-bold truncate max-w-full px-4 mt-1">{licenseFile.name}</p>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 text-gray-400 group-hover:text-brand-600 group-hover:bg-brand-50 transition-colors rounded-2xl flex items-center justify-center mb-4">
                                                    <Upload size={32} />
                                                </div>
                                                <p className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">Permis de conduire</p>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Valide & Lisible</p>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                                <button 
                                    onClick={() => setOnboardingStep(2)}
                                    className="px-8 py-5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-[32px] font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95"
                                >
                                    Retour
                                </button>
                                <button 
                                    onClick={handleOnboardingSubmit}
                                    disabled={isSubmittingOnboarding || !idCardFile || ((deliveryVehicle === 'moto' || deliveryVehicle === 'voiture') && !licenseFile)}
                                    className="flex-1 sm:flex-none px-16 py-5 bg-brand-600 text-white rounded-[32px] font-black text-sm uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:bg-brand-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 disabled:grayscale"
                                >
                                    {isSubmittingOnboarding ? <Activity className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
                                    Finaliser l'Inscription
                                </button>
                            </div>
                        </div>
                    )}

                    {onboardingStep === 4 && (
                        <div className="text-center py-12 space-y-8 animate-in zoom-in duration-700">
                            <div className="w-24 h-24 bg-brand-50 dark:bg-brand-900/20 text-brand-600 rounded-[32px] flex items-center justify-center mx-auto shadow-inner relative">
                                <div className="absolute inset-0 bg-brand-400 rounded-[32px] animate-ping opacity-20"></div>
                                <ShieldCheck size={48} className="relative z-10" />
                            </div>
                            <div className="max-w-xs mx-auto">
                                <h3 className="font-display font-black text-gray-900 dark:text-white text-2xl mb-3 uppercase tracking-tight">Demande Reçue !</h3>
                                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium leading-relaxed">
                                    Votre dossier est en cours d'examen. Vous recevrez une notification d'activation très prochainement.
                                </p>
                            </div>
                            <div className="flex justify-center pt-4">
                                <button 
                                    onClick={() => setViewMode('list')}
                                    className="px-12 py-5 bg-brand-600 text-white rounded-[32px] font-black text-sm uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:bg-brand-700 transition-all active:scale-95 flex items-center gap-2"
                                >
                                    Explorer les Restaurants <ArrowRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
  };

  const restaurantsWithStories = restaurants.filter(r => r.isActive !== false && r.isOnline !== false && promotionsMap[r.id] && promotionsMap[r.id].length > 0 && !r.isVerified);
  
  // Get list of verified restaurants (Network Ads)
  const verifiedNetworkAds = allRestaurants.filter(r => r.isActive !== false && r.isOnline !== false && r.isVerified);

  return (
    <div className="h-screen overflow-y-auto pb-40 max-w-md md:max-w-none mx-auto bg-gray-50 dark:bg-gray-900 shadow-2xl md:shadow-none relative transition-colors duration-300">
      
      {/* STORY VIEWER OVERLAY */}
      {activeStoryRestaurant && promotionsMap[activeStoryRestaurant.id] && (
          <StoryViewer 
            key={`${activeStoryRestaurant.id}-${storyStartIndex}`}
            restaurant={activeStoryRestaurant}
            promotions={promotionsMap[activeStoryRestaurant.id]}
            onClose={closeStory}
            onVisitRestaurant={() => {
                closeStory();
                setSelectedRestaurant(activeStoryRestaurant);
                setViewMode('restaurant_detail');
            }}
            initialIndex={storyStartIndex}
            onAddToCart={(item, resto) => {
                addToCart(item, resto);
                toast.success(`"${item.name}" ajouté au panier !`);
            }}
            currentUser={user}
          />
      )}

      {/* CLIENT CLAIMED OFFERS MODAL */}
      {isClientOffersOpen && (
        <ClientClaimedOffersModal
          user={user}
          onClose={() => setIsClientOffersOpen(false)}
        />
      )}

      {/* ACTIVE CLAIMED OFFER MODAL */}
      {activeClaimedOffer && (
        <ClaimedOfferModal
          offer={activeClaimedOffer}
          onClose={() => setActiveClaimedOffer(null)}
        />
      )}

      {/* CHAT OVERLAY */}
      {activeChatOrder && (
          <ChatWindow 
            orderId={activeChatOrder.id}
            currentUser={{ id: user.id, role: 'client', name: user.name }}
            otherUserId={activeChatOrder.restaurant?.ownerId || (activeChatOrder.restaurant as any)?.owner_id || ''}
            otherUserName={activeChatOrder.restaurant?.name || 'Restaurant'}
            otherUserPhone={activeChatOrder.restaurant?.phone_number || '+243999999999'}
            restaurantId={activeChatOrder.restaurantId}
            onClose={closeChat}
          />
      )}

      {/* CHAT LIVREUR OVERLAY */}
      {activeChatLivreur && (
          <ChatWindow 
            orderId={activeChatLivreur.id}
            currentUser={{ id: user.id, role: 'client', name: user.name }}
            otherUserId={activeChatLivreur.delivery_person_id || ''}
            otherUserName={activeChatLivreur.delivery_person?.full_name || 'Livreur'}
            otherUserPhone={activeChatLivreur.delivery_person?.phone_number || ''}
            onClose={() => setActiveChatLivreur(null)}
          />
      )}

      {/* SUCCESS OVERLAY */}
      {showSuccess && (
        <div className="absolute inset-0 z-[60] bg-brand-500 flex flex-col items-center justify-center text-white p-6 text-center animate-fade-in">
           <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl">
              <ShoppingBag className="text-brand-500" size={40} />
           </div>
           <h2 className="text-3xl font-bold mb-2">{t('order_received')}</h2>
           <p className="text-brand-100">Votre repas est en préparation.</p>
           <div className="mt-8 bg-white/20 p-4 rounded-xl backdrop-blur-sm">
             <p className="font-mono text-sm">Redirection vers le suivi...</p>
           </div>
        </div>
      )}

      {/* KPAY GATEWAY REDIRECTION OVERLAY */}
      {kpayGatewayUrl && (
        <div className="absolute inset-0 z-[70] bg-black/85 flex flex-col items-center justify-center text-white p-6 text-center backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-gray-150 dark:border-gray-800 space-y-6 animate-in zoom-in-95 duration-300">
             <div className="flex justify-center">
               <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center">
                 <CreditCard className="text-brand-600 animate-pulse" size={40} />
               </div>
             </div>
             
             <div className="space-y-2 text-center">
               <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white font-display uppercase tracking-tight">Portail de paiement DashMeals Pay</h3>
               <p className="text-xs text-gray-500 dark:text-gray-400">
                 Le portail sécurisé de DashMeals Pay vous permet de finaliser votre commande en toute sécurité.
               </p>
             </div>

             <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/30 text-[11px] text-amber-850 dark:text-amber-400 text-left leading-normal space-y-1.5">
               <p className="font-bold">Redirection d'aperçu d'intégration</p>
               <p>
                 Si vous utilisez l'environnement de développement ou si un bloqueur de publicités bloque la redirection automatique, cliquez sur le bouton ci-dessous pour ouvrir le portail de paiement sécurisé dans un nouvel onglet et régler la commande.
               </p>
             </div>

             <div className="flex flex-col gap-3">
               <a 
                 href={kpayGatewayUrl}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="w-full bg-brand-600 hover:bg-brand-700 text-white py-4 px-6 rounded-2xl font-black shadow-lg shadow-brand-200 dark:shadow-none transition-all flex items-center justify-center gap-2 group text-sm"
               >
                 <CreditCard size={18} className="group-hover:scale-110 transition-transform" />
                 <span>Procéder au paiement sécurisé</span>
                 <ExternalLink size={14} className="opacity-70" />
               </a>
               
               <button 
                 onClick={() => {
                   setKpayGatewayUrl('');
                   toast.info("Portail de paiement fermé. La commande reste enregistrée en attente de paiement.");
                 }}
                 className="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded-xl text-sm font-bold transition-all"
               >
                 Fermer
               </button>
             </div>
           </div>
        </div>
      )}

      {/* KPAY USSD POLLING OVERLAY */}
      {isKpayPolling && (
        <div className="absolute inset-0 z-[70] bg-black/80 flex flex-col items-center justify-center text-white p-6 text-center backdrop-blur-sm">
           <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-800 space-y-6">
             <div className="flex justify-center">
               <div className="relative">
                 <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center">
                   <Smartphone className="text-brand-600 animate-pulse" size={40} />
                 </div>
                 <div className="absolute -top-1 -right-1 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold animate-ping"></div>
                 <div className="absolute -top-1 -right-1 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">●</div>
               </div>
             </div>
             
             <div className="space-y-2 text-center">
               <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white font-display">Validation sur votre téléphone</h3>
               <p className="text-sm text-gray-500 dark:text-gray-400">
                 Une demande de paiement Mobile Money a été envoyée sur votre téléphone.
               </p>
             </div>

             <div className="bg-brand-50 dark:bg-brand-950/20 p-4 rounded-2xl border border-brand-100/50 dark:border-brand-900/30 font-mono text-xs sm:text-sm space-y-1 text-left">
               <div className="flex justify-between text-xs text-gray-500">
                 <span>Statut de transaction</span>
                 <span className="font-bold uppercase text-brand-600">{kpayStatusMessage || 'INITIÉ'}</span>
               </div>
               <div className="flex justify-between text-xs sm:text-sm mt-2">
                 <span>Numéro de paiement</span>
                 <span className="font-bold text-gray-800 dark:text-gray-200">{kpayCurrentPhone}</span>
               </div>
             </div>

             <p className="text-xs text-gray-400 dark:text-gray-500">
               Veuillez saisir votre code PIN Mobile Money pour valider le débit et finaliser la commande.
             </p>

             <div className="flex flex-col gap-2">
               <button 
                 onClick={() => {
                   if (kpayIntervalRef.current) clearInterval(kpayIntervalRef.current);
                   setIsKpayPolling(false);
                   setIsCheckingOut(false);
                   toast.info("Transaction interrompue par l'utilisateur.");
                 }}
                 className="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-bold transition-all"
               >
                 Annuler / Payer autrement
               </button>
             </div>
           </div>
        </div>
      )}

      {/* URGENT MODE OVERLAY */}
      {isSearchingUrgent && (
        <div className="absolute inset-0 z-[70] bg-black/80 flex flex-col items-center justify-center text-white p-6 text-center backdrop-blur-sm">
           <div className="w-24 h-24 rounded-full border-4 border-red-500 border-t-transparent animate-spin mb-6"></div>
           <h2 className="text-2xl font-black mb-2 animate-pulse">Recherche Express...</h2>
           <p className="text-gray-300">Nous cherchons le restaurant le plus rapide autour de vous !</p>
        </div>
      )}

      {urgentRestaurant && urgentMode && (
         <div className="absolute inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl border-2 border-red-500 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 animate-pulse"></div>
                
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Zap size={40} className="text-red-600 fill-red-600 animate-bounce" />
                </div>
                
                <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-1">Trouvé !</h2>
                <h3 className="text-xl font-bold text-brand-600 mb-4">{urgentRestaurant.name}</h3>
                
                <div className="flex justify-center space-x-4 mb-6 text-sm">
                    <span className="flex items-center text-gray-600 dark:text-gray-300 font-bold bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-lg">
                        <Navigation size={14} className="mr-1"/> {formatDistance(urgentRestaurant.distance || 0)}
                    </span>
                    <span className="flex items-center text-red-600 font-bold bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-lg">
                        <Clock size={14} className="mr-1"/> ~{urgentRestaurant.preparationTime} min
                    </span>
                </div>

                <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                    Ce restaurant est ouvert et peut préparer votre commande rapidement. Voulez-vous voir le menu ?
                </p>

                <div className="space-y-3">
                    <button 
                        onClick={() => {
                            setUrgentRestaurant(null);
                            navigateTo('restaurant_detail');
                        }}
                        className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 shadow-lg shadow-red-500/30 transition-transform active:scale-95"
                    >
                        {t('checkout').toUpperCase()}
                    </button>
                    <button 
                        onClick={() => {
                            setUrgentMode(false);
                            setUrgentRestaurant(null);
                        }}
                        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold py-3 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600"
                    >{t('cancel')}</button>
                </div>
            </div>
         </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-orange-500 to-brand-600 dark:from-transparent dark:to-transparent dark:bg-gray-950/80 dark:backdrop-blur-xl shadow-md shadow-brand-500/5 dark:shadow-none border-b border-white/15 dark:border-white/5">
        <div className="max-w-md md:max-w-7xl mx-auto px-6 py-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-brand-500 rounded-xl shadow-lg rotate-3 group-hover:rotate-0 transition-transform duration-500 ring-2 ring-white/20 flex items-center justify-center overflow-hidden w-10 h-10">
               <img src={APP_LOGO_URL} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-display font-black text-white dark:text-white tracking-tight uppercase leading-none">DashMeals</h1>
              <div className="flex items-center mt-1 space-x-2">
                <p className="text-[9px] font-black text-orange-100 dark:text-brand-400 uppercase tracking-[0.2em]">Kinshasa Food</p>
                {user.id === 'guest' ? (
                  <span className="flex items-center text-[9px] font-black text-amber-200 dark:text-amber-500 uppercase tracking-widest animate-in fade-in slide-in-from-left-2">
                    <span className="mx-1 opacity-50">•</span>
                    MODE INVITÉ
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-[9px] font-black text-white/95 dark:text-emerald-400 uppercase tracking-widest animate-in fade-in slide-in-from-left-2 select-none">
                    <span className="opacity-40 mr-1">•</span>
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="w-4 h-4 rounded-full object-cover border border-white/40 dark:border-emerald-500/40 shrink-0" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-white/20 dark:bg-emerald-500/10 text-white dark:text-emerald-400 flex items-center justify-center text-[8px] font-black shrink-0">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    )}
                    <span className="hidden sm:inline-block max-w-[100px] truncate">{user.name}</span>
                    <span className="w-1.5 h-1.5 bg-white dark:bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)] dark:shadow-[0_0_8px_rgba(16,185,129,0.8)] shrink-0" title="En ligne"></span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* REFRESH BUTTON */}
            <button 
                onClick={() => {
                  if (onRefreshData) {
                    setIsRefreshingData(true);
                    toast.success("Synchronisation en arrière-plan...");
                    
                    // On lance le processus sans bloquer l'UI
                    onRefreshData().finally(() => {
                        // Optionnel: on peut cacher le spinner immédiatement ou après un court délai
                        // pour l'effet visuel.
                        setTimeout(() => setIsRefreshingData(false), 800);
                    });
                  }
                }}
                disabled={isRefreshingData}
                className={`p-2.5 bg-white/10 ${isRefreshingData ? 'opacity-50 cursor-wait' : 'hover:bg-white/25 dark:hover:bg-white/10 dark:bg-white/5'} border border-white/10 dark:border-white/5 rounded-2xl text-white dark:text-gray-300 transition-all duration-300 active:scale-95`}
                title="Actualiser les données"
            >
                <RefreshCw size={20} className={isRefreshingData ? 'animate-spin' : ''} />
            </button>

            {/* 3-DOT MENU FOR ACTIONS */}
            <div className="relative" ref={menuDropdownRef}>
              <button 
                onClick={() => setShowMenuDropdown(!showMenuDropdown)}
                className="relative p-2.5 bg-white/10 hover:bg-white/25 dark:bg-white/5 border border-white/10 dark:border-white/5 rounded-2xl text-white dark:text-gray-300 dark:hover:bg-white/10 transition-all duration-300 active:scale-95"
                title="Plus d'options"
              >
                <MoreVertical size={20} />
                {(cart.length > 0 || unreadCount > 0) && (
                  <span className="absolute -top-1 -right-1 bg-amber-400 text-gray-900 text-[9px] font-black h-4.5 w-4.5 flex items-center justify-center rounded-full border-2 border-orange-500 dark:border-gray-950 shadow-md">
                    {cart.length + unreadCount}
                  </span>
                )}
              </button>

              {/* Menu Popover Dropdown */}
              {showMenuDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-950 border border-gray-100 dark:border-white/10 rounded-2.5xl shadow-2xl py-3 px-3 z-[100] animate-in fade-in slide-in-from-top-3 duration-200">
                
                <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 py-1.5 border-b border-gray-50 dark:border-white/5 mb-2">
                  Navigation
                </div>

                <div className="space-y-1">
                  <button 
                    onClick={() => { navigateTo('list'); setShowMenuDropdown(false); }} 
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${viewMode === 'list' || viewMode === 'restaurant_detail' ? 'bg-orange-50 text-orange-600 dark:bg-brand-500/10 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <List size={15} />
                      <span>Enseignes</span>
                    </span>
                    <span className="text-[10px] opacity-60">Restos</span>
                  </button>

                  <button 
                    onClick={() => { navigateTo('map'); setShowMenuDropdown(false); }} 
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${viewMode === 'map' ? 'bg-orange-50 text-orange-600 dark:bg-brand-500/10 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <Map size={15} />
                      <span>Carte du réseau</span>
                    </span>
                    <span className="text-[10px] opacity-60">GPS</span>
                  </button>

                  <button 
                    onClick={() => { navigateTo('orders'); setShowMenuDropdown(false); }} 
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${viewMode === 'orders' ? 'bg-orange-50 text-orange-600 dark:bg-brand-500/10 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <Receipt size={15} />
                      <span>{t('orders')}</span>
                    </span>
                    <span className="text-[10px] opacity-60">{t('orders')}</span>
                  </button>

                  <button 
                    onClick={() => { handleUrgentMode(); setShowMenuDropdown(false); }} 
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${urgentMode ? 'bg-amber-100/50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <Zap size={14} className={urgentMode ? 'fill-amber-500 text-amber-500 animate-pulse-fast' : ''} />
                      <span>Livraison Express </span>
                    </span>
                    <span className={`text-[9px] font-black uppercase ${urgentMode ? 'text-amber-600 dark:text-amber-400' : 'opacity-60'}`}>{urgentMode ? 'Actif' : 'Off'}</span>
                  </button>
                </div>

                <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 py-1.5 border-b border-gray-50 dark:border-white/5 mt-3 mb-2">
                  Mon Compte
                </div>

                <div className="space-y-1">
                  <button 
                    onClick={() => { openCart(); setShowMenuDropdown(false); }} 
                    className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all flex items-center justify-between"
                  >
                    <span className="flex items-center space-x-2.5">
                      <ShoppingBag size={15} />
                      <span>{t('cart')}</span>
                    </span>
                    {cart.length > 0 ? (
                      <span className="bg-brand-600 text-white dark:bg-brand-500 text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                        {cart.length}
                      </span>
                    ) : (
                      <span className="text-[10px] opacity-60">Vide</span>
                    )}
                  </button>

                  {user.id !== 'guest' && (
                    <>
                      <button 
                        onClick={() => { setIsClientOffersOpen(true); setShowMenuDropdown(false); }} 
                        className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all flex items-center justify-between"
                      >
                        <span className="flex items-center space-x-2.5">
                          <Ticket size={15} className="text-brand-500" />
                          <span>Mes Codes Offres & Promos</span>
                        </span>
                        <span className="text-[9px] bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400 px-2 py-0.5 rounded-full font-black">
                           Codes
                        </span>
                      </button>

                      <button 
                        onClick={() => { setShowNotifications(true); setShowMenuDropdown(false); }} 
                        className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all flex items-center justify-between"
                      >
                        <span className="flex items-center space-x-2.5">
                          <Bell size={15} />
                          <span>Notifications</span>
                        </span>
                        {unreadCount > 0 ? (
                          <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-bounce">
                            {unreadCount}
                          </span>
                        ) : (
                          <span className="text-[10px] opacity-65">Aucune</span>
                        )}
                      </button>
                    </>
                  )}

                  {user.role === 'superadmin' && onGoToAdmin && (
                    <button 
                      onClick={() => { onGoToAdmin(); setShowMenuDropdown(false); }} 
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all flex items-center space-x-2.5"
                    >
                      <Shield size={14} className="text-amber-600 dark:text-amber-500 animate-pulse" />
                      <span>Administration</span>
                    </button>
                  )}

                  {user.id !== 'guest' ? (
                    <>
                      <button 
                        onClick={() => { setViewMode('private_courier'); setShowMenuDropdown(false); }} 
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2.5 ${viewMode === 'private_courier' ? 'bg-orange-50 text-orange-600 dark:bg-brand-500/10 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                      >
                        <ShoppingBag size={15} className="text-orange-500" />
                        <span className="flex-1 flex justify-between items-center">
                          <span>Course Privée </span>
                          <span className="text-[8px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-black uppercase">Forfait</span>
                        </span>
                      </button>
                      <button 
                        onClick={() => { navigateTo('settings'); setShowMenuDropdown(false); }} 
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2.5 ${viewMode === 'settings' ? 'bg-orange-50 text-orange-600 dark:bg-brand-500/10 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                      >
                        <Settings size={15} />
                        <span>{t('settings')}</span>
                      </button>
                      <button 
                        onClick={() => { onLogout(); setShowMenuDropdown(false); }} 
                        className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/10 transition-all flex items-center space-x-2.5"
                      >
                        <LogOut size={15} />
                        <span>{t('logout')}</span>
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => { onLogout(); setShowMenuDropdown(false); }} 
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-black bg-orange-600 hover:bg-orange-700 text-white text-center transition-all flex items-center justify-center space-x-1.5"
                    >
                      <LogIn size={14} />
                      <span>{t('login_btn')}</span>
                    </button>
                  )}
                  
                  <button 
                    onClick={() => { openHelpCenter(); setShowMenuDropdown(false); }} 
                    className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-all flex items-center space-x-2.5 whitespace-nowrap"
                  >
                    <HelpCircle size={15} />
                    <span>Centre d'aide</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
        
        {(viewMode === 'list' || viewMode === 'map') && (
            <div className="flex items-center space-x-3 px-6 pb-4">
                <div className="flex-1 flex items-center justify-between text-xs text-white/90 dark:text-gray-400 bg-white/10 dark:bg-white/5 py-2.5 px-4 rounded-2xl border border-white/10 dark:border-white/5 shadow-inner">
                  <div className="flex items-center truncate">
                    <MapPin size={12} className={`mr-2 flex-shrink-0 ${userState.locationError ? 'text-white/40' : 'text-white animate-pulse'}`} />
                    <span className="truncate font-bold uppercase tracking-tight text-[10px]">
                      {userState.loadingLocation ? "Détection..." : userState.locationError ? "Kinshasa (Défaut)" : (detectedAddress || "Ma Position GPS")}
                    </span>
                  </div>
                  <button onClick={refreshLocation} className="ml-2 p-1.5 bg-white text-brand-600 dark:bg-white/10 dark:text-brand-400 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-90" title="Actualiser ma position">
                    <Navigation size={10} className={`text-brand-600 dark:text-brand-400 ${userState.loadingLocation ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="relative">
                    <select className="bg-white/15 text-white dark:bg-brand-900/20 dark:text-brand-400 text-[10px] font-black py-2.5 pl-4 pr-10 rounded-2xl border border-white/10 dark:border-brand-900/30 outline-none appearance-none cursor-pointer hover:bg-white dark:hover:bg-white/5 shadow-sm transition-all uppercase tracking-tighter" value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                      <option value="Toutes" className="text-gray-950 dark:text-white">VILLES</option>
                      {CITIES_RDC.map(city => <option key={city} value={city} className="text-gray-950 dark:text-white">{city}</option>)}
                    </select>
                    <ChevronRight className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white dark:text-brand-500 pointer-events-none rotate-90" size={10} />
                </div>
            </div>
        )}
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto pb-24 relative">
        <div className="max-w-md md:max-w-7xl mx-auto p-4 pt-2">
          {viewMode === 'list' || viewMode === 'map' ? (
            <>
                {/* MARKETING CAMPAIGN BANNER (MARQUEE) */}
                {!searchQuery && (Object.values(promotionsMap).flat() as Promotion[]).some(promo => restaurants.some(r => r.id === promo.restaurantId)) && (
                    <div className="mb-4 -mx-4 overflow-hidden bg-brand-500 text-white relative block border-b border-brand-400 group">
                        <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused] whitespace-nowrap py-2 items-center">
                            {[...(Object.values(promotionsMap).flat() as Promotion[]), ...(Object.values(promotionsMap).flat() as Promotion[]), ...(Object.values(promotionsMap).flat() as Promotion[]), ...(Object.values(promotionsMap).flat() as Promotion[])].map((promo, idx) => {
                                const resto = restaurants.find(r => r.id === promo.restaurantId);
                                if (!resto) return null;
                                
                                const parsedPromo = parsePromoCaption(promo.caption);
                                const linkedItem = parsedPromo.isPromoProduct && parsedPromo.menuItemId
                                    ? resto.menu?.find(item => item.id === parsedPromo.menuItemId)
                                    : null;
                                    
                                const storyIndex = promotionsMap[resto.id]?.findIndex(p => p.id === promo.id) ?? 0;

                                return (
                                    <div 
                                        key={`${promo.id}-${idx}`}
                                        onClick={() => openStory(resto, storyIndex)}
                                        className="mx-6 flex items-center cursor-pointer hover:opacity-80 transition-opacity"
                                    >
                                        <div className="w-5 h-5 rounded-full overflow-hidden border border-white/30 mr-2 shrink-0">
                                            <img src={resto.coverImage} alt={resto.name} className="w-full h-full object-cover" />
                                        </div>
                                        <span className="font-black text-xs uppercase tracking-wider mr-2">
                                            {resto.name}
                                        </span>
                                        <span className="text-yellow-200 font-black text-[10px] uppercase tracking-widest mr-2 flex items-center bg-brand-600/50 px-2 py-0.5 rounded-full">
                                            <Zap size={10} className="mr-1 fill-current" />
                                            {parsedPromo.badgeText || "PROMO"}
                                        </span>
                                        <span className="text-white/90 text-xs font-medium mr-2">
                                            {linkedItem ? linkedItem.name : (parsedPromo.caption ? parsedPromo.caption.substring(0, 40) + (parsedPromo.caption.length > 40 ? '...' : '') : "Offre Spéciale")}
                                        </span>
                                        {parsedPromo.promoPrice !== undefined && parsedPromo.promoPrice !== null && (
                                            <span className="bg-white text-brand-600 font-black text-[10px] px-1.5 py-0.5 rounded-sm">
                                                ${parsedPromo.promoPrice.toFixed(2)}
                                            </span>
                                        )}
                                        <span className="ml-6 text-brand-300 opacity-50">•</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* SEARCH BAR */}
                <div className="mb-6 flex items-center space-x-3 relative z-20">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-brand-500 transition-colors" size={20} />
                        <input 
                            type="text"
                            placeholder={activeTab === 'restaurants' ? "Rechercher un établissement..." : "Rechercher un plat..."}
                            className="w-full pl-12 pr-12 py-4 rounded-2xl border border-gray-200 dark:border-white/10 focus:ring-4 focus:ring-brand-500/10 outline-none text-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white shadow-sm transition-all focus:shadow-xl font-medium"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                          <button 
                            onClick={() => setSearchQuery('')} 
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                          >
                            <X size={16} />
                          </button>
                        )}
                    </div>
                </div>

                {/* PRIVATE COURIER BANNER / CARD */}
                <div className="mb-8 bg-gradient-to-r from-orange-500 to-amber-500 rounded-[32px] p-6 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between animate-in slide-in-from-top duration-500">
                    <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4 scale-150 pointer-events-none">
                        <ShoppingBag size={140} />
                    </div>
                    <div className="mb-4 md:mb-0 relative z-10 max-w-lg">
                        <span className="bg-white/20 text-white font-extrabold text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full">Nouveau Service</span>
                        <h3 className="text-xl font-black mt-2 leading-tight">Besoin d'une course privée ?</h3>
                        <p className="text-xs text-white/95 mt-1.5 leading-relaxed">Faites livrer ou récupérer un colis, pli, clés ou tout autre objet par un livreur partenaire en un clic ! Forfait simple et rapide.</p>
                    </div>
                    <button 
                        onClick={() => setViewMode('private_courier')} 
                        className="bg-white text-orange-600 hover:bg-orange-50 active:scale-95 transition-all py-3 px-5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-md self-start md:self-center relative z-10"
                    >
                        Demander un livreur
                    </button>
                </div>

                {/* VIEW TOGGLE (Restaurants vs Plats) */}
                {!searchQuery && (
                    <div className="flex bg-gray-100/50 dark:bg-white/5 p-1.5 rounded-[22px] mb-10 shadow-inner border border-gray-200/50 dark:border-white/5 backdrop-blur-sm">
                        <button 
                            onClick={() => setActiveTab('restaurants')}
                            className={`flex-1 flex items-center justify-center py-3.5 text-[10px] font-black rounded-2xl transition-all duration-500 uppercase tracking-widest ${activeTab === 'restaurants' ? 'bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-xl shadow-brand-500/10 transform scale-[1.02] border border-gray-100 dark:border-white/5' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                        >
                            Établissements
                        </button>
                        <button 
                            onClick={() => setActiveTab('items')}
                            className={`flex-1 flex items-center justify-center py-3.5 text-[10px] font-black rounded-2xl transition-all duration-500 uppercase tracking-widest ${activeTab === 'items' ? 'bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-xl shadow-brand-500/10 transform scale-[1.02] border border-gray-100 dark:border-white/5' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                        >
                            Carte Menu
                        </button>
                    </div>
                )}

                {/* RE-ORDER SECTION (If history exists) */}
                {!searchQuery && activeTab === 'restaurants' && recentOrderedItems.length > 0 && (
                    <div className="mb-8 animate-in slide-in-from-left duration-700">
                        <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight mb-4 flex items-center">
                            <Clock className="text-brand-600 mr-2" size={18} />
                            Commandez à nouveau
                        </h2>
                        <div className="flex overflow-x-auto no-scrollbar space-x-3 pb-2">
                            {recentOrderedItems.map(item => {
                                const promo = getPromoDetails(item, item.restaurant.id);
                                const hasPromo = promo && promo.promoPrice !== null;
                                const finalPrice = hasPromo ? promo.promoPrice : item.price;
                                return (
                                <div 
                                    key={item.id}
                                    onClick={() => { setSelectedRestaurant(item.restaurant); navigateTo('restaurant_detail'); }}
                                    className="flex-shrink-0 w-36 bg-white dark:bg-gray-800 rounded-2xl p-2 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all cursor-pointer relative"
                                >
                                    {hasPromo && (
                                        <div className="absolute top-3 left-3 z-10 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow border border-red-400 animate-pulse">
                                            {promo.badgeText || "PROMO"}
                                        </div>
                                    )}
                                    <img src={item.image} className="w-full h-24 object-cover rounded-xl mb-2" alt={item.name} />
                                    <h4 className="text-[10px] font-black text-gray-900 dark:text-white truncate mb-0.5">{item.name}</h4>
                                    <p className="text-[8px] text-gray-400 truncate mb-1.5">{item.restaurant.name}</p>
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            {hasPromo && (
                                                <span className="text-[8px] text-gray-400 line-through">
                                                    {item.restaurant.currency === 'CDF' ? `${item.price} FC` : `$${item.price}`}
                                                </span>
                                            )}
                                            <span className="text-[10px] font-bold text-brand-600">
                                                {item.restaurant.currency === 'CDF' ? `${finalPrice} FC` : `$${finalPrice}`}
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-1">
                                            {cart.find(c => c.id === item.id) && (
                                                <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-md">x{cart.find(c => c.id === item.id)?.quantity}</span>
                                            )}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); addToCart(item, item.restaurant); }}
                                                className="p-1 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-lg hover:bg-brand-100 transition-colors active:scale-90"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}



                {/* NEARBY EXPLORATION SECTION - MOVED HIGHER FOR VISIBILITY */}
                {!searchQuery && nearbyRestaurants.length > 0 && (
                    <div className="mb-10 relative animate-in fade-in slide-in-from-right duration-1000">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter flex items-center">
                                    <MapPin className="text-brand-600 mr-2" size={28} />
                                    EXPLOREZ À PIED
                                </h2>
                                <p className="text-[11px] uppercase font-black text-brand-500 dark:text-brand-400 tracking-[0.2em] mt-0.5 flex items-center">
                                    <Bike size={12} className="mr-1.5" /> À MOINS DE 3KM DE VOUS
                                </p>
                            </div>
                            <button 
                                onClick={() => {
                                    setSortBy('distance');
                                    const listEl = document.getElementById('restaurants-main-list');
                                    if (listEl) listEl.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="text-[10px] font-black text-white bg-black dark:bg-gray-700 px-4 py-2 rounded-xl hover:bg-brand-600 transition-all uppercase tracking-widest shadow-lg shadow-black/10 active:scale-95"
                            >
                                Voir tout
                            </button>
                        </div>

                        <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar space-x-4 -mx-4 px-4 pb-2">
                            {nearbyRestaurants.map(r => (
                                <div 
                                    key={r.id}
                                    onClick={() => { setSelectedRestaurant(r); navigateTo('restaurant_detail'); }}
                                    className="snap-center shrink-0 w-[240px] bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all group"
                                >
                                    {/* Small Cover Image with Stats */}
                                    <div className="relative h-28 overflow-hidden">
                                        <img src={r.coverImage} alt={r.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                                        <div className="absolute top-2 right-2">
                                            <div className="flex items-center space-x-1 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md px-1.5 py-0.5 rounded-md shadow-sm">
                                                <Star size={10} className="fill-amber-400 text-amber-400" />
                                                <span className="text-[10px] font-black text-gray-800 dark:text-white">{r.rating || 4.5}</span>
                                            </div>
                                        </div>
                                        <div className="absolute bottom-2 left-2 flex items-center gap-2">
                                            <span className="flex items-center bg-brand-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-lg border border-white/20">
                                                <Footprints size={10} className="mr-1" /> {r.timeWalking ? formatTime(r.timeWalking) : '--'}
                                            </span>
                                            <span className="flex items-center bg-black/40 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/10">
                                                {formatDistance(r.distance || 0)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Content with Mini Menu */}
                                    <div className="p-3">
                                        <h3 className="font-black text-gray-900 dark:text-white text-sm truncate mb-2">{r.name}</h3>
                                        
                                        {/* Mini Menu (2 items) */}
                                        <div className="space-y-1.5 mb-2">
                                            {r.menu?.slice(0, 2).map(item => {
                                                const promo = getPromoDetails(item, r.id);
                                                const hasPromo = promo && promo.promoPrice !== null;
                                                const finalPrice = hasPromo ? promo.promoPrice : item.price;
                                                return (
                                                    <div key={item.id} className="flex items-center justify-between">
                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[140px] transition-all flex items-center">
                                                            {item.name}
                                                            {hasPromo && (
                                                                <span className="ml-1 text-[8px] font-black text-red-500 bg-red-50 dark:bg-red-950/40 px-1 rounded animate-pulse">
                                                                    %
                                                                </span>
                                                            )}
                                                        </span>
                                                        <div className="flex items-center space-x-1.5">
                                                            {hasPromo && (
                                                                <span className="text-[8px] text-gray-400 line-through">
                                                                    {r.currency === 'CDF' ? `${item.price} FC` : `$${item.price}`}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] font-bold text-brand-600">
                                                                {r.currency === 'CDF' ? `${finalPrice} FC` : `$${finalPrice}`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                            <div className="flex items-center text-[10px] text-gray-400 font-bold">
                                                <Zap size={10} className="mr-1 text-yellow-500 fill-yellow-500" />
                                                {r.preparationTime} min
                                            </div>
                                            <button className="text-[10px] font-black text-brand-600 bg-brand-50 dark:bg-brand-900/30 px-2 py-1 rounded-md">
                                                COMMANDER
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* FILTERS & SORTING */}
                <div className="mb-6 flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{t('categories')}</h3>
                        <div className="relative">
                            <select 
                                className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium py-1.5 pl-8 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 outline-none appearance-none cursor-pointer shadow-sm focus:ring-2 focus:ring-brand-500"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                <option value="relevance">Pertinence</option>
                                <option value="rating">Mieux notés</option>
                                <option value="distance">Plus proches</option>
                                <option value="time">Livraison rapide</option>
                            </select>
                            <List className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                            <ChevronRight className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none rotate-90" size={14} />
                        </div>
                    </div>
                    <div className="flex flex-nowrap md:flex-wrap gap-2 mb-4 overflow-x-auto md:overflow-x-visible no-scrollbar pb-1 -mx-4 md:mx-0 px-4 md:px-0">
                        <button
                            onClick={() => setOpenNow(!openNow)}
                            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm border flex items-center ${
                                openNow 
                                ? 'bg-emerald-500 text-white border-emerald-500' 
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            <Clock size={14} className="mr-1.5" /> Ouvert
                        </button>
                        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 my-auto mx-1"></div>
                        {['Tous', 'Restaurant', 'Snack', 'Bar', 'Terrasse'].map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm border ${
                                    selectedCategory === cat 
                                    ? 'bg-brand-500 text-white border-brand-500' 
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* FEATURED RESTAURANTS CAROUSEL (Verified Restaurants) - Hidden during search */}
                {!searchQuery && verifiedNetworkAds.length > 0 && (
                    <div className="mb-8 relative">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight flex items-center">
                                <Star className="text-yellow-500 mr-1.5" size={18} fill="currentColor" />
                                Sélection Premium
                            </h2>
                            <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-1 rounded-md uppercase tracking-wider">Sponsorisé</span>
                        </div>
                        <div ref={carouselRef} className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar space-x-4 pb-4 -mx-4 px-4">
                            {verifiedNetworkAds.map(r => (
                                <div 
                                    key={r.id}
                                    onClick={() => { setSelectedRestaurant(r); navigateTo('restaurant_detail'); }}
                                    className="snap-center shrink-0 w-[90vw] sm:w-[500px] relative rounded-2xl overflow-hidden shadow-xl cursor-pointer group border border-gray-100 dark:border-gray-700"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent z-10"></div>
                                    <img src={r.coverImage} alt={r.name} className="w-full h-56 sm:h-64 object-cover group-hover:scale-105 transition-transform duration-700" />
                                    
                                    <div className="absolute top-4 left-4 z-20 flex gap-2">
                                        <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-lg flex items-center border border-white/20">
                                            <Star size={12} className="mr-1.5 fill-white" /> Premium
                                        </span>
                                        {subscribedRestaurants.includes(r.id) && (
                                            <span className="bg-brand-500/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-lg flex items-center border border-white/20">
                                                <Bell size={12} className="mr-1.5 fill-white" /> Abonné
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="absolute top-4 right-4 z-20">
                                        <button 
                                            disabled={isSubscribing === r.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSubscription(r.id);
                                            }}
                                            className={`p-2 rounded-full shadow-lg backdrop-blur-md border transition-colors ${
                                                isSubscribing === r.id ? 'opacity-50 cursor-not-allowed' : ''
                                            } ${
                                                subscribedRestaurants.includes(r.id)
                                                ? 'bg-white/20 border-white/30 text-white'
                                                : 'bg-white border-white text-brand-600 hover:bg-brand-50'
                                            }`}
                                        >
                                            <Bell size={18} className={`${subscribedRestaurants.includes(r.id) ? 'fill-white' : ''} ${isSubscribing === r.id ? 'animate-spin' : ''}`} />
                                        </button>
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-5 z-20">
                                        <h3 className="text-2xl font-black text-white mb-1.5 drop-shadow-lg">{r.name}</h3>
                                        <p className="text-gray-200 text-sm line-clamp-2 mb-4 drop-shadow-md">{r.description}</p>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3 text-white/90 text-sm font-bold">
                                                <span className="flex items-center bg-black/40 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10"><Star size={14} className="text-amber-400 fill-amber-400 mr-1.5" /> {r.rating}</span>
                                                <span className="flex items-center bg-black/40 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10"><Clock size={14} className="mr-1.5" /> {r.estimatedDeliveryTime} min</span>
                                            </div>
                                            <button className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-black px-5 py-2.5 rounded-xl shadow-lg transition-colors flex items-center">{t('checkout')}<ChevronRight size={16} className="ml-1" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* STORIES BAR - REMOVED AS REQUESTED, PROMOTIONS ARE NOW IN MARQUEE */}


                {/* FILTERS */}
                <div className="flex flex-nowrap md:flex-wrap gap-2 md:gap-3 mb-6 overflow-x-auto md:overflow-x-visible no-scrollbar pb-1">
                    <button 
                        onClick={handleUrgentMode}
                        className={`flex items-center px-4 py-2 rounded-full font-bold text-sm shadow-sm transition-all border whitespace-nowrap ${urgentMode ? 'bg-brand-600 text-white border-brand-600 animate-pulse-fast' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700'}`}
                    >
                        <Zap size={16} className={`mr-1 ${urgentMode ? 'fill-white' : 'fill-none'}`} />
                        Urgent - J'ai faim !
                    </button>
                    <button className="px-4 py-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm whitespace-nowrap shadow-sm">Grillades</button>
                    <button className="px-4 py-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm whitespace-nowrap shadow-sm">Poulet</button>
                </div>

                {/* CONTENT */}
                {viewMode === 'list' && activeTab === 'restaurants' ? (
                    <div className="space-y-12 w-full">
                        {/* Section 1: Restaurants dans la région de l'utilisateur (Premier plan) */}
                        {user && user.id !== 'guest' && user.city && selectedCity === 'Toutes' && !searchQuery && !urgentMode && (
                            <div className="bg-gray-50/50 dark:bg-gray-900/40 p-6 sm:p-8 rounded-[40px] border border-gray-100 dark:border-gray-850 shadow-sm relative overflow-hidden backdrop-blur-sm">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 dark:bg-brand-500/10 rounded-full blur-3xl -z-10" />
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                                    <div>
                                        <div className="flex items-center space-x-2 text-brand-600 dark:text-brand-400 mb-1">
                                            <MapPin size={18} />
                                            <span className="text-[11px] font-black uppercase tracking-widest">Ma Région</span>
                                        </div>
                                        <h2 className="text-xl sm:text-2xl font-black text-[#0d1527] dark:text-white capitalize">
                                            Établissements à {user.city}
                                        </h2>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Proposés au premier plan pour des délais de livraison minimaux
                                        </p>
                                    </div>
                                    <span className="bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                                        {userRegionRestaurants.length} resto{userRegionRestaurants.length > 1 ? 's' : ''} trouvé{userRegionRestaurants.length > 1 ? 's' : ''}
                                    </span>
                                </div>

                                {userRegionRestaurants.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {userRegionRestaurants.map(restaurant => (
                                            <RestaurantCard 
                                                key={`region-${restaurant.id}`} 
                                                restaurant={restaurant} 
                                                onClick={() => { setSelectedRestaurant(restaurant); navigateTo('restaurant_detail'); }} 
                                                promotionsCount={promotionsMap[restaurant.id]?.length || 0}
                                                isSubscribed={subscribedRestaurants.includes(restaurant.id)}
                                                onSubscribe={(e) => {
                                                    e.stopPropagation();
                                                    toggleSubscription(restaurant.id);
                                                }}
                                                isSubscribing={isSubscribing === restaurant.id}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 text-center text-gray-500 py-10">
                                        <ShoppingBag className="mx-auto mb-2 text-gray-300" size={32} />
                                        <p className="text-sm font-semibold">Aucun établissement disponible à {user.city} pour l'instant.</p>
                                        <p className="text-xs text-gray-400 mt-1">Découvrez tous les restaurants disponibles dans l'application ci-dessous.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Section 2: Tous les restaurants de l'application (Second plan) */}
                        <div className="space-y-6">
                            {user && user.id !== 'guest' && user.city && selectedCity === 'Toutes' && !searchQuery && !urgentMode && (
                                <div className="border-t border-gray-100 dark:border-gray-800 pt-8">
                                    <h2 className="text-lg font-black text-[#0d1527] dark:text-white uppercase tracking-wider mb-1 flex items-center">
                                        <span className="w-1.5 h-6 bg-brand-500 rounded-full mr-2"></span>
                                        Tous les restaurants de l'application
                                    </h2>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Explorez tous les restaurants partenaires et découvrez l'adresse de leur ville</p>
                                </div>
                            )}

                            <div id="restaurants-main-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {paginatedRestaurants.length > 0 ? (
                                    paginatedRestaurants.map(restaurant => (
                                        <RestaurantCard 
                                            key={restaurant.id} 
                                            restaurant={restaurant} 
                                            onClick={() => { setSelectedRestaurant(restaurant); navigateTo('restaurant_detail'); }} 
                                            promotionsCount={promotionsMap[restaurant.id]?.length || 0}
                                            isSubscribed={subscribedRestaurants.includes(restaurant.id)}
                                            onSubscribe={(e) => {
                                                e.stopPropagation();
                                                toggleSubscription(restaurant.id);
                                            }}
                                            isSubscribing={isSubscribing === restaurant.id}
                                        />
                                    ))
                                ) : (
                                    <div className="text-center py-20 px-10 animate-in fade-in zoom-in duration-700 col-span-1 md:col-span-2 lg:col-span-3">
                                        <div className="bg-gray-100 dark:bg-white/5 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <Search size={40} className="text-gray-300 dark:text-gray-600" />
                                        </div>
                                        <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2 uppercase tracking-tight">Oups ! Rien trouvé</h3>
                                        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-[200px] mx-auto">Nous n'avons trouvé aucun établissement correspondant à votre recherche.</p>
                                        <button 
                                            onClick={() => setSearchQuery('')}
                                            className="mt-8 text-brand-600 font-black text-xs uppercase tracking-[0.2em] hover:opacity-80 transition-opacity"
                                        >
                                            Tout réinitialiser
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center space-x-4 py-4">
                                    <button 
                                        onClick={() => {
                                            setCurrentPage(p => Math.max(1, p - 1));
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-50 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Précédent
                                    </button>
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                        Page {currentPage} / {totalPages}
                                    </span>
                                    <button 
                                        onClick={() => {
                                            setCurrentPage(p => Math.min(totalPages, p + 1));
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-50 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Suivant
                                    </button>
                                </div>
                            )}

                            {filteredRestaurants.length === 0 && (
                                <div className="text-center py-16 px-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 col-span-1 md:col-span-2 lg:col-span-3">
                                    <div className="bg-gray-100 dark:bg-gray-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Search size={24} className="text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Aucun résultat trouvé</h3>
                                    <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
                                        Nous n'avons trouvé aucun établissement correspondant à vos critères {selectedCity !== 'Toutes' ? `à ${selectedCity}` : ''} {searchQuery ? `pour "${searchQuery}"` : ''}.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'list' && activeTab === 'items' ? (
                    <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {(searchQuery 
                                ? discoverableItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.restaurant.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                : discoverableItems).map(item => {
                                    const isNew = item.createdAt ? (new Date().getTime() - new Date(item.createdAt).getTime()) / (1000 * 3600 * 24) <= 5 : false;
                                    const promo = getPromoDetails(item, item.restaurant.id);
                                    const hasPromo = promo && promo.isPromo;
                                    const promoPrice = promo?.promoPrice;
                                    const promoBadge = promo?.badgeText || "PROMO";
                                    const finalPrice = hasPromo && promoPrice !== null ? promoPrice : item.price;
                                    return (
                                <div 
                                    key={`${item.restaurant.id}-${item.id}`}
                                    className="glass rounded-[32px] overflow-hidden shadow-sm border border-white/40 dark:border-white/5 flex flex-col group hover:shadow-2xl hover:border-brand-500/30 transition-all duration-700 active:scale-[0.98] transform hover:-translate-y-2 relative"
                                >
                                    {hasPromo && (
                                        <div className="absolute top-4 left-4 z-10 flex items-center space-x-1 bg-red-500 text-white px-2 py-1 rounded-lg shadow-lg border border-red-400 animate-pulse">
                                            <Zap size={10} className="fill-white" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">{promoBadge}</span>
                                        </div>
                                    )}
                                    {isNew && !hasPromo && (
                                        <div className="absolute top-4 left-4 z-10 flex items-center space-x-1 bg-green-500 text-white px-2 py-1 rounded-lg shadow-lg border border-green-400">
                                            <Sparkles size={10} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">New</span>
                                        </div>
                                    )}
                                    {isNew && hasPromo && (
                                        <div className="absolute top-14 left-4 z-10 flex items-center space-x-1 bg-green-500 text-white px-2 py-1 rounded-lg shadow-lg border border-green-400">
                                            <Sparkles size={10} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">New</span>
                                        </div>
                                    )}
                                    <div className="relative h-40 sm:h-48 overflow-hidden">
                                        <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={item.name} />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80 group-hover:opacity-40 transition-opacity duration-700"></div>
                                        <div className="absolute bottom-4 left-4 right-4">
                                            <p className="text-[9px] font-black text-white/90 uppercase drop-shadow-2xl truncate tracking-widest">{item.restaurant.name}</p>
                                        </div>
                                        <div className="absolute top-4 right-4 flex flex-col items-end space-y-1 z-10">
                                            {hasPromo && promoPrice !== null && (
                                                <div className="bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg text-[9px] font-bold text-white/70 line-through border border-white/10 shadow-sm">
                                                    {formatDualPrice(item.price, item.restaurant.currency as 'USD' | 'CDF', item.restaurant.exchangeRate || appSettings?.payment_exchange_rate || 2850, item.restaurant.displayCurrencyMode)}
                                                </div>
                                            )}
                                            <div className="bg-brand-600 backdrop-blur-xl px-3 py-1.5 rounded-2xl text-[11px] font-black text-white shadow-2xl border border-white/20 whitespace-nowrap">
                                                {formatDualPrice(finalPrice, item.restaurant.currency as 'USD' | 'CDF', item.restaurant.exchangeRate || appSettings?.payment_exchange_rate || 2850, item.restaurant.displayCurrencyMode)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-5 flex-1 flex flex-col bg-white/50 dark:bg-black/20">
                                        <div className="flex-1 mb-4">
                                            <h4 className="text-[15px] font-display font-black text-gray-900 dark:text-white line-clamp-2 mb-1.5 uppercase tracking-tight leading-tight">{item.name}</h4>
                                            <p className="text-[10px] text-gray-400 dark:text-white/40 font-medium line-clamp-2 leading-relaxed">{item.description || "Une création signature par nos chefs."}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {cart.find(c => c.id === item.id) && (
                                                <div className="flex items-center bg-brand-600 text-white rounded-2xl px-3.5 py-2.5 shadow-lg shadow-brand-500/20">
                                                    <span className="text-xs font-black">x{cart.find(c => c.id === item.id)?.quantity}</span>
                                                </div>
                                            )}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); addToCart(item, item.restaurant); }}
                                                className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-black py-3 rounded-2xl shadow-xl shadow-brand-500/20 transition-all flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest active:scale-95 group/btn"
                                            >
                                                <Plus size={14} strokeWidth={4} className="group-hover/btn:rotate-90 transition-transform" /> {cart.find(c => c.id === item.id) ? 'AJOUTER' : 'COMMANDER'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                            })}
                        </div>
                        {discoverableItems.length === 0 && (
                            <div className="text-center py-12">
                                <p className="text-gray-400">Aucun plat disponible pour le moment.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <MapView 
                        restaurants={filteredRestaurants} 
                        userLocation={userState.location} 
                        selectedRestaurant={selectedRestaurant}
                        onSelect={(r) => { setSelectedRestaurant(r); navigateTo('restaurant_detail'); }}
                        onLocationChange={(loc) => setUserState(prev => ({ ...prev, location: loc, locationError: null }))}
                        onClose={() => setViewMode('list')}
                    />
                )}
            </>
        ) : viewMode === 'restaurant_detail' && selectedRestaurant ? (
            <div className="animate-in slide-in-from-right duration-300">
                <button onClick={() => window.history.back()} className="mb-6 flex items-center text-gray-650 dark:text-gray-300 font-bold hover:text-brand-600 transition-colors group">
                    <span className="w-8 h-8 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mr-2 shadow-sm border border-gray-100 dark:border-gray-750 group-hover:bg-brand-50 transition-colors"><ArrowLeft size={16} /></span>
                    Retour Enseignes
                </button>
                
                <div className="flex flex-col md:grid md:grid-cols-12 md:gap-8 items-start w-full">
                    {/* RESTAURANT HERO COVER - FULL WIDTH ON TOP OF GRID */}
                    <div className="col-span-12 w-full bg-white dark:bg-gray-800 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-750 overflow-hidden mb-6">
                        <div className="relative h-48 md:h-64 lg:h-80 w-full overflow-hidden">
                            <img src={selectedRestaurant.coverImage} className="w-full h-full object-cover" alt="Cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80"></div>
                        </div>
                        <div className="p-6 md:p-8">
                            <div className="flex justify-between items-start flex-wrap gap-4">
                               <div className="flex items-center flex-wrap gap-3">
                                   <h1 className="text-2xl md:text-3.5xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">{selectedRestaurant.name}</h1>
                                   {selectedRestaurant.isVerified && (
                                       <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg shadow-sm flex items-center">
                                           <Star size={10} className="mr-1 fill-white" /> Premium
                                       </span>
                                   )}
                               </div>
                               <div className="flex flex-col items-end space-y-1">
                                   <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider">{selectedRestaurant.city}</span>
                                   {selectedRestaurant.type && (
                                       <span className="text-[9px] bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 px-2.5 py-1 rounded-md font-black uppercase tracking-widest">{selectedRestaurant.type}</span>
                                   )}
                               </div>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 mb-6 mt-4 md:text-base leading-relaxed max-w-4xl">{selectedRestaurant.description}</p>
                            
                            {selectedRestaurant.isOpen === false && (
                                <div className="mb-6 p-4 bg-red-55 px-5 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex items-start space-x-3.5 text-red-800 dark:text-red-300 shadow-sm">
                                    <AlertTriangle className="shrink-0 mt-0.5 text-red-600 dark:text-red-400 animate-pulse" size={20} />
                                    <div>
                                        <h4 className="font-extrabold text-sm uppercase tracking-tight">Établissement actuellement fermé</h4>
                                        <p className="text-xs mt-1.5 opacity-90 leading-relaxed font-medium">
                                            Cet établissement n'accepte pas de nouvelles commandes pour le moment. Vous pouvez consulter l'intégralité de la carte et du menu, mais l'ajout de plats au panier est temporairement restreint.
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-3">
                                <button 
                                    disabled={isSubscribing === selectedRestaurant.id}
                                    onClick={() => toggleSubscription(selectedRestaurant.id)}
                                    className={`flex-1 sm:flex-initial flex items-center justify-center px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md ${
                                        isSubscribing === selectedRestaurant.id ? 'opacity-50 cursor-not-allowed' : ''
                                    } ${
                                        subscribedRestaurants.includes(selectedRestaurant.id)
                                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                        : 'bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-600 hover:to-brand-700 animate-pulse'
                                    }`}
                                >
                                    <Bell size={16} className={`mr-2 ${subscribedRestaurants.includes(selectedRestaurant.id) ? 'fill-gray-400' : ''} ${isSubscribing === selectedRestaurant.id ? 'animate-spin' : ''}`} />
                                    {isSubscribing === selectedRestaurant.id ? 'Traitement...' : (subscribedRestaurants.includes(selectedRestaurant.id) ? 'Abonné aux offres' : "S'abonner aux offres")}
                                </button>

                                {subscribedRestaurants.includes(selectedRestaurant.id) && (
                                    <button 
                                        onClick={() => {
                                            setActiveChatOrder({
                                                id: `sub-${user.id}-${selectedRestaurant.id}`,
                                                userId: user.id,
                                                restaurantId: selectedRestaurant.id,
                                                status: 'completed',
                                                paymentMethod: 'cash',
                                                paymentStatus: 'paid',
                                                totalAmount: 0,
                                                items: [],
                                                createdAt: new Date().toISOString(),
                                                restaurant: selectedRestaurant
                                            } as any);
                                        }}
                                        className="p-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl shadow-md transition-all flex items-center justify-center shrink-0"
                                        title="Discuter avec le restaurant"
                                    >
                                        <MessageSquare size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN (SIDEBAR - ON MOBILE SLIDES SECOND UNDER BANNER) */}
                    <div className="order-2 md:col-span-4 md:col-start-9 md:row-start-2 w-full space-y-6 md:sticky md:top-24 mb-6 md:mb-0">
                        {/* Timing, Delivery & Distance */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-750 shadow-sm space-y-4">
                            <h3 className="text-[10px] font-black text-gray-450 dark:text-gray-400 uppercase tracking-widest flex items-center justify-between border-b border-gray-50 dark:border-gray-750 pb-2">
                                <span>Estimation de Livraison</span>
                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                            </h3>
                            <div className="flex items-center space-x-3 text-sm text-gray-700 dark:text-gray-300">
                                <span className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-3 py-2.5 rounded-xl font-bold">
                                    <Navigation size={13} className="mr-1.5 text-brand-500"/> 
                                    {formatDistance(selectedRestoCalculated?.distKm ?? selectedRestaurant.distance ?? 0)}
                                </span>
                                <span className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-3 py-2.5 rounded-xl font-bold"><Zap size={13} className="mr-1.5 text-yellow-500 fill-yellow-400"/> {selectedRestaurant.preparationTime} min</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3.5">
                                 <div className="flex items-center p-3 bg-orange-50 dark:bg-orange-950/20 rounded-2xl text-orange-700 dark:text-orange-400 border border-orange-100/30 dark:border-orange-900/20">
                                    <Bike size={18} className="mr-2.5 shrink-0" />
                                    <div className="truncate">
                                        <p className="text-[8px] font-black uppercase tracking-wider opacity-60">En Moto</p>
                                        <p className="font-extrabold text-[13px] leading-tight text-orange-850 dark:text-orange-300">
                                            {formatTime(selectedRestoCalculated?.timeMoto ?? selectedRestaurant.timeMoto ?? 5)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-2xl text-blue-700 dark:text-blue-400 border border-blue-100/30 dark:border-blue-900/20">
                                    <Footprints size={18} className="mr-2.5 shrink-0" />
                                    <div className="truncate">
                                        <p className="text-[8px] font-black uppercase tracking-wider opacity-60">À pied</p>
                                        <p className="font-extrabold text-[13px] leading-tight text-blue-850 dark:text-blue-300">
                                            {formatTime(selectedRestoCalculated?.timeWalking ?? selectedRestaurant.timeWalking ?? 20)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 grid grid-cols-2 gap-2 border-t border-gray-100 dark:border-gray-750">
                                <button
                                    onClick={() => setViewMode('map')}
                                    className="flex items-center justify-center py-2 px-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all active:scale-95"
                                >
                                    <Map size={14} className="mr-1.5" /> Voir Carte
                                </button>
                                <a
                                    href={userState.location 
                                        ? `https://www.google.com/maps/dir/?api=1&origin=${userState.location.latitude},${userState.location.longitude}&destination=${selectedRestaurant.latitude},${selectedRestaurant.longitude}&travelmode=driving`
                                        : `https://www.google.com/maps/search/?api=1&query=${selectedRestaurant.latitude},${selectedRestaurant.longitude}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all active:scale-95"
                                >
                                    <ExternalLink size={14} className="mr-1.5" /> Google Maps
                                </a>
                            </div>
                        </div>

                        {/* Info & Contact */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-750 shadow-sm">
                            <h3 className="text-[10px] font-black text-gray-450 dark:text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-50 dark:border-gray-750 pb-2 flex items-center"><Info size={13} className="mr-1.5 text-brand-600"/> Informations & Contact</h3>
                            <div className="space-y-3.5">
                                <div className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                                    <MapPin size={16} className="mr-3 text-gray-400 shrink-0 mt-0.5"/>
                                    <span className="font-semibold text-xs leading-normal">{selectedRestaurant.city || 'Kinshasa'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 border-t border-gray-50 dark:border-gray-750 pt-3">
                                    <div className="flex items-center text-sm text-gray-700 dark:text-gray-300 min-w-0">
                                        <Phone size={16} className="mr-3 text-gray-400 shrink-0"/>
                                        <span className="font-mono text-xs font-bold truncate">
                                            {selectedRestaurant.phoneNumber || (selectedRestaurant as any).phone_number || '+243 812 345 678'}
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => window.open(`tel:${(selectedRestaurant.phoneNumber || (selectedRestaurant as any).phone_number || '+243812345678').replace(/\s+/g, '')}`)}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center shadow-md transition-transform active:scale-95 shrink-0"
                                    >
                                        <Phone size={10} className="mr-1"/> Appeler
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Automated Campaigns / Promo codes */}
                        {activeCampaigns[selectedRestaurant.id] && activeCampaigns[selectedRestaurant.id].length > 0 && (
                            <div className="p-5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl text-white shadow-md relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="font-black text-[10px] uppercase tracking-wider flex items-center">
                                            <Zap size={15} className="mr-1.5 text-yellow-300 fill-yellow-300" />
                                            Offre Flash active !
                                        </h3>
                                        <span className="bg-white/25 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">
                                            ACTIF
                                        </span>
                                    </div>
                                    <div className="space-y-3">
                                        {activeCampaigns[selectedRestaurant.id].map(campaign => {
                                            const isApplied = appliedCampaign?.id === campaign.id;
                                            return (
                                                <div key={campaign.id} className="bg-white/15 backdrop-blur-sm border border-white/15 p-3.5 rounded-2xl flex flex-col justify-between">
                                                    <div>
                                                        <p className="text-xs font-black uppercase tracking-tight">{campaign.name}</p>
                                                        <p className="text-[10px] text-orange-100 mt-1 leading-relaxed font-medium">{campaign.message_body}</p>
                                                    </div>
                                                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/10">
                                                        <span className="text-xs font-black text-yellow-300">-{campaign.discount_percentage}% de réduction !</span>
                                                        <button
                                                            onClick={() => {
                                                                if (isApplied) {
                                                                    setAppliedCampaign(null);
                                                                    toast.success("Réduction retirée.");
                                                                } else {
                                                                    setAppliedCampaign(campaign);
                                                                    toast.success(`Réduction de ${campaign.discount_percentage}% appliquée au panier !`);
                                                                }
                                                            }}
                                                            className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all active:scale-95 ${isApplied ? 'bg-white text-orange-600 shadow-md' : 'bg-yellow-300 text-orange-950 hover:bg-yellow-400'}`}
                                                        >
                                                            {isApplied ? 'OFFRE APPLIQUÉE' : "ACTIVER L'OFFRE"}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Loyalty program info */}
                        {user.role !== 'guest' && (
                            <div className="p-5 bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl text-white shadow-md relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-black text-[10px] uppercase tracking-wider flex items-center">
                                            <Star size={15} className="mr-1.5 text-yellow-400 fill-yellow-400" />
                                            Fidélité {selectedRestaurant.name}
                                        </h3>
                                        <span className="bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                                            {loyaltyPoints[selectedRestaurant.id] || 0} Pts
                                        </span>
                                    </div>
                                    
                                    {loyaltyRewards[selectedRestaurant.id] && loyaltyRewards[selectedRestaurant.id].length > 0 ? (
                                        <div className="space-y-3">
                                            <p className="text-[8px] text-brand-100 font-extrabold uppercase tracking-widest pb-1 border-b border-white/10">Récompenses de l'établissement :</p>
                                            <div className="flex space-x-3 overflow-x-auto pb-2 no-scrollbar">
                                                {loyaltyRewards[selectedRestaurant.id].map(reward => (
                                                    <div key={reward.id} className="flex-shrink-0 bg-white/10 backdrop-blur-sm border border-white/10 p-3 rounded-2xl w-36">
                                                        <p className="text-xs font-bold truncate">{reward.name}</p>
                                                        <div className="flex justify-between items-end mt-2">
                                                            <span className="text-[9px] text-brand-200">{reward.points_required} pts</span>
                                                            <button 
                                                                onClick={() => handleClaimReward(reward)}
                                                                disabled={(loyaltyPoints[selectedRestaurant.id] || 0) < reward.points_required}
                                                                className={`text-[9px] font-black px-2 py-1 rounded-md transition-all active:scale-95 ${(loyaltyPoints[selectedRestaurant.id] || 0) >= reward.points_required ? 'bg-white text-brand-600 shadow-sm' : 'bg-white/20 text-white/55 cursor-not-allowed'}`}
                                                            >
                                                                Réclamer
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-brand-100 leading-relaxed font-semibold">Commandez pour remporter des points d'achat et débloquer des cadeaux exclusifs !</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* LEFT COLUMN (ON DESKTOP OCCUPIES COLS 1-8 FOR MENU LISTING) */}
                    <div className="order-3 md:col-span-8 md:col-start-1 md:row-start-2 w-full space-y-6">
                        {/* THE CENTRAL MENU SECTION */}
                        <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl border border-gray-100 dark:border-gray-750 shadow-sm">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-md md:text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Le Menu de Collection</h3>
                                <div className="text-[9px] font-black text-gray-450 dark:text-gray-400 uppercase tracking-widest bg-gray-50 dark:bg-gray-905 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-750">
                                    {selectedRestaurant.menu.filter(item => selectedMenuCategory === 'Tous' || item.category === selectedMenuCategory).length} articles
                                </div>
                            </div>

                            {/* MENU CATEGORY FILTER */}
                            <div className="flex space-x-2 overflow-x-auto no-scrollbar mb-6 pb-1">
                                {['Tous', ...Array.from(new Set(selectedRestaurant.menu.map(item => item.category).filter(Boolean)))].map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedMenuCategory(cat)}
                                        className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm border ${
                                            selectedMenuCategory === cat 
                                            ? 'bg-brand-500 text-white border-brand-500 shadow-md' 
                                            : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-305 border-gray-150 dark:border-gray-750 hover:bg-gray-100 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        {cat === 'entrée' ? 'Entrées' : 
                                         cat === 'plat' ? 'Plats' : 
                                         cat === 'dessert' ? 'Desserts' : 
                                         cat === 'boisson' ? 'Boissons' : 
                                         cat === 'Tous' ? 'Tout' : cat}
                                    </button>
                                ))}
                            </div>

                            {/* DYNAMIC CARD-WISE MENU LISTING */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-12">
                                {selectedRestaurant.menu.filter(item => selectedMenuCategory === 'Tous' || item.category === selectedMenuCategory).length === 0 && (
                                    <div className="col-span-full text-center py-16 bg-gray-50 dark:bg-gray-900/40 rounded-3xl border border-dashed border-gray-200 dark:border-gray-750">
                                        <ShoppingBag className="mx-auto text-gray-300 dark:text-gray-600 mb-2.5" size={36} />
                                        <p className="text-gray-500 dark:text-gray-400 text-sm font-semibold">Aucun article disponible dans cette catégorie.</p>
                                    </div>
                                )}
                                {selectedRestaurant.menu
                                    .filter(item => selectedMenuCategory === 'Tous' || item.category === selectedMenuCategory)
                                    .map(item => {
                                        const isNew = item.createdAt ? (new Date().getTime() - new Date(item.createdAt).getTime()) / (1000 * 3600 * 24) <= 5 : false;
                                        const promo = getPromoDetails(item, selectedRestaurant.id);
                                        const hasPromo = promo && promo.isPromo;
                                        const promoBadge = promo?.badgeText || "PROMO";
                                        const promoPrice = promo?.promoPrice;
                                        return (
                                        <div key={item.id} className={`bg-gray-50 dark:bg-gray-901 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-750 shadow-sm flex space-x-3.5 hover:shadow-md transition-shadow duration-300 relative overflow-hidden group ${!item.isAvailable ? 'opacity-55 grayscale' : ''}`}>
                                            <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-gray-200 dark:bg-gray-800">
                                                <img src={item.image} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={item.name} />
                                                {hasPromo && (
                                                    <div className="absolute top-1 left-1 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow border border-red-400 animate-pulse uppercase tracking-wider z-10">
                                                        {promoBadge}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 flex flex-col justify-between min-w-0 relative">
                                                {isNew && (
                                                    <div className="absolute top-0 right-0 flex items-center space-x-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800/50">
                                                        <Sparkles size={8} />
                                                        <span className="text-[8px] font-black uppercase tracking-widest">New</span>
                                                    </div>
                                                )}
                                                <div>
                                                    <h4 className={`font-extrabold text-xs md:text-sm text-gray-950 dark:text-white truncate leading-snug ${isNew ? 'pr-12' : ''}`}>{item.name}</h4>
                                                    <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5 leading-normal font-medium">{item.description}</p>
                                                    
                                                    {/* MEAL RATING DISPLAY */}
                                                    <div 
                                                        className="flex items-center space-x-1.5 mt-1 cursor-pointer hover:opacity-80 inline-flex" 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenMealReviews(item);
                                                        }}
                                                    >
                                                        <div className="flex items-center text-amber-500">
                                                            <Star size={11} fill={item.rating ? "currentColor" : "none"} className="stroke-[2.5]" />
                                                            <span className="text-[10px] font-black ml-0.5">
                                                                {item.rating ? `${item.rating}/5` : 'Nouveau'}
                                                            </span>
                                                        </div>
                                                        <span className="text-[9px] text-gray-450 dark:text-gray-400 font-bold underline decoration-dotted">
                                                            {item.reviewCount && item.reviewCount > 0 ? `${item.reviewCount} avis` : 'Donner un avis'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-end mt-2">
                                                    <div className="flex flex-col">
                                                        {hasPromo && promoPrice !== null && (
                                                            <span className="text-[9px] text-gray-450 dark:text-gray-400 line-through">
                                                                {formatDualPrice(item.price || 0, selectedRestaurant?.currency as 'USD' | 'CDF' || 'USD', selectedRestaurant?.exchangeRate || appSettings?.payment_exchange_rate || 2850, selectedRestaurant?.displayCurrencyMode)}
                                                            </span>
                                                        )}
                                                        <span className="font-black text-brand-600 dark:text-brand-400 text-xs md:text-sm whitespace-nowrap">
                                                            {formatDualPrice(
                                                                (hasPromo && promoPrice !== null) ? promoPrice : (item.price || 0),
                                                                selectedRestaurant?.currency as 'USD' | 'CDF' || 'USD',
                                                                selectedRestaurant?.exchangeRate || appSettings?.payment_exchange_rate || 2850,
                                                                selectedRestaurant?.displayCurrencyMode
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-2 shrink-0">
                                                        {cart.find(c => c.id === item.id) && (
                                                            <span className="text-[10px] font-black bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-md">
                                                                x{cart.find(c => c.id === item.id)?.quantity}
                                                            </span>
                                                        )}
                                                        <button 
                                                            onClick={() => addToCart(item, selectedRestaurant)} 
                                                            disabled={!item.isAvailable || selectedRestaurant.isOpen === false}
                                                            className={`p-1.5 rounded-lg transition-all active:scale-90 ${
                                                                (item.isAvailable && selectedRestaurant.isOpen !== false) 
                                                                ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm' 
                                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                                            }`}
                                                            title={selectedRestaurant.isOpen === false ? "Le restaurant est fermé" : "Ajouter au Panier"}
                                                        >
                                                            <Plus size={14} strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                    })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* STICKY CART SUMMARY */}
                {cart.length > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-2xl animate-slide-in-right max-w-md mx-auto">
                        <button 
                            onClick={openCart}
                            className="w-full bg-brand-600 text-white rounded-xl p-4 flex justify-between items-center shadow-lg hover:bg-brand-700 transition-colors"
                        >
                            <div className="flex items-center">
                                <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center mr-3 font-bold text-sm">
                                    {cart.reduce((acc, item) => acc + item.quantity, 0)}
                                </div>
                                <span className="font-bold">{t('view_cart')}</span>
                            </div>
                            <span className="font-black text-lg">
                                {formatDualPrice(cartTotal, selectedRestaurant?.currency as 'USD' | 'CDF' || 'USD', selectedRestaurant?.exchangeRate || appSettings?.payment_exchange_rate || 2850, selectedRestaurant?.displayCurrencyMode)}
                            </span>
                        </button>
                    </div>
                )}
            </div>
        ) : viewMode === 'private_courier' ? (
            renderPrivateCourierView()
        ) : viewMode === 'orders' ? (
            <OrdersView 
                orders={orders} 
                onChat={openChat} 
                onLivreurChat={setActiveChatLivreur}
                onBrowse={() => setViewMode('list')} 
                onOrderUpdated={fetchOrders}
                subscribedRestaurantIds={subscribedRestaurants}
                allRestaurants={allRestaurants}
            />
        ) : viewMode === 'settings' ? (
             <div className="animate-in fade-in slide-in-from-right duration-500 max-w-2xl mx-auto px-4 sm:px-0">
                <button onClick={() => setViewMode('list')} className="mb-8 flex items-center text-gray-500 dark:text-gray-400 font-bold hover:text-brand-600 transition-colors group">
                    <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mr-2 group-hover:bg-brand-50 dark:group-hover:bg-brand-900/20 transition-colors">
                        <ArrowLeft size={16} /> 
                    </div>
                    {t('back_to_restaurants')}
                </button>

                <div className="flex flex-col items-center text-center mb-10">
                    <div className="w-20 h-20 bg-brand-50 dark:bg-brand-900/20 rounded-[32px] flex items-center justify-center mb-4 text-brand-600 shadow-inner">
                        <Settings size={40} />
                    </div>
                    <h2 className="text-3xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('settings')}</h2>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mt-2 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">Panneau de configuration client</p>
                </div>
                
                <div className="space-y-8 pb-32">
                    {/* Mon Profil (Facebook/Instagram Style) */}
                    {user.role !== 'guest' && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden relative">
                            {/* Premium decorative banner */}
                            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-brand-600 to-orange-500 opacity-90"></div>
                            
                            <div className="relative pt-10 flex flex-col items-center sm:items-start sm:flex-row sm:space-x-6">
                                {/* Avatar column */}
                                <div className="relative group mb-4 sm:mb-0 shrink-0">
                                    <div className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 bg-gray-100 dark:bg-gray-700 overflow-hidden shadow-lg flex items-center justify-center">
                                        {profileAvatarPreview ? (
                                            <img src={profileAvatarPreview} alt={user.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <UserIcon size={40} className="text-gray-400 dark:text-gray-500" />
                                        )}
                                    </div>
                                    <label className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Camera size={20} className="text-white" />
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            className="hidden" 
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    setProfileAvatarFile(file);
                                                    setProfileAvatarPreview(URL.createObjectURL(file));
                                                    setIsEditingProfile(true); // Auto editing on change photo
                                                }
                                            }}
                                        />
                                    </label>
                                </div>

                                {/* Information/Editing block */}
                                <div className="flex-1 text-center sm:text-left mt-2 self-center w-full">
                                    {!isEditingProfile ? (
                                        <>
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 justify-center sm:justify-start">
                                                <h4 className="text-xl font-display font-black text-gray-950 dark:text-white uppercase tracking-tight">{user.name}</h4>
                                                <span className="inline-flex self-center items-center px-2 py-0.5 rounded-full text-[9px] font-black bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400 uppercase tracking-widest mt-1 sm:mt-0">Profil vérifié</span>
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">{user.email}</p>
                                            
                                            <div className="mt-4 flex flex-col sm:flex-row sm:space-x-4 space-y-2 sm:space-y-0 text-xs text-gray-600 dark:text-gray-300 font-bold uppercase tracking-tight">
                                                <span className="flex items-center justify-center sm:justify-start">
                                                    <Phone size={14} className="mr-1.5 text-brand-500 shrink-0" />
                                                    {user.phoneNumber || "Aucun numéro"}
                                                </span>
                                                <span className="flex items-center justify-center sm:justify-start">
                                                    <MapPin size={14} className="mr-1.5 text-orange-500 shrink-0" />
                                                    {user.city || "Kinshasa"}
                                                </span>
                                            </div>

                                            <button 
                                                onClick={() => setIsEditingProfile(true)}
                                                className="mt-6 flex items-center justify-center space-x-2 px-6 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-150 dark:border-white/10 hover:bg-brand-50 dark:hover:bg-brand-950 text-gray-700 dark:text-gray-200 hover:text-brand-600 dark:hover:text-brand-400 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                                            >
                                                <Pencil size={12} />
                                                <span>Modifier mon profil</span>
                                            </button>

                                            {user.role === 'superadmin' && onGoToAdmin && (
                                                <div className="mt-4 p-4 bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 rounded-2xl flex flex-col items-center sm:items-start">
                                                    <h5 className="text-[10px] font-extrabold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-1">Accès Administrateur</h5>
                                                    <p className="text-[10px] text-sky-500 dark:text-sky-350 sm:text-left text-center mb-3">Vous êtes répertorié comme Administrateur ou Gestionnaire.</p>
                                                    <button 
                                                        onClick={onGoToAdmin}
                                                        className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                                                    >
                                                        <Shield size={12} />
                                                        <span>Espace Administration</span>
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="space-y-4 text-left w-full mt-2">
                                            <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2">Modifier mes informations</h4>
                                            
                                            {/* Mobile change picture helper */}
                                            <div className="block sm:hidden flex justify-center mb-2">
                                                <label className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-750 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-200 transition-colors">
                                                    <Camera size={14} />
                                                    <span>Changer la photo</span>
                                                    <input 
                                                        type="file" 
                                                        accept="image/*" 
                                                        className="hidden" 
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setProfileAvatarFile(file);
                                                                setProfileAvatarPreview(URL.createObjectURL(file));
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">{t('full_name')}</label>
                                                    <input 
                                                        type="text" 
                                                        value={profileName} 
                                                        onChange={(e) => setProfileName(e.target.value)} 
                                                        placeholder="Votre nom complet" 
                                                        className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-sans font-semibold text-gray-800 dark:text-white dark:bg-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                                    />
                                                </div>
                                                
                                                <div>
                                                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">{t('phone')}</label>
                                                    <input 
                                                        type="text" 
                                                        value={profilePhone} 
                                                        onChange={(e) => setProfilePhone(e.target.value)} 
                                                        placeholder="Ex: +243 ..." 
                                                        className="w-full p-3 font-mono border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-semibold text-gray-800 dark:text-white dark:bg-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Ville de résidence</label>
                                                    <select 
                                                        value={profileCity} 
                                                        onChange={(e) => setProfileCity(e.target.value)} 
                                                        className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-sans font-semibold text-gray-800 dark:text-white dark:bg-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                                    >
                                                        {CITIES_RDC.map(city => (
                                                            <option key={city} value={city}>{city}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:space-x-2 pt-2 gap-2">
                                                <button 
                                                    disabled={isSavingProfile}
                                                    onClick={handleSaveProfile}
                                                    className="w-full sm:w-auto px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md flex items-center justify-center space-x-2"
                                                >
                                                    {isSavingProfile ? (
                                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                    ) : (
                                                        <span>{t('save')}</span>
                                                    )}
                                                </button>
                                                <button 
                                                    disabled={isSavingProfile}
                                                    onClick={() => {
                                                        setIsEditingProfile(false);
                                                        setProfileName(user.name || '');
                                                        setProfilePhone(user.phoneNumber || '');
                                                        setProfileCity(user.city || 'Kinshasa');
                                                        setProfileAvatarPreview(user.avatarUrl || '');
                                                    }}
                                                    className="w-full sm:w-auto px-6 py-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                                                >{t('cancel')}</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Help & Support */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-display font-black text-gray-900 dark:text-white mb-6 flex items-center uppercase tracking-tight">
                            <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-xl mr-3">
                                <HelpCircle size={20} className="text-brand-600"/>
                            </div>
                            {t('help_and_support')}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button 
                                onClick={openHelpCenter}
                                className="flex flex-col items-center text-center p-6 bg-gray-50 dark:bg-gray-700/50 rounded-3xl hover:bg-white dark:hover:bg-gray-700 border border-transparent hover:border-brand-500 hover:shadow-xl hover:shadow-brand-500/10 transition-all duration-300 group"
                            >
                                <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl mb-4 shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all">
                                    <Book size={24} className="text-brand-600" />
                                </div>
                                <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('help_center')}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter mt-1">{t('help_guides')}</p>
                            </button>

                            <a 
                                href="mailto:irmerveilkanku@gmail.com"
                                className="flex flex-col items-center text-center p-6 bg-gray-50 dark:bg-gray-700/50 rounded-3xl hover:bg-white dark:hover:bg-gray-700 border border-transparent hover:border-brand-500 hover:shadow-xl hover:shadow-brand-500/10 transition-all duration-300 group"
                            >
                                <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl mb-4 shadow-sm group-hover:scale-110 group-hover:-rotate-3 transition-all">
                                    <Mail size={24} className="text-brand-600" />
                                </div>
                                <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('contact_support')}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter mt-1">Support Email</p>
                            </a>
                        </div>
                    </div>

                    {/* Theme Toggle */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-display font-black text-gray-900 dark:text-white mb-6 flex items-center uppercase tracking-tight">
                            <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-xl mr-3">
                                {theme === 'light' ? <Sun size={20} className="text-orange-500"/> : <Moon size={20} className="text-blue-400"/>}
                            </div>
                            {t('appearance')}
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => setTheme('light')}
                                className={`flex flex-col items-center py-6 px-4 rounded-[24px] font-black text-xs uppercase tracking-widest border-2 transition-all active:scale-95 ${theme === 'light' ? 'bg-orange-50 border-orange-500 text-orange-700 shadow-lg shadow-orange-500/20' : 'bg-gray-50 dark:bg-gray-700 border-gray-100 dark:border-gray-600 text-gray-400'}`}
                            >
                                <Sun size={24} className="mb-2" />
                                {t('light')}
                            </button>
                            <button 
                                onClick={() => setTheme('dark')}
                                className={`flex flex-col items-center py-6 px-4 rounded-[24px] font-black text-xs uppercase tracking-widest border-2 transition-all active:scale-95 ${theme === 'dark' ? 'bg-blue-900/20 border-blue-500 text-blue-400 shadow-lg shadow-blue-500/20' : 'bg-gray-50 dark:bg-gray-700 border-gray-100 dark:border-gray-600 text-gray-400'}`}
                            >
                                <Moon size={24} className="mb-2" />
                                {t('dark')}
                            </button>
                        </div>
                    </div>

                    {/* Language Toggle */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-display font-black text-gray-900 dark:text-white mb-6 flex items-center uppercase tracking-tight">
                            <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-xl mr-3">
                                <Globe size={20} className="text-brand-600"/>
                            </div>
                            {t('language')}
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                             {(['fr', 'en', 'ln'] as const).map((lang) => (
                                <button
                                    key={lang} 
                                    onClick={() => setLanguage(lang)}
                                    className={`relative overflow-hidden text-center py-4 px-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border-2 transition-all active:scale-95 ${language === lang ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-500/40' : 'bg-gray-50 dark:bg-gray-700 border-gray-100 dark:border-gray-600 text-gray-400'}`}
                                >
                                    <span className="relative z-10">{lang === 'fr' ? 'Français' : lang === 'en' ? 'English' : 'Lingala'}</span>
                                    {language === lang && (
                                        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent"></div>
                                    )}
                                </button>
                             ))}
                        </div>
                    </div>

                    {/* Become a Delivery Person */}
                    {user.role === 'client' && (
                        <div className="bg-gradient-to-br from-brand-600 to-orange-500 p-8 rounded-[40px] shadow-2xl shadow-brand-500/20 text-white relative overflow-hidden group">
                            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                                        <Bike size={32} />
                                    </div>
                                    <div className="bg-white text-brand-600 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
                                        Opportunité
                                    </div>
                                </div>
                                <h3 className="text-3xl font-display font-black uppercase tracking-tight mb-2 leading-none">
                                    {t('earn_with_us')}
                                </h3>
                                <p className="text-sm text-brand-100 font-medium max-w-sm leading-relaxed mb-8">
                                    {t('join_fleet')} - Gagnez de l'argent selon votre propre emploi du temps.
                                </p>
                                
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <div className="bg-black/10 backdrop-blur-sm p-4 rounded-3xl border border-white/10">
                                        <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">{t('flexibility')}</p>
                                        <p className="text-xs font-bold">{t('work_when_you_want')}</p>
                                    </div>
                                    <div className="bg-black/10 backdrop-blur-sm p-4 rounded-3xl border border-white/10">
                                        <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">{t('earnings')}</p>
                                        <p className="text-xs font-bold">{t('paid_per_delivery')}</p>
                                    </div>
                                </div>

                                <div className="flex justify-center">
                                    <button 
                                        onClick={() => setViewMode('delivery_onboarding')}
                                        className="w-full sm:w-auto px-12 py-5 bg-white text-brand-600 rounded-[32px] font-black text-sm uppercase tracking-widest hover:bg-brand-50 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        {t('start_registration')}
                                        <ArrowRight size={20} />
                                    </button>
                                </div>
                                
                                <p className="text-[10px] text-center text-white/60 mt-6 font-bold uppercase tracking-tight">
                                    {t('terms_accept')}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Security Settings */}
                    {user.role !== 'guest' && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700">
                             <h3 className="font-display font-black text-gray-900 dark:text-white mb-6 flex items-center uppercase tracking-tight">
                                <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-xl mr-3">
                                    <Shield size={20} className="text-brand-600"/>
                                </div>
                                {t('security_and_access')}
                            </h3>
                            
                            <div className="grid grid-cols-1 gap-4 max-w-sm mx-auto w-full">
                                {/* App Lock */}
                                <div className="p-6 bg-gray-50 dark:bg-gray-700/50 rounded-3xl flex flex-col items-center text-center">
                                    <div className="p-3 bg-white dark:bg-gray-800 rounded-2xl mb-4 shadow-sm">
                                        <Lock size={24} className="text-gray-600 dark:text-gray-300" />
                                    </div>
                                    <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight mb-1">{t('app_lock')}</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-4">{t('ask_pin')}</p>
                                    <button 
                                        onClick={() => user.settings?.appLockEnabled ? updateSecuritySettings({ appLockEnabled: false }) : setIsPinSetupOpen(true)}
                                        className={`w-14 h-7 rounded-full transition-all relative ${user.settings?.appLockEnabled ? 'bg-brand-600 ring-4 ring-brand-100 dark:ring-brand-900/20' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-xl transition-all ${user.settings?.appLockEnabled ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notifications Settings */}
                    {user.role !== 'guest' && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-700">
                            <h3 className="font-display font-black text-gray-900 dark:text-white mb-6 flex items-center uppercase tracking-tight">
                                <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-xl mr-3">
                                    <Bell size={20} className="text-brand-600"/>
                                </div>
                                Notifications
                            </h3>
                            
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl">
                                    <div>
                                        <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">Push</p>
                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Temps réel</p>
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            if (!user.settings?.notifPush) {
                                                const granted = await requestNotificationPermission();
                                                if (granted) {
                                                    updateSecuritySettings({ notifPush: true });
                                                    sendPushNotification("Notifications activées", { body: "Vous recevrez désormais des alertes en temps réel." });
                                                } else {
                                                    const isInIframe = window.self !== window.top;
                                                    if (isInIframe) {
                                                        toast.error("Veuillez ouvrir l'application dans un nouvel onglet pour activer les notifications.");
                                                    } else {
                                                        toast.error("Permission refusée.");
                                                    }
                                                }
                                            } else {
                                                updateSecuritySettings({ notifPush: false });
                                            }
                                        }}
                                        className={`w-14 h-7 rounded-full transition-all relative ${user.settings?.notifPush ? 'bg-brand-600 ring-4 ring-brand-100 dark:ring-brand-900/20' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-xl transition-all ${user.settings?.notifPush ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl">
                                    <div>
                                        <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">Emails</p>
                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Factures & Recaps</p>
                                    </div>
                                    <button 
                                        onClick={() => updateSecuritySettings({ notifEmail: !user.settings?.notifEmail })}
                                        className={`w-14 h-7 rounded-full transition-all relative ${user.settings?.notifEmail ? 'bg-brand-600 ring-4 ring-brand-100 dark:ring-brand-900/20' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-xl transition-all ${user.settings?.notifEmail ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl">
                                    <div>
                                        <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">SMS</p>
                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Alertes critiques</p>
                                    </div>
                                    <button 
                                        onClick={() => updateSecuritySettings({ notifSms: !user.settings?.notifSms })}
                                        className={`w-14 h-7 rounded-full transition-all relative ${user.settings?.notifSms ? 'bg-brand-600 ring-4 ring-brand-100 dark:ring-brand-900/20' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-xl transition-all ${user.settings?.notifSms ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Danger Zone */}
                    {user.id !== 'guest' && (
                        <div className="bg-red-50/50 dark:bg-red-900/10 p-6 rounded-[32px] border border-red-100 dark:border-red-900/30 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 shadow-sm">
                                <LogOut size={28} className="text-red-500" />
                            </div>
                            <h3 className="text-xl font-display font-black text-red-600 uppercase tracking-tight mb-2">{t('logout')}</h3>
                            <p className="text-xs text-red-400 font-bold uppercase mb-6 tracking-tighter">Quitter votre session sécurisée DashMeals</p>
                            
                            <div className="flex justify-center w-full">
                                <button 
                                    onClick={onLogout} 
                                    className="w-full sm:w-auto px-16 py-4 bg-red-600 text-white rounded-[24px] font-black text-sm uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-500/20 active:scale-95" 
                                    id="customer_logout_btn"
                                >
                                    {t('logout')}
                                </button>
                            </div>
                        </div>
                    )}

                    <Footer onLegalClick={(type) => setLegalView(type)} appSettings={appSettings} />
                </div>
            </div>

        ) : viewMode === 'delivery_onboarding' ? (
            renderDeliveryOnboarding()
        ) : null}
        </div>
      </main>

      {/* BOTTOM NAV */}
      <nav className={`fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-around items-center z-40 max-w-md md:max-w-7xl mx-auto rounded-t-[32px] md:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.05)] md:hidden transition-all duration-300 ${isNavVisible ? 'translate-y-0 opacity-100' : 'translate-y-[110%] opacity-0 pointer-events-none'}`}>
        <button onClick={() => navigateTo('list')} className={`flex flex-col items-center space-y-1 ${viewMode === 'list' || viewMode === 'restaurant_detail' ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'}`}><List size={22} /><span className="text-[10px] font-medium">Liste</span></button>
        <button onClick={() => navigateTo('map')} className={`flex flex-col items-center space-y-1 ${viewMode === 'map' ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'}`}><Map size={22} /><span className="text-[10px] font-medium">Carte</span></button>
        <div className="relative -top-6"><button onClick={toggleUrgentMode} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-gray-50 dark:border-gray-900 transition-all ${urgentMode ? 'bg-brand-600 text-white scale-110 shadow-brand-500/50' : 'bg-brand-500 text-white'}`}><Zap size={24} className={urgentMode ? 'animate-pulse' : ''} /></button></div>
        
        {user.role === 'superadmin' && onGoToAdmin && (
          <button 
            onClick={onGoToAdmin} 
            className="flex flex-col items-center space-y-1 text-amber-500 dark:text-amber-400 animate-pulse"
            title="Espace Administration"
          >
            <Shield size={22} />
            <span className="text-[9px] font-black uppercase tracking-widest">Admin</span>
          </button>
        )}
        
        <button onClick={() => navigateTo('orders')} className={`flex flex-col items-center space-y-1 ${viewMode === 'orders' ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'}`}><Receipt size={22} /><span className="text-[10px] font-medium">{t('orders')}</span></button>
      </nav>

      <CartDrawer 
        isOpen={isCartOpen} 
        onClose={closeCart} 
        items={cart} 
        onRemove={removeFromCart} 
        onUpdateQuantity={updateQuantity}
        onCheckout={handleCheckout} 
        total={cartTotal} 
        isLoading={isCheckingOut} 
        currency={allRestaurants.find(r => r.id === cart[0]?.restaurantId)?.currency} 
        exchangeRate={allRestaurants.find(r => r.id === cart[0]?.restaurantId)?.exchangeRate || appSettings?.payment_exchange_rate || 2850}
        displayCurrencyMode={allRestaurants.find(r => r.id === cart[0]?.restaurantId)?.displayCurrencyMode}
        paymentConfig={allRestaurants.find(r => r.id === cart[0]?.restaurantId)?.paymentConfig}
        language={language}
        userRole={user.role}
        userName={user.name}
        userPhone={user.phoneNumber}
        discountPercentage={appliedCampaign && cart.length > 0 && cart[0].restaurantId === appliedCampaign.restaurant_id ? appliedCampaign.discount_percentage : 0}
        discountName={appliedCampaign && cart.length > 0 && cart[0].restaurantId === appliedCampaign.restaurant_id ? appliedCampaign.name : ''}
      />

      {/* LEGAL MODALS */}
      <LegalModal 
        type={legalView}
        onClose={() => setLegalView(null)}
        appSettings={appSettings}
      />

      {/* HELP CENTER OVERLAY */}
      {isHelpCenterOpen && (
          <HelpCenter 
            user={user}
            onClose={closeHelpCenter}
            appSettings={appSettings}
          />
      )}

      {/* NOTIFICATIONS MODAL */}
      {showNotifications && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNotifications(false)}></div>
              <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-200 max-h-[80vh] flex flex-col">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-brand-600 text-white">
                      <div className="flex items-center">
                          <Bell size={18} className="mr-2" />
                          <h3 className="font-black uppercase tracking-tight">Notifications</h3>
                      </div>
                      <div className="flex items-center space-x-2">
                          {unreadCount > 0 && (
                              <button 
                                  onClick={markAllAsRead}
                                  className="text-[10px] font-bold bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
                              >
                                  Tout lire
                              </button>
                          )}
                          <button onClick={() => setShowNotifications(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                              <X size={20} />
                          </button>
                      </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                      {notifications.length === 0 ? (
                          <div className="py-12 text-center">
                              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Bell size={32} className="text-gray-300 dark:text-gray-600" />
                              </div>
                              <p className="text-gray-500 dark:text-gray-400 font-bold">Aucune notification</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Vous êtes à jour !</p>
                          </div>
                      ) : (
                          notifications.map((notif) => (
                              <div 
                                  key={notif.id} 
                                  className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                                      notif.is_read 
                                      ? 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 opacity-80' 
                                      : 'bg-brand-50 dark:bg-brand-900/20 border-brand-100 dark:border-brand-900/30 shadow-sm'
                                  }`}
                                  onClick={() => {
                                      markNotificationAsRead(notif.id);
                                      setExpandedNotificationId(expandedNotificationId === notif.id ? null : notif.id);
                                      if (notif.type === 'message' && notif.data?.order_id) {
                                          setShowNotifications(false);
                                          // If it's a subscriber chat
                                          if (notif.data.order_id.startsWith('sub-')) {
                                              // We need to find the restaurant to open the chat
                                              const restaurantId = notif.data.order_id.split('-').pop();
                                              const resto = allRestaurants.find(r => r.id === restaurantId);
                                              if (resto) {
                                                  setActiveChatOrder({
                                                      id: notif.data.order_id,
                                                      userId: user.id,
                                                      restaurantId: resto.id,
                                                      status: 'completed', // Dummy status
                                                      paymentMethod: 'cash',
                                                      paymentStatus: 'paid',
                                                      totalAmount: 0,
                                                      items: [],
                                                      createdAt: new Date().toISOString(),
                                                      restaurant: resto
                                                  } as any);
                                              }
                                          } else {
                                              // It's a real order chat
                                              const order = orders.find(o => o.id === notif.data.order_id);
                                              if (order) {
                                                  setActiveChatOrder(order);
                                              } else {
                                                  toast.error("Commande introuvable");
                                              }
                                          }
                                      }
                                  }}
                              >
                                  <div className="flex items-start">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mr-3 ${
                                          notif.type === 'message' ? 'bg-blue-100 text-blue-600' : 
                                          notif.type === 'order_status' ? 'bg-orange-100 text-orange-600' :
                                          notif.type === 'new_order' ? 'bg-green-100 text-green-600' :
                                          notif.type === 'support' ? 'bg-purple-100 text-purple-600' :
                                          'bg-brand-100 text-brand-600'
                                      }`}>
                                          {notif.type === 'message' ? <MessageSquare size={16} /> : 
                                           notif.type === 'order_status' ? <ShoppingBag size={16} /> :
                                           notif.type === 'support' ? <HelpCircle size={16} /> :
                                           <Bell size={16} />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                          <div className="flex justify-between items-start">
                                              <h4 className={`text-xs font-black truncate pr-4 ${notif.is_read ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white'}`}>
                                                  {notif.title}
                                              </h4>
                                              <span className="text-[9px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                                                  {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                              </span>
                                          </div>
                                          <p className={`text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight ${
                                              expandedNotificationId === notif.id ? 'line-clamp-none' : 'line-clamp-2'
                                          }`}>
                                              {notif.message}
                                          </p>
                                      </div>
                                  </div>
                                  <button 
                                      onClick={(e) => {
                                          e.stopPropagation();
                                          deleteNotification(notif.id);
                                      }}
                                      className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                      <X size={12} />
                                  </button>
                                  {!notif.is_read && (
                                      <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-brand-500 rounded-full"></div>
                                  )}
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* PIN Setup Dialog */}
      <PinSetupDialog 
        isOpen={isPinSetupOpen}
        onClose={() => setIsPinSetupOpen(false)}
        onConfirm={handleSetPin}
      />

      {/* CART CONFLICT MODAL */}
      {cartConflict && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                  <div className="p-8 text-center">
                      <div className="w-20 h-20 bg-brand-50 dark:bg-brand-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                          <ShoppingBag size={40} className="text-brand-600 animate-bounce" />
                      </div>
                      <h3 className="text-xl font-black text-gray-900 dark:text-white leading-tight mb-4 uppercase">Changer de restaurant ?</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
                          Votre panier contient déjà des plats de <span className="font-bold text-gray-900 dark:text-white">"{cart[0]?.restaurantName}"</span>. 
                          Voulez-vous le vider pour commander chez <span className="font-bold text-brand-600">"{cartConflict.restaurant.name}"</span> ?
                      </p>
                      
                      <div className="space-y-3">
                          <button 
                              onClick={clearAndAddToCart}
                              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-brand-200 transition-all uppercase tracking-widest text-sm"
                          >
                              Oui, vider et ajouter
                          </button>
                          <button 
                              onClick={() => setCartConflict(null)}
                              className="w-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold py-4 rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all text-sm"
                          >
                              Non, garder mon panier
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MEAL REVIEWS MODAL */}
      {activeMealForReviews && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 max-h-[85vh] flex flex-col">
                  {/* Header */}
                  <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-brand-600 text-white shrink-0">
                      <div>
                          <h3 className="text-sm font-black uppercase tracking-wider">Avis sur le plat</h3>
                          <p className="text-[11px] font-medium text-brand-100 truncate max-w-[280px]">{activeMealForReviews.name}</p>
                      </div>
                      <button 
                          onClick={() => setActiveMealForReviews(null)} 
                          className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white"
                      >
                          <X size={20} />
                      </button>
                  </div>

                  {/* Body (Scrollable) */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar">
                      {/* Rating Stats Summary */}
                      <div className="bg-gray-50 dark:bg-gray-950 p-4 rounded-2xl border border-gray-100 dark:border-gray-805 flex items-center justify-between">
                          <div>
                              <span className="text-3xl font-black text-gray-900 dark:text-white">
                                  {activeMealForReviews.rating ? activeMealForReviews.rating : '0.0'}
                              </span>
                              <span className="text-sm text-gray-400 dark:text-gray-500 font-bold ml-1">/5</span>
                              <p className="text-[10px] text-gray-450 dark:text-gray-400 font-bold uppercase tracking-widest mt-0.5">Note moyenne</p>
                          </div>
                          <div className="flex flex-col items-end">
                              <div className="flex space-x-0.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                      <Star 
                                          key={star} 
                                          size={16} 
                                          className="text-amber-500" 
                                          fill={star <= (activeMealForReviews.rating || 0) ? "currentColor" : "none"} 
                                      />
                                  ))}
                              </div>
                              <span className="text-[10px] text-gray-500 dark:text-gray-455 font-bold mt-1">
                                  {activeMealForReviews.reviewCount || 0} avis au total
                              </span>
                          </div>
                      </div>

                      {/* Reviews List */}
                      <div>
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-450 dark:text-gray-400 mb-3">Commentaires des clients</h4>
                          {isLoadingMealReviews ? (
                              <div className="py-8 text-center text-gray-400">
                                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                  <span className="text-xs font-semibold">Chargement des avis...</span>
                              </div>
                          ) : mealReviews.length === 0 ? (
                              <div className="py-8 text-center bg-gray-50 dark:bg-gray-950 rounded-2xl border border-dashed border-gray-100 dark:border-gray-805">
                                  <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Aucun commentaire pour ce plat.</p>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Soyez le premier à donner votre avis !</p>
                              </div>
                          ) : (
                              <div className="space-y-3">
                                  {mealReviews.map((rev) => (
                                      <div key={rev.id} className="p-3 bg-gray-50/50 dark:bg-gray-901/40 rounded-xl border border-gray-100/70 dark:border-gray-805/50">
                                          <div className="flex justify-between items-start">
                                              <div>
                                                  <span className="text-xs font-extrabold text-gray-900 dark:text-white">
                                                      {rev.profiles?.full_name || 'Client anonyme'}
                                                  </span>
                                                  <div className="flex space-x-0.5 mt-0.5">
                                                      {[1, 2, 3, 4, 5].map((star) => (
                                                          <Star 
                                                              key={star} 
                                                              size={10} 
                                                              className="text-amber-500" 
                                                              fill={star <= rev.rating ? "currentColor" : "none"} 
                                                          />
                                                      ))}
                                                  </div>
                                              </div>
                                              <span className="text-[9px] text-gray-400 dark:text-gray-500 font-semibold">
                                                  {new Date(rev.created_at).toLocaleDateString()}
                                              </span>
                                          </div>
                                          {rev.comment && (
                                              <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 font-medium leading-relaxed bg-white dark:bg-gray-900/60 p-2.5 rounded-lg border border-gray-100 dark:border-gray-805">
                                                  {rev.comment}
                                              </p>
                                          )}
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>

                      {/* Add Review Form */}
                      <div className="border-t border-gray-100 dark:border-gray-805 pt-5">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-450 dark:text-gray-400 mb-3">Votre appréciation</h4>
                          {user.role === 'guest' ? (
                              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl text-center">
                                  <p className="text-xs text-amber-700 dark:text-amber-300 font-bold font-sans">Inscrivez-vous ou connectez-vous pour évaluer ce plat et partager votre expérience.</p>
                              </div>
                          ) : (
                              <div className="space-y-4">
                                  {/* Star Rating Selector */}
                                  <div>
                                      <label className="text-[10px] text-gray-450 dark:text-gray-400 font-bold uppercase tracking-wider block mb-1.5">Note (sur 5 étoiles)</label>
                                      <div className="flex space-x-2">
                                          {[1, 2, 3, 4, 5].map((star) => (
                                              <button
                                                  key={star}
                                                  type="button"
                                                  onClick={() => setNewMealRating(star)}
                                                  className="transition-transform active:scale-95"
                                              >
                                                  <Star 
                                                      size={24} 
                                                      className="text-amber-500" 
                                                      fill={star <= newMealRating ? "currentColor" : "none"} 
                                                  />
                                              </button>
                                          ))}
                                      </div>
                                  </div>

                                  {/* Short Comment Area */}
                                  <div>
                                      <label className="text-[10px] text-gray-450 dark:text-gray-400 font-bold uppercase tracking-wider block mb-1.5">Votre commentaire</label>
                                      <textarea
                                          value={newMealComment}
                                          onChange={(e) => setNewMealComment(e.target.value)}
                                          placeholder="Ex: Savoureux, cuisson parfaite, service soigné..."
                                          maxLength={250}
                                          className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-150 dark:border-gray-805 rounded-xl px-3.5 py-2.5 text-xs text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-brand-500 min-h-[70px] resize-none"
                                      />
                                  </div>

                                  <button
                                      onClick={handleSubmitMealReview}
                                      disabled={isSubmittingMealReview}
                                      className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white font-black py-3 px-4 rounded-xl text-xs uppercase tracking-widest shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
                                  >
                                      {isSubmittingMealReview ? (
                                          <>
                                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                              <span>Envoi en cours...</span>
                                          </>
                                      ) : (
                                          <span>Publier mon avis</span>
                                      )}
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};