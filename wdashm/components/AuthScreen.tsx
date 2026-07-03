import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, UserRole, BusinessType } from '../types';
import { CITIES_RDC, APP_LOGO_URL } from '../constants';
import { User as UserIcon, Store, AlertCircle, MapPin, Mail, Phone, KeyRound, Users, Bike, HelpCircle } from 'lucide-react';
import { HelpCenter } from './HelpCenter';
import { AppSettings } from '../types';
import { Language } from '../types';
import { useTranslation } from '../lib/i18n';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';

interface Props {
  onLogin: (user: User, businessData?: any) => void;
  isSupabaseReachable?: boolean;
  onBackToGuest?: () => void;
  initialMode?: 'login' | 'signup' | 'reset';
  language?: Language;
}

export const AuthScreen: React.FC<Props> = ({ onLogin, isSupabaseReachable = true, onBackToGuest, initialMode = 'login', language = 'fr' }) => {
  const t = useTranslation(language as Language);
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [isStaffMode, setIsStaffMode] = useState(false);
  const [role, setRole] = useState<UserRole>('client');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Kinshasa');
  const [availableCities, setAvailableCities] = useState<string[]>(CITIES_RDC);
  
  // Business Specific States
  const [businessType, setBusinessType] = useState<BusinessType>('restaurant');
  const [businessName, setBusinessName] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false);
  const [showDemoOptions, setShowDemoOptions] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const fetchAppSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('id', 'global')
          .single();
        if (data?.value) {
          setAppSettings(data.value as AppSettings);
        }
      } catch (err) {
        console.error("Error fetching app settings in AuthScreen:", err);
      }
    };
    fetchAppSettings();

    const appSettingsSubscription = supabase
      .channel('public:app_settings_auth')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_settings',
        filter: 'id=eq.global'
      }, (payload) => {
        if (payload.new && (payload.new as any).value) {
          setAppSettings((payload.new as any).value as AppSettings);
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(appSettingsSubscription);
    };
  }, []);

  useEffect(() => {
    if (isInputFocused) {
      const activeElement = document.activeElement;
      if (activeElement) {
        // Wait for keyboard animation to settle
        setTimeout(() => {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [isInputFocused]);

  // Forgot Password States
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(initialMode === 'reset');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (initialMode === 'reset') {
      setIsResettingPassword(true);
      setIsLogin(false);
      setIsForgotPassword(false);
    } else if (initialMode === 'signup') {
      setIsLogin(false);
      setIsResettingPassword(false);
      setIsForgotPassword(false);
    } else {
      setIsLogin(true);
      setIsResettingPassword(false);
      setIsForgotPassword(false);
    }
  }, [initialMode]);

  // Staff Specific States
  const [staffRestaurantName, setStaffRestaurantName] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPin, setStaffPin] = useState('');

  // Listen for OAuth messages from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log("📩 [AuthScreen] Message reçu de la popup:", event.origin, event.data?.type);
      
      // Origin check - be more lenient in development/preview environments
      const isAllowedOrigin = event.origin === window.location.origin || 
                             event.origin.includes('.run.app') || 
                             event.origin.includes('localhost') ||
                             event.origin.includes('stripe.com'); // Allow stripe for JS SDK
                             
      if (event.origin.includes('stripe.com')) return; // Ignore stripe messages for auth

      if (!isAllowedOrigin) {
        console.warn("⚠️ [AuthScreen] Origine non autorisée:", event.origin);
        return;
      }
      
      if (event.data?.type === 'OAUTH_SUCCESS' && event.data.session) {
        console.log("✅ [AuthScreen] OAuth Success message received, setting session...");
        setLoading(true);
        supabase.auth.setSession({
          access_token: event.data.session.access_token,
          refresh_token: event.data.session.refresh_token
        });
        // Remove reload. onAuthStateChange in App.tsx will handle the rest.
      } else if (event.data?.type === 'OAUTH_ERROR') {
        console.error("❌ [AuthScreen] OAuth Error message received:", event.data.error);
        setError(event.data.error || t('error'));
        setLoading(false);
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Check for password recovery event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true);
      }
    });

    return () => {
      window.removeEventListener('message', handleMessage);
      subscription.unsubscribe();
    };
  }, []);

  // Fetch cities from DB on mount
  useEffect(() => {
    setAvailableCities(CITIES_RDC);
  }, []);

  const handleOAuthLogin = async (provider: 'google' | 'facebook') => {
    if (provider === 'facebook') {
      setError("Connexion via Facebook indisponible pour l'instant, utiliser Google ou créer un compte manuellement");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      localStorage.setItem('dashmeals_pending_auth', JSON.stringify({ 
          role, 
          city,
      }));

      // --- STRATÉGIE AUTHENTIFICATION ---
      // Détection de l'environnement (Capacitor native ou Web)
      const isNative = Capacitor.getPlatform() !== 'web';
      
      // Configuration de l'URL de redirection
      // IMPORTANT: Ces URLs doivent être ajoutées dans "Redirect URLs" sur le dashboard Supabase !
      const isRender = window.location.hostname.includes('onrender.com');
      const RENDER_PROD_URL = "https://dashmeals-rdc.onrender.com";
      const MOBILE_SCHEME = "com.dashmeals.android://callback";
      
      let redirectTo = window.location.origin;
      
      if (isNative) {
        redirectTo = MOBILE_SCHEME;
      } else if (isRender) {
        redirectTo = RENDER_PROD_URL;
      }

      console.log("📱 [Auth] Environnement:", isNative ? "NATIVE/APK" : "WEB");
      console.log("🔗 [Auth] URL de retour (redirectTo):", redirectTo);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: redirectTo,
          // Sur APK, on récupère l'URL pour l'ouvrir dans le navigateur système
          skipBrowserRedirect: isNative, 
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      });
      
      if (error) throw error;

      if (data?.url) {
        if (isNative) {
            // Sur APK, on DOIT ouvrir le navigateur système pour que le Deep Link fonctionne au retour
            // window.open(url, '_system') est la méthode standard Capacitor pour ouvrir le navigateur externe
            console.log("🌍 [Auth] Ouverture du navigateur système pour login...");
            window.open(data.url, '_system');
            
            // On peut arrêter le loading ici car l'utilisateur quitte l'application momentanément
            setLoading(false);
        } else {
            // Sur Web, on utilise une popup standard
            const width = 500;
            const height = 650;
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;
            
            const popup = window.open(
              data.url,
              'oauth_popup',
              `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
            );

            if (!popup) {
                setError("Le popup a été bloqué par votre navigateur.");
                setLoading(false);
                return;
            }

            const timer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(timer);
                    setLoading(false); 
                }
            }, 1000);
        }
      }

    } catch (err: any) {
      console.error("OAuth Error:", err);
      setError(err.message || "Erreur de connexion sociale");
      setLoading(false);
    }
  };

  const handleDemoLogin = (demoRole: UserRole) => {
    const demoUser: User = {
      id: demoRole === 'superadmin' ? 'demo-superadmin-99' : `${demoRole}-user-${Date.now()}`,
      email: `${demoRole}-demo@example.com`,
      name: demoRole === 'client' ? 'Client Démo' : 
            demoRole === 'business' ? 'Restaurant Démo (DashPro)' : 
            demoRole === 'delivery' ? 'Livreur Démo (DashBike)' : 'SuperAdmin Démo',
      role: demoRole,
      city: 'Kinshasa',
      businessId: demoRole === 'business' ? 'resto-1' : undefined,
      phoneNumber: '+243812345678',
      deliveryInfo: demoRole === 'delivery' ? {
        vehicleType: 'moto',
        isAvailable: true,
        completedOrders: 15,
        rating: 4.9
      } : undefined
    };
    onLogin(demoUser);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    
    console.log(`🚀 [Auth] Tentative de ${isLogin ? 'Connexion' : 'Inscription'} pour: ${email}`);
    setLoading(true);
    setError(null);

    // Timeout de sécurité pour ne pas rester bloqué si Supabase ne répond pas
    const authTimeout = setTimeout(() => {
        if (loading) {
            console.warn("⚠️ [Auth] Timeout détecté durant le processus d'authentification");
            setError("Le délai d'attente est dépassé. Veuillez réessayer ou vérifier votre connexion.");
            setLoading(false);
        }
    }, 15000);

    try {
      if (!isLogin) {
        localStorage.setItem('dashmeals_pending_auth', JSON.stringify({ role, city, phone, name }));
      }

      if (isLogin) {
        // LOGIN
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        console.log("✅ [Auth] signInWithPassword réussi");
      } else {
        // SIGN UP
        // 1. Create Auth User
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // On sauvegarde aussi les infos dans les métadonnées comme backup
            data: { 
                full_name: name, 
                role: role, 
                city: city, 
                phone_number: phone 
            }, 
          }
        });

        if (authError) throw authError;
        
        if (authData.user) {
          // Check if there is an existing profile with the same email to preserve their role
          const { data: preExistingProfileByEmail } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();

          let roleToAssign = role;
          if (preExistingProfileByEmail) {
            console.log("🔗 Profil pré-existant trouvé par e-mail, préservation du rôle s'il est spécifique, sinon utilisation du nouveau rôle :", preExistingProfileByEmail.role);
            roleToAssign = (preExistingProfileByEmail.role && preExistingProfileByEmail.role !== 'client') 
              ? preExistingProfileByEmail.role 
              : role;
            // Supprimer l'ancien profil temporaire/placeholder
            await supabase.from('profiles').delete().eq('id', preExistingProfileByEmail.id);
          }

          // 2. Create Profile in DB using UPSERT to prevent conflicts
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: authData.user.id,
            role: roleToAssign,
            full_name: name,
            city: city,
            phone_number: phone,
            email: email
          });
          
          if (profileError) {
             console.warn("Avertissement création profil (Non bloquant):", profileError);
             // On ne throw PAS d'erreur ici car l'utilisateur est déjà créé dans Auth
             // et l'application peut fonctionner avec les métadonnées ou le mode offline
          }

          // 3. If Business, Create Restaurant
          if (role === 'business') {
            if (!businessName.trim()) throw new Error("Le nom du commerce est requis");

            const { error: restoError } = await supabase.from('restaurants').insert({
              owner_id: authData.user.id,
              name: businessName,
              type: businessType,
              city: city, 
              latitude: -4.301 + (Math.random() - 0.5) * 0.02, 
              longitude: 15.301 + (Math.random() - 0.5) * 0.02,
              description: `Bienvenue chez ${businessName}`,
              cover_image: `https://picsum.photos/800/600?random=${Date.now()}`,
              preparation_time: 30,
              estimated_delivery_time: 30,
              currency: 'USD',
              exchange_rate: 2850,
              phone_number: phone // Set restaurant phone number to owner's phone initially
            });
            if (restoError) {
                console.warn("Restaurant creation warning:", restoError);
            }

            if (authData.user) {
              // Forcer la mise à jour des métadonnées auth pour que le rôle
              // soit disponible immédiatement sans requête DB
              await supabase.auth.updateUser({
                data: { role: 'business', full_name: name, city, phone_number: phone }
              });
            }
          }
          
          // Si inscription réussie mais pas de session auto (ex: email confirm), on prévient
          if (!authData.session) {
              setError("Compte créé ! Veuillez vérifier vos emails pour confirmer votre adresse avant de vous connecter.");
              setIsLogin(true);
              setLoading(false);
              return;
          }
        }
      }
    } catch (err: any) {
      clearTimeout(authTimeout);
      console.error("Auth Error:", err);
      let message = err.message || "Une erreur est survenue";
      const lowerMsg = message.toLowerCase();
      
      // MAPPING DES ERREURS SUPABASE
      if (lowerMsg.includes("rate limit") || lowerMsg.includes("too many requests")) {
        message = "Trop de tentatives de connexion. Pour votre sécurité, veuillez patienter quelques minutes avant de réessayer.";
      } else if (lowerMsg.includes("invalid login credentials")) {
        message = "Identifiants incorrects. Si vous n'avez pas de compte, inscrivez-vous ou utilisez le Mode Démo.";
      } else if (lowerMsg.includes("email not confirmed")) {
        message = "Votre adresse email n'a pas encore été confirmée. Veuillez vérifier votre boîte de réception (et vos spams).";
      } else if (lowerMsg.includes("user already registered") || lowerMsg.includes("already exists")) {
        message = "Cette adresse email est déjà associée à un compte. Essayez de vous connecter.";
      } else if (lowerMsg.includes("password should be at least")) {
        message = "Le mot de passe est trop court. Il doit contenir au moins 6 caractères.";
      } else if (lowerMsg.includes("captcha verification process failed")) {
        message = "La vérification Captcha a échoué. Veuillez désactiver 'Enable Captcha protection' dans votre dashboard Supabase (Authentication > Settings) pour permettre l'inscription sans Captcha.";
      } else if (lowerMsg.includes("fetch failed") || lowerMsg.includes("network request failed")) {
        message = "Impossible de contacter le serveur d'authentification (Supabase). Vérifiez votre connexion internet ou la configuration de votre projet Supabase.";
      }

      setError(message);
    } finally {
      clearTimeout(authTimeout);
      setLoading(false);
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Find the restaurant by name
      const { data: restoData, error: restoError } = await supabase
        .from('restaurants')
        .select('id, name')
        .ilike('name', `%${staffRestaurantName}%`)
        .limit(1)
        .single();

      if (restoError || !restoData) {
        throw new Error("Établissement non trouvé. Vérifiez le nom.");
      }

      // 2. Find the staff member in that restaurant
      const { data: staffData, error: staffError } = await supabase
        .from('staff_members')
        .select('*')
        .eq('restaurant_id', restoData.id)
        .ilike('name', staffName)
        .eq('pin_code', staffPin)
        .single();

      if (staffError || !staffData) {
        throw new Error("Nom ou Code PIN incorrect pour cet établissement.");
      }

      // 3. Create a virtual user session
      const staffUser: User = {
        id: staffData.id,
        name: staffData.name,
        email: `staff_${staffData.id}@dashmeals.com`,
        role: 'staff',
        city: 'Kinshasa', // Default
        businessId: staffData.restaurant_id,
        staffRole: staffData.role
      };

      // Save to local storage for persistence (since it's not a real Supabase Auth session)
      localStorage.setItem('dashmeals_staff_session', JSON.stringify(staffUser));
      
      onLogin(staffUser);
    } catch (err: any) {
      console.error("Staff Login Error:", err);
      setError(err.message || "Erreur de connexion équipe");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!email) {
      setError("Veuillez entrer votre adresse email.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetEmailSent(true);
    } catch (err: any) {
      console.error("Forgot Password Error:", err);
      setError(err.message || "Erreur lors de l'envoi de l'email de réinitialisation.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (newPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      
      // Sign out to force re-login with new password
      await supabase.auth.signOut();
      setIsResettingPassword(false);
      setIsLogin(true);
      setError("Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter.");
    } catch (err: any) {
      console.error("Reset Password Error:", err);
      setError(err.message || "Erreur lors de la réinitialisation du mot de passe.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black flex flex-col items-center overflow-y-auto p-4 pb-80 relative transition-colors duration-500 scroll-smooth">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-brand-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {onBackToGuest && (
        <button 
          onClick={onBackToGuest}
          className="absolute top-6 left-6 p-3 glass rounded-full shadow-lg text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-all z-20 active:scale-90"
          title="Retourner à l'accueil"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
      )}

      <div className="w-full max-w-md relative z-10 glass rounded-[32px] shadow-2xl overflow-hidden border border-white/40 dark:border-white/10">
        
        {/* Header */}
        <div className="transition-all duration-500 overflow-hidden bg-brand-600 relative p-4 sm:p-8 opacity-100 flex flex-col items-center">
          {/* Subtle pattern background */}
          <div className="absolute inset-0 opacity-10 mix-blend-overlay">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          <div className="bg-white/10 backdrop-blur-xl p-2 sm:p-4 rounded-3xl shadow-2xl border border-white/20 mb-3 sm:mb-6 group transition-transform hover:scale-105 duration-500">
             <img src={APP_LOGO_URL} alt="DashMeals Logo" className="h-8 sm:h-12 w-auto object-contain filter drop-shadow-lg" />
          </div>
          <div className="relative z-10">
             <h1 className="text-2xl sm:text-4xl font-display font-black text-white tracking-tight uppercase leading-none">DashMeals <span className="text-brand-200">RDC</span></h1>
             <div className="h-0.5 sm:h-1 w-8 sm:w-12 bg-white/30 mx-auto mt-2 sm:mt-4 rounded-full"></div>
             <p className="text-brand-50 mt-2 sm:mt-4 font-medium text-[10px] sm:text-sm tracking-wide opacity-90 uppercase">La plateforme gourmande de Kinshasa</p>
          </div>
        </div>

        {/* Tabs */}
        {!isStaffMode && !isForgotPassword && !isResettingPassword && (
          <div className="flex bg-gray-50/80 dark:bg-white/5 backdrop-blur-md p-1.5 mx-6 mt-6 rounded-2xl border border-gray-100 dark:border-white/5">
            <button 
              type="button"
              onClick={() => setRole('client')}
              className={`flex-1 py-4 flex items-center justify-center rounded-xl transition-all duration-500 ${role === 'client' ? 'text-brand-600 bg-white dark:bg-gray-800 shadow-md transform scale-[1.02]' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
              title={t('client_role')}
            >
              <UserIcon size={24} className={role === 'client' ? 'animate-bounce' : ''} />
            </button>
            <button 
              type="button"
              onClick={() => setRole('business')}
              className={`flex-1 py-4 flex items-center justify-center rounded-xl transition-all duration-500 ${role === 'business' ? 'text-brand-600 bg-white dark:bg-gray-800 shadow-md transform scale-[1.02]' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
              title={t('business_role')}
            >
              <Store size={24} className={role === 'business' ? 'animate-bounce' : ''} />
            </button>
            <button 
              type="button"
              onClick={() => setRole('delivery')}
              className={`flex-1 py-4 flex items-center justify-center relative rounded-xl transition-all duration-500 ${role === 'delivery' ? 'text-brand-600 bg-white dark:bg-gray-800 shadow-md transform scale-[1.02]' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              title={t('delivery_role')}
            >
              <Bike size={24} className={role === 'delivery' ? 'animate-bounce' : ''} />
            </button>
          </div>
        )}

        <div className="p-8 pb-4">
            {!isForgotPassword && !isResettingPassword && (
              <>
                <div className="flex flex-col items-center justify-center mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mb-3 shadow-inner">
                        {role === 'client' ? <UserIcon className="text-brand-600" /> : role === 'business' ? <Store className="text-brand-600" /> : <Bike className="text-brand-600" />}
                    </div>
                    <h2 className="text-2xl font-display font-black text-gray-900 dark:text-white text-center uppercase tracking-tight">
                        {isStaffMode ? t('staff_access') : (isLogin ? t('login') : t('signup'))}
                    </h2>
                </div>
                {!isLogin && !isStaffMode && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center mb-8 font-bold uppercase tracking-widest leading-relaxed">
                    {role === 'client' ? 'Inscrivez-vous pour commander vos plats préférés.' : 
                     role === 'business' ? 'Inscrivez-vous pour vendre vos produits sur la plateforme.' : 
                     'Inscrivez-vous pour devenir livreur et gagner de l\'argent.'}
                  </p>
                )}
                {isLogin && !isStaffMode && <div className="mb-4"></div>}

                {/* Social Login Buttons */}
                {!isStaffMode && (
                  <div className="space-y-3 mb-6">
                      <button 
                          type="button"
                          onClick={() => handleOAuthLogin('google')}
                          className="w-full flex items-center justify-center py-3 px-4 border border-gray-300 rounded-xl transition-colors font-bold text-sm bg-white text-gray-700 hover:bg-gray-50"
                          title="Connexion avec Google"
                      >
                          <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                          </svg>
                          {isLogin ? t('login_btn') + " avec Google" : t('signup_btn') + " avec Google"}
                      </button>
                  </div>
                )}
                
                {!isStaffMode && (
                  <div className="relative flex items-center justify-center mb-6">
                      <hr className="w-full border-gray-300" />
                      <span className="absolute bg-white px-3 text-xs text-gray-500 font-medium">OU AVEC EMAIL</span>
                  </div>
                )}
              </>
            )}
        </div>

        {/* Form */}
        {isResettingPassword ? (
          <form onSubmit={handleResetPassword} className="px-6 pb-6 space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">{t('new_password')}</h2>
              <p className="text-xs text-gray-500 mt-1">{t('account_security')}</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm animate-pulse flex items-start shadow-sm">
                   <AlertCircle size={18} className="mr-2 flex-shrink-0 mt-0.5" />
                   <span className="font-medium leading-tight">{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">{t('new_password')}</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-black bg-white placeholder:text-gray-400"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-95 mt-4 flex justify-center items-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : t('update')}
            </button>
          </form>
        ) : isForgotPassword ? (
          <form onSubmit={handleForgotPassword} className="px-6 pb-6 space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">{t('forgot_password')}</h2>
              <p className="text-xs text-gray-500 mt-1">
                {resetEmailSent 
                  ? t('success') 
                  : t('send_reset_link')}
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm animate-pulse flex items-start shadow-sm">
                   <AlertCircle size={18} className="mr-2 flex-shrink-0 mt-0.5" />
                   <span className="font-medium leading-tight">{error}</span>
              </div>
            )}

            {!resetEmailSent ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">{t('email')}</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      placeholder={t('email_placeholder')}
                      className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-black bg-white placeholder:text-gray-400"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-95 mt-4 flex justify-center items-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : t('send_reset_link')}
                </button>
              </>
            ) : (
              <div className="bg-brand-50 p-4 rounded-xl text-brand-700 text-xs text-center font-medium">
                Veuillez vérifier votre boîte de réception (et vos spams) pour le lien de réinitialisation.
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setResetEmailSent(false);
                setError(null);
              }}
              className="w-full text-brand-600 font-bold text-sm py-2"
            >
              {t('back_to_login')}
            </button>
          </form>
        ) : isStaffMode ? (
          <form onSubmit={handleStaffLogin} className="px-6 pb-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm flex items-start shadow-sm">
                   <AlertCircle size={18} className="mr-2 flex-shrink-0 mt-0.5" />
                   <span className="font-medium leading-tight">{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">{t('establishment_name')}</label>
              <div className="relative">
                <Store size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  required 
                  className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-black bg-white placeholder:text-gray-400"
                  placeholder="Ex: Chez Ntemba"
                  value={staffRestaurantName}
                  onChange={(e) => setStaffRestaurantName(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">{t('name')}</label>
              <div className="relative">
                <Users size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  required 
                  className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-black bg-white placeholder:text-gray-400"
                  placeholder="Ex: Jean"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Code PIN (4 chiffres)</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input 
                  type="password" 
                  required 
                  maxLength={4}
                  pattern="\d{4}"
                  className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-black bg-white placeholder:text-gray-400 tracking-widest"
                  placeholder="••••"
                  value={staffPin}
                  onChange={(e) => setStaffPin(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className={`w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-95 mt-4 flex justify-center items-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : t('login_btn')}
            </button>

            <button 
              type="button"
              onClick={() => setIsStaffMode(false)}
              className="w-full text-brand-600 font-bold text-sm py-2"
            >
              {t('back_to_login')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm animate-pulse flex items-start shadow-sm">
                 <AlertCircle size={18} className="mr-2 flex-shrink-0 mt-0.5" />
                 <span className="font-medium leading-tight">{error}</span>
            </div>
          )}

          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">{t('full_name')}</label>
              <input 
                type="text" 
                required 
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-black bg-white placeholder:text-gray-400"
                placeholder="Ex: Jean K."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
              />
            </div>
          )}

           {/* Phone Number Field */}
           {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">{t('phone')}</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input 
                    type="tel" 
                    required 
                    className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-black bg-white placeholder:text-gray-400"
                    placeholder="Ex: 0812345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                />
              </div>
            </div>
          )}

          {/* City Selection for both Roles during Signup */}
          {!isLogin && (
             <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 flex items-center">
                  <MapPin size={12} className="mr-1"/> 
                  {role === 'business' ? t('city') : t('city')}
                </label>
                <select 
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-white text-gray-900"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                >
                  {availableCities.map(c => (
                    <option key={c} value={c} className="text-gray-900">{c}</option>
                  ))}
                </select>
             </div>
          )}

          {/* Business Specific Fields during Signup */}
          {!isLogin && role === 'business' && (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
              <h3 className="text-sm font-bold text-gray-700 flex items-center"><Store size={14} className="mr-2"/> Infos Établissement</h3>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nom du commerce</label>
                <input 
                  type="text" 
                  required 
                  className="w-full p-2 border border-gray-300 rounded focus:ring-1 focus:ring-brand-500 outline-none text-gray-900"
                  placeholder="Ex: Chez Ntemba"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Type</label>
                <select 
                  className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                >
                  <option value="restaurant" className="text-gray-900">Restaurant</option>
                  <option value="bar" className="text-gray-900">Bar / Lounge</option>
                  <option value="terrasse" className="text-gray-900">Terrasse</option>
                  <option value="snack" className="text-gray-900">Snack / Fast-food</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">{t('email')}</label>
            <input 
              type="email" 
              required 
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-black bg-white placeholder:text-gray-400"
              placeholder={t('email_placeholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">{t('password')}</label>
            <input 
              type="password" 
              required 
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-black bg-white placeholder:text-gray-400"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
            />
            {isLogin && (
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className="text-[10px] font-bold text-brand-600 hover:underline"
                >
                  {t('forgot_password')}
                </button>
              </div>
            )}
          </div>

          {!isLogin && (
            <div className="flex items-start space-x-2 mt-2">
              <input
                type="checkbox"
                id="privacy"
                checked={acceptPrivacy}
                onChange={(e) => setAcceptPrivacy(e.target.checked)}
                className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded"
              />
              <label htmlFor="privacy" className="text-xs text-gray-600 leading-tight">
                {t('accept_privacy')}
              </label>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading || (!isLogin && !acceptPrivacy)}
            className={`w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-95 mt-4 flex justify-center items-center ${loading || (!isLogin && !acceptPrivacy) ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (isLogin ? t('login_btn') : t('signup_btn'))}
          </button>

          {/* Section Mode Démo & Accès Test Rapide */}
          <div className="mt-6 pt-5 border-t border-gray-150 dark:border-gray-800 space-y-3">
            <p className="text-center text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
              🚀 Accès Démo Rapide & Centre d'aide
            </p>
            
            {/* Bouton de démo principal pour afficher/masquer le sous-menu de démo */}
            <button
              type="button"
              onClick={() => setShowDemoOptions(!showDemoOptions)}
              className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 focus:outline-none"
            >
              <span>{showDemoOptions ? "Masquer les Comptes Démo 🔼" : "Se connecter en Mode Démo 🔽"}</span>
            </button>

            {/* Liste des comptes démo affichée uniquement si showDemoOptions est vrai */}
            {showDemoOptions && (
              <div className="p-3 bg-gray-50 dark:bg-gray-850/50 rounded-xl border border-gray-150 dark:border-gray-800/80 space-y-2 animate-fade-in">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => handleDemoLogin('client')}
                    className="py-2 px-3 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/10 dark:hover:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-bold rounded-lg text-xs shadow-sm border border-orange-100 dark:border-orange-900/30 transition-all active:scale-95 flex items-center justify-center gap-1"
                  >
                    <span>Demo Client</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleDemoLogin('business')}
                    className="py-2 px-3 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/10 dark:hover:bg-brand-900/20 text-brand-600 dark:text-brand-400 font-bold rounded-lg text-xs shadow-sm border border-brand-100 dark:border-brand-900/30 transition-all active:scale-95 flex items-center justify-center gap-1"
                  >
                    <span>Demo Resto</span>
                  </button>
                </div>
                <div className="grid grid-cols-1">
                  <button 
                    type="button"
                    onClick={() => handleDemoLogin('delivery')}
                    className="py-2.5 px-4 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/10 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold rounded-lg text-xs shadow-sm border border-blue-100 dark:border-blue-900/30 transition-all active:scale-95 flex items-center justify-center gap-1"
                  >
                    <span>Demo Livreur 🚴</span>
                  </button>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-3">
              <button 
                type="button"
                onClick={() => onLogin({ id: 'guest', name: 'Invité', email: '', role: 'guest', city: 'Kinshasa' })}
                className="w-full bg-gray-50 dark:bg-gray-850 hover:bg-gray-100 dark:hover:bg-gray-750 text-gray-650 dark:text-gray-300 font-bold py-3 rounded-xl text-xs shadow-sm transition-transform active:scale-95 flex justify-center items-center border border-gray-100 dark:border-gray-700 font-sans"
              >
                Mode Invité
              </button>
              
              <button
                type="button"
                onClick={() => setIsHelpCenterOpen(true)}
                className="w-full py-3 bg-gray-50 dark:bg-gray-850 hover:bg-gray-100 dark:hover:bg-gray-750 text-gray-650 dark:text-gray-300 font-bold rounded-xl text-xs transition-all tracking-tight active:scale-95 flex items-center justify-center space-x-1 border border-gray-100 dark:border-gray-700"
              >
                <HelpCircle size={14} className="text-orange-500 flex-shrink-0" />
                <span>Centre d'aide 📖</span>
              </button>
            </div>
          </div>
        </form>
        )}

        <div className="bg-gray-50/50 dark:bg-white/5 p-6 text-center border-t border-gray-100 dark:border-white/5 space-y-4">
          {isLogin ? (
            <div className="space-y-3 pb-2">
              <div className="relative flex items-center justify-center">
                <hr className="w-full border-gray-300 dark:border-gray-700" />
                <span className="absolute bg-gray-50 dark:bg-gray-900 px-3 text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t('no_account')}</span>
              </div>
              <button 
                type="button"
                onClick={() => {
                    setIsLogin(false);
                    setIsStaffMode(false);
                    setError(null);
                }}
                className="w-full bg-white dark:bg-brand-900/10 text-brand-600 dark:text-brand-400 border-2 border-brand-500/50 hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30 font-black py-4 rounded-2xl shadow-md transition-all transform hover:scale-[1.02] active:scale-95 uppercase tracking-widest text-sm relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-brand-400/0 via-brand-400/10 to-brand-400/0 w-[200%] translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]"></div>
                {t('signup_btn')}
              </button>
            </div>
          ) : (
            <button 
              type="button"
              onClick={() => {
                  setIsLogin(true);
                  setIsStaffMode(false);
                  setError(null);
              }}
              className="w-full text-xs text-brand-600 dark:text-brand-400 font-black hover:underline py-2 uppercase tracking-widest"
            >
              {t('have_account')} {t('login')}
            </button>
          )}
          
          {isLogin && !isStaffMode && (
            <button 
              type="button"
              onClick={() => {
                  setIsStaffMode(true);
                  setError(null);
              }}
              className="text-[10px] text-gray-400 hover:text-brand-600 font-bold flex items-center justify-center w-full uppercase tracking-tighter pt-2 border-t border-gray-100 dark:border-white/5"
            >
              <KeyRound size={12} className="mr-1.5" /> {t('staff_access')} (PIN)
            </button>
          )}
        </div>
      </div>

      {isHelpCenterOpen && (
        <HelpCenter 
          user={{ id: 'guest', name: 'Invité', email: '', role: 'guest', city: 'Kinshasa' }}
          onClose={() => setIsHelpCenterOpen(false)}
          appSettings={appSettings}
        />
      )}

      {/* Google OAuth Compliance Policy Footer */}
      <div className="mt-8 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest relative z-10 px-4 space-y-2 max-w-sm mx-auto">
        <p className="opacity-80">© 2026 DashMeals RDC. Tous droits réservés.</p>
        <div className="flex justify-center space-x-3 text-[11px] normal-case tracking-normal">
          <a href="/terms.html" className="text-gray-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors uppercase text-[9px] tracking-wider font-extrabold">Terms of Service</a>
          <span className="text-gray-300 dark:text-gray-700">•</span>
          <a href="/privacy.html" className="text-rose-500 hover:text-rose-700 transition-colors uppercase text-[9px] tracking-wider font-extrabold">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
};