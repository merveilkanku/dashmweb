import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { MOCK_RESTAURANTS, KINSHASA_CENTER_LAT, KINSHASA_CENTER_LNG } from './constants';
import { Restaurant, User, UserRole, MenuItem, BusinessType, Theme, Language, AppFont } from './types';
import { AuthScreen } from './components/AuthScreen';
import { CustomerView } from './components/CustomerView';
import { BusinessDashboard } from './BusinessDashboard';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { DeliveryView } from './components/DeliveryView';
import { SplashScreen } from './components/SplashScreen';
import { SecurityLock } from './components/SecurityLock';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { PaymentResult } from './components/PaymentResult';
import { AlertTriangle, Store, ArrowRight, Zap } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { initializeCapacitorPush } from './utils/notifications';
import { analytics } from './utils/analytics';

const OfflineBanner = ({ isSupabaseReachable }: { isSupabaseReachable: boolean }) => (!isSupabaseReachable) ? (
  <div className="bg-red-600 text-white text-[10px] sm:text-xs font-bold px-4 py-2 text-center flex justify-center items-center sticky top-0 z-[100] shadow-lg animate-in slide-in-from-top duration-300">
      <AlertTriangle size={14} className="mr-2 shrink-0" />
      <span className="mr-3">Erreur de connexion Supabase (Serveur injoignable)</span>
      <button 
        onClick={() => window.location.reload()}
        className="bg-white text-red-600 px-2 py-0.5 rounded-md hover:bg-red-50 transition-colors uppercase text-[9px]"
      >
        Réessayer
      </button>
  </div>
) : null;

function App() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [adminClientMode, setAdminClientMode] = useState(false);
  const [showAuth, setShowAuth] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset'>('login');
  
  // Détection initiale (réservée à la récupération de mot de passe avec type=recovery ou l'URL explicite)
  const isRecoveryUrl = window.location.pathname === '/reset-password' ||
                        window.location.hash.includes('type=recovery') || 
                        window.location.href.includes('type=recovery');

  const [isRecoveryMode, setIsRecoveryMode] = useState(isRecoveryUrl);
  const [loading, setLoading] = useState(!isRecoveryUrl);
  const [showSplash, setShowSplash] = useState(!isRecoveryUrl);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState("Démarrage de DashMeals...");
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isSupabaseReachable, setIsSupabaseReachable] = useState(true);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [isAppInitializing, setIsAppInitializing] = useState(true);
  const [restaurantsLoaded, setRestaurantsLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Coordonner la fermeture du loader une fois à 100%
  useEffect(() => {
    if (loadingProgress >= 100 && loading) {
      const timer = setTimeout(() => {
        setLoading(false);
        setIsAppInitializing(false);
      }, 500); // Court délai pour apprécier les 100% et assurer une transition fluide
      return () => clearTimeout(timer);
    }
  }, [loadingProgress, loading]);

  // Incrémentation automatique et progressive lente pour donner de la vie au chargement si le réseau est lent
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev < 95) {
          // Ralentit à mesure qu'on approche de 95% pour ne pas devancer le chargement réel
          const step = prev < 40 ? 4 : prev < 70 ? 2 : prev < 90 ? 1 : 0.5;
          return Math.min(prev + step, 95);
        }
        return prev;
      });
    }, 180);
    return () => clearInterval(interval);
  }, [loading]);

  // Failsafe pour les utilisateurs connectés : si la session est résolue et qu'on reste bloqué au chargement, on force l'accès après 3.5 secondes
  useEffect(() => {
    if (loading && currentUser) {
      const timer = setTimeout(() => {
        console.warn("🛡️ [App] Failsafe connecté déclenché : accès direct autorisé pour l'utilisateur connecté.");
        setLoadingProgress(100);
        setLoadingStatus("Données prêtes ! Redirection vers votre espace...");
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [loading, currentUser]);
  
  // KPay Payment Detection
  const queryParams = new URLSearchParams(window.location.search);
  const paymentStatus = queryParams.get('payment_status') as 'success' | 'cancel' | 'failed' | null;

  // Synchroniser Firebase Analytics avec l'utilisateur connecté
  useEffect(() => {
    if (currentUser) {
      analytics.setUserId(currentUser.id);
      analytics.setUserProperty('role', currentUser.role);
      analytics.setUserProperty('city', currentUser.city || 'Kinshasa');
      analytics.logEvent('login', {
        userId: currentUser.id,
        role: currentUser.role,
        method: currentUser.id.startsWith('mock-') ? 'demo' : 'email'
      });

      // Enregistrer l'écran d'accueil correspondant au rôle
      if (currentUser.role === 'superadmin') {
        analytics.setScreenName('SuperAdminDashboard');
      } else if (currentUser.role === 'delivery') {
        analytics.setScreenName('DeliveryDashboard');
      } else if (currentUser.role === 'business') {
        analytics.setScreenName('BusinessDashboard');
      } else {
        analytics.setScreenName('CustomerDashboard');
      }
    } else {
      analytics.setUserId(null);
      analytics.setUserProperty('role', null);
      analytics.setUserProperty('city', null);
      analytics.setScreenName('AuthScreen');
    }
  }, [currentUser]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Connexion internet rétablie", { icon: '🌐' });
      // Retry charging data when back online
      fetchRestaurants();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.error("Vous êtes hors ligne. Certaines fonctionnalités peuvent être limitées.", { icon: '📡' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Capture immédiate du jeton dans l'URL (Deep Link ou Redirection localhost)
    const handleUrlAuth = async (urlStr: string) => {
      try {
        if (!urlStr || (!urlStr.includes('access_token=') && !urlStr.includes('refresh_token='))) return;

        console.log("🔍 [Auth] Analyse URL pour jeton...");
        
        // Extraction manuelle robuste (le hash n'est pas toujours géré par URLSearchParams nativement après un redirect)
        const getParam = (name: string) => {
          const regex = new RegExp('[#?&]' + name + '=([^&#]*)');
          const results = regex.exec(urlStr);
          return results ? decodeURIComponent(results[1]) : null;
        };

        const accessToken = getParam('access_token');
        const refreshToken = getParam('refresh_token');

        if (accessToken) {
          // --- EVITER LE PROBLÈME DE REBOOT INTENT SUR APK ---
          // Si on a déjà traité ce jeton avec succès, on l'ignore pour éviter qu'Android n'écrive par-dessus la session
          const lastToken = localStorage.getItem('dashmeals_last_auth_token');
          if (lastToken === accessToken) {
            console.log("⏭️ [Auth] Jeton d'accès déjà traité lors d'une session précédente. Ignoré de façon préventive.");
            return;
          }

          console.log("🔑 [Auth] Jeton trouvé. Synchronisation Supabase...");
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          
          if (error) {
            console.error('❌ [Auth] Erreur setSession:', error.message);
            if (error.message.includes('expired')) {
              toast.error("Le lien a expiré. Veuillez recommencer.");
            }
          } else if (data.session) {
            console.log('✅ [Auth] Session activée via URL');
            // Enregistrer le token traité avec succès pour éviter que le reboot ne le traite de nouveau
            localStorage.setItem('dashmeals_last_auth_token', accessToken);
            toast.success("Connexion réussie !");
            
            // Si on est dans une popup d'authentification (Google OAuth), on informe la fenêtre parente
            if (window.opener && window.opener !== window) {
              console.log("📤 [Auth] Envoi du signal de succès à la fenêtre parente...");
              window.opener.postMessage({ 
                type: 'OAUTH_SUCCESS', 
                session: data.session 
              }, window.location.origin);
              
              // Un court délai avant de fermer pour s'assurer que le message est envoyé
              setTimeout(() => {
                window.close();
              }, 1000);
              return;
            }
            
            // Nettoyage impératif pour éviter les boucles au refresh (sécurisé sous try-catch pour Android WebView)
            try {
              if (window.history.replaceState) {
                const cleanUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
              }
            } catch (historyErr) {
              console.warn("⚠️ Impossible de nettoyer l'historique de la plateforme locale:", historyErr);
            }
          }
        }
      } catch (e) {
        console.error("❌ [Auth] Erreur critique parsing URL auth:", e);
      }
    };

    // Vérifier au chargement
    handleUrlAuth(window.location.href);

    // Deep link handling for Capacitor (Supabase OAuth) - sécurisé et réservé aux APKs natives
    let appOpenListener: any = null;
    if (Capacitor.isNativePlatform()) {
      try {
        CapApp.addListener('appUrlOpen', async (data: any) => {
          console.log('🔗 [App] Deep link reçu :', data.url);
          handleUrlAuth(data.url);
        }).then(listener => {
          appOpenListener = listener;
        });
      } catch (err) {
        console.error("❌ [App] Erreur lors de l'initialisation du listener CapApp appUrlOpen:", err);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (appOpenListener && typeof appOpenListener.remove === 'function') {
        try {
          appOpenListener.remove();
        } catch (removeErr) {
          console.error("❌ Erreur retrait listener App:", removeErr);
        }
      }
    };
  }, []);
  
  // Settings States
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('dashmeals_theme') as Theme) || 'light');
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('dashmeals_language') as Language) || 'fr');
  const [font, setFont] = useState<AppFont>(() => (localStorage.getItem('dashmeals_font') as AppFont) || 'facebook');

  // États pour la création manuelle de restaurant (Fallback)
  const [newRestoName, setNewRestoName] = useState('');
  const [newRestoType, setNewRestoType] = useState<BusinessType>('restaurant');
  const [creationLoading, setCreationLoading] = useState(false);
  const isFetchingProfile = useRef(false);
  const isRestaurantsLoaded = useRef(false);
  const lastFetchedUserId = useRef<string | null>(null);
  const fetchRestaurantsRequestId = useRef(0);

  // Apply & Persist Theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('dashmeals_theme', theme);
  }, [theme]);

  // Persist Language
  useEffect(() => {
    localStorage.setItem('dashmeals_language', language);
  }, [language]);

  // Presence online status (heartbeat Facebook style)
  useEffect(() => {
    if (!currentUser || !currentUser.id || currentUser.id.startsWith('mock-') || currentUser.role === 'guest') return;

    const updatePresence = async () => {
      try {
        await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', currentUser.id);
      } catch (err) {
        console.error("Presency status update failed", err);
      }
    };

    // Premier appel immédiat
    updatePresence();

    // Puis toutes les 30 secondes
    const interval = setInterval(updatePresence, 30000);

    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // Global Keyboard Handling (Scroll into view)
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        // Only scroll if it's a small screen (mobile/tablets) where keyboard might hide field
        if (window.innerHeight < 800) {
          setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      }
    };
    window.addEventListener('focusin', handleFocus);
    return () => window.removeEventListener('focusin', handleFocus);
  }, []);

  // Apply & Persist Font
  useEffect(() => {
    if (currentUser?.settings?.appLockEnabled) {
      setIsAppLocked(true);
    } else {
      setIsAppLocked(false);
    }
  }, [currentUser?.id, currentUser?.settings?.appLockEnabled]);

  useEffect(() => {
    // Update the global sans font variable to match the selected font
    const fontValue = `var(--font-${font})`;
    document.documentElement.style.setProperty('--font-sans', fontValue);
    // Also force it on body to ensure it overrides any Tailwind defaults
    document.body.style.fontFamily = fontValue;
    localStorage.setItem('dashmeals_font', font);
  }, [font]);

  // Refs to avoid stale closures in timeouts
  const loadingRef = useRef(loading);
  const initializingRef = useRef(isAppInitializing);
  const currentUserRef = useRef(currentUser);

  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { initializingRef.current = isAppInitializing; }, [isAppInitializing]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Standalone global watchdog for ultra-fast native/web rendering bypass (6.0s fail-safe window)
  useEffect(() => {
    const watchdogTimer = setTimeout(() => {
      if (initializingRef.current || loadingRef.current) {
        console.warn("🛡️ [App] Standalone Watchdog: Completing progress to bypass any loader hang.");
        setLoadingProgress(100);
        setLoadingStatus("Démarrage en mode fail-safe...");
        setShowSplash(false);
      }
    }, 6000); // 6.0 second fail-safe watchdog window

    return () => clearTimeout(watchdogTimer);
  }, []);

  // Initialisation et écoute de la session
  useEffect(() => {
    const initSession = async () => {
      console.log("🚀 [Auth] Début initSession");
      setIsAppInitializing(true);
      setLoadingProgress(10);
      setLoadingStatus("Initialisation de la session sécurisée...");

      // Force le stop du loading après 15.0s quoi qu'il arrive (Fail-safe)
      const safetyTimer = setTimeout(() => {
        if (initializingRef.current || loadingRef.current) {
          console.warn("⚠️ [Auth] Safety timeout. Completing progress.");
          setLoadingProgress(100);
          setLoadingStatus("Lancement de l'application...");
          setShowSplash(false);
        }
      }, 15000);

      try {
        if (isRecoveryMode) {
          setAuthMode('reset');
          setShowAuth(true);
          clearTimeout(safetyTimer);
          setLoading(false);
          setIsAppInitializing(false);
          return;
        }

        // We removed the eager fetchRestaurants here to wait for session resolution to optimize load times!

        // Récupération instantanée de la session locale Supabase avec timeout de sécurité de 10.0s
        let session = null;
        try {
          const getSessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 10000)
          );
          const sessionRes = await Promise.race([getSessionPromise, timeoutPromise]) as any;
          session = sessionRes.data?.session;
        } catch (sessionErr: any) {
          console.warn("⚠️ [Auth] getSession() s'est bloquée ou a échoué (réseau lent), tentative de récupération directe locale...", sessionErr.message);
          try {
            const keys = Object.keys(localStorage);
            const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
            if (sbKey) {
              const rawData = localStorage.getItem(sbKey);
              if (rawData) {
                const parsed = JSON.parse(rawData);
                if (parsed && parsed.user) {
                  console.log("📂 [Auth] Session récupérée manuellement depuis le stockage local !");
                  session = parsed;
                }
              }
            }
          } catch (storageErr) {
            console.error("❌ [Auth] Impossible de parser le token local:", storageErr);
          }
        }

        if (session) {
          console.log("✅ [Auth] Session active trouvée:", session.user.email);
          
          // EFFICIENT FAST PROVISIONAL LOGIN TO PREVENT BLOCKING LOADER SCREENS!
          // We immediately extract metadata and set a provisional user to dismiss any loading spinners and transition to the app,
          // while fetchUserProfile synchronizes latest complete profile records from the database in the background!
          if (!currentUserRef.current) {
            const metadata = session.user.user_metadata || {};
            const savedRole = localStorage.getItem(`dashmeals_role_${session.user.id}`);
            const computedRole = savedRole || metadata.role || 'client';
            
            // Special rule for the super admin email
            let finalRole = computedRole;
            if (session.user.email && session.user.email.toLowerCase().trim() === 'irmerveilkanku@gmail.com') {
              finalRole = 'superadmin';
            }

            const pendingAuthStr = localStorage.getItem('dashmeals_pending_auth');
            const pendingAuthData = pendingAuthStr ? JSON.parse(pendingAuthStr) : null;

            const provisionalUser: User = {
              id: session.user.id,
              email: session.user.email!,
              name: pendingAuthData?.name || metadata.full_name || metadata.name || session.user.email!.split('@')[0],
              role: finalRole as UserRole,
              city: pendingAuthData?.city || metadata.city || 'Kinshasa',
              phoneNumber: pendingAuthData?.phone || metadata.phone_number || '',
              avatarUrl: metadata.avatar_url || '',
              settings: {
                notifPush: true,
                notifEmail: true,
                notifSms: false,
                twoFactorEnabled: false,
                appLockEnabled: false,
                appLockPin: null,
                biometricsEnabled: false
              }
            };
            
            console.log("⚡ [Auth] Fast provisional user loaded instantly on init:", provisionalUser.name, "(Role:", provisionalUser.role, ")");
            setCurrentUser(provisionalUser);
            currentUserRef.current = provisionalUser;
          }

          setShowAuth(false);
          setLoadingProgress(35);
          setLoadingStatus("Session active, chargement de votre profil...");

          // Force fetching the full profile from postgres in the background
          if (!isFetchingProfile.current) {
            fetchUserProfile(session.user.id, session.user.email!, session.user.user_metadata);
          }
        } else {
          // Fallback local instantané (staff, sub-admin ou hors-ligne de secours)
          const subAdminSession = localStorage.getItem('dashmeals_subadmin_session');
          const staffSession = localStorage.getItem('dashmeals_staff_session');
          if (subAdminSession) {
            console.log("📂 [Auth] Session locale (sous-admin) trouvée");
            const sa = JSON.parse(subAdminSession);
            const user: User = {
              id: sa.id || `sub-${Date.now()}`,
              name: sa.full_name,
              email: sa.email,
              role: 'superadmin',
              city: 'Kinshasa',
              phoneNumber: sa.phone_number || '',
              simulatedSubAdmin: sa
            };
            if (!currentUserRef.current) {
              setCurrentUser(user);
              lastFetchedUserId.current = user.id;
              setShowAuth(false);
            }
          } else if (staffSession) {
            console.log("📂 [Auth] Session locale (staff) trouvée");
            const user = JSON.parse(staffSession);
            if (!currentUserRef.current) {
              setCurrentUser(user);
              lastFetchedUserId.current = user.id;
              setShowAuth(false);
            }
          } else {
            console.log("👤 [Auth] Pas de session active.");
            setShowAuth(true);
            setIsAppInitializing(false);
            setLoading(false);
          }
        }
        
        // NOW we fetch restaurants after we have evaluated the user role!
        fetchRestaurants().catch(err => {
          console.error("❌ [Restaurants] Erreur chargement asynchrone après init:", err);
        });

      } catch (err) {
        console.error("❌ [Auth] Erreur critique initSession:", err);
      } finally {
        clearTimeout(safetyTimer);
        // On ne coupe loading/initializing QUE si on n'a pas de session en cours de chargement
        if (!isFetchingProfile.current && !currentUserRef.current) {
          setIsAppInitializing(false);
          setLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`🔔 [Auth] Event: ${event}`);
      
      // On sort immédiatement du callback avant tout appel réseau Supabase
      setTimeout(async () => {
        if (event === 'SIGNED_IN') {
          if (session?.user) {
            console.log(`📡 [Auth] ${event} pour ${session.user.email}`);
            
            // Refresh restaurants to ensure fresh state upon login
            fetchRestaurants().catch(console.error);

            // EFFICIENT FAST PROVISIONAL LOGIN TO PREVENT BLOCKING LOADER SCREENS!
            // Instantly set a provisional user based on the Auth session metadata and transition immediately.
            if (!currentUserRef.current || currentUserRef.current.id !== session.user.id) {
              const metadata = session.user.user_metadata || {};
              const savedRole = localStorage.getItem(`dashmeals_role_${session.user.id}`);
              const computedRole = savedRole || metadata.role || 'client';
              
              let finalRole = computedRole;
              if (session.user.email && session.user.email.toLowerCase().trim() === 'irmerveilkanku@gmail.com') {
                finalRole = 'superadmin';
              }

              const pendingAuthStr2 = localStorage.getItem('dashmeals_pending_auth');
              const pendingAuthData2 = pendingAuthStr2 ? JSON.parse(pendingAuthStr2) : null;

              const provisionalUser: User = {
                id: session.user.id,
                email: session.user.email!,
                name: pendingAuthData2?.name || metadata.full_name || metadata.name || session.user.email!.split('@')[0],
                role: finalRole as UserRole,
                city: pendingAuthData2?.city || metadata.city || 'Kinshasa',
                phoneNumber: pendingAuthData2?.phone || metadata.phone_number || '',
                avatarUrl: metadata.avatar_url || metadata.picture || '',
                settings: {
                  notifPush: true,
                  notifEmail: true,
                  notifSms: false,
                  twoFactorEnabled: false,
                  appLockEnabled: false,
                  appLockPin: null,
                  biometricsEnabled: false
                }
              };
              
              console.log("⚡ [Auth] Fast provisional user loaded instantly on event:", provisionalUser.name, "(Role:", provisionalUser.role, ")");
              setCurrentUser(provisionalUser);
              currentUserRef.current = provisionalUser;
            }

            setShowAuth(false);
            setLoading(true);
            setLoadingProgress(20);
            setLoadingStatus("Connexion réussie, synchronisation...");
            
            // Fetch real profile table data in the background
            fetchUserProfile(session.user.id, session.user.email!, session.user.user_metadata);
          }
        }
        
        if (event === 'SIGNED_OUT') {
          // Délai de sécurité : un TOKEN_REFRESHED peut déclencher un faux SIGNED_OUT
          // on attend 300ms avant de vérifier si la session est vraiment morte
          await new Promise(resolve => setTimeout(resolve, 300));
          
          try {
            const { data: { session: activeSession } } = await supabase.auth.getSession();
            if (!activeSession) {
              // Vérification supplémentaire : si on a un user business/delivery,
              // ne pas déconnecter sauf si le localStorage est aussi vide
              const hasLocalStaff = !!localStorage.getItem('dashmeals_staff_session');
              if (currentUserRef.current && !hasLocalStaff) {
                console.log('👋 [Auth] SIGNED_OUT confirmé, déconnexion.');
                setCurrentUser(null);
                lastFetchedUserId.current = null;
                localStorage.removeItem('dashmeals_staff_session');
                setShowAuth(true);
              }
            } else {
              console.log('📡 [Auth] Faux SIGNED_OUT ignoré — session active trouvée.');
            }
          } catch (e) {
            console.warn('⚠️ [Auth] Erreur vérification SIGNED_OUT:', e);
          }
          setIsAppInitializing(false);
          setLoading(false);
        }

        if (event === 'PASSWORD_RECOVERY') {
          setAuthMode('reset');
          setShowAuth(true);
        }
      }, 0);
    });

    initSession();
    return () => subscription.unsubscribe();
  }, []);

    const fetchUserProfile = async (userId: string, email: string, metadata: any = {}): Promise<void> => {
    if (isFetchingProfile.current && lastFetchedUserId.current === userId) {
        console.log("⏳ [Auth] fetchUserProfile déjà en cours pour cet utilisateur, on ignore l'appel doublon");
        return;
    }
    
    isFetchingProfile.current = true;
    lastFetchedUserId.current = userId; 
    
    // Fail-safe global pour fetchUserProfile (10 secondes max)
    const profileTimeout = setTimeout(() => {
        if (isFetchingProfile.current && lastFetchedUserId.current === userId) {
            console.warn("⚠️ [Auth] fetchUserProfile total timeout triggered. Forcing profile creation.");
            
            const pendingAuthDataStr = localStorage.getItem('dashmeals_pending_auth');
            const pendingAuthData = pendingAuthDataStr ? JSON.parse(pendingAuthDataStr) : null;
            
            let expectedRole = 'client';
            let expectedCity = 'Kinshasa';
            let expectedPhone = '';
            
            if (currentUserRef.current && currentUserRef.current.id === userId && currentUserRef.current.role !== 'guest') {
                expectedRole = currentUserRef.current.role;
                expectedCity = currentUserRef.current.city || 'Kinshasa';
                expectedPhone = currentUserRef.current.phoneNumber || '';
            } else {
                const savedRole = localStorage.getItem(`dashmeals_role_${userId}`);
                expectedRole = pendingAuthData?.role || metadata?.role || savedRole || 'client';
                expectedCity = pendingAuthData?.city || metadata?.city || 'Kinshasa';
                expectedPhone = pendingAuthData?.phone || metadata?.phone_number || '';
            }

            const cachedStr = localStorage.getItem(`dashmeals_cached_user_${userId}`);
            const cachedUser = cachedStr ? JSON.parse(cachedStr) : null;
            
            const virtualProfile: User = cachedUser || {
                id: userId,
                email: email,
                name: currentUserRef.current?.name || pendingAuthData?.name || metadata?.full_name || metadata?.name || email.split('@')[0],
                role: expectedRole as UserRole,
                city: expectedCity,
                phoneNumber: expectedPhone,
                avatarUrl: currentUserRef.current?.avatarUrl || metadata?.avatar_url || metadata?.picture || '',
                settings: currentUserRef.current?.settings || {
                    notifPush: true,
                    notifEmail: true,
                    notifSms: false,
                    twoFactorEnabled: false,
                    appLockEnabled: false,
                    appLockPin: null,
                    biometricsEnabled: false
                }
            };
            
            setCurrentUser(virtualProfile);
            currentUserRef.current = virtualProfile;
            setLoadingProgress(100);
            setLoadingStatus("Profil synchronisé ! Bienvenue sur DashMeals.");
            setShowAuth(false);
            setLoading(false);
            setIsAppInitializing(false);
            isFetchingProfile.current = false;
        }
    }, 10000);
    
    // On ne montre le loader principal QUE si on n'a pas encore d'utilisateur
    if (!currentUserRef.current) {
        setLoading(true);
    }
    
    try {
      console.log(`📡 [Auth] fetchUserProfile pour: ${email}`);
      setIsSupabaseReachable(true); 
      
      // 👑 FORCE SUPERADMIN FOR SPECIFIC EMAIL
      if (email && email.toLowerCase().trim() === 'irmerveilkanku@gmail.com') {
          console.log("👑 [Auth] IDENTIFIÉ COMME SUPER ADMIN");
          const superAdmin: User = {
              id: userId,
              email: email,
              name: metadata?.full_name || 'Super Admin',
              role: 'superadmin',
              city: 'Kinshasa',
              phoneNumber: metadata?.phone_number
          };
          setCurrentUser(superAdmin);
          setAdminClientMode(false);
          currentUserRef.current = superAdmin;
          setLoading(false);
          setIsAppInitializing(false);
          setShowAuth(false);
          isFetchingProfile.current = false;
          clearTimeout(profileTimeout);
          return;
      }

      const fetchProfilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      let fetchTimeoutId: NodeJS.Timeout;
      const fetchTimeoutPromise = new Promise<{ data: any, error: any }>((resolve) => 
        fetchTimeoutId = setTimeout(() => resolve({ data: null, error: new Error('TIMEOUT') }), 10000)
      );

      let profileRes = await Promise.race([fetchProfilePromise, fetchTimeoutPromise]);
      clearTimeout(fetchTimeoutId!);
      let profile = profileRes.data;
      let error = profileRes.error;

      if (error && (error.code === '42703' || error.message?.includes('column'))) {
        console.warn("⚠️ [Auth] Colonnes profiles manquantes, tentative avec sélection minimale...");
        const fallbackPromise = supabase
          .from('profiles')
          .select('id, email, full_name, role, city, phone_number, settings, delivery_info')
          .eq('id', userId)
          .maybeSingle();
        
        const fallbackTimeoutPromise = new Promise<{ data: any, error: any }>((resolve) => 
          fetchTimeoutId = setTimeout(() => resolve({ data: null, error: new Error('TIMEOUT') }), 10000)
        );
        const fallbackRes = await Promise.race([fallbackPromise, fallbackTimeoutPromise]);
        clearTimeout(fetchTimeoutId!);
        profile = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
          console.warn(`Erreur lecture profil:`, error.message);
          
          // CRITICAL FAIL-SAFE: Instead of throwing a database schema cache error (which would result in Guest mode redirect),
          // we gracefully fallback to a memory-based profile using registration details/metadata!
          console.warn("⚠️ [Auth] Erreur de base de données fatale ou cache Supabase détecté. Utilisation d'un profil virtuel pour autoriser la connexion.", error.message);
          
          const pendingAuthDataStr = localStorage.getItem('dashmeals_pending_auth');
          const pendingAuthData = pendingAuthDataStr ? JSON.parse(pendingAuthDataStr) : null;

          profile = {
              id: userId,
              full_name: pendingAuthData?.name || metadata?.full_name || metadata?.name || email.split('@')[0],
              email: email,
              role: pendingAuthData?.role || metadata?.role || 'client', 
              city: pendingAuthData?.city || metadata?.city || 'Kinshasa',
              phone_number: pendingAuthData?.phone || metadata?.phone_number || '',
              avatar_url: metadata?.avatar_url || metadata?.picture || '',
              created_at: new Date().toISOString()
          };
      }

      // Si pas de profil ou erreur, création profil par défaut (ou migration d'un profil pré-existant par email)
      if (!profile) {
        console.log("🆕 [Auth] Profil introuvable, vérification d'un profil pré-existant par e-mail...");
        
        let preExistingProfileByEmail = null;
        try {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();
          preExistingProfileByEmail = data;
        } catch (err) {
          console.warn("⚠️ Impossible de vérifier le profil pré-existant par e-mail:", err);
        }

        const pendingAuthDataStr = localStorage.getItem('dashmeals_pending_auth');
        const pendingAuthData = pendingAuthDataStr ? JSON.parse(pendingAuthDataStr) : null;

        let profileToUpsert = null;

        if (preExistingProfileByEmail) {
          console.log("🔗 Profil pré-existant trouvé par e-mail, migration en cours de l'ID temporaire vers l'ID utilisateur réel...");
          try {
            await supabase.from('profiles').delete().eq('id', preExistingProfileByEmail.id);
          } catch (err) {
            console.warn("⚠️ Impossible de supprimer l'ancien profil temporaire:", err);
          }
          
          const chosenRole = pendingAuthData?.role || metadata?.role || preExistingProfileByEmail.role || 'client';
          profileToUpsert = {
            ...preExistingProfileByEmail,
            id: userId,
            role: (preExistingProfileByEmail.role && preExistingProfileByEmail.role !== 'client') ? preExistingProfileByEmail.role : chosenRole,
            full_name: preExistingProfileByEmail.full_name || pendingAuthData?.name || metadata?.full_name || metadata?.name || email.split('@')[0],
            phone_number: preExistingProfileByEmail.phone_number || pendingAuthData?.phone || metadata?.phone_number || '',
            city: preExistingProfileByEmail.city || pendingAuthData?.city || metadata?.city || 'Kinshasa',
          };
        } else {
          profileToUpsert = {
              id: userId,
              full_name: pendingAuthData?.name || metadata?.full_name || metadata?.name || email.split('@')[0],
              email: email,
              role: pendingAuthData?.role || metadata?.role || 'client', 
              city: pendingAuthData?.city || metadata?.city || 'Kinshasa',
              phone_number: pendingAuthData?.phone || metadata?.phone_number || '',
              avatar_url: metadata?.avatar_url || metadata?.picture || '',
              created_at: new Date().toISOString()
          };
        }

        const { data: created, error: insertError } = await supabase
            .from('profiles')
            .upsert(profileToUpsert)
            .select()
            .single();
        
        if (insertError) {
            console.warn("⚠️ Erreur création profil DB:", insertError.message);
            profile = profileToUpsert; // Fallback mémoire
        } else {
            profile = created;
        }
      }

        if (profile) {
          let businessId = profile.business_id;
          let computedRole = profile.role as UserRole;

          // ── PRIORITÉ 1 : préserver le rôle provisoire si déjà non-client ──
          // Si on a déjà un user en mémoire avec un rôle business/delivery/superadmin,
          // on ne le rétrograde JAMAIS vers 'client' depuis la DB.
          if (
            currentUserRef.current &&
            currentUserRef.current.id === userId &&
            currentUserRef.current.role !== 'client' &&
            currentUserRef.current.role !== 'guest' &&
            (computedRole === 'client' || !computedRole)
          ) {
            console.log(
              `🛡️ [Auth] Role guard: DB returned '${computedRole}' but keeping '${currentUserRef.current.role}' from provisional user`
            );
            computedRole = currentUserRef.current.role;
            businessId = businessId || currentUserRef.current.businessId;
          }

          // ── PRIORITÉ 2 : superadmin par email ──
          if (email && email.toLowerCase().trim() === 'irmerveilkanku@gmail.com') {
            computedRole = 'superadmin';
          }

          // ── PRIORITÉ 2.5 & 3 : Deep merge metadata and DB profile ──
          try {
            const pendingAuthDataStr = localStorage.getItem('dashmeals_pending_auth');
            const pendingAuthData = pendingAuthDataStr ? JSON.parse(pendingAuthDataStr) : null;
            
            let profileNeedsUpdate = false;
            const updates: any = {};

            const expectedRole = pendingAuthData?.role || metadata?.role;
            const expectedCity = pendingAuthData?.city || metadata?.city;
            const expectedPhone = pendingAuthData?.phone || metadata?.phone_number;

            // Merge Role
            if (expectedRole && expectedRole !== 'client' && computedRole !== expectedRole) {
              computedRole = expectedRole as UserRole;
              updates.role = computedRole;
              profileNeedsUpdate = true;
            } else if ((metadata?.role === 'business' || metadata?.role === 'delivery') && (computedRole === 'client' || !computedRole)) {
              computedRole = metadata.role as UserRole;
              updates.role = computedRole;
              profileNeedsUpdate = true;
            }

            // Merge City
            if (expectedCity && (!profile.city || profile.city === 'Kinshasa') && profile.city !== expectedCity) {
              updates.city = expectedCity;
              profile.city = expectedCity;
              profileNeedsUpdate = true;
            }

            // Merge Phone
            if (expectedPhone && !profile.phone_number) {
              updates.phone_number = expectedPhone;
              profile.phone_number = expectedPhone;
              profileNeedsUpdate = true;
            }

            // Merge Name (Google OAuth full_name)
            const expectedName = pendingAuthData?.name || metadata?.full_name || metadata?.name;
            if (expectedName && (!profile.full_name || profile.full_name === 'Utilisateur' || profile.full_name === email.split('@')[0]) && profile.full_name !== expectedName) {
              updates.full_name = expectedName;
              profile.full_name = expectedName;
              profileNeedsUpdate = true;
            }

            // Avatar URL (Google OAuth picture)
            if (metadata?.picture && profile.avatar_url !== metadata?.picture && !metadata?.avatar_url) {
                updates.avatar_url = metadata.picture;
                profile.avatar_url = metadata.picture;
                profileNeedsUpdate = true;
            } else if (metadata?.avatar_url && profile.avatar_url !== metadata?.avatar_url) {
                updates.avatar_url = metadata.avatar_url;
                profile.avatar_url = metadata.avatar_url;
                profileNeedsUpdate = true;
            }

            if (profileNeedsUpdate) {
               console.warn(`🛡️ [Auth] Deep merging missing metadata into profile DB:`, updates);
               supabase.from('profiles').update(updates).eq('id', userId)
                 .then(({ error }) => {
                   if (error) {
                     console.error("❌ [Auth] Error updating profile metadata (RLS issue?):", error);
                   } else if (pendingAuthData) {
                     localStorage.removeItem('dashmeals_pending_auth');
                   }
                 });
            }
          } catch (_) {}

          // ── PRIORITÉ 4 : auto-healing business (cherche restaurant) ──
          if (computedRole === 'client' || !computedRole) {
            try {
              const { data: dbResto } = await supabase
                .from('restaurants')
                .select('id')
                .eq('owner_id', userId)
                .maybeSingle();
              if (dbResto) {
                computedRole = 'business';
                businessId = dbResto.id;
                supabase.from('profiles')
                  .update({ role: 'business', business_id: dbResto.id })
                  .eq('id', userId).then(() => {});
              }
            } catch (_) {}
          }

          // ── Construction finale ──
          if (!businessId && computedRole === 'business') {
            const userRestaurant = restaurants.find(r => r.ownerId === userId);
            if (userRestaurant) {
              businessId = userRestaurant.id;
            } else {
              const { data: restoData } = await supabase
                .from('restaurants').select('id').eq('owner_id', userId).maybeSingle();
              if (restoData) businessId = restoData.id;
            }
          }

          const userData: User = {
            id: userId,
            email,
            name: profile.full_name || profile.settings?.fullName || metadata?.full_name || metadata?.name || 'Utilisateur',
            role: computedRole,
            city: profile.city || profile.settings?.city || metadata?.city || 'Kinshasa',
            phoneNumber: profile.phone_number || profile.settings?.phoneNumber || metadata?.phone_number || '',
            avatarUrl: profile.avatar_url || profile.settings?.avatarUrl || metadata?.avatar_url || metadata?.picture || '',
            businessId,
            deliveryInfo: profile.delivery_info,
            settings: profile.settings || {
              notifPush: true, notifEmail: true, notifSms: false,
              twoFactorEnabled: false, appLockEnabled: false, appLockPin: null, biometricsEnabled: false
            }
          };

          // Cache user profile for robust offline/slow connections
          localStorage.setItem(`dashmeals_cached_user_${userId}`, JSON.stringify(userData));

          setCurrentUser(userData);
          setAdminClientMode(false);
          currentUserRef.current = userData;
          setIsAppInitializing(false);
          setShowAuth(false);

          if (userData.id && !userData.id.startsWith('mock-')) {
            initializeCapacitorPush(userData.id);
          }

          // Synchroniser immédiatement les restaurants avec le vrai profil utilisateur résolu !
          console.log("📡 [Auth] Synchronisation immédiate des restaurants pour le profil connecté...");
          await fetchRestaurants();
        }
    } catch (error) {
      console.error("❌ [Auth] Erreur fetchUserProfile:", error);
      
      const cachedStr = localStorage.getItem(`dashmeals_cached_user_${userId}`);
      if (cachedStr && !currentUserRef.current) {
         console.warn("⚠️ Utilisation du profil en cache local après erreur");
         const cachedUser = JSON.parse(cachedStr);
         setCurrentUser(cachedUser);
         currentUserRef.current = cachedUser;
         setShowAuth(false);
      }
      
      // On synchronise aussi les restaurants en cas d'erreur de profil pour charger depuis le cache local ou la DB
      try {
        await fetchRestaurants();
      } catch (_) {}
      
      setIsOfflineMode(prev => {
        if (!prev) {
          toast.error("Impossible de synchroniser votre compte. Utilisation du mode restreint.", { id: 'sync-error' });
        }
        return true;
      });
    } finally {
      clearTimeout(profileTimeout);
      isFetchingProfile.current = false;
      // We ALWAYS set the loading progress to 100% and turn off loading/initializing states
      // when fetchUserProfile completes, to ensure the user is never stuck behind a loading screen.
      setLoadingProgress(100);
      setLoadingStatus("Données chargées ! Bienvenue sur DashMeals.");
      setLoading(false);
      setIsAppInitializing(false);
    }
  };

  const fetchRestaurants = useCallback(async () => {
    const requestId = ++fetchRestaurantsRequestId.current; // identifiant unique pour CET appel
    isRestaurantsLoaded.current = false;
    try {
      console.log(`📡 [Restaurants] Début chargement... (req #${requestId})`);
      let data: any[] | null = null;
      let error: any = null;

      let query = supabase
        .from('restaurants')
        .select(`
          *,
          menu_items (id, name, description, price, image, category, is_available, stock, low_stock_threshold, created_at)
        `)
        .order('created_at', { ascending: true });
        
      let fallbackQuery = supabase
          .from('restaurants')
          .select(`
            id, owner_id, type, name, description, latitude, longitude, 
            city, phone_number, is_open, is_active, rating, review_count, 
            preparation_time, estimated_delivery_time, delivery_available, 
            cover_image, currency, exchange_rate, display_currency_mode,
            is_verified, verification_status, verification_requested,
            verification_payment_status, verification_docs, created_at,
            subscription_tier, subscription_status, subscription_end_date, settings,
            menu_items (id, name, description, price, image, category, is_available, stock, low_stock_threshold, created_at)
          `)
          .order('created_at', { ascending: true });

      // Toujours récupérer l'intégralité du catalogue de restaurants pour assurer une synchronisation globale et fluide entre tous les rôles et modes de vue
      console.log(`📡 [Restaurants] Récupération globale pour synchronisation (Rôle: ${currentUserRef.current?.role || 'visiteur'})`);

      // Utilisation d'un timeout de sécurité robuste de 10.0s pour le chargement principal des restaurants
      let fetchTimeoutId: NodeJS.Timeout;
      const fetchTimeoutPromise = new Promise<{ data: any[] | null, error: any }>((resolve) => 
        fetchTimeoutId = setTimeout(() => resolve({ data: null, error: new Error('TIMEOUT') }), 10000)
      );

      const fullResultRes = await Promise.race([query, fetchTimeoutPromise]);
      clearTimeout(fetchTimeoutId!);

      data = fullResultRes.data;
      error = fullResultRes.error;

      // Fallback if columns are missing (Error 42703 or 400 with specific message)
      if (error && (error.code === '42703' || error.message?.includes('column'))) {
        console.warn("⚠️ [Restaurants] Colonnes manquantes détectées, tentative avec sélection minimale...");
        let fallbackTimeoutId: NodeJS.Timeout;
        const fallbackTimeoutPromise = new Promise<{ data: any[] | null, error: any }>((resolve) => 
          fallbackTimeoutId = setTimeout(() => resolve({ data: null, error: new Error('TIMEOUT') }), 10000)
        );
        const fallbackRes = await Promise.race([fallbackQuery, fallbackTimeoutPromise]);
        clearTimeout(fallbackTimeoutId!);
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) throw error;

      // Fetch all meal reviews with safety timeout
      let mealReviews: any[] = [];
      try {
        const fetchRevsPromise = supabase
          .from('meal_reviews')
          .select('menu_item_id, rating');
        
        let revsTimeoutId: NodeJS.Timeout;
        const revsTimeoutPromise = new Promise<{ data: any[] | null, error: any }>((resolve) => 
          revsTimeoutId = setTimeout(() => resolve({ data: null, error: new Error('TIMEOUT') }), 3000)
        );

        const revsRes = await Promise.race([fetchRevsPromise, revsTimeoutPromise]);
        clearTimeout(revsTimeoutId!);
        
        const revs = revsRes.data;
        const revsErr = revsRes.error;

        if (!revsErr && revs) {
          mealReviews = revs;
          localStorage.setItem('dashmeals_meal_reviews', JSON.stringify(revs));
        } else {
          const local = localStorage.getItem('dashmeals_meal_reviews');
          if (local) mealReviews = JSON.parse(local);
        }
      } catch (e) {
        const local = localStorage.getItem('dashmeals_meal_reviews');
        if (local) mealReviews = JSON.parse(local);
      }

      // ⛔️ Ignore si une requête plus récente a déjà été lancée entre-temps
      if (requestId !== fetchRestaurantsRequestId.current) {
        console.log(`⏭️ [Restaurants] Résultat obsolète ignoré (req #${requestId})`);
        return;
      }

      if (data && data.length > 0) {
        const mappedRestaurants: Restaurant[] = data.map((r: any) => ({
          id: r.id,
          ownerId: r.owner_id,
          type: r.type,
          name: r.name,
          description: r.description,
          latitude: Number(r.latitude) || KINSHASA_CENTER_LAT,
          longitude: Number(r.longitude) || KINSHASA_CENTER_LNG,
          city: r.city || 'Kinshasa',
          phoneNumber: r.phone_number || r.phoneNumber || r.phone || '+243812345678',
          isOpen: r.is_open === true,
          isOnline: (r.is_online === false || r.settings?.isOnline === false) ? false : true,
          isActive: r.is_active !== false,
          rating: r.rating,
          reviewCount: r.review_count,
          preparationTime: r.preparation_time,
          estimatedDeliveryTime: r.estimated_delivery_time || 20,
          deliveryAvailable: r.delivery_available,
          coverImage: r.cover_image || 'https://picsum.photos/800/600?grayscale',
          currency: r.currency || 'USD',
          exchangeRate: r.exchange_rate,
          displayCurrencyMode: r.display_currency_mode || 'dual',
          isVerified: r.is_verified || false,
          verificationRequested: r.verification_requested || false,
          verificationStatus: r.verification_status || 'unverified',
          verificationDocs: r.verification_docs,
          verificationPaymentStatus: r.verification_payment_status,
          subscriptionTier: r.subscription_tier,
          subscriptionStatus: r.subscription_status,
          subscriptionEndDate: r.subscription_end_date,
          createdAt: r.created_at,
          paymentConfig: r.payment_config || {
            acceptCash: true,
            acceptMobileMoney: false
          },
          settings: r.settings || {},
          menu: (r.menu_items || []).map((m: any) => {
            const itemReviews = mealReviews.filter((rev: any) => rev.menu_item_id === m.id);
            const avgRating = itemReviews.length > 0
              ? Number((itemReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / itemReviews.length).toFixed(1))
              : undefined;

            let itemCategory = m.category;
            let itemDesc = m.description || '';
            if (itemDesc) {
              const catMatch = itemDesc.match(/\[cat:([^\]]+)\]/);
              if (catMatch) {
                itemCategory = catMatch[1].trim();
                itemDesc = itemDesc.replace(/\[cat:[^\]]+\]/g, '').trim();
              }
            }

            return {
              id: m.id,
              name: m.name,
              description: itemDesc,
              price: Number(m.price) || 0,
              image: m.image,
              category: itemCategory,
              isAvailable: m.is_available,
              stock: m.stock !== undefined ? Number(m.stock) : undefined,
              lowStockThreshold: m.low_stock_threshold !== undefined ? Number(m.low_stock_threshold) : undefined,
              rating: avgRating,
              reviewCount: itemReviews.length,
              createdAt: m.created_at
            };
          })
        }));
        setRestaurants(mappedRestaurants);
        localStorage.setItem('dashmeals_restaurants_cache', JSON.stringify(mappedRestaurants));
        setIsOfflineMode(false);
      } else {
        console.log("ℹ️ Aucun restaurant trouvé en base. Utilisation du cache ou des données MOCK.");
        const cachedRestos = localStorage.getItem('dashmeals_restaurants_cache');
        if (cachedRestos) {
          setRestaurants(JSON.parse(cachedRestos));
        } else {
          setRestaurants(MOCK_RESTAURANTS);
        }
      }
    } catch (err: any) {
      if (requestId !== fetchRestaurantsRequestId.current) return;
      console.warn("Erreur chargement restaurants. Utilisation du cache ou des données MOCK.", err.message);
      const cachedRestos = localStorage.getItem('dashmeals_restaurants_cache');
      if (cachedRestos) {
        setRestaurants(JSON.parse(cachedRestos));
      } else {
        setRestaurants(MOCK_RESTAURANTS);
      }
      setIsOfflineMode(true);
    } finally {
      if (requestId === fetchRestaurantsRequestId.current) {
        isRestaurantsLoaded.current = true;
        setRestaurantsLoaded(true);
        setLoadingProgress(100);
        setLoadingStatus("Données chargées ! Bienvenue sur DashMeals.");
      }
    }
  }, []);

  // Realtime subscription for restaurants and menu items to ensure hot sync across all roles & tabs
  useEffect(() => {
    let syncTimeout: NodeJS.Timeout | null = null;
    const triggerSync = () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        console.log("🔄 [Realtime] Synchronisation à chaud des restaurants et des menus...");
        fetchRestaurants().catch(console.error);
      }, 500); // 500ms debounce to avoid spamming the DB
    };

    const channel = supabase
      .channel('public-restaurants-sync-all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurants'
        },
        (payload) => {
          console.log(`📡 [Realtime] Événement sur 'restaurants' (${payload.eventType}). Synchronisation en cours...`);
          triggerSync();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'menu_items'
        },
        (payload) => {
          console.log(`📡 [Realtime] Événement sur 'menu_items' (${payload.eventType}). Synchronisation en cours...`);
          triggerSync();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings'
        },
        (payload) => {
          console.log(`📡 [Realtime] Événement sur 'app_settings' (${payload.eventType}). Synchronisation des paramètres...`);
          triggerSync();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          console.log(`📡 [Realtime] Événement sur 'profiles' (${payload.eventType}). Synchronisation utilisateur...`);
          triggerSync();
          if (currentUserRef.current?.id && (payload.new as any)?.id === currentUserRef.current.id) {
             fetchUserProfile(currentUserRef.current.id, currentUserRef.current.email, currentUserRef.current);
          }
        }
      )
      .subscribe((status) => {
        console.log(`🔌 [Realtime] Restaurants channel status changed: ${status}`);
        if (status === 'CHANNEL_ERROR') {
          console.error("❌ [Realtime] Channel error on restaurants, fallback to automatic polling...");
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (syncTimeout) clearTimeout(syncTimeout);
    };
  }, []);

  // Backing up the real-time subscriptions with a reliable background polling mechanism (every 20s)
  // to guarantee restaurant profiles, menu items, prices, and stock statuses remain 100% in sync
  useEffect(() => {
    const backupInterval = setInterval(() => {
      console.log("⏱️ [App] Background backup polling of restaurants & menus...");
      fetchRestaurants().catch(console.error);
    }, 20000);
    return () => clearInterval(backupInterval);
  }, [fetchRestaurants]);

  const handleUpdateRestaurant = async (updatedResto: Restaurant) => {
    // Mise à jour de l'état local et de la persistence instantanée pour éviter les conflits et la latence
    setRestaurants(prev => {
      const next = prev.map(r => r.id === updatedResto.id ? updatedResto : r);
      localStorage.setItem('dashmeals_restaurants_cache', JSON.stringify(next));
      return next;
    });
  };

  // Fonction pour force la création du restaurant si l'automatisme a échoué
  const handleManualRestaurantCreation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setCreationLoading(true);

    const newRestaurantPayload = {
        owner_id: currentUser.id,
        name: newRestoName || "Mon Restaurant",
        type: newRestoType,
        city: currentUser.city || 'Kinshasa',
        description: `Bienvenue chez ${newRestoName}`,
        latitude: -4.325 + (Math.random() * 0.01), // Random pos near center
        longitude: 15.322 + (Math.random() * 0.01),
        is_open: true,
        preparation_time: 30,
        estimated_delivery_time: 30,
        currency: 'USD',
        exchange_rate: 2850,
        settings: {
            appearance: 'light',
            language: 'fr'
        },
        cover_image: 'https://picsum.photos/800/600?food'
    };

    try {
        // 1. Tenter l'insertion DB
        const { data, error } = await supabase
            .from('restaurants')
            .insert(newRestaurantPayload)
            .select()
            .single();

        if (error) throw error;

        // 2. Si succès, recharger
        await fetchRestaurants();
    } catch (err: any) {
        console.warn("Erreur création DB (Mode Offline activé):", err.message);
        
        // 3. Fallback Mode Offline / Démo
        const mockResto: Restaurant = {
            id: `temp-${Date.now()}`,
            ownerId: currentUser.id,
            name: newRestoName || "Mon Restaurant (Mode Démo)",
            type: newRestoType,
            city: currentUser.city || 'Kinshasa',
            description: "Restaurant créé en mode démonstration.",
            latitude: -4.325,
            longitude: 15.322,
            isOpen: true,
            rating: 5.0,
            reviewCount: 0,
            preparationTime: 30,
            estimatedDeliveryTime: 30,
            deliveryAvailable: true,
            coverImage: 'https://picsum.photos/800/600?food',
            currency: 'USD',
            menu: []
        };
        
        setRestaurants(prev => [...prev, mockResto]);
        setIsOfflineMode(true);
    } finally {
        setCreationLoading(false);
    }
  };

  if (showSplash && !isRecoveryMode) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  if (loading && !isRecoveryMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 transition-colors duration-300">
        <div className="w-full max-w-md p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-800 text-center flex flex-col items-center">
          <div className="relative mb-8">
              <div className="w-24 h-24 border-4 border-brand-100 dark:border-brand-900/30 rounded-full animate-pulse"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 border-4 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="absolute -top-1 -right-1 bg-brand-500 text-white p-2 rounded-full shadow-lg">
                  <Zap size={16} className="animate-bounce" />
              </div>
          </div>
          
          <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight mb-1">
            Dash<span className="text-brand-500">Meals</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-6 min-h-[20px]">
            {loadingStatus}
          </p>

          {/* Progress Bar Container */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden relative shadow-inner mb-2">
            <motion.div 
              className="bg-gradient-to-r from-brand-500 via-orange-400 to-brand-600 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
              layout
            />
          </div>

          {/* Percentage and details */}
          <div className="w-full flex justify-between items-center text-xs font-semibold text-slate-400 dark:text-slate-500 px-1">
            <span>Synchronisation</span>
            <span className="text-brand-500 dark:text-brand-400 font-mono text-sm">{loadingProgress}%</span>
          </div>

          <div className="mt-6 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-ping"></span>
            <span>Serveurs de base de données opérationnels</span>
          </div>
        </div>
      </div>
    );
  }

  const handleManualLogin = (user: User) => {
    setCurrentUser(user);
    setShowAuth(false);
    setAuthMode('login');
    setIsOfflineMode(true);
  };

  const handleLogout = () => {
    console.log("👋 [Auth] Initiating instantaneous non-blocking logout...");
    
    // 1. Clear all local application sessions
    if (currentUser?.id) {
       localStorage.removeItem(`dashmeals_role_${currentUser.id}`);
    }
    localStorage.removeItem('dashmeals_staff_session');
    localStorage.removeItem('dashmeals_subadmin_session');
    
    // 2. Clear all local Supabase keys and sessions to force client-side de-authentication immediately
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase') || key.includes('session')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn("Error clearing localStorage keys during logout:", e);
    }

    // 3. Immediately reset UI/State to show login screen
    setCurrentUser(null);
    currentUserRef.current = null;
    setIsAppLocked(false);
    setAuthMode('login');
    setShowAuth(true); // Always show auth screen after logout

    // 4. Fire standard remote signOut in background so it doesn't block the UI
    try {
      supabase.auth.signOut().catch((e) => {
        console.warn("Background remote signOut failed:", e);
      });
      fetchRestaurants().catch(console.error);
    } catch (e) {
      console.warn("Error launching background remote signOut:", e);
    }
  };

  const handleResetAppPin = async () => {
    if (currentUser && currentUser.id) {
      const updatedSettings = {
        ...(currentUser.settings || {
          notifPush: true,
          notifEmail: true,
          notifSms: false,
          twoFactorEnabled: false
        }),
        appLockEnabled: false,
        appLockPin: null,
        biometricsEnabled: false
      };
      
      console.log("🛡️ [Auth] Désactivation et réinitialisation du code PIN dans Supabase...");
      try {
        await supabase
          .from('profiles')
          .update({ settings: updatedSettings })
          .eq('id', currentUser.id);
        console.log("✅ [Auth] Code PIN réinitialisé en base avec succès !");
      } catch (err) {
        console.error("❌ [Auth] Erreur lors de la réinitialisation du code PIN :", err);
      }
    }
    
    handleLogout();
    toast.success("Votre code PIN a été désactivé. Veuillez vous reconnecter.");
  };

  const renderContent = () => {
    // 0. Check for KPay Payment Redirect (IMMEDIATE PRIORITY)
    if (paymentStatus) {
      return (
        <PaymentResult 
          status={paymentStatus} 
          onReturn={() => window.location.href = "https://dashmeals-rdc.onrender.com"} 
        />
      );
    }

    // Previous 0. Check for dedicated reset password route
    if (isRecoveryMode) {
      return <ResetPasswordPage />;
    }

    // PRIORITÉ ABSOLUE : Réinitialisation du mot de passe (Legacy detection)
    if (authMode === 'reset' && showAuth) {
      return (
        <>
          <OfflineBanner isSupabaseReachable={isSupabaseReachable} />
          <AuthScreen 
            onLogin={handleManualLogin} 
            isSupabaseReachable={isSupabaseReachable} 
            language={language}
            onBackToGuest={() => {
              setShowAuth(false);
              setAuthMode('login');
            }} 
            initialMode="reset"
          />
        </>
      );
    }

    // 1. Loading / Initializing State
    // Si on est encore en train d'initialiser ou si un chargement critique est en cours sans utilisateur résolu, on bloque l'UI
    if (isAppInitializing || (loading && !currentUser)) {
      if (showSplash) {
        return <SplashScreen onFinish={() => setShowSplash(false)} />;
      }
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-[100]">
           <div className="flex flex-col items-center">
             <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="text-sm text-gray-500 animate-pulse font-medium">Initialisation de votre session...</p>
           </div>
        </div>
      );
    }

    // 2. Not Logged In -> Show Auth or Guest View
    if (!currentUser) {
      if (showAuth) {
        return (
          <>
            {!isSupabaseReachable && (
              <div className="bg-red-600 text-white p-3 text-center text-sm font-bold sticky top-0 z-[100] flex items-center justify-center">
                <AlertTriangle size={18} className="mr-2" />
                Connexion Supabase impossible. L'application fonctionne en mode dégradé (Mocks).
              </div>
            )}
            <AuthScreen 
              onLogin={handleManualLogin} 
              isSupabaseReachable={isSupabaseReachable} 
              language={language}
              onBackToGuest={() => {
                setShowAuth(false);
                setAuthMode('login');
              }} 
              initialMode={authMode}
            />
          </>
        );
      }

      // Guest View
      const guestUser: User = {
          id: 'guest',
          name: 'Invité',
          email: '',
          role: 'guest',
          city: 'Kinshasa'
      };

      return (
        <>
          <OfflineBanner isSupabaseReachable={isSupabaseReachable} />
          <CustomerView 
            user={guestUser}
            allRestaurants={restaurants}
            onLogout={() => setShowAuth(true)} // onLogout for guest means "Login"
            theme={theme}
            setTheme={setTheme}
            language={language}
            setLanguage={setLanguage}
            font={font}
            setFont={setFont}
            onUpdateUser={setCurrentUser}
            onRefreshData={fetchRestaurants}
          />
        </>
      );
    }

    // 2. Logged in as SuperAdmin
    if (currentUser.role === 'superadmin' && !adminClientMode) {
        return (
          <SuperAdminDashboard 
            user={currentUser} 
            onLogout={handleLogout} 
            theme={theme}
            setTheme={setTheme}
            language={language}
            setLanguage={setLanguage}
            font={font}
            setFont={setFont}
            onGoToClient={() => setAdminClientMode(true)}
            onRefreshData={fetchRestaurants}
          />
        );
    }

    // 3. Logged in as Delivery or Staff Delivery
    if (currentUser.role === 'delivery' || (currentUser.role === 'staff' && currentUser.staffRole === 'delivery')) {
      return (
        <DeliveryView 
          user={currentUser} 
          onLogout={handleLogout} 
          onUpdateUser={setCurrentUser}
        />
      );
    }

    // 4. Logged in as Business or Staff
    if (currentUser.role === 'business' || currentUser.role === 'staff') {
      const myRestaurant = restaurants.find(r => r.id === currentUser.businessId || r.ownerId === currentUser.id);
      
      // CAS CRITIQUE : L'utilisateur est Business mais n'a pas de restaurant (Echec initialisation)
      if (!myRestaurant && currentUser.role === 'business') {
           // On attend d'avoir chargé les données de la base avant d'afficher le formulaire de création
           if (!restaurantsLoaded) {
               return (
                   <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-[100]">
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-sm text-gray-500 animate-pulse font-medium">Chargement de votre établissement...</p>
                      </div>
                   </div>
               );
           }

           return (
               <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
                   <OfflineBanner isSupabaseReachable={isSupabaseReachable} />
                   
                   <div className="bg-white dark:bg-gray-800 max-w-md w-full rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-300">
                       <div className="w-16 h-16 bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-400 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Store size={32} />
                       </div>
                       
                       <h2 className="text-2xl font-black text-gray-800 dark:text-white mb-2">Finalisation</h2>
                       <p className="text-[10px] text-gray-400 mb-2 uppercase font-bold">Connecté : {currentUser.email} ({currentUser.role})</p>
                       <p className="text-gray-500 dark:text-gray-400 mb-6">Nous devons configurer votre établissement pour continuer.</p>
                       
                       <form onSubmit={handleManualRestaurantCreation} className="space-y-4 text-left">
                          <div>
                              <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Nom du restaurant</label>
                              <input 
                                  type="text"
                                  required
                                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none dark:bg-gray-700 dark:text-white"
                                  placeholder="Ex: Chez Maman..."
                                  value={newRestoName}
                                  onChange={e => setNewRestoName(e.target.value)}
                              />
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Type d'établissement</label>
                              <select 
                                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-white dark:bg-gray-700 dark:text-white"
                                  value={newRestoType}
                                  onChange={e => setNewRestoType(e.target.value as BusinessType)}
                              >
                                  <option value="restaurant">Restaurant</option>
                                  <option value="snack">Snack / Fast Food</option>
                                  <option value="bar">Bar / Lounge</option>
                                  <option value="terrasse">Terrasse</option>
                              </select>
                          </div>

                          <button 
                              type="submit"
                              disabled={creationLoading}
                              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg flex justify-center items-center mt-4"
                          >
                              {creationLoading ? (
                                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                  <>Créer mon espace <ArrowRight size={18} className="ml-2"/></>
                              )}
                          </button>
                       </form>
                       
                        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700 flex flex-col space-y-3">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">Déjà configuré ?</p>
                            <button 
                                onClick={() => fetchRestaurants()}
                                className="w-full p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-sm transition-colors flex items-center justify-center"
                            >
                                <Zap size={16} className="mr-2 text-brand-600" />
                                Actualiser mes données
                            </button>
                            <button onClick={handleLogout} className="text-gray-400 text-xs hover:text-red-500 underline py-2 text-center">
                                Annuler et se déconnecter
                            </button>
                        </div>
                   </div>
               </div>
           )
      }
      
      return (
        <>
          <OfflineBanner isSupabaseReachable={isSupabaseReachable} />
          <BusinessDashboard 
              user={currentUser} 
              restaurant={myRestaurant} 
              onUpdateRestaurant={handleUpdateRestaurant}
              onUpdateUser={setCurrentUser}
              onRefreshData={fetchRestaurants}
              onLogout={handleLogout}
              theme={theme}
              setTheme={setTheme}
              language={language}
              setLanguage={setLanguage}
              font={font}
              setFont={setFont}
          />
        </>
      );
    }

    // 4. Logged in as Client
    return (
      <>
        <OfflineBanner isSupabaseReachable={isSupabaseReachable} />
        <CustomerView 
          user={currentUser}
          allRestaurants={restaurants}
          onLogout={handleLogout}
          theme={theme}
          setTheme={setTheme}
          language={language}
          setLanguage={setLanguage}
          font={font}
          setFont={setFont}
          onUpdateUser={setCurrentUser}
          onGoToAdmin={() => setAdminClientMode(false)}
          onRefreshData={fetchRestaurants}
        />
      </>
    );
  };

  return (
    <>
      <Toaster position="top-center" richColors />
      <AnimatePresence mode="wait">
        {isAppLocked && currentUser?.settings?.appLockEnabled ? (
          <SecurityLock 
            key="lock"
            isEnabled={true}
            correctPin={currentUser.settings.appLockPin}
            biometricsEnabled={currentUser.settings.biometricsEnabled}
            onUnlock={() => setIsAppLocked(false)}
            onReset={handleResetAppPin}
          />
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 1 }} // Start with 1 to avoid white page if animation engine is slow
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen"
          >
            {renderContent()}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default App;