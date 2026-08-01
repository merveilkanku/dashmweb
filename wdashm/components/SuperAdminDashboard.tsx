import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Store, ShoppingBag, DollarSign, Activity, 
  Search, CheckCircle, XCircle, LogOut, Shield, 
  Trash2, AlertTriangle, Database, Type, Sun, Moon, Menu, X, Bell,
  Eye, EyeOff, Download, FileText, Mail, MessageSquare, MessageCircle,
  Settings, UserPlus, UserMinus, ShieldCheck, ShieldAlert, RefreshCw, Bike,
  CreditCard, Calendar, Edit3, RotateCcw, ArrowUpRight, ChevronUp, ChevronDown,
  Sliders, Lock, Plus, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { APP_LOGO_URL, MOCK_RESTAURANTS, CITIES_RDC } from '../constants';
import { formatDualPrice } from '../utils/format';
import { User, Restaurant, Order, Theme, Language, AppFont, AppSettings, BusinessType } from '../types';
import { toast } from 'sonner';
import { sendEmail, sendVerificationStatusEmail, sendSupportReplyEmail, sendSubscriptionRefundEmail, sendTransactionInvoiceEmail } from '../lib/email';
import { parseJsonResponse } from '../utils/fetch';
import { useTranslation } from '../lib/i18n';

const getMockProfiles = () => [
  {
    id: 'admin-1',
    full_name: 'Merveil Kanku (Principal)',
    email: 'irmerveilkanku@gmail.com',
    role: 'superadmin',
    city: 'Kinshasa',
    phone_number: '+243 890 000 000',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'owner-1',
    full_name: 'Maman Africa Chef',
    email: 'mama.africa@gmail.com',
    role: 'business',
    city: 'Kinshasa',
    phone_number: '+243 812 345 678',
    is_active: true,
    created_at: '2026-01-10T00:00:00Z'
  },
  {
    id: 'owner-2',
    full_name: 'KinBurger Manager',
    email: 'kinburger@gmail.com',
    role: 'business',
    city: 'Kinshasa',
    phone_number: '+243 823 456 789',
    is_active: true,
    created_at: '2026-02-01T00:00:00Z'
  },
  {
    id: 'client-1',
    full_name: 'Jean Mukendi',
    email: 'jean.mukendi@test.com',
    role: 'client',
    city: 'Kinshasa',
    phone_number: '+243 819 876 543',
    is_active: true,
    created_at: '2026-03-01T00:00:00Z'
  },
  {
    id: 'delivery-1',
    full_name: 'Sylvain Kabeya',
    email: 'sylvain.kabeya@delivery.com',
    role: 'delivery',
    city: 'Kinshasa',
    phone_number: '+243 855 443 322',
    is_active: true,
    created_at: '2026-03-15T00:00:00Z'
  }
];

const getMockTickets = () => [
  {
    id: 'ticket-1',
    user_id: 'client-1',
    subject: "Problème avec le paiement DashMeals Pay",
    message: "Bonjour, j'ai essayé de payer pour ma commande mais l'application a affiché une erreur de réseau au moment de valider le PIN DashMeals Pay. Pourtant mon compte a été débité.",
    status: 'open',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    profiles: {
      full_name: "Jean Mukendi",
      email: "jean.mukendi@test.com"
    }
  },
  {
    id: 'ticket-2',
    user_id: 'owner-2',
    subject: "Demande d'abonnement Premium",
    message: "Je souhaiterais passer mon établissement KinBurger Express en abonnement Gold Premium annuel pour bénéficier des notifications push illimitées et de l'intégration publicitaire.",
    status: 'open',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    profiles: {
      full_name: "KinBurger Manager",
      email: "kinburger@gmail.com"
    }
  }
];

const getMockPublications = () => [
  {
    id: 'm1',
    name: 'Poulet Moambe',
    description: 'Poulet à la sauce arachide avec fufu.',
    price: 12.5,
    image: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&auto=format&fit=crop&q=80',
    category: 'plat',
    is_available: true,
    pubType: 'menu_item',
    restaurantName: 'Chez Mama Africa',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 'k1',
    name: 'Le Kinshasa Burger',
    description: 'Double steak, fromage, sauce secrète.',
    price: 9.0,
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    category: 'plat',
    is_available: true,
    pubType: 'menu_item',
    restaurantName: 'KinBurger Express',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: 'demo-promo-1',
    media_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    media_type: 'image',
    caption: JSON.stringify({
      is_promo_product: true,
      caption: "Offre Spéciale : Le Kinshasa Burger à prix cassé ce midi !",
      menu_item_id: "k1",
      promo_price: 6.90,
      badge_text: "-23%"
    }),
    is_active: true,
    pubType: 'promotion',
    restaurantName: 'KinBurger Express',
    created_at: new Date().toISOString()
  }
];

const getMockOrderMessages = () => [
  {
    id: 'msg-1',
    order_id: 'ord-104',
    sender_id: 'client-1',
    message: "Est-ce que le livreur est déjà en route pour Gombe ?",
    created_at: new Date(Date.now() - 600000).toISOString(),
    profiles: {
      full_name: "Jean Mukendi",
      email: "jean.mukendi@test.com"
    },
    orders: {
      id: 'ord-104',
      total_amount: 15.0
    }
  },
  {
    id: 'msg-2',
    order_id: 'ord-104',
    sender_id: 'owner-1',
    message: "Oui, la commande vient de partir de notre cuisine.",
    created_at: new Date(Date.now() - 500000).toISOString(),
    profiles: {
      full_name: "Maman Africa Chef",
      email: "mama.africa@gmail.com"
    },
    orders: {
      id: 'ord-104',
      total_amount: 15.0
    }
  }
];

interface Props {
  user: User;
  onLogout: () => void;
  theme?: Theme;
  setTheme?: (t: Theme) => void;
  language?: Language;
  setLanguage?: (l: Language) => void;
  font?: AppFont;
  setFont?: (f: AppFont) => void;
  onGoToClient?: () => void;
  onRefreshData?: () => void;
}

type AdminView = 'overview' | 'users' | 'restaurants' | 'publications' | 'verifications' | 'products' | 'support' | 'messages' | 'settings' | 'requests' | 'subscriptions' | 'subadmins';

export const SuperAdminDashboard: React.FC<Props> = ({ user, onLogout, theme, setTheme, language, setLanguage, font, setFont, onGoToClient, onRefreshData }) => {
  const t = useTranslation(language || 'fr');
  const [simulatedSubAdmin, setSimulatedSubAdmin] = useState<any | null>(user?.simulatedSubAdmin || null);
  const activeSubAdmin = user?.simulatedSubAdmin || simulatedSubAdmin;
  const isSubAdminActive = Boolean(activeSubAdmin);
  const isPrincipalAdmin = !isSubAdminActive;
  const fetchStatsRequestId = useRef(0);
  const fetchUsersRequestId = useRef(0);
  const fetchRestaurantsRequestId = useRef(0);
  const [activeView, setActiveView] = useState<AdminView>('overview');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalRestaurants: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingVerifications: 0,
    openTickets: 0,
    subscriptionRequests: 0
  });
  const [users, setUsers] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState<Restaurant[]>([]);
  const [publications, setPublications] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [orderMessages, setOrderMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [emailModal, setEmailModal] = useState<{ isOpen: boolean; to: string; subject: string; body: string } | null>(null);
  const [subscriptionModal, setSubscriptionModal] = useState<{ isOpen: boolean; restaurant: Restaurant | null }>({ isOpen: false, restaurant: null });
  const [selectedTier, setSelectedTier] = useState<string>('free');
  const [subEndDate, setSubEndDate] = useState<string>('');
  const [subFilter, setSubFilter] = useState<string>('all');
  const [refundModal, setRefundModal] = useState<{ isOpen: boolean; restaurant: Restaurant | null; reason: string; returnToFree: boolean }>({ isOpen: false, restaurant: null, reason: '', returnToFree: true });

  const [subSectionView, setSubSectionView] = useState<'restaurants' | 'kpay_transactions'>('kpay_transactions');
  const [kpayTxFilter, setKpayTxFilter] = useState<'all' | 'captured' | 'refunded' | 'pending'>('all');
  const [kpayTypeFilter, setKpayTypeFilter] = useState<'all' | 'subscription' | 'refund' | 'order_payment'>('all');
  const [selectedKpayTx, setSelectedKpayTx] = useState<any | null>(null);
  const [invoiceRecipientEmail, setInvoiceRecipientEmail] = useState<string>('');
  const [isSendingInvoice, setIsSendingInvoice] = useState<boolean>(false);

  const [isBottomMenuOpen, setIsBottomMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    if (user?.simulatedSubAdmin) {
      setSimulatedSubAdmin(user.simulatedSubAdmin);
    }
  }, [user?.simulatedSubAdmin]);

  const [subAdmins, setSubAdmins] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('dashmeals_subadmins');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: 'sub-1',
        full_name: 'Alain Mutombo',
        email: 'alain.mutombo@dashmeals.cd',
        phone_number: '+243 890 123 456',
        password: 'AdminAlain2026!',
        role_title: 'Gestionnaire Paiements & Abonnements',
        permissions: ['subscriptions'],
        is_active: true,
        created_at: new Date(Date.now() - 3600000 * 240).toISOString()
      },
      {
        id: 'sub-2',
        full_name: 'Clarisse Tshilomba',
        email: 'support.clarisse@dashmeals.cd',
        phone_number: '+243 812 987 654',
        password: 'ClarissePass2026!',
        role_title: 'Superviseur Support Client & Tickets',
        permissions: ['support', 'messages'],
        is_active: true,
        created_at: new Date(Date.now() - 3600000 * 120).toISOString()
      },
      {
        id: 'sub-3',
        full_name: 'Patrick Kabongo',
        email: 'patrick.kabongo@dashmeals.cd',
        phone_number: '+243 854 321 098',
        password: 'PatrickPass2026!',
        role_title: 'Agent de Conformité & Validation',
        permissions: ['restaurants', 'verifications'],
        is_active: true,
        created_at: new Date(Date.now() - 3600000 * 48).toISOString()
      }
    ];
  });

  const [subAdminModal, setSubAdminModal] = useState<{
    isOpen: boolean;
    subAdmin: any | null;
  }>({ isOpen: false, subAdmin: null });

  const [showSubAdminPassword, setShowSubAdminPassword] = useState(false);

  const [subAdminFormData, setSubAdminFormData] = useState<{
    full_name: string;
    email: string;
    phone_number: string;
    password: string;
    role_title: string;
    permissions: string[];
  }>({
    full_name: '',
    email: '',
    phone_number: '',
    password: '',
    role_title: '',
    permissions: []
  });

  useEffect(() => {
    try {
      localStorage.setItem('dashmeals_subadmins', JSON.stringify(subAdmins));
      (async () => {
        try {
          await supabase.from('app_settings').upsert({ id: 'sub_admins', value: subAdmins });
        } catch (err) {}
      })();
    } catch (e) {}
  }, [subAdmins]);

  const canAccessView = (view: AdminView): boolean => {
    if (isPrincipalAdmin) return true;
    if (!activeSubAdmin) return true;
    if (view === 'subadmins') return false; // Sub-admins can NEVER view or manage sub-admins
    if (view === 'overview') return true;
    if (view === 'requests') {
      return Boolean(
        activeSubAdmin.permissions?.includes('verifications') ||
        activeSubAdmin.permissions?.includes('subscriptions')
      );
    }
    return Boolean(activeSubAdmin.permissions?.includes(view));
  };

  useEffect(() => {
    if (!canAccessView(activeView)) {
      const allViews: AdminView[] = ['overview', 'users', 'restaurants', 'subscriptions', 'publications', 'verifications', 'support', 'messages', 'settings'];
      const firstAllowed = allViews.find(v => canAccessView(v));
      if (firstAllowed) {
        setActiveView(firstAllowed);
      }
    }
  }, [activeView, activeSubAdmin]);

  const handleGenerateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let generated = "Dash";
    for (let i = 0; i < 6; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    generated += "!";
    setSubAdminFormData(prev => ({ ...prev, password: generated }));
    toast.info("Nouveau mot de passe généré automatiquement.");
  };

  const handleOpenSubAdminModal = (subAdmin?: any) => {
    setShowSubAdminPassword(false);
    if (subAdmin) {
      setSubAdminFormData({
        full_name: subAdmin.full_name || '',
        email: subAdmin.email || '',
        phone_number: subAdmin.phone_number || '',
        password: subAdmin.password || '',
        role_title: subAdmin.role_title || '',
        permissions: subAdmin.permissions || []
      });
      setSubAdminModal({ isOpen: true, subAdmin });
    } else {
      const defaultPass = "DashAdmin" + Math.floor(1000 + Math.random() * 9000) + "!";
      setSubAdminFormData({
        full_name: '',
        email: '',
        phone_number: '',
        password: defaultPass,
        role_title: 'Gestionnaire de Module',
        permissions: ['subscriptions']
      });
      setSubAdminModal({ isOpen: true, subAdmin: null });
    }
  };

  const handleSaveSubAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subAdminFormData.full_name.trim() || !subAdminFormData.email.trim()) {
      toast.error("Veuillez remplir au moins le nom complet et l'adresse email.");
      return;
    }
    if (!subAdminFormData.password.trim()) {
      toast.error("Veuillez définir un mot de passe d'accès pour ce sous-administrateur.");
      return;
    }
    if (subAdminFormData.permissions.length === 0) {
      toast.error("Veuillez sélectionner au moins une permission pour ce sous-administrateur.");
      return;
    }

    if (subAdminModal.subAdmin) {
      setSubAdmins(prev => prev.map(sa => sa.id === subAdminModal.subAdmin.id ? {
        ...sa,
        full_name: subAdminFormData.full_name.trim(),
        email: subAdminFormData.email.trim(),
        phone_number: subAdminFormData.phone_number.trim(),
        password: subAdminFormData.password.trim(),
        role_title: subAdminFormData.role_title.trim(),
        permissions: subAdminFormData.permissions
      } : sa));
      toast.success(`Sous-admin ${subAdminFormData.full_name} mis à jour avec succès !`);
    } else {
      const newSub: any = {
        id: `sub-${Date.now()}`,
        full_name: subAdminFormData.full_name.trim(),
        email: subAdminFormData.email.trim(),
        phone_number: subAdminFormData.phone_number.trim(),
        password: subAdminFormData.password.trim(),
        role_title: subAdminFormData.role_title.trim() || 'Sous-Administrateur',
        permissions: subAdminFormData.permissions,
        is_active: true,
        created_at: new Date().toISOString()
      };
      setSubAdmins(prev => [newSub, ...prev]);
      toast.success(`Sous-admin ${newSub.full_name} créé avec succès !`);
    }

    setSubAdminModal({ isOpen: false, subAdmin: null });
  };

  const handleToggleSubAdminStatus = (id: string) => {
    setSubAdmins(prev => prev.map(sa => sa.id === id ? { ...sa, is_active: !sa.is_active } : sa));
    toast.info("Statut du sous-administrateur mis à jour.");
  };

  const handleDeleteSubAdmin = (id: string, name: string) => {
    if (confirm(`Voulez-vous vraiment supprimer le sous-administrateur "${name}" ?`)) {
      setSubAdmins(prev => prev.filter(sa => sa.id !== id));
      if (simulatedSubAdmin?.id === id) {
        setSimulatedSubAdmin(null);
      }
      toast.success(`Sous-administrateur "${name}" supprimé.`);
    }
  };

  const togglePermission = (perm: string) => {
    setSubAdminFormData(prev => {
      const exists = prev.permissions.includes(perm);
      return {
        ...prev,
        permissions: exists ? prev.permissions.filter(p => p !== perm) : [...prev.permissions, perm]
      };
    });
  };

  const handleSendInvoiceEmail = async (tx: any, targetEmail?: string) => {
    const emailToSend = (targetEmail || invoiceRecipientEmail || 'partenaire@dashmeals.cd').trim();
    if (!emailToSend || !emailToSend.includes('@')) {
      toast.error("Veuillez saisir une adresse email valide pour l'envoi de la facture.");
      return;
    }

    setIsSendingInvoice(true);
    try {
      const invNum = tx.type === 'refund' 
        ? `AVOIR-${Math.floor(100000 + Math.random() * 900000)}` 
        : `FAC-${Math.floor(100000 + Math.random() * 900000)}`;

      await sendTransactionInvoiceEmail({
        clientEmail: emailToSend,
        clientName: tx.payerName || tx.restaurantName,
        restaurantName: tx.restaurantName,
        invoiceNumber: invNum,
        invoiceType: tx.type === 'refund' ? 'refund' : tx.type === 'subscription' ? 'subscription' : 'order',
        grossAmount: Math.abs(tx.grossAmount || 0),
        feeAmount: Math.abs(tx.feeAmount || 0),
        netAmount: Math.abs(tx.netAmount || 0),
        paymentChannel: tx.paymentChannel || 'DashMeals Pay Gateway',
        txRef: tx.txRef,
        date: tx.createdAt,
        notes: tx.notes
      });

      toast.success(`Facture officielle N° ${invNum} envoyée avec succès à ${emailToSend} !`);
    } catch (err: any) {
      console.error('Invoice email error:', err);
      toast.error("Erreur lors de l'envoi de la facture: " + (err.message || "Échec d'envoi"));
    } finally {
      setIsSendingInvoice(false);
    }
  };

  const [kpayTransactions, setKpayTransactions] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('dashmeals_kpay_txs');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}

    return [
      {
        id: 'kpay_tx_101',
        txRef: 'KPAY-2026-884120',
        createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
        restaurantName: 'KinBurger Express',
        payerName: 'Jean Mukendi',
        type: 'subscription',
        grossAmount: 49.00,
        feeAmount: 1.23,
        netAmount: 47.77,
        currency: 'USD',
        status: 'captured',
        paymentChannel: 'DashMeals Pay (M-Pesa)',
        notes: 'Abonnement Mensuel Gold Premium'
      },
      {
        id: 'kpay_tx_102',
        txRef: 'KPAY-2026-773192',
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        restaurantName: 'Le Jardin Gourmand',
        payerName: 'Marie Claire',
        type: 'subscription',
        grossAmount: 29.00,
        feeAmount: 0.73,
        netAmount: 28.27,
        currency: 'USD',
        status: 'captured',
        paymentChannel: 'DashMeals Pay (Orange)',
        notes: 'Abonnement Mensuel Basic'
      },
      {
        id: 'kpay_tx_103',
        txRef: 'KPAY-2026-992145',
        createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        restaurantName: 'Chez Ntemba Lounge',
        payerName: 'Joseph K.',
        type: 'subscription',
        grossAmount: 99.00,
        feeAmount: 2.48,
        netAmount: 96.52,
        currency: 'USD',
        status: 'captured',
        paymentChannel: 'DashMeals Pay (Airtel)',
        notes: 'Abonnement Annuel Elite VIP'
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('dashmeals_kpay_txs', JSON.stringify(kpayTransactions));
    } catch (e) {}
  }, [kpayTransactions]);

  const [editRestaurantModal, setEditRestaurantModal] = useState<{ isOpen: boolean; restaurant: Restaurant | null }>({ isOpen: false, restaurant: null });
  const [editRestoForm, setEditRestoForm] = useState<{
    id: string;
    name: string;
    type: BusinessType;
    city: string;
    description: string;
    exchangeRate: number;
    isVerified: boolean;
    verificationStatus: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    subscriptionEndDate: string;
    isActive: boolean;
    isOpen: boolean;
    preparationTime: number;
    estimatedDeliveryTime: number;
    deliveryAvailable: boolean;
    displayCurrencyMode: 'dual' | 'usd' | 'cdf';
  }>({
    id: '',
    name: '',
    type: 'restaurant',
    city: 'Kinshasa',
    description: '',
    exchangeRate: 2850,
    isVerified: false,
    verificationStatus: 'unverified',
    subscriptionTier: 'free',
    subscriptionStatus: 'active',
    subscriptionEndDate: '',
    isActive: true,
    isOpen: true,
    preparationTime: 20,
    estimatedDeliveryTime: 30,
    deliveryAvailable: true,
    displayCurrencyMode: 'dual'
  });

  const handleOpenEditRestaurant = (r: Restaurant) => {
    setEditRestoForm({
      id: r.id,
      name: r.name || '',
      type: r.type || 'restaurant',
      city: r.city || 'Kinshasa',
      description: r.description || '',
      exchangeRate: r.exchangeRate || 2850,
      isVerified: r.isVerified || false,
      verificationStatus: r.verificationStatus || 'unverified',
      subscriptionTier: r.subscriptionTier || 'free',
      subscriptionStatus: r.subscriptionStatus || 'active',
      subscriptionEndDate: r.subscriptionEndDate ? r.subscriptionEndDate.split('T')[0] : '',
      isActive: r.isActive !== false,
      isOpen: r.isOpen !== false,
      preparationTime: r.preparationTime || 20,
      estimatedDeliveryTime: r.estimatedDeliveryTime || 30,
      deliveryAvailable: r.deliveryAvailable !== false,
      displayCurrencyMode: r.displayCurrencyMode || 'dual'
    });
    setEditRestaurantModal({ isOpen: true, restaurant: r });
  };

  const handleSaveRestaurantDetails = async () => {
    if (!isPrincipalAdmin) {
      toast.error("Action non autorisée. Seul l'administrateur principal est habilité à modifier les établissements.");
      return;
    }
    if (!editRestoForm.id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({
          name: editRestoForm.name,
          type: editRestoForm.type,
          city: editRestoForm.city,
          description: editRestoForm.description,
          exchange_rate: Number(editRestoForm.exchangeRate) || 2850,
          is_verified: editRestoForm.isVerified,
          verification_status: editRestoForm.verificationStatus,
          subscription_tier: editRestoForm.subscriptionTier,
          subscription_status: editRestoForm.subscriptionStatus,
          subscription_end_date: editRestoForm.subscriptionEndDate || null,
          is_active: editRestoForm.isActive,
          is_open: editRestoForm.isOpen,
          preparation_time: Number(editRestoForm.preparationTime) || 20,
          estimated_delivery_time: Number(editRestoForm.estimatedDeliveryTime) || 30,
          delivery_available: editRestoForm.deliveryAvailable,
          display_currency_mode: editRestoForm.displayCurrencyMode
        })
        .eq('id', editRestoForm.id);

      if (error) throw error;

      toast.success(`Informations de "${editRestoForm.name}" enregistrées avec succès !`);
      setEditRestaurantModal({ isOpen: false, restaurant: null });
      fetchRestaurants();
      fetchStats();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      console.error("Error updating restaurant details:", err);
      toast.error("Erreur de sauvegarde : " + (err.message || "Vérifiez vos permissions."));
    } finally {
      setLoading(false);
    }
  };
  const [appSettings, setAppSettings] = useState<AppSettings>({
    support_email: '',
    support_phone: '',
    support_whatsapp: '',
    office_address: '',
    payment_exchange_rate: 2850
  });

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [roleModal, setRoleModal] = useState<{ isOpen: boolean; userId: string; currentRole: string }>({ isOpen: false, userId: '', currentRole: '' });
  const [newUserData, setNewUserData] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'client', // client, business, delivery, superadmin
    city: 'Kinshasa',
    password: ''
  });

  const handleCreateUser = async () => {
    if (!isPrincipalAdmin) {
      toast.error("Action non autorisée. Seul l'administrateur principal est habilité à créer de nouveaux utilisateurs.");
      return;
    }

    if (!newUserData.fullName || !newUserData.email || !newUserData.password) {
      toast.error("Veuillez remplir tous les champs obligatoires (Nom complet, Email, Mot de passe).");
      return;
    }

    setLoading(true);
    try {
      console.log("Envoi de la requête de création d'utilisateur...", newUserData);
      
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      const response = await fetch('/api/admin/create-user', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           ...(token ? { 'Authorization': `Bearer ${token}` } : {})
         },
         body: JSON.stringify({
           fullName: newUserData.fullName,
           email: newUserData.email,
           password: newUserData.password,
           role: newUserData.role,
           city: newUserData.city,
           phone: newUserData.phone
         })
       });

      const resData = await parseJsonResponse(response);

      if (!response.ok || resData.error) {
        const errorMsg = resData.error || "Erreur de communication avec le serveur.";
        const customError = new Error(errorMsg);
        if (resData.code) {
          (customError as any).code = resData.code;
        }
        throw customError;
      }

      toast.success("Utilisateur créé avec succès ! Suivi du profil ajouté.");
      setIsAddUserModalOpen(false);
      setNewUserData({
        fullName: '',
        email: '',
        phone: '',
        role: 'client',
        city: 'Kinshasa',
        password: ''
      });
      fetchUsers();
      fetchStats();
    } catch (apiError: any) {
      if (apiError.code === "user_already_registered" || 
          (apiError.message && (
            apiError.message.includes("already registered") || 
            apiError.message.toLowerCase().includes("already registered") || 
            apiError.message.includes("déjà enregistrée") ||
            apiError.message.includes("already_registered")
          ))) {
        toast.error(apiError.message || "Cette adresse e-mail est déjà enregistrée.");
        setLoading(false);
        return;
      }

      console.warn("Échec requête API Admin (Normal si clé de service non configurée). Insertion directe dans la table profiles en secours local...", apiError);
      
      try {
        const generateUUID = () => {
          try {
            if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
              return window.crypto.randomUUID();
            }
          } catch (e) {}
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        };
        
        const fallbackId = generateUUID();
        const { error: insertError } = await supabase.from('profiles').insert({
          id: fallbackId,
          role: newUserData.role,
          full_name: newUserData.fullName,
          email: newUserData.email,
          phone_number: newUserData.phone,
          city: newUserData.city,
          is_active: true
        });

        if (insertError) throw insertError;

        toast.success("Utilisateur ajouté directement à la table profiles (mode autonome) !");
        setIsAddUserModalOpen(false);
        setNewUserData({
          fullName: '',
          email: '',
          phone: '',
          role: 'client',
          city: 'Kinshasa',
          password: ''
        });
        fetchUsers();
        fetchStats();
      } catch (fallbackError: any) {
        console.error("Erreur fatale lors de la création de l'utilisateur :", fallbackError);
        toast.error("Erreur de création : " + (fallbackError.message || "Impossible de créer le profil."));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Listen for realtime changes
    const channel = supabase
      .channel('superadmin_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, (payload) => {
        console.log("Ticket change detected:", payload);
        fetchStats();
        // Since this effect doesn't depend on activeView, we can't easily call fetchSupportTickets() here
        // unless we use a ref for activeView or just fetch it anyway if needed.
        // For simplicity, we'll rely on the other useEffect to fetch when the view is active.
        
        if (payload.eventType === 'INSERT') {
          toast.info("Nouveau ticket de support reçu !", {
            description: (payload.new as any).subject,
            duration: 5000
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurants' }, () => {
        console.log("Restaurant change detected");
        fetchStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        console.log("Order change detected");
        fetchStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        console.log("Message change detected");
        // We'll let the other useEffect or manual refresh handles the data
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        console.log("Profile change detected");
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Only once at mount

  useEffect(() => {
    if (activeView === 'users') fetchUsers();
    if (activeView === 'restaurants') fetchRestaurants();
    if (activeView === 'verifications') fetchPendingVerifications();
    if (activeView === 'publications') fetchPublications();
    if (activeView === 'support') {
        fetchSupportTickets();
        fetchRestaurants();
    }
    if (activeView === 'messages') fetchOrderMessages();
    if (activeView === 'settings') fetchAppSettings();
    if (activeView === 'requests') {
        fetchPendingVerifications();
        fetchSupportTickets();
        fetchRestaurants();
    }
  }, [activeView]);

  const fetchAppSettings = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('id', 'global')
        .single();
      
      if (data?.value) {
        const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        setAppSettings({
          support_email: raw.support_email || '',
          support_phone: raw.support_phone || '',
          support_whatsapp: raw.support_whatsapp || '',
          office_address: raw.office_address || '',
          payment_exchange_rate: raw.payment_exchange_rate || 2850
        });
      }

      const { data: subData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('id', 'sub_admins')
        .maybeSingle();
      if (subData?.value) {
        const rawSubs = typeof subData.value === 'string' ? JSON.parse(subData.value) : subData.value;
        if (Array.isArray(rawSubs) && rawSubs.length > 0) {
          setSubAdmins(rawSubs);
          localStorage.setItem('dashmeals_subadmins', JSON.stringify(rawSubs));
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAppSettings();

    const appSettingsSubscription = supabase
      .channel('admin:app_settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings', filter: 'id=eq.global' }, (payload) => {
        if (payload.new && (payload.new as any).value) {
          const raw = typeof (payload.new as any).value === 'string' ? JSON.parse((payload.new as any).value) : (payload.new as any).value;
          setAppSettings({
            support_email: raw.support_email || '',
            support_phone: raw.support_phone || '',
            support_whatsapp: raw.support_whatsapp || '',
            office_address: raw.office_address || '',
            payment_exchange_rate: raw.payment_exchange_rate || 2850
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(appSettingsSubscription);
    };
  }, []);

  const updateAppSettings = async () => {
    if (!isPrincipalAdmin) {
      toast.error("Action non autorisée. Seul l'administrateur principal est habilité à modifier les paramètres généraux.");
      return;
    }
    setLoading(true);
    try {
      const cleanSettings = {
        support_email: appSettings.support_email ? appSettings.support_email.trim() : 'support@dashmeals-rdc.com',
        support_phone: appSettings.support_phone ? appSettings.support_phone.trim() : '+243 81 000 0000',
        support_whatsapp: appSettings.support_whatsapp ? appSettings.support_whatsapp.trim() : '+243 81 000 0001',
        office_address: appSettings.office_address ? appSettings.office_address.trim() : 'Boulevard du 30 Juin, Gombe, Kinshasa, RDC.',
        payment_exchange_rate: Number(appSettings.payment_exchange_rate) || 2850
      };

      let savedOk = false;

      // 1. First try updating via the backend API endpoint (bypasses client-side RLS using service role key)
      try {
        const res = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanSettings)
        });
        if (res.ok) {
          savedOk = true;
        }
      } catch (apiErr) {
        console.warn("API settings update endpoint unavailable, trying direct Supabase upsert...", apiErr);
      }

      // 2. Also run client-side Supabase upsert to ensure Realtime listeners fire instantly
      const { error } = await supabase
        .from('app_settings')
        .upsert({ id: 'global', value: cleanSettings, updated_at: new Date().toISOString() });
      
      if (!savedOk && error) {
        throw error;
      }
      
      setAppSettings(cleanSettings);
      toast.success("Paramètres généraux mis à jour avec succès !");
      if (onRefreshData) onRefreshData();
    } catch (error: any) {
      console.error("Error updating settings:", error);
      toast.error("Erreur : " + (error.message || "Impossible de sauvegarder la configuration"));
    }
    setLoading(false);
  };

  const handleNavigation = (view: AdminView) => {
      if (!canAccessView(view)) {
        toast.error("Permission insuffisante : Votre rôle de sous-administrateur ne vous donne pas accès à ce module.");
        return;
      }
      setActiveView(view);
      setIsMobileMenuOpen(false);
  };

  const fetchStats = async () => {
    const requestId = ++fetchStatsRequestId.current;
    try {
      let userCount = 0;
      let restoCount = 0;
      let orderCount = 0;
      let verificationCount = 0;
      let ticketCount = 0;
      let subCount = 0;

      try {
        const { count: uc, error: err1 } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        if (!err1) userCount = uc || 0;
      } catch (e) {}

      try {
        const { count: rc, error: err2 } = await supabase.from('restaurants').select('*', { count: 'exact', head: true });
        if (!err2) restoCount = rc || 0;
      } catch (e) {}

      try {
        const { count: oc, error: err3 } = await supabase.from('orders').select('*', { count: 'exact', head: true });
        if (!err3) orderCount = oc || 0;
      } catch (e) {}

      try {
        const { count: vc, error: err4 } = await supabase.from('restaurants').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending');
        if (!err4) verificationCount = vc || 0;
      } catch (e) {}

      try {
        const { count: tc, error: err5 } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open');
        if (!err5) ticketCount = tc || 0;
      } catch (e) {}

      try {
        const { count: sc } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open').ilike('subject', '%abonnement%');
        subCount = sc || 0;
      } catch (e) {}

      if (userCount === 0) userCount = getMockProfiles().length;
      if (restoCount === 0) restoCount = MOCK_RESTAURANTS.length;
      if (orderCount === 0) orderCount = 15;
      if (verificationCount === 0) verificationCount = 1;
      if (ticketCount === 0) ticketCount = getMockTickets().length;
      if (subCount === 0) subCount = 1;

      if (requestId !== fetchStatsRequestId.current) return;

      setStats({
        totalUsers: userCount,
        totalRestaurants: restoCount,
        totalOrders: orderCount,
        totalRevenue: orderCount * 25,
        pendingVerifications: verificationCount,
        openTickets: ticketCount,
        subscriptionRequests: subCount
      });
    } catch (error) {
      if (requestId !== fetchStatsRequestId.current) return;
      console.error("Error fetching stats:", error);
    }
  };

  const fetchUsers = async () => {
    const requestId = ++fetchUsersRequestId.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (requestId !== fetchUsersRequestId.current) return;
      setUsers(data || []);
    } catch (error: any) {
      if (requestId !== fetchUsersRequestId.current) return;
      console.error("Error fetching users:", error);
      setUsers([]);
    } finally {
      if (requestId === fetchUsersRequestId.current) {
        setLoading(false);
      }
    }
  };

  const fetchRestaurants = async () => {
    const requestId = ++fetchRestaurantsRequestId.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('restaurants').select('*').order('created_at', { ascending: false });
      
      if (error) throw error;
      if (requestId !== fetchRestaurantsRequestId.current) return;
      if (data && data.length > 0) {
        setRestaurants(data.map((r: any) => ({
            ...r,
            ownerId: r.owner_id,
            reviewCount: r.review_count,
            preparationTime: r.preparation_time,
            estimatedDeliveryTime: r.estimated_delivery_time,
            deliveryAvailable: r.delivery_available,
            coverImage: r.cover_image,
            isVerified: r.is_verified === true,
            isOpen: r.is_open === true,
            isActive: r.is_active !== false,
            subscriptionTier: r.subscription_tier,
            subscriptionStatus: r.subscription_status,
            subscriptionEndDate: r.subscription_end_date,
            menu: []
        })));
      } else {
        setRestaurants([]);
      }
    } catch (error: any) {
      if (requestId !== fetchRestaurantsRequestId.current) return;
      console.error("Error fetching restaurants:", error);
      setRestaurants([]);
    } finally {
      if (requestId === fetchRestaurantsRequestId.current) {
        setLoading(false);
      }
    }
  };

  const fetchPendingVerifications = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
          .from('restaurants')
          .select('*')
          .eq('verification_status', 'pending')
          .order('created_at', { ascending: false });
          
      if (error) throw error;
      
      if (data && data.length > 0) {
        setPendingVerifications(data.map((r: any) => ({
            ...r,
            ownerId: r.owner_id,
            reviewCount: r.review_count,
            preparationTime: r.preparation_time,
            estimatedDeliveryTime: r.estimated_delivery_time,
            deliveryAvailable: r.delivery_available,
            coverImage: r.cover_image,
            isVerified: r.is_verified === true,
            isOpen: r.is_open === true,
            isActive: r.is_active !== false,
            verificationStatus: r.verification_status,
            verificationDocs: r.verification_docs,
            verificationPaymentStatus: r.verification_payment_status,
            subscriptionTier: r.subscription_tier,
            subscriptionStatus: r.subscription_status,
            subscriptionEndDate: r.subscription_end_date,
            menu: []
        })));
      } else {
        setPendingVerifications([
          {
            id: '2',
            ownerId: 'owner-2',
            type: 'snack',
            name: 'KinBurger Express',
            description: 'Burgers rapides et savoureux.',
            latitude: -4.3060,
            longitude: 15.2980,
            city: 'Kinshasa',
            isOpen: true,
            rating: 4.2,
            reviewCount: 89,
            preparationTime: 12,
            estimatedDeliveryTime: 20,
            deliveryAvailable: true,
            coverImage: 'https://picsum.photos/800/600?random=2',
            currency: 'USD',
            isVerified: false,
            createdAt: '2026-02-01T00:00:00Z',
            verificationStatus: 'pending',
            verificationDocs: {
              registryNumber: 'RC/KIN/26-B-0421',
              taxNumber: 'A1604561Z',
              idCardUrl: 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=600&auto=format&fit=crop&q=80',
              businessLicenseUrl: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=600&auto=format&fit=crop&q=80'
            },
            verificationPaymentStatus: 'paid',
            subscriptionTier: 'free',
            subscriptionStatus: 'active',
            subscriptionEndDate: '',
            menu: []
          } as any
        ]);
      }
    } catch (error: any) {
      console.error("Error fetching verifications:", error);
      setPendingVerifications([
        {
          id: '2',
          ownerId: 'owner-2',
          type: 'snack',
          name: 'KinBurger Express',
          description: 'Burgers rapides et savoureux.',
          latitude: -4.3060,
          longitude: 15.2980,
          city: 'Kinshasa',
          isOpen: true,
          rating: 4.2,
          reviewCount: 89,
          preparationTime: 12,
          estimatedDeliveryTime: 20,
          deliveryAvailable: true,
          coverImage: 'https://picsum.photos/800/600?random=2',
          currency: 'USD',
          isVerified: false,
          createdAt: '2026-02-01T00:00:00Z',
          verificationStatus: 'pending',
          verificationDocs: {
            registryNumber: 'RC/KIN/26-B-0421',
            taxNumber: 'A1604561Z',
            idCardUrl: 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=600&auto=format&fit=crop&q=80',
            businessLicenseUrl: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=600&auto=format&fit=crop&q=80'
          },
          verificationPaymentStatus: 'paid',
          subscriptionTier: 'free',
          subscriptionStatus: 'active',
          subscriptionEndDate: '',
          menu: []
        } as any
      ]);
    }
    setLoading(false);
  };

  const cleanVerificationData = async () => {
    setLoading(true);
    try {
      // On récupère tous les 'pending' pour vérifier localement car les filtres JSON complexes sont limités en RLS/RPC
      const { data: pending, error: fetchError } = await supabase
        .from('restaurants')
        .select('id, verification_docs')
        .eq('verification_status', 'pending');
        
      if (fetchError) throw fetchError;
      
      const toReset = pending?.filter(r => 
        !r.verification_docs || 
        !r.verification_docs.registryNumber || 
        r.verification_docs.registryNumber.trim() === ""
      ).map(r => r.id) || [];
      
      if (toReset.length > 0) {
        const { error: updateError } = await supabase
          .from('restaurants')
          .update({ 
            verification_status: 'unverified',
            verification_requested: false 
          })
          .in('id', toReset);
          
        if (updateError) throw updateError;
        toast.success(`${toReset.length} demande(s) nettoyée(s) !`);
      } else {
        toast.info("Aucune donnée orpheline trouvée.");
      }
      
      fetchPendingVerifications();
      fetchRestaurants();
    } catch (error: any) {
      console.error("Cleanup error:", error);
      toast.error("Erreur lors du nettoyage : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPublications = async () => {
    setLoading(true);
    try {
      const { data: menuData, error: menuError } = await supabase
          .from('menu_items')
          .select('*, restaurants(name, currency, exchange_rate, display_currency_mode)')
          .order('created_at', { ascending: false });
          
      if (menuError) throw menuError;

      const { data: promoData, error: promoError } = await supabase
          .from('promotions')
          .select('*, restaurants(name, currency, exchange_rate, display_currency_mode)')
          .order('created_at', { ascending: false });
          
      if (promoError) throw promoError;

      let combined: any[] = [];
      if ((menuData && menuData.length > 0) || (promoData && promoData.length > 0)) {
        combined = [
            ...(menuData || []).map((m: any) => ({ ...m, pubType: 'menu_item', restaurantName: m.restaurants?.name, restaurantCurrency: m.restaurants?.currency, restaurantExchangeRate: m.restaurants?.exchange_rate, restaurantDisplayCurrencyMode: m.restaurants?.display_currency_mode })),
            ...(promoData || []).map((p: any) => ({ ...p, pubType: 'promotion', restaurantName: p.restaurants?.name, restaurantCurrency: p.restaurants?.currency, restaurantExchangeRate: p.restaurants?.exchange_rate, restaurantDisplayCurrencyMode: p.restaurants?.display_currency_mode }))
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else {
        combined = getMockPublications();
      }
      
      setPublications(combined);
    } catch (error: any) {
      console.error("Error fetching publications:", error);
      setPublications(getMockPublications());
    }
    setLoading(false);
  };

  const fetchSupportTickets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      if (data && data.length > 0) {
        setSupportTickets(data);
      } else {
        setSupportTickets(getMockTickets());
      }
    } catch (error: any) {
      console.error("Error fetching tickets:", error);
      setSupportTickets(getMockTickets());
    }
    setLoading(false);
  };

  const fetchOrderMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles:sender_id(full_name, email)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
          const orderIds = data.filter(m => m.order_id && !m.order_id.startsWith('sub-')).map(m => m.order_id);
          let ordersMap = new Map();
          
          if (orderIds.length > 0) {
              const { data: ordersData } = await supabase
                .from('orders')
                .select('id, total_amount')
                .in('id', orderIds);
              ordersData?.forEach(o => ordersMap.set(o.id, o));
          }
          
          const enrichedMessages = data.map(m => ({
              ...m,
              orders: ordersMap.get(m.order_id) || null
          }));
          
          setOrderMessages(enrichedMessages);
      } else {
        setOrderMessages(getMockOrderMessages());
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      setOrderMessages(getMockOrderMessages());
    }
    setLoading(false);
  };

  const deleteOrderMessage = async (messageId: string) => {
      if (!window.confirm("Voulez-vous vraiment supprimer ce message ?")) return;
      
      setLoading(true);
      try {
          console.log("🗑️ Suppression du message:", messageId);
          const { error } = await supabase.from('messages').delete().eq('id', messageId);
          if (error) {
              console.error("Supabase delete message error:", error);
              throw error;
          }
          toast.success("Message supprimé");
          await fetchOrderMessages();
      } catch (error: any) {
          console.error("Delete message error:", error);
          toast.error("Erreur lors de la suppression : " + (error.message || "Vérifiez vos permissions"));
      } finally {
          setLoading(false);
      }
  };

  const updateTicketStatus = async (ticketId: string, status: string, notes?: string) => {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status, admin_notes: notes || selectedTicket?.admin_notes })
        .eq('id', ticketId);
      
      if (error) throw error;
      toast.success("Ticket mis à jour");

      // Insert notification for the user
      if (selectedTicket && selectedTicket.user_id) {
          const statusLabels: Record<string, string> = {
              'open': 'ouvert',
              'in_progress': 'en cours',
              'resolved': 'résolu',
              'closed': 'fermé'
          };

          await supabase.from('notifications').insert({
              user_id: selectedTicket.user_id,
              title: `Support: ${selectedTicket.subject}`,
              message: notes || `Votre ticket est maintenant ${statusLabels[status] || status}.`,
              type: 'support',
              data: { ticket_id: ticketId, status }
          });
      }

      // Send email if notes are added or status is resolved
      if (selectedTicket && selectedTicket.user_id && (notes || status === 'resolved')) {
          const { data: userProfile } = await supabase.from('profiles').select('full_name, email').eq('id', selectedTicket.user_id).single();
          if (userProfile?.email) {
              sendSupportReplyEmail(
                  userProfile.full_name || 'Utilisateur',
                  userProfile.email,
                  selectedTicket.subject || 'Votre demande de support',
                  notes || selectedTicket.admin_notes || 'Votre ticket a été mis à jour.'
              );
          }
      }

      fetchSupportTickets();
      fetchStats();
      setSelectedTicket(null);
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isLoading?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const deleteVerificationRequest = async (restoId: string) => {
    console.log("🛠️ deleteVerificationRequest for:", restoId);
    setConfirmModal({
        isOpen: true,
        title: "Supprimer la demande",
        message: "Voulez-vous supprimer définitivement cette demande de vérification ?",
        onConfirm: async () => {
            setConfirmModal(prev => ({ ...prev, isLoading: true }));
            try {
                console.log("🗑️ Updating identity verification status to unverified for:", restoId);
                const { error } = await supabase.from('restaurants').update({
                    verification_status: 'unverified',
                    verification_requested: false,
                    verification_docs: null
                }).eq('id', restoId);
                
                if (error) throw error;
                
                toast.success('Demande de vérification supprimée');
                fetchPendingVerifications();
                fetchStats();
                setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
            } catch (error: any) {
                console.error("Delete verification error:", error);
                toast.error("Erreur: " + (error.message || "Permissions ?"));
                setConfirmModal(prev => ({ ...prev, isLoading: false }));
            }
        }
    });
  };

  const deleteTicket = async (ticketId: string) => {
    console.log("🛠️ deleteTicket for:", ticketId);
    setConfirmModal({
        isOpen: true,
        title: "Supprimer le ticket",
        message: "Voulez-vous vraiment supprimer ce ticket ? Cette action est irréversible.",
        onConfirm: async () => {
            setConfirmModal(prev => ({ ...prev, isLoading: true }));
            try {
                console.log("🗑️ Deleting ticket row:", ticketId);
                const { error } = await supabase.from('support_tickets').delete().eq('id', ticketId);
                if (error) throw error;
                
                toast.success("Ticket supprimé avec succès");
                fetchSupportTickets();
                fetchStats();
                setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
            } catch (error: any) {
                console.error("Delete ticket error:", error);
                toast.error("Erreur: " + (error.message || "Permissions ?"));
                setConfirmModal(prev => ({ ...prev, isLoading: false }));
            }
        }
    });
  };

  const togglePublicationStatus = async (pub: any) => {
      const table = pub.pubType === 'menu_item' ? 'menu_items' : 'promotions';
      const currentStatus = pub.pubType === 'menu_item' ? pub.is_available : pub.is_active;
      const updateField = pub.pubType === 'menu_item' ? { is_available: !currentStatus } : { is_active: !currentStatus };
      
      const { error } = await supabase.from(table).update(updateField).eq('id', pub.id);
      if (error) {
          if (error.code === '42703') {
              toast.error("La colonne is_active n'existe pas encore pour les promotions. Veuillez exécuter la commande SQL fournie.");
          } else {
              toast.error("Erreur lors de la modification");
          }
      } else {
          toast.success("Statut mis à jour !");
          fetchPublications();
          if (onRefreshData) onRefreshData();
      }
  };

  const deletePublication = async (pub: any) => {
      if (!isPrincipalAdmin) {
          toast.error("Action non autorisée. Seul l'administrateur principal est habilité à supprimer des publications.");
          return;
      }
      if (!window.confirm("Voulez-vous vraiment supprimer cette publication ?")) return;
      
      setLoading(true);
      try {
          const table = pub.pubType === 'menu_item' ? 'menu_items' : 'promotions';
          console.log("🗑️ Suppression de la publication:", pub.id, "Table:", table);
          const { error } = await supabase.from(table).delete().eq('id', pub.id);
          if (error) {
              console.error("Supabase delete publication error:", error);
              throw error;
          }
          toast.success("Publication supprimée !");
          await fetchPublications();
          if (onRefreshData) onRefreshData();
      } catch (error: any) {
          console.error("Delete publication error:", error);
          toast.error("Erreur lors de la suppression : " + (error.message || "Vérifiez vos permissions"));
      } finally {
          setLoading(false);
      }
  };

  const handleVerification = async (restoId: string, status: 'verified' | 'rejected') => {
      setLoading(true);
      try {
          const { error } = await supabase.from('restaurants').update({
              verification_status: status,
              is_verified: status === 'verified',
              verification_requested: false // Reset request flag after decision
          }).eq('id', restoId);
          
          if (error) {
              console.error("Update error:", error);
              toast.error("Erreur de mise à jour : " + error.message);
              return;
          }
          
          toast.success(`Restaurant ${status === 'verified' ? 'vérifié' : 'rejeté'} avec succès !`);
          
          // Send email and platform notification to owner
          const { data: resto } = await supabase.from('restaurants').select('name, owner_id').eq('id', restoId).single();
          if (resto && resto.owner_id) {
              // Platform Notification
              await supabase.from('notifications').insert({
                  user_id: resto.owner_id,
                  restaurant_id: restoId,
                  title: status === 'verified' ? "Compte Vérifié !" : "Demande de vérification rejetée",
                  message: status === 'verified' 
                      ? `Félicitations ! Votre restaurant "${resto.name}" est désormais vérifié.` 
                      : `Votre demande de vérification pour "${resto.name}" a été rejetée. Veuillez vérifier vos documents.`,
                  type: 'verification_result',
                  data: { restaurant_id: restoId, status }
              });

              // Email Notification
              const { data: owner } = await supabase.from('profiles').select('email').eq('id', resto.owner_id).single();
              if (owner?.email) {
                  sendVerificationStatusEmail(resto.name, owner.email, status);
              }
          }

          fetchPendingVerifications();
          fetchRestaurants();
          fetchStats(); // Update counters
          if (onRefreshData) onRefreshData();
      } catch (error: any) {
          console.error("Verification error:", error);
          toast.error("Erreur : " + (error.message || "Erreur inconnue"));
      } finally {
          setLoading(false);
      }
  };

  const sendVerificationRequest = async (restoId: string) => {
      setLoading(true);
      try {
          // Get restaurant owner_id
          const { data: restoData, error: fetchError } = await supabase
              .from('restaurants')
              .select('owner_id, name')
              .eq('id', restoId)
              .single();
          
          if (fetchError) throw fetchError;

          // Update restaurant to mark verification as requested
          const { error: updateError } = await supabase.from('restaurants').update({
              verification_requested: true,
              verification_status: 'unverified' // Ensure it's not 'pending' yet
          }).eq('id', restoId);
          
          if (updateError) throw updateError;

          // Create notification for the owner
          const { error: notifError } = await supabase.from('notifications').insert({
              user_id: restoData.owner_id,
              title: "Vérification requise",
              message: `L'administrateur demande la vérification de votre restaurant "${restoData.name}". Veuillez soumettre vos documents dans les paramètres.`,
              type: 'verification_request',
              data: { restaurant_id: restoId }
          });

          if (notifError) console.error("Notification error:", notifError);
          
          toast.success("Demande de vérification envoyée !");
          fetchRestaurants();
          if (onRefreshData) onRefreshData();
      } catch (error: any) {
          console.error("Verification request error:", error);
          toast.error("Erreur : " + error.message);
      } finally {
          setLoading(false);
      }
  };

  const toggleRestaurantStatus = async (restoId: string, currentStatus: boolean) => {
      const { error } = await supabase.from('restaurants').update({ is_active: !currentStatus }).eq('id', restoId);
      if (error) {
          toast.error("Erreur lors de la modification du statut");
      } else {
          toast.success(`Restaurant ${!currentStatus ? 'affiché' : 'masqué'}`);
          fetchRestaurants();
          if (onRefreshData) onRefreshData();
      }
  };

  const deleteRestaurant = async (restoId: string) => {
      if (!isPrincipalAdmin) {
          toast.error("Action non autorisée. Seul l'administrateur principal est habilité à supprimer des restaurants.");
          return;
      }
      if (!window.confirm("Voulez-vous vraiment supprimer définitivement ce restaurant ?")) return;
      
      setLoading(true);
      try {
          const { error } = await supabase.from('restaurants').delete().eq('id', restoId);
          if (error) {
              console.error("Delete restaurant error:", error);
              throw new Error(error.message);
          }
          toast.success("Restaurant supprimé avec succès");
          await fetchRestaurants();
          await fetchStats();
          if (onRefreshData) onRefreshData();
      } catch (error: any) {
          console.error("Delete restaurant catch error:", error);
          toast.error("Erreur lors de la suppression : " + (error.message || "Vérifiez les contraintes de base de données"));
      } finally {
          setLoading(false);
      }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
      if (!isPrincipalAdmin) {
          toast.error("Action non autorisée. Seul l'administrateur principal est habilité à suspendre un utilisateur.");
          return;
      }
      const { error } = await supabase.from('profiles').update({ is_active: !currentStatus }).eq('id', userId);
      if (error) {
          toast.error("Erreur lors de la modification du statut");
      } else {
          toast.success(`Utilisateur ${!currentStatus ? 'activé' : 'désactivé'}`);
          fetchUsers();
          if (onRefreshData) onRefreshData();
      }
  };

  const changeUserRole = async (userId: string, newRole: string) => {
      if (!isPrincipalAdmin) {
          toast.error("Action non autorisée. Seul l'administrateur principal est habilité à changer les rôles.");
          return;
      }
      setLoading(true);
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      setLoading(false);
      if (error) {
          toast.error("Erreur lors du changement de rôle");
          console.error(error);
      } else {
          toast.success(`Rôle changé avec succès en ${newRole}`);
          setRoleModal({ isOpen: false, userId: '', currentRole: '' });
          fetchUsers();
          if (onRefreshData) onRefreshData();
      }
  };

  const deleteUser = async (userId: string) => {
      if (!isPrincipalAdmin) {
          toast.error("Action non autorisée. Seul l'administrateur principal est habilité à supprimer des utilisateurs.");
          return;
      }
      setConfirmModal({
          isOpen: true,
          title: "Supprimer l'utilisateur",
          message: "Voulez-vous vraiment supprimer définitivement cet utilisateur et son profil ?",
          onConfirm: async () => {
              setConfirmModal(prev => ({ ...prev, isLoading: true }));
              try {
                  console.log("🗑️ Deleting user account:", userId);
                  // Try to use RPC for full account deletion
                  const { error: rpcError } = await supabase.rpc('delete_user_account', { user_id: userId });
                  
                  if (rpcError) {
                      console.warn("RPC delete failed, falling back to profile delete:", rpcError);
                      // Fallback to just deleting the profile
                      const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
                      if (profileError) throw profileError;
                  }
                  
                  toast.success("Utilisateur supprimé avec succès");
                  await fetchUsers();
                  await fetchStats();
                  if (onRefreshData) onRefreshData();
                  setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
              } catch (error: any) {
                  console.error("Delete user error:", error);
                  toast.error("Erreur lors de la suppression : " + (error.message || "Erreur inconnue"));
                  setConfirmModal(prev => ({ ...prev, isLoading: false }));
              }
          }
      });
  };

  const updateSubscription = async () => {
    if (!isPrincipalAdmin) {
      toast.error("Action non autorisée. Seul l'administrateur principal est habilité à gérer les abonnements.");
      return;
    }
    if (!subscriptionModal.restaurant) return;
    setLoading(true);
    try {
        const { error } = await supabase
            .from('restaurants')
            .update({
                subscription_tier: selectedTier,
                subscription_end_date: subEndDate || null,
                subscription_status: 'active'
            })
            .eq('id', subscriptionModal.restaurant.id);
        
        if (error) throw error;
        toast.success("Abonnement mis à jour !");

        // Send email to the restaurant owner notifying them of the subscription update
        try {
          const { data: ownerProfile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', subscriptionModal.restaurant.ownerId)
            .single();

          if (ownerProfile?.email) {
            const planNames: Record<string, string> = {
              free: "Gratuit",
              premium: "Premium Pro",
              business: "Business Max",
              enterprise: "Entreprise"
            };
            const planName = planNames[selectedTier] || selectedTier.toUpperCase();
            const endDateFormatted = subEndDate 
              ? new Date(subEndDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) 
              : 'Non définie';

            await sendEmail({
              to: ownerProfile.email,
              subject: `[DashMeals] Mise à jour de votre abonnement - ${subscriptionModal.restaurant.name}`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; color: white;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Abonnement Mis à Jour</h1>
                    <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Votre restaurant ${subscriptionModal.restaurant.name} a été mis à jour par l'administration.</p>
                  </div>
                  <div style="padding: 30px; color: #1f2937; line-height: 1.6;">
                    <p style="font-size: 16px; margin-top: 0;">Bonjour <strong>${ownerProfile.full_name || "Partenaire"}</strong>,</p>
                    <p>Nous vous informons qu'un administrateur a mis à jour le statut d'abonnement de votre restaurant <strong>${subscriptionModal.restaurant.name}</strong>.</p>
                    
                    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; border-radius: 12px; margin: 25px 0;">
                      <h3 style="margin-top: 0; color: #10b981; font-size: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; text-transform: uppercase;">Détails de l'Abonnement</h3>
                      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr>
                          <td style="padding: 6px 0; color: #4b5563; font-weight: 500;">Établissement :</td>
                          <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #111827;">${subscriptionModal.restaurant.name}</td>
                        </tr>
                        <tr>
                          <td style="padding: 6px 0; color: #4b5563; font-weight: 500;">Forfait :</td>
                          <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #10b981;">${planName}</td>
                        </tr>
                        <tr>
                          <td style="padding: 6px 0; color: #4b5563; font-weight: 500;">Statut :</td>
                          <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #10b981;">Actif</td>
                        </tr>
                        <tr>
                          <td style="padding: 6px 0; color: #4b5563; font-weight: 500;">Date d'expiration :</td>
                          <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #111827;">${endDateFormatted}</td>
                        </tr>
                      </table>
                    </div>
                    
                    <p>Si vous avez des questions, notre support est à votre entière disposition.</p>
                    
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;" />
                    <p style="font-size: 12px; color: #6b7280; text-align: center; margin-bottom: 0;">L'équipe DashMeals Admin.</p>
                  </div>
                </div>
              `
            });
          }
        } catch (emailErr) {
          console.error("Error sending subscription update email:", emailErr);
        }

        setSubscriptionModal({ isOpen: false, restaurant: null });
        fetchRestaurants();
        if (onRefreshData) onRefreshData();
    } catch (error: any) {
        toast.error("Erreur : " + error.message);
    }
    setLoading(false);
  };

  const viewDocument = async (documentUrl: string) => {
      if (!documentUrl) {
          toast.error("Aucun document disponible");
          return;
      }
      setSelectedDocument(documentUrl);
      window.open(documentUrl, '_blank');
  };

  const downloadDocument = async (documentUrl: string, fileName: string) => {
      try {
          const response = await fetch(documentUrl);
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          toast.success("Téléchargement démarré");
      } catch (error) {
          console.error("Download error:", error);
          toast.error("Erreur lors du téléchargement");
      }
  };

  // Filtrer les utilisateurs par recherche
  const filteredUsers = users.filter(u => {
      const search = searchTerm.toLowerCase();
      const fullName = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const id = (u.id || '').toLowerCase();
      
      return (fullName.includes(search) || email.includes(search) || id.includes(search)) && u.role !== 'superadmin';
  });

  const syncUsers = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('sync_users_to_profiles');
      if (error) throw error;
      toast.success("Utilisateurs synchronisés !");
      fetchUsers();
      fetchStats();
    } catch (error) {
      console.error("Sync error:", error);
      toast.error("Erreur lors de la synchronisation");
    } finally {
      setLoading(false);
    }
  };

  const renderSupport = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <div>
                <h3 className="font-bold text-lg text-gray-800 dark:text-white">Centre de Support</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Gérez les demandes d'assistance des utilisateurs</p>
            </div>
            <button onClick={fetchSupportTickets} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                <Activity size={20} className="text-gray-400" />
            </button>
        </div>
        
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase text-xs">
                    <tr>
                        <th className="px-6 py-4">Utilisateur</th>
                        <th className="px-6 py-4">Sujet</th>
                        <th className="px-6 py-4">Statut</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {supportTickets.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="p-12 text-center text-gray-500 dark:text-gray-400">
                                <Mail size={48} className="mx-auto mb-3 opacity-20" />
                                Aucun ticket de support pour le moment
                            </td>
                        </tr>
                    ) : (
                        supportTickets.map(ticket => (
                            <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-900 dark:text-white">{ticket.profiles?.full_name || 'Inconnu'}</div>
                                    <div className="text-xs text-gray-400">{ticket.profiles?.email}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-800 dark:text-gray-200">{ticket.subject}</div>
                                    <div className="text-xs text-gray-500 truncate max-w-xs">{ticket.message}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                                        ticket.status === 'open' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                        ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    }`}>
                                        {ticket.status === 'open' ? 'Ouvert' : ticket.status === 'in_progress' ? 'En cours' : 'Résolu'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-xs">
                                    {new Date(ticket.created_at).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button 
                                        onClick={() => setSelectedTicket(ticket)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                        title="Répondre / Gérer"
                                    >
                                        <MessageCircle size={18} />
                                    </button>
                                    <button 
                                        onClick={() => deleteTicket(ticket.id)}
                                        disabled={loading}
                                        className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors disabled:opacity-50"
                                        title="Supprimer"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>

        {/* Ticket Detail Modal */}
        {selectedTicket && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                        <div>
                            <h3 className="font-black text-gray-900 dark:text-white">Détails du Ticket</h3>
                            <p className="text-xs text-gray-500">ID: {selectedTicket.id}</p>
                        </div>
                        <button onClick={() => setSelectedTicket(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                            <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Message de l'utilisateur</p>
                            <p className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-relaxed">{selectedTicket.message}</p>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Notes Admin / Réponse</label>
                            <textarea 
                                className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white min-h-[120px]"
                                placeholder="Saisissez vos notes ou la réponse ici..."
                                value={selectedTicket.admin_notes || ''}
                                onChange={(e) => setSelectedTicket({...selectedTicket, admin_notes: e.target.value})}
                            />
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={() => updateTicketStatus(selectedTicket.id, selectedTicket.status, selectedTicket.admin_notes)}
                                className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs transition-all tracking-wide active:scale-95 flex items-center justify-center space-x-2 shadow-lg shadow-brand-500/10 mb-4"
                            >
                                <MessageSquare size={14} />
                                <span>Envoyer la réponse (sans changer le statut)</span>
                            </button>
                            
                            <p className="text-[10px] uppercase font-black tracking-widest text-gray-400 mb-2">
                                Ou envoyer & changer le statut :
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <button 
                                onClick={() => updateTicketStatus(selectedTicket.id, 'open', selectedTicket.admin_notes)}
                                className={`py-2 rounded-lg text-xs font-bold transition-all ${selectedTicket.status === 'open' ? 'bg-red-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                            >
                                Re-ouvrir
                            </button>
                            <button 
                                onClick={() => updateTicketStatus(selectedTicket.id, 'in_progress', selectedTicket.admin_notes)}
                                className={`py-2 rounded-lg text-xs font-bold transition-all ${selectedTicket.status === 'in_progress' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                            >
                                En cours
                            </button>
                            <button 
                                onClick={() => updateTicketStatus(selectedTicket.id, 'resolved', selectedTicket.admin_notes)}
                                className={`py-2 rounded-lg text-xs font-bold transition-all ${selectedTicket.status === 'resolved' ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                            >
                                Résoudre
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );

  const renderMessages = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">Messages des Commandes</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Surveillez les échanges entre clients, restaurants et livreurs</p>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase text-xs">
                    <tr>
                        <th className="px-6 py-4">Expéditeur</th>
                        <th className="px-6 py-4">Commande</th>
                        <th className="px-6 py-4">Message</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {orderMessages.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="p-12 text-center text-gray-500 dark:text-gray-400">
                                <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
                                Aucun message de commande trouvé
                            </td>
                        </tr>
                    ) : (
                        orderMessages.map(msg => (
                            <tr key={msg.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-900 dark:text-white">{msg.profiles?.full_name || 'Inconnu'}</div>
                                    <div className="text-xs text-gray-400">{msg.profiles?.email}</div>
                                </td>
                                <td className="px-6 py-4">
                                    {msg.order_id?.startsWith('sub-') ? (
                                        <div className="flex items-center text-xs font-bold text-blue-600 dark:text-blue-400">
                                            <Users size={12} className="mr-1" /> Chat Abonné
                                        </div>
                                    ) : (
                                        <>
                                            <div className="text-xs font-bold text-brand-600 dark:text-brand-400">#{msg.orders?.id?.slice(0, 8) || msg.order_id?.slice(0, 8)}</div>
                                            <div className="text-[10px] text-gray-400">{msg.orders?.total_amount || '0'} USD</div>
                                        </>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{msg.content}</div>
                                </td>
                                <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-xs">
                                    {new Date(msg.created_at).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => deleteOrderMessage(msg.id)}
                                        className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                                        title="Supprimer"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );

  const handleSendManualEmail = async () => {
      if (!emailModal) return;
      if (!emailModal.subject || !emailModal.body) {
          toast.error("Veuillez remplir tous les champs");
          return;
      }

      setLoading(true);
      try {
          const result = await sendEmail({
              to: emailModal.to,
              subject: emailModal.subject,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: #ea580c; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 20px;">Message de l'administration DashMeals</h1>
                  </div>
                  <div style="padding: 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px;">
                    <div style="line-height: 1.6; color: #333;">
                      ${emailModal.body.replace(/\n/g, '<br/>')}
                    </div>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #666;">Ceci est un message officiel de l'équipe DashMeals.</p>
                  </div>
                </div>
              `
          });

          if (result) {
              toast.success("E-mail envoyé avec succès !");
              setEmailModal(null);
          } else {
              toast.error("Erreur lors de l'envoi de l'e-mail");
          }
      } catch (error) {
          toast.error("Erreur lors de l'envoi");
      } finally {
          setLoading(false);
      }
  };

  const renderRoleModal = () => {
      if (!roleModal.isOpen) return null;
      return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/40">
                      <div>
                          <h3 className="font-extrabold text-[#0d1527] dark:text-white text-base uppercase tracking-tight">Modifier le rôle</h3>
                          <p className="text-xs text-gray-500">Attribuer des privilèges spécifiques à cet utilisateur</p>
                      </div>
                      <button onClick={() => setRoleModal({ isOpen: false, userId: '', currentRole: '' })} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Choisir le nouveau rôle *</label>
                          <select 
                              value={roleModal.currentRole}
                              onChange={(e) => setRoleModal({ ...roleModal, currentRole: e.target.value })}
                              className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-650 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white font-semibold"
                          >
                              <option value="client">Client (Utilisateur final)</option>
                              <option value="business">Restaurateur (Gérant d'établissement)</option>
                              <option value="delivery">Livreur (Partenaire Coursier)</option>
                              <option value="superadmin">Sous-Administrateur (Gestionnaire DashMeals)</option>
                          </select>
                      </div>

                      <div className="pt-4 flex gap-3 border-t border-gray-100 dark:border-gray-700">
                          <button 
                              onClick={() => setRoleModal({ isOpen: false, userId: '', currentRole: '' })}
                              className="flex-1 py-3 bg-gray-100 hover:bg-gray-250 dark:bg-gray-700 dark:hover:bg-gray-650 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs transition-all active:scale-95 text-center"
                          >{t('cancel')}</button>
                          <button 
                              onClick={() => changeUserRole(roleModal.userId, roleModal.currentRole)}
                              disabled={loading}
                              className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs transition-all tracking-wide active:scale-95 flex items-center justify-center space-x-2 shadow-lg shadow-brand-500/10"
                          >
                              {loading && <RefreshCw size={14} className="animate-spin" />}
                              <span>{t('save')}</span>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  const renderEmailModal = () => {
      if (!emailModal) return null;
      return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                      <h3 className="font-black text-gray-900 dark:text-white">Envoyer un E-mail</h3>
                      <button onClick={() => setEmailModal(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Destinataire</label>
                          <input 
                              type="text" 
                              disabled 
                              value={emailModal.to}
                              className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm opacity-70"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sujet</label>
                          <input 
                              type="text" 
                              placeholder="Sujet de l'e-mail"
                              value={emailModal.subject}
                              onChange={(e) => setEmailModal({...emailModal, subject: e.target.value})}
                              className="w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Message</label>
                          <textarea 
                              placeholder="Écrivez votre message ici..."
                              value={emailModal.body}
                              onChange={(e) => setEmailModal({...emailModal, body: e.target.value})}
                              className="w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white min-h-[150px]"
                          />
                      </div>
                      <button 
                          onClick={handleSendManualEmail}
                          disabled={loading}
                          className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center gap-2"
                      >
                          {loading ? <RefreshCw size={18} className="animate-spin" /> : <Mail size={18} />}
                          Envoyer l'e-mail
                      </button>
                  </div>
              </div>
          </div>
      );
  };

  const renderOverview = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 animate-in fade-in duration-300">
      {canAccessView('users') && (
        <div className="bg-white dark:bg-[#0d1527] p-6 rounded-3xl shadow-lg hover:shadow-xl dark:shadow-none border border-gray-100/80 dark:border-white/[0.05] transition-all duration-350 hover:-translate-y-1 relative overflow-hidden group cursor-pointer" onClick={() => handleNavigation('users')}>
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-2xl text-blue-600 dark:text-blue-400">
              <Users size={22} />
            </div>
            <span className="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Utilisateurs</span>
          </div>
          <p className="text-3xl font-black text-gray-900 dark:text-white tracking-tight relative z-10">{stats.totalUsers}</p>
          <p className="text-xs text-green-500 font-bold mt-3 flex items-center relative z-10 bg-green-500/5 py-1 px-2 rounded-lg w-max"><Activity size={12} className="mr-1"/> Actifs</p>
        </div>
      )}

      {canAccessView('restaurants') && (
        <div className="bg-white dark:bg-[#0d1527] p-6 rounded-3xl shadow-lg hover:shadow-xl dark:shadow-none border border-gray-100/80 dark:border-white/[0.05] transition-all duration-350 hover:-translate-y-1 relative overflow-hidden group cursor-pointer" onClick={() => handleNavigation('restaurants')}>
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-2xl text-orange-600 dark:text-orange-400">
              <Store size={22} />
            </div>
            <span className="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">{t('restaurants')}</span>
          </div>
          <p className="text-3xl font-black text-gray-900 dark:text-white tracking-tight relative z-10">{stats.totalRestaurants}</p>
          <p className="text-xs text-orange-500 font-bold mt-3 flex items-center relative z-10 bg-orange-500/5 py-1 px-2 rounded-lg w-max">Partenaires actifs</p>
        </div>
      )}

      {(canAccessView('restaurants') || canAccessView('subscriptions')) && (
        <div className="bg-white dark:bg-[#0d1527] p-6 rounded-3xl shadow-lg hover:shadow-xl dark:shadow-none border border-gray-100/80 dark:border-white/[0.05] transition-all duration-350 hover:-translate-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-2xl text-purple-600 dark:text-purple-400">
              <ShoppingBag size={22} />
            </div>
            <span className="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">{t('orders')}</span>
          </div>
          <p className="text-3xl font-black text-gray-900 dark:text-white tracking-tight relative z-10">{stats.totalOrders}</p>
          <p className="text-xs text-purple-500 font-bold mt-3 flex items-center relative z-10 bg-purple-500/5 py-1 px-2 rounded-lg w-max"><Activity size={12} className="mr-1"/>{t('total')}</p>
        </div>
      )}

      {canAccessView('requests') && (
        <div className="bg-white dark:bg-[#0d1527] p-6 rounded-3xl shadow-lg hover:shadow-xl dark:shadow-none border border-gray-100/80 dark:border-white/[0.05] transition-all duration-350 hover:-translate-y-1 cursor-pointer hover:border-orange-500/40 relative overflow-hidden group" onClick={() => handleNavigation('requests')}>
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-2xl text-orange-600 dark:text-orange-400">
              <Mail size={22} />
            </div>
            <span className="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Demandes</span>
          </div>
          <p className="text-3xl font-black text-gray-900 dark:text-white tracking-tight relative z-10">{stats.pendingVerifications + stats.subscriptionRequests}</p>
          <p className="text-xs text-orange-600 font-bold mt-3 flex items-center relative z-10 bg-orange-500/5 py-1 px-2 rounded-lg w-max">
              <AlertTriangle size={12} className="mr-1"/> 
              {stats.pendingVerifications} vérif. + {stats.subscriptionRequests} abonn.
          </p>
        </div>
      )}

      {canAccessView('support') && (
        <div className="bg-white dark:bg-[#0d1527] p-6 rounded-3xl shadow-lg hover:shadow-xl dark:shadow-none border border-gray-100/80 dark:border-white/[0.05] transition-all duration-350 hover:-translate-y-1 cursor-pointer hover:border-red-500/40 relative overflow-hidden group" onClick={() => handleNavigation('support')}>
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-2xl text-red-600 dark:text-red-400">
              <MessageSquare size={22} />
            </div>
            <span className="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">{t('support')}</span>
          </div>
          <p className="text-3xl font-black text-gray-900 dark:text-white tracking-tight relative z-10">{stats.openTickets}</p>
          <p className="text-xs text-red-500 font-bold mt-3 flex items-center relative z-10 bg-red-500/5 py-1 px-2 rounded-lg w-max"><Activity size={12} className="mr-1"/> {stats.openTickets} ouverts</p>
        </div>
      )}
    </div>
  );

  const renderUsers = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
                <h3 className="font-bold text-lg text-gray-800 dark:text-white">Gestion Utilisateurs</h3>
                <button 
                    onClick={syncUsers}
                    disabled={loading}
                    className="p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-brand-100 dark:border-brand-900/30"
                    title="Synchroniser avec Auth"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Sync
                </button>
                {isPrincipalAdmin && (
                    <button 
                        onClick={() => setIsAddUserModalOpen(true)}
                        className="py-1.5 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-all flex items-center gap-2 text-xs font-bold shadow-md shadow-brand-500/10 active:scale-95"
                    >
                        <UserPlus size={14} />
                        Ajouter un utilisateur
                    </button>
                )}
            </div>
            <div className="relative w-full md:w-auto">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Rechercher..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full md:w-64 pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white" 
                />
            </div>
        </div>
        
        <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase text-xs">
                    <tr>
                        <th className="px-6 py-4">Utilisateur</th>
                        <th className="px-6 py-4 text-center">Statut</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Rôle</th>
                        <th className="px-6 py-4">{t('city')}</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredUsers.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="p-12 text-center text-gray-500 dark:text-gray-400">
                                <div className="flex flex-col items-center">
                                    {loading ? (
                                        <>
                                            <RefreshCw size={48} className="text-brand-500 mb-4 animate-spin" />
                                            <p className="font-bold">Chargement des utilisateurs...</p>
                                        </>
                                    ) : (
                                        <>
                                            <Users size={48} className="text-gray-200 dark:text-gray-700 mb-4" />
                                            <p className="font-bold">Aucun utilisateur trouvé</p>
                                            <p className="text-xs mb-4">
                                                {searchTerm ? "Aucun résultat pour votre recherche." : "Les utilisateurs inscrits apparaîtront ici."}
                                            </p>
                                            {!searchTerm && (
                                                <button 
                                                    onClick={fetchUsers}
                                                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    <RefreshCw size={16} />
                                                    Actualiser les données
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ) : (
                        filteredUsers.map(u => {
                        // Logic for user status colors:
                        // Green: Online (always for now if active)
                        // Red: Inactive/Disconnected
                        // Black: Blocked (if we had a field, but we'll use a logic)
                        const isOnline = u.is_active !== false; 
                        
                        return (
                            <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-900 dark:text-white">{u.full_name || 'Sans nom'}</div>
                                    <div className="text-xs text-gray-400">{u.id.slice(0, 8)}...</div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div 
                                        className={`w-3 h-3 rounded-full mx-auto shadow-sm ${
                                            u.is_active === false ? 'bg-black' : // Bloqué
                                            'bg-emerald-500 animate-pulse' // En ligne
                                        }`}
                                        title={u.is_active === false ? 'Bloqué / Supprimé' : 'En ligne'}
                                    ></div>
                                </td>
                                <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{u.email || '-'}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                                    u.role === 'business' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 
                                    u.role === 'delivery' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                                    u.role === 'superadmin' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                }`}>
                                    {u.role === 'business' ? 'Restaurateur' : 
                                     u.role === 'delivery' ? 'Livreur' : 
                                     u.role === 'superadmin' ? 'Admin' : 'Client'}
                                </span>
                                {u.role === 'delivery' && (
                                    <div className="text-[10px] font-black text-orange-600 mt-1 flex items-center">
                                        <Bike size={10} className="mr-1" />
                                        {u.delivery_info?.completedOrders || 0} courses
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{u.city || '-'}</td>
                            <td className="px-6 py-4 text-right space-x-2">
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(u.id);
                                        toast.success("ID copié !");
                                    }} 
                                    className="p-2 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all" 
                                    title="Copier l'ID"
                                >
                                    <Database size={16} />
                                </button>
                                <button 
                                    onClick={() => setEmailModal({ isOpen: true, to: u.email, subject: '', body: '' })} 
                                    className="p-2 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all" 
                                    title="Envoyer un e-mail"
                                    disabled={!u.email}
                                >
                                    <Mail size={18} />
                                </button>
                                 <button 
                                    onClick={() => isPrincipalAdmin && toggleUserStatus(u.id, u.is_active !== false)}
                                    className={isPrincipalAdmin ? `p-2 rounded-lg transition-all ${u.is_active !== false ? 'text-gray-400 hover:text-orange-500' : 'text-orange-600 bg-orange-50'}` : "hidden"}
                                    title={u.is_active !== false ? "Désactiver" : "Activer"}
                                >
                                    {u.is_active !== false ? <Eye size={18} /> : <XCircle size={18} />}
                                </button>
                                <button 
                                    onClick={() => isPrincipalAdmin && setRoleModal({ isOpen: true, userId: u.id, currentRole: u.role })}
                                    className={isPrincipalAdmin ? "p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all" : "hidden"}
                                    title="Changer le rôle"
                                >
                                    <ShieldCheck size={18} />
                                </button>
                                <button 
                                    onClick={() => isPrincipalAdmin && deleteUser(u.id)}
                                    className={isPrincipalAdmin ? "p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all" : "hidden"}
                                    title="Supprimer"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </td>
                        </tr>
                        );
                    })
                    )}
                </tbody>
            </table>
        </div>

        <div className="md:hidden p-4 space-y-4">
            {filteredUsers.map(u => (
                <div key={u.id} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-100 dark:border-gray-600 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                            <div 
                                className={`w-2.5 h-2.5 rounded-full shadow-sm ${
                                    u.is_active === false ? 'bg-black' : 'bg-emerald-500 animate-pulse'
                                }`}
                                title={u.is_active === false ? 'Bloqué / Supprimé' : 'En ligne'}
                            ></div>
                            <div>
                                <div className="font-bold text-gray-900 dark:text-white">{u.full_name || 'Sans nom'}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                            </div>
                        </div>
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                            u.role === 'business' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 
                            u.role === 'delivery' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                            u.role === 'superadmin' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                            'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        }`}>
                            {u.role === 'business' ? 'Restaurateur' : 
                             u.role === 'delivery' ? 'Livreur' : 
                             u.role === 'superadmin' ? 'Admin' : 'Client'}
                        </span>
                    </div>
                    
                    {u.role === 'delivery' && (
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg mb-3 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider">Courses effectuées</span>
                            <div className="flex items-center text-orange-600 font-black">
                                <Bike size={12} className="mr-1" />
                                {u.delivery_info?.completedOrders || 0}
                            </div>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 mb-4">
                        <div className="flex items-center">
                            <span className="text-gray-400 dark:text-gray-500 mr-1">Ville:</span> {u.city || '-'}
                        </div>
                        <div className="flex items-center">
                            <span className="text-gray-400 dark:text-gray-500 mr-1">ID:</span> {u.id.slice(0, 8)}...
                        </div>
                    </div>

                    {isPrincipalAdmin && (
                        <div className="flex justify-end space-x-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <button onClick={() => setRoleModal({ isOpen: true, userId: u.id, currentRole: u.role })} className="p-2 bg-white dark:bg-gray-800 rounded-lg text-gray-400 hover:text-blue-600 shadow-sm border border-gray-200 dark:border-gray-600 font-bold" title="Modifier le rôle">
                                <Users size={16} />
                            </button>
                            <button onClick={() => deleteUser(u.id)} className="p-2 bg-white dark:bg-gray-800 rounded-lg text-gray-400 hover:text-red-500 shadow-sm border border-gray-200 dark:border-gray-600">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
  );

  const renderVerifications = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <div>
                <h3 className="font-bold text-lg text-gray-800 dark:text-white">Demandes de Vérification</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Consultez les documents et validez ou rejetez les demandes</p>
            </div>
            <button 
                onClick={cleanVerificationData}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all text-xs font-bold disabled:opacity-50"
                title="Nettoyer les demandes sans documents"
            >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Nettoyer</span>
            </button>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase text-xs">
                    <tr>
                        <th className="px-6 py-4">Restaurant</th>
                        <th className="px-6 py-4">Propriétaire</th>
                        <th className="px-6 py-4">Documents</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {pendingVerifications.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="p-8 text-center text-gray-500 dark:text-gray-400">
                                <CheckCircle size={48} className="mx-auto mb-3 text-green-500" />
                                Aucune demande en attente
                            </td>
                        </tr>
                    ) : (
                        pendingVerifications.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-900 dark:text-white">{r.name}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{r.city}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm text-gray-700 dark:text-gray-300">ID: {r.ownerId?.slice(0, 8)}...</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="space-y-2">
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                            <span className="font-bold">RCCM:</span> {r.verificationDocs?.registryNumber || 'N/A'}
                                        </div>
                                        {r.verificationDocs?.idCardUrl && (
                                            <div className="flex space-x-2">
                                                <button 
                                                    onClick={() => viewDocument(r.verificationDocs.idCardUrl)}
                                                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center"
                                                >
                                                    <Eye size={12} className="mr-1"/> Voir carte d'identité
                                                </button>
                                                <button 
                                                    onClick={() => downloadDocument(r.verificationDocs.idCardUrl, `id_card_${r.name}.pdf`)}
                                                    className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-xs flex items-center"
                                                >
                                                    <Download size={12} className="mr-1"/> Télécharger
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button 
                                        onClick={() => handleVerification(r.id, 'verified')}
                                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-700 transition-colors inline-flex items-center"
                                    >
                                        <CheckCircle size={14} className="mr-1" /> Valider
                                    </button>
                                    <button 
                                        onClick={() => handleVerification(r.id, 'rejected')}
                                        className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors inline-flex items-center"
                                    >
                                        <XCircle size={14} className="mr-1" /> Rejeter
                                    </button>
                                    <button 
                                        onClick={() => deleteVerificationRequest(r.id)}
                                        disabled={loading}
                                        className="p-2 text-gray-400 hover:text-red-500 transition-colors inline-flex items-center disabled:opacity-50"
                                        title="Supprimer définitivement"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-green-50/30 dark:bg-green-900/10">
            <h3 className="font-bold text-lg text-green-800 dark:text-green-400 mb-4 flex items-center">
                <CheckCircle size={20} className="mr-2" />
                Restaurants Vérifiés
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {restaurants.filter(r => r.isVerified).length === 0 ? (
                    <div className="col-span-full p-4 text-center text-gray-500 text-xs">
                        Aucun restaurant n'est encore vérifié.
                    </div>
                ) : (
                    restaurants.filter(r => r.isVerified).map(r => (
                        <div key={r.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-green-100 dark:border-green-900/30 flex items-center justify-between shadow-sm">
                            <div className="flex items-center">
                                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center mr-3">
                                    <CheckCircle size={20} />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white text-sm">{r.name}</p>
                                    <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider">Vérifié</p>
                                </div>
                            </div>
                            <div className="text-[10px] text-gray-400">
                                Badge actif
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-4">Tous les Restaurants Non Vérifiés</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {restaurants.filter(r => !r.isVerified).length === 0 ? (
                    <div className="col-span-full p-4 text-center text-gray-500 text-xs">
                        Tous les restaurants sont déjà vérifiés.
                    </div>
                ) : (
                    restaurants.filter(r => !r.isVerified).map(r => (
                        <div key={r.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between shadow-sm">
                            <div className="flex items-center">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 ${r.verificationRequested ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                    {r.verificationRequested ? <Mail size={20} /> : <ShieldAlert size={20} />}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white text-sm">{r.name}</p>
                                    <p className="text-[10px] text-gray-500">
                                        {r.verificationRequested ? 'Demande déjà envoyée' : 'Aucune demande envoyée'}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => sendVerificationRequest(r.id)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all shadow-sm flex items-center ${
                                    r.verificationRequested 
                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed' 
                                    : 'bg-brand-600 text-white hover:bg-brand-700'
                                }`}
                                disabled={r.verificationRequested}
                            >
                                <Mail size={12} className="mr-1.5" />
                                {r.verificationRequested ? 'Envoyée' : 'Demander'}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    </div>
  );

  const renderRestaurants = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">Gestion Restaurants</h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase text-xs">
                    <tr>
                        <th className="px-6 py-4">Restaurant</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4">{t('city')}</th>
                        <th className="px-6 py-4">Statut</th>
                        <th className="px-6 py-4">Plan</th>
                        <th className="px-6 py-4 font-center">Vérifié</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {restaurants.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="p-12 text-center text-gray-500 dark:text-gray-400">
                                <div className="flex flex-col items-center">
                                    {loading ? (
                                        <>
                                            <RefreshCw size={48} className="text-brand-500 mb-4 animate-spin" />
                                            <p className="font-bold">Chargement des restaurants...</p>
                                        </>
                                    ) : (
                                        <>
                                            <Store size={48} className="text-gray-200 dark:text-gray-700 mb-4" />
                                            <p className="font-bold">Aucun restaurant trouvé</p>
                                            <p className="text-xs mb-4">Les restaurants inscrits apparaîtront ici.</p>
                                            <button 
                                                onClick={fetchRestaurants}
                                                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors"
                                            >
                                                <RefreshCw size={16} />
                                                Actualiser les données
                                            </button>
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ) : (
                        restaurants.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <td className="px-6 py-4">
                                <div className="flex items-center">
                                    <img src={r.coverImage} className="w-10 h-10 rounded-lg object-cover mr-3" alt="" />
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white">{r.name}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md text-xs font-medium uppercase text-gray-700 dark:text-gray-300">{r.type}</span>
                            </td>
                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{r.city}</td>
                            <td className="px-6 py-4">
                                <div className="flex justify-center">
                                    <div 
                                        className={`w-3 h-3 rounded-full shadow-sm ${
                                            !r.isActive ? 'bg-black' : // Bloqué ou Supprimé
                                            !r.isOpen ? 'bg-gray-400' : // Indisponible
                                            'bg-emerald-500 animate-pulse' // En ligne
                                        }`}
                                        title={
                                            !r.isActive ? 'Bloqué / Supprimé' : 
                                            !r.isOpen ? 'Indisponible' : 
                                            'En ligne'
                                        }
                                    ></div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase w-fit ${
                                        r.subscriptionTier === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                                        r.subscriptionTier === 'premium' ? 'bg-orange-100 text-orange-700' :
                                        r.subscriptionTier === 'basic' ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-700'
                                    }`}>
                                        {r.subscriptionTier || 'free'}
                                    </span>
                                    {r.subscriptionEndDate && (
                                        <span className="text-[9px] text-gray-500 mt-0.5">
                                            Expire le: {new Date(r.subscriptionEndDate).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex justify-center">
                                    {r.isVerified ? (
                                        <CheckCircle size={16} className="text-green-500" />
                                    ) : (
                                        <XCircle size={16} className="text-gray-400" />
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                                {!r.isVerified && !r.verificationRequested && (
                                    <button 
                                        onClick={() => sendVerificationRequest(r.id)}
                                        className="p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all"
                                        title="Envoyer demande de vérification"
                                    >
                                        <ShieldAlert size={18} />
                                    </button>
                                )}
                                {isPrincipalAdmin && (
                                    <button 
                                        onClick={() => {
                                            setSelectedTier(r.subscriptionTier || 'free');
                                            setSubEndDate(r.subscriptionEndDate ? r.subscriptionEndDate.split('T')[0] : '');
                                            setSubscriptionModal({ isOpen: true, restaurant: r });
                                        }}
                                        className="p-2 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                                        title="Gérer l'abonnement"
                                    >
                                        <CreditCard size={18} />
                                    </button>
                                )}
                                {isPrincipalAdmin && (
                                    <button 
                                        onClick={() => handleOpenEditRestaurant(r)}
                                        className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                        title="Modifier l'établissement"
                                    >
                                        <Edit3 size={18} />
                                    </button>
                                )}
                                <button 
                                    onClick={() => toggleRestaurantStatus(r.id, r.isActive)}
                                    className={`p-2 rounded-lg transition-all ${r.isActive ? 'text-gray-400 hover:text-orange-500' : 'text-orange-600 bg-orange-50'}`}
                                    title={r.isActive ? "Masquer" : "Afficher"}
                                >
                                    {r.isActive ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                                <button 
                                    onClick={() => isPrincipalAdmin && deleteRestaurant(r.id)}
                                    className={isPrincipalAdmin ? "p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors" : "hidden"}
                                    title="Supprimer le restaurant"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </td>
                        </tr>
                    )))
                    }
                </tbody>
            </table>
        </div>
    </div>
  );

  const renderPublications = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">Toutes les Publications</h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                        <th className="p-4 font-medium">Type</th>
                        <th className="p-4 font-medium">Restaurant</th>
                        <th className="p-4 font-medium">Contenu</th>
                        <th className="p-4 font-medium">Date</th>
                        <th className="p-4 font-medium">Statut</th>
                        <th className="p-4 font-medium text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {publications.map((pub: any) => (
                        <tr key={pub.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${pub.pubType === 'menu_item' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'}`}>
                                    {pub.pubType === 'menu_item' ? 'Plat' : 'Promotion'}
                                </span>
                            </td>
                            <td className="p-4 font-medium text-gray-900 dark:text-white">{pub.restaurantName || 'Inconnu'}</td>
                            <td className="p-4 text-gray-600 dark:text-gray-300">
                                {pub.pubType === 'menu_item' ? (
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-white">{pub.name}</p>
                                        <p className="text-xs font-bold text-brand-600">
                                            {formatDualPrice(pub.price || 0, (pub.restaurantCurrency || pub.currency) as 'USD' | 'CDF' || 'USD', pub.restaurantExchangeRate, pub.restaurantDisplayCurrencyMode)}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-sm truncate max-w-xs">{pub.caption || 'Sans légende'}</p>
                                        {pub.media_url && (
                                            <a href={pub.media_url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                                                Voir le média
                                            </a>
                                        )}
                                    </div>
                                )}
                            </td>
                            <td className="p-4 text-gray-500 dark:text-gray-400 text-sm">{new Date(pub.created_at).toLocaleDateString()}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${(pub.pubType === 'menu_item' ? pub.is_available : pub.is_active) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'}`}>
                                    {(pub.pubType === 'menu_item' ? pub.is_available : pub.is_active) ? 'Visible' : 'Masqué'}
                                </span>
                            </td>
                            <td className="p-4 text-right space-x-2">
                                <button 
                                    onClick={() => togglePublicationStatus(pub)}
                                    className="p-2 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                                    title={(pub.pubType === 'menu_item' ? pub.is_available : pub.is_active) ? "Masquer" : "Afficher"}
                                >
                                    {(pub.pubType === 'menu_item' ? pub.is_available : pub.is_active) ? <XCircle size={18} /> : <CheckCircle size={18} />}
                                </button>
                                {isPrincipalAdmin && (
                                    <button 
                                        onClick={() => deletePublication(pub)}
                                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        title="Supprimer"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                    {publications.length === 0 && !loading && (
                        <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">Aucune publication trouvée</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );

  const renderDashMealsPayTransactionsDashboard = () => {
    const filteredTxs = kpayTransactions.filter(tx => {
      const matchSearch = (tx.txRef || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (tx.restaurantName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (tx.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;

      if (kpayTxFilter !== 'all' && tx.status !== kpayTxFilter) return false;
      if (kpayTypeFilter !== 'all' && tx.type !== kpayTypeFilter) return false;

      return true;
    });

    const totalCapturedGross = kpayTransactions
      .filter(tx => tx.status === 'captured')
      .reduce((sum, tx) => sum + Math.abs(tx.grossAmount || 0), 0);

    const totalRefundedGross = kpayTransactions
      .filter(tx => tx.status === 'refunded')
      .reduce((sum, tx) => sum + Math.abs(tx.netAmount || 0), 0);

    const totalFees = kpayTransactions.reduce((sum, tx) => sum + Math.abs(tx.feeAmount || 0), 0);

    const netKpayBalance = totalCapturedGross - totalRefundedGross - totalFees;

    const capturedCount = kpayTransactions.filter(tx => tx.status === 'captured').length;
    const refundedCount = kpayTransactions.filter(tx => tx.status === 'refunded').length;
    const pendingCount = kpayTransactions.filter(tx => tx.status === 'pending').length;

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Total Encaissements</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-xl">
                <ArrowUpRight size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              ${totalCapturedGross.toFixed(2)} <span className="text-xs text-gray-400 font-normal">USD</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{capturedCount} transaction(s) capturée(s)</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Total Remboursé (Prorata)</span>
              <div className="p-2 bg-rose-50 dark:bg-rose-950/30 text-rose-600 rounded-xl">
                <RotateCcw size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
              -${totalRefundedGross.toFixed(2)} <span className="text-xs text-gray-400 font-normal">USD</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{refundedCount} remboursement(s) synchronisé(s)</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Solde Net DashMeals Pay</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 rounded-xl">
                <CreditCard size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
              ${netKpayBalance.toFixed(2)} <span className="text-xs text-gray-400 font-normal">USD</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Après déduction frais & remboursements</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Commissions DashMeals Pay (2.5%)</span>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/30 text-purple-600 rounded-xl">
                <ShieldCheck size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
              ${totalFees.toFixed(2)} <span className="text-xs text-gray-400 font-normal">USD</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Frais de traitement passerelle</p>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Rechercher par réf KPAY-..., restaurant, motif..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center p-1 bg-gray-100 dark:bg-gray-700/60 rounded-xl">
              {[
                { id: 'all', label: `Tous (${kpayTransactions.length})` },
                { id: 'captured', label: `Capturés (${capturedCount})` },
                { id: 'refunded', label: `Remboursés (${refundedCount})` },
                { id: 'pending', label: `En Attente (${pendingCount})` },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setKpayTxFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    kpayTxFilter === f.id
                      ? 'bg-white dark:bg-gray-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Type Filter */}
            <select
              value={kpayTypeFilter}
              onChange={e => setKpayTypeFilter(e.target.value as any)}
              className="p-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-800 dark:text-white outline-none"
            >
              <option value="all">Tous types de flux</option>
              <option value="subscription">Abonnements</option>
              <option value="refund">Remboursements</option>
              <option value="order_payment">Commandes Clients</option>
            </select>
          </div>
        </div>

        {/* Real-time Ledger Table */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/20">
            <div>
              <h4 className="font-extrabold text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                <CreditCard size={18} className="text-brand-500" />
                Journal des Flux Financiers DashMeals Pay
              </h4>
              <p className="text-xs text-gray-500 mt-0.5">Mise à jour instantanée des encaissements et remboursements au prorata</p>
            </div>
            <span className="text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/40 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync DashMeals Pay
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-[11px] uppercase tracking-wider font-extrabold border-b border-gray-100 dark:border-gray-700">
                  <th className="p-4">Réf. Transaction</th>
                  <th className="p-4">Date & Heure</th>
                  <th className="p-4">Établissement / Payeur</th>
                  <th className="p-4">Type & Canal</th>
                  <th className="p-4 text-right">Montant Brut</th>
                  <th className="p-4 text-right">Frais (2.5%)</th>
                  <th className="p-4 text-right">Net Restitué/Reçu</th>
                  <th className="p-4 text-center">Statut</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 text-xs">
                {filteredTxs.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 dark:hover:bg-gray-700/40 transition-colors">
                    <td className="p-4 font-mono font-black text-slate-800 dark:text-slate-200">
                      <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-600">
                        {tx.txRef}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-4">
                      <p className="font-extrabold text-gray-900 dark:text-white">{tx.restaurantName}</p>
                      {tx.payerName && <p className="text-[11px] text-gray-400">{tx.payerName}</p>}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black w-max ${
                          tx.type === 'refund' 
                            ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40'
                            : 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40'
                        }`}>
                          {tx.type === 'refund' ? 'Remboursement Prorata' : 'Abonnement DashMeals Pay'}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">{tx.paymentChannel}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-gray-800 dark:text-gray-200">
                      {tx.grossAmount < 0 ? '-' : ''}${Math.abs(tx.grossAmount).toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-mono text-gray-400">
                      {tx.feeAmount < 0 ? '-' : ''}${Math.abs(tx.feeAmount).toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-mono font-black text-sm">
                      <span className={tx.netAmount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                        {tx.netAmount < 0 ? '-' : '+'}${Math.abs(tx.netAmount).toFixed(2)} USD
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {tx.status === 'captured' && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 inline-flex items-center gap-1">
                          <CheckCircle size={12} /> Capturé
                        </span>
                      )}
                      {tx.status === 'refunded' && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 inline-flex items-center gap-1">
                          <RotateCcw size={12} /> Remboursé
                        </span>
                      )}
                      {tx.status === 'pending' && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 inline-flex items-center gap-1">
                          <RefreshCw size={12} className="animate-spin" /> En attente
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedKpayTx(tx)}
                          className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                          title="Voir le reçu"
                        >
                          <FileText size={13} />
                          <span>Reçu</span>
                        </button>
                        <button
                          onClick={() => {
                            const email = prompt("Saisissez l'adresse email de destination pour la facture :", "partenaire@dashmeals.cd");
                            if (email) {
                              handleSendInvoiceEmail(tx, email);
                            }
                          }}
                          className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                          title="Envoyer la facture par email"
                        >
                          <Mail size={13} />
                          <span>Facture</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredTxs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-gray-500 dark:text-gray-400">
                      <p className="font-bold">Aucune transaction ne correspond aux filtres.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Receipt Modal */}
        {selectedKpayTx && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
              <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-brand-500/20 rounded-xl border border-brand-400/30">
                    <CreditCard size={18} className="text-brand-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Reçu de Transaction DashMeals Pay</h3>
                    <p className="text-[11px] text-slate-300 font-mono">{selectedKpayTx.txRef}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedKpayTx(null)}
                  className="p-1.5 hover:bg-white/20 rounded-full text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600">
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Montant Net Effectif</span>
                  <div className={`text-3xl font-black mt-1 ${selectedKpayTx.netAmount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {selectedKpayTx.netAmount < 0 ? '-' : '+'}${Math.abs(selectedKpayTx.netAmount).toFixed(2)} USD
                  </div>
                  <span className={`inline-block mt-2 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    selectedKpayTx.status === 'refunded' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {selectedKpayTx.status === 'refunded' ? 'Remboursement Traité' : 'Paiement Confirmé'}
                  </span>
                </div>

                <div className="space-y-2 text-xs border-t border-b border-gray-100 dark:border-gray-700 py-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Établissement :</span>
                    <span className="font-bold text-gray-900 dark:text-white">{selectedKpayTx.restaurantName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Date & Heure :</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {new Date(selectedKpayTx.createdAt).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Canal de Règlement :</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{selectedKpayTx.paymentChannel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Montant Brut :</span>
                    <span className="font-mono font-bold text-gray-800 dark:text-gray-200">${Math.abs(selectedKpayTx.grossAmount).toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Frais de Service (2.5%) :</span>
                    <span className="font-mono text-gray-500">${Math.abs(selectedKpayTx.feeAmount).toFixed(2)} USD</span>
                  </div>
                  {selectedKpayTx.notes && (
                    <div className="pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
                      <span className="text-gray-400 text-[10px] uppercase font-bold block">Note / Motif :</span>
                      <p className="text-gray-700 dark:text-gray-300 font-medium italic mt-0.5">{selectedKpayTx.notes}</p>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 dark:bg-slate-700/50 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-600 space-y-2">
                  <label className="block text-[10px] font-extrabold uppercase text-gray-500 dark:text-gray-400">
                    Envoyer la Facture Officielle par Email :
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={invoiceRecipientEmail}
                      onChange={(e) => setInvoiceRecipientEmail(e.target.value)}
                      placeholder="email.client@domaine.cd"
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white font-medium"
                    />
                    <button
                      onClick={() => handleSendInvoiceEmail(selectedKpayTx, invoiceRecipientEmail)}
                      disabled={isSendingInvoice}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer whitespace-nowrap"
                    >
                      {isSendingInvoice ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />}
                      <span>Envoyer</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => {
                      toast.success("Impression du reçu lancée !");
                      window.print();
                    }}
                    className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs uppercase transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileText size={16} />
                    Imprimer le Reçu PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSubscriptions = () => {
    const paidRestaurants = restaurants.filter(r => r.subscriptionTier && r.subscriptionTier !== 'free');
    
    const activePaidCount = paidRestaurants.filter(r => r.subscriptionStatus === 'active').length;
    const cancelledWithDaysCount = paidRestaurants.filter(r => {
      if (r.subscriptionStatus !== 'cancelled') return false;
      if (!r.subscriptionEndDate) return false;
      return new Date(r.subscriptionEndDate).getTime() > new Date().getTime();
    }).length;
    const expiredCount = restaurants.filter(r => {
      if (r.subscriptionStatus === 'expired') return true;
      if (r.subscriptionEndDate && new Date(r.subscriptionEndDate).getTime() <= new Date().getTime() && r.subscriptionTier !== 'free') return true;
      return false;
    }).length;

    const filteredSubs = restaurants.filter(r => {
      const matchSearch = (r.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (r.city || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (r.subscriptionTier || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchSearch) return false;

      if (subFilter === 'active') return r.subscriptionTier !== 'free' && r.subscriptionStatus === 'active';
      if (subFilter === 'cancelled') {
        return r.subscriptionStatus === 'cancelled' && r.subscriptionEndDate && new Date(r.subscriptionEndDate).getTime() > new Date().getTime();
      }
      if (subFilter === 'expired') return r.subscriptionStatus === 'expired' || (r.subscriptionEndDate && new Date(r.subscriptionEndDate).getTime() <= new Date().getTime() && r.subscriptionTier !== 'free');
      if (subFilter === 'refunded') return r.subscriptionStatus === 'refunded';
      if (subFilter === 'free') return !r.subscriptionTier || r.subscriptionTier === 'free';
      return true;
    });

    const totalEstRevenue = paidRestaurants.reduce((sum, r) => {
      if (r.subscriptionTier === 'enterprise' || r.subscriptionTier === 'elite') return sum + 99;
      if (r.subscriptionTier === 'premium' || r.subscriptionTier === 'pro') return sum + 49;
      if (r.subscriptionTier === 'basic') return sum + 29;
      return sum;
    }, 0);

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Navigation Sub-Tabs DashMeals Pay */}
        <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 w-fit">
          <button
            onClick={() => setSubSectionView('kpay_transactions')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              subSectionView === 'kpay_transactions'
                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 dark:bg-brand-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <CreditCard size={16} />
            <span>Suivi Transactions DashMeals Pay (Temps Réel)</span>
            <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full ml-1">Live</span>
          </button>

          <button
            onClick={() => setSubSectionView('restaurants')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              subSectionView === 'restaurants'
                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 dark:bg-brand-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Store size={16} />
            <span>Gestion des Forfaits par Établissement</span>
          </button>
        </div>

        {subSectionView === 'kpay_transactions' ? renderDashMealsPayTransactionsDashboard() : (
          <>
        {/* DashMeals Pay Style Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden border border-slate-700/50">
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center space-x-2 text-brand-400 font-extrabold text-xs uppercase tracking-widest mb-1">
                <CreditCard size={16} />
                <span>DashMeals Pay Ledger</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                Tableau de Bord des Paiements & Abonnements
              </h3>
              <p className="text-slate-300 text-xs md:text-sm mt-1 max-w-xl">
                Suivi en temps réel des transactions DashMeals Pay, gestion des périodes de validité restantes et réactivation des comptes partenaires.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchRestaurants()}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/10 backdrop-blur-md flex items-center space-x-2"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Actualiser</span>
              </button>
            </div>
          </div>

          {/* DashMeals Pay Metrics Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-700/60">
            <div className="bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Revenus Estimés (Abonnements)</span>
              <div className="text-xl md:text-2xl font-black text-emerald-400 mt-1">
                ${totalEstRevenue}.00 <span className="text-[10px] text-slate-400 font-normal">USD</span>
              </div>
              <p className="text-[9px] text-slate-400 mt-0.5">Calculé sur forfaits souscrits</p>
            </div>

            <div className="bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Abonnements Actifs Payants</span>
              <div className="text-xl md:text-2xl font-black text-white mt-1 flex items-center gap-2">
                {activePaidCount}
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">En ligne</span>
              </div>
              <p className="text-[9px] text-slate-400 mt-0.5">Renouvellement automatique</p>
            </div>

            <div className="bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">En Résiliation (Jours restants)</span>
              <div className="text-xl md:text-2xl font-black text-amber-400 mt-1 flex items-center gap-2">
                {cancelledWithDaysCount}
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">Actif temporaire</span>
              </div>
              <p className="text-[9px] text-slate-400 mt-0.5">Demandé annulation mais encore valide</p>
            </div>

            <div className="bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Expirés / Gratuit</span>
              <div className="text-xl md:text-2xl font-black text-slate-300 mt-1">
                {expiredCount} / {restaurants.length - paidRestaurants.length}
              </div>
              <p className="text-[9px] text-slate-400 mt-0.5">À relancer ou forfaits gratuits</p>
            </div>
          </div>
        </div>

        {/* Filters & Search Table Section */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="relative flex-1 w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Rechercher par établissement, ville, forfait..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
              {[
                { id: 'all', label: `Tous (${restaurants.length})` },
                { id: 'active', label: `Actifs (${activePaidCount})` },
                { id: 'cancelled', label: `En Résiliation (${cancelledWithDaysCount})` },
                { id: 'expired', label: `Expirés (${expiredCount})` },
                { id: 'refunded', label: `Remboursés (${restaurants.filter(r => r.subscriptionStatus === 'refunded').length})` },
                { id: 'free', label: 'Gratuits' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setSubFilter(f.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    subFilter === f.id
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* DashMeals Pay Ledger Table */}
          <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-700">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="px-5 py-4">Réf Transaction</th>
                  <th className="px-5 py-4">Établissement & Ville</th>
                  <th className="px-5 py-4">Forfait Acheté</th>
                  <th className="px-5 py-4">Montant Payé</th>
                  <th className="px-5 py-4">Date & Échéance (Jours)</th>
                  <th className="px-5 py-4">Statut Paiement</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredSubs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 font-medium">
                      Aucun abonnement trouvé pour ces critères
                    </td>
                  </tr>
                ) : (
                  filteredSubs.map((r, idx) => {
                    const isPaid = r.subscriptionTier && r.subscriptionTier !== 'free';
                    const endDate = r.subscriptionEndDate ? new Date(r.subscriptionEndDate) : null;
                    const now = new Date();
                    
                    let remainingDays = 0;
                    if (endDate) {
                      const diffMs = endDate.getTime() - now.getTime();
                      remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                    }

                    const isCancelled = r.subscriptionStatus === 'cancelled' && remainingDays > 0;
                    const isExpired = r.subscriptionStatus === 'expired' || (endDate && remainingDays === 0 && isPaid);
                    const isActive = r.subscriptionStatus === 'active' && isPaid && remainingDays > 0;

                    const priceStr = r.subscriptionTier === 'enterprise' || r.subscriptionTier === 'elite' ? '$99.00 USD' :
                                    r.subscriptionTier === 'premium' || r.subscriptionTier === 'pro' ? '$49.00 USD' :
                                    r.subscriptionTier === 'basic' ? '$29.00 USD' : 'Gratuit ($0)';

                    const txRef = `KPAY-SUB-${(100000 + idx * 77 + (r.id.charCodeAt(0) || 12) * 19).toString().slice(0, 6)}`;

                    return (
                      <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-5 py-4">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                            {txRef}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-bold text-gray-900 dark:text-white text-sm">{r.name}</div>
                          <div className="text-[10px] text-gray-400 font-medium">{r.type?.toUpperCase()} • {r.city}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            r.subscriptionTier === 'enterprise' || r.subscriptionTier === 'elite' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800' :
                            r.subscriptionTier === 'premium' || r.subscriptionTier === 'pro' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800' :
                            r.subscriptionTier === 'basic' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border border-sky-200 dark:border-sky-800' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                          }`}>
                            {r.subscriptionTier === 'premium' ? 'Pro' : r.subscriptionTier === 'enterprise' ? 'Elite' : (r.subscriptionTier || 'Free').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-bold text-gray-900 dark:text-white">
                          {priceStr}
                          <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">DashMeals Pay</div>
                        </td>
                        <td className="px-5 py-4">
                          {endDate ? (
                            <div>
                              <div className="font-bold text-gray-800 dark:text-gray-200">
                                Fin: {endDate.toLocaleDateString('fr-FR')}
                              </div>
                              <div className={`text-[10px] font-black mt-0.5 ${remainingDays > 5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {remainingDays} jour(s) restant(s)
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 font-medium">Pas d'échéance</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {isActive && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                              Payé & Actif
                            </span>
                          )}
                          {isCancelled && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title="Abonnement résilié mais valide jusqu'à l'échéance">
                              <AlertTriangle size={12} className="mr-1 text-amber-600" />
                              Résilié ({remainingDays}j restants)
                            </span>
                          )}
                          {isExpired && r.subscriptionStatus !== 'refunded' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800">
                              <XCircle size={12} className="mr-1 text-red-500" />
                              Expiré
                            </span>
                          )}
                          {r.subscriptionStatus === 'refunded' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <RotateCcw size={12} className="mr-1 text-purple-600" />
                              Remboursé
                            </span>
                          )}
                          {!isPaid && r.subscriptionStatus !== 'refunded' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                              Gratuit
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right space-x-2">
                          {(isCancelled || isExpired) && isPrincipalAdmin && (
                            <button
                              onClick={async () => {
                                try {
                                  const newEndDate = new Date();
                                  newEndDate.setDate(newEndDate.getDate() + 30);
                                  
                                  const { error } = await supabase
                                    .from('restaurants')
                                    .update({
                                      subscription_status: 'active',
                                      subscription_end_date: endDate && remainingDays > 0 ? endDate.toISOString() : newEndDate.toISOString()
                                    })
                                    .eq('id', r.id);

                                  if (error) throw error;
                                  toast.success(`Abonnement de "${r.name}" réactivé avec succès !`);
                                  fetchRestaurants();
                                } catch (err: any) {
                                  toast.error("Erreur de réactivation: " + err.message);
                                }
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 inline-flex items-center gap-1"
                              title="Réactiver immédiatement l'abonnement"
                            >
                              <CheckCircle size={12} /> Réactiver
                            </button>
                          )}
                          {isPrincipalAdmin && (isPaid || r.subscriptionStatus === 'active' || r.subscriptionStatus === 'cancelled') && r.subscriptionStatus !== 'refunded' && (
                            <button
                              onClick={() => setRefundModal({ isOpen: true, restaurant: r, reason: '', returnToFree: true })}
                              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 border border-red-200 dark:border-red-800/40 text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all active:scale-95 inline-flex items-center gap-1"
                              title="Rembourser la transaction"
                            >
                              <RotateCcw size={12} /> Rembourser
                            </button>
                          )}
                          {isPrincipalAdmin && (
                            <button
                              onClick={() => {
                                const grossPrice = r.subscriptionTier === 'enterprise' || r.subscriptionTier === 'elite' ? 99 :
                                                   r.subscriptionTier === 'premium' || r.subscriptionTier === 'pro' ? 49 :
                                                   r.subscriptionTier === 'basic' ? 29 : 0;
                                const feePrice = grossPrice * 0.025;
                                const netPrice = grossPrice - feePrice;

                                const email = prompt(`Saisissez l'email pour la facture d'abonnement de ${r.name} :`, "partenaire@dashmeals.cd");
                                if (email) {
                                  handleSendInvoiceEmail({
                                    type: 'subscription',
                                    grossAmount: grossPrice,
                                    feeAmount: feePrice,
                                    netAmount: netPrice,
                                    txRef,
                                    restaurantName: r.name,
                                    payerName: r.name,
                                    paymentChannel: 'DashMeals Pay Gateway',
                                    createdAt: new Date().toISOString(),
                                    notes: `Abonnement ${(r.subscriptionTier || 'Standard').toUpperCase()} - DashMeals`
                                  }, email);
                                }
                              }}
                              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40 text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer"
                              title="Envoyer la facture d'abonnement par email"
                            >
                              <Mail size={12} /> Facture
                            </button>
                          )}
                          {isPrincipalAdmin && (
                            <button
                              onClick={() => {
                                setSelectedTier(r.subscriptionTier || 'free');
                                setSubEndDate(r.subscriptionEndDate ? r.subscriptionEndDate.split('T')[0] : '');
                                setSubscriptionModal({ isOpen: true, restaurant: r });
                              }}
                              className="p-2 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                              title="Modifier / Prolonger l'abonnement"
                            >
                              <CreditCard size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}
      </div>
    );
  };

  const PERMISSION_MODULES = [
    { id: 'subscriptions', label: 'Paiements & Abonnements', desc: 'Gestion des transactions DashMeals Pay & formules restaurants', icon: CreditCard, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
    { id: 'support', label: 'Support Client & Tickets', desc: 'Gestion et réponse aux tickets de support des utilisateurs', icon: Mail, color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
    { id: 'messages', label: 'Messages Commandes', desc: 'Surveillance et tchat direct des commandes clients/restaurants', icon: MessageSquare, color: 'text-sky-500 bg-sky-500/10 border-sky-500/30' },
    { id: 'restaurants', label: 'Gestion Restaurants', desc: 'Modération, suspension et activation des établissements', icon: Store, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30' },
    { id: 'verifications', label: 'Vérification Identités', desc: 'Examen des documents légaux et validation des badges', icon: Shield, color: 'text-purple-500 bg-purple-500/10 border-purple-500/30' },
    { id: 'users', label: 'Gestion Utilisateurs', desc: 'Gestion des rôles (clients, livreurs, restaurateurs)', icon: Users, color: 'text-blue-500 bg-blue-500/10 border-blue-500/30' },
    { id: 'publications', label: 'Publications & Cartes', desc: 'Modération des plats, menus et bannières promotionnelles', icon: Database, color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' },
    { id: 'settings', label: 'Paramètres Plateforme', desc: 'Configuration globale des taux et paramètres système', icon: Settings, color: 'text-slate-400 bg-slate-500/10 border-slate-500/30' }
  ];

  const renderSubAdminModal = () => {
    if (!subAdminModal.isOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
          <button
            onClick={() => setSubAdminModal({ isOpen: false, subAdmin: null })}
            className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-2xl border border-brand-500/20">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                {subAdminModal.subAdmin ? 'Modifier le Sous-Admin' : 'Créer un Sous-Administrateur'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Définissez le profil et accordez des accès restreints selon la fonction
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveSubAdmin} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  Nom Complet <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Alain Mutombo"
                  value={subAdminFormData.full_name}
                  onChange={(e) => setSubAdminFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  Adresse Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="ex: alain@dashmeals.cd"
                  value={subAdminFormData.email}
                  onChange={(e) => setSubAdminFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  Numéro de Téléphone
                </label>
                <input
                  type="text"
                  placeholder="ex: +243 890 123 456"
                  value={subAdminFormData.phone_number}
                  onChange={(e) => setSubAdminFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  Intitulé du Rôle / Poste
                </label>
                <input
                  type="text"
                  placeholder="ex: Gestionnaire Paiements & Abonnements"
                  value={subAdminFormData.role_title}
                  onChange={(e) => setSubAdminFormData(prev => ({ ...prev, role_title: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {/* Mot de Passe d'Accès */}
            <div className="p-4 bg-brand-500/5 dark:bg-brand-500/10 border border-brand-500/20 rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Lock size={14} className="text-brand-600 dark:text-brand-400" />
                  <span>Mot de Passe d'Accès <span className="text-red-500">*</span></span>
                </label>
                <button
                  type="button"
                  onClick={handleGenerateRandomPassword}
                  className="text-[10px] font-black text-brand-600 dark:text-brand-400 hover:underline uppercase tracking-wider flex items-center gap-1"
                >
                  <RefreshCw size={11} /> Générer auto
                </button>
              </div>

              <div className="relative">
                <input
                  type={showSubAdminPassword ? "text" : "password"}
                  required
                  placeholder="Mot de passe pour se connecter"
                  value={subAdminFormData.password}
                  onChange={(e) => setSubAdminFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full pl-4 pr-10 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setShowSubAdminPassword(!showSubAdminPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  title={showSubAdminPassword ? "Masquer" : "Afficher"}
                >
                  {showSubAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Le sous-admin utilisera son email <strong>{subAdminFormData.email || "ex: email@dashmeals.cd"}</strong> et ce mot de passe pour se connecter.
              </p>
            </div>

            {/* Selection of Permissions */}
            <div>
              <label className="block text-xs font-extrabold text-slate-900 dark:text-white mb-2 uppercase tracking-wider flex items-center justify-between">
                <span>Modules & Actions Autorisés</span>
                <span className="text-[10px] text-brand-600 dark:text-brand-400 font-bold">
                  {subAdminFormData.permissions.length} sur {PERMISSION_MODULES.length} sélectionnés
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1 custom-scrollbar">
                {PERMISSION_MODULES.map((mod) => {
                  const isChecked = subAdminFormData.permissions.includes(mod.id);
                  const Icon = mod.icon;
                  return (
                    <div
                      key={mod.id}
                      onClick={() => togglePermission(mod.id)}
                      className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-start space-x-3 ${
                        isChecked
                          ? 'bg-brand-500/5 dark:bg-brand-500/10 border-brand-500 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:border-slate-300'
                      }`}
                    >
                      <div className={`p-2 rounded-xl shrink-0 mt-0.5 border ${mod.color}`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {mod.label}
                          </h5>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="h-4 w-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {mod.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setSubAdminModal({ isOpen: false, subAdmin: null })}
                className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-all"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-brand-500/25 transition-all active:scale-95 flex items-center space-x-2"
              >
                <ShieldCheck size={16} />
                <span>{subAdminModal.subAdmin ? 'Enregistrer les modifications' : 'Créer le Sous-Admin'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderSubAdmins = () => {
    const filteredSubAdmins = subAdmins.filter(sa =>
      sa.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sa.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sa.role_title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Banner header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 rounded-3xl text-white shadow-xl border border-slate-800 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-full text-xs font-bold mb-3">
              <ShieldCheck size={14} />
              <span>Gestion des Accès Délégués</span>
            </div>
            <h3 className="text-2xl font-black tracking-tight text-white mb-2">
              Sous-Administrateurs & Permissions
            </h3>
            <p className="text-sm text-slate-300 font-medium leading-relaxed">
              Créez des comptes d'administration restreints avec des droits spécifiques (Paiements, Support client, Validation des restaurants, Modération).
            </p>
          </div>

          <button
            onClick={() => handleOpenSubAdminModal()}
            className="px-6 py-3.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-brand-500/20 transition-all active:scale-95 flex items-center space-x-2 shrink-0 border border-brand-400/30"
          >
            <UserPlus size={18} />
            <span>Nouveau Sous-Admin</span>
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-2xl border border-brand-500/20">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Sous-Admins Créés</p>
              <h4 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{subAdmins.length}</h4>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20">
              <CheckCircle size={22} />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Comptes Actifs</p>
              <h4 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                {subAdmins.filter(s => s.is_active).length}
              </h4>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-2xl border border-purple-500/20">
              <Lock size={22} />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Modules Sécurisés</p>
              <h4 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{PERMISSION_MODULES.length}</h4>
            </div>
          </div>
        </div>

        {/* Search & List */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Rechercher par nom, email ou rôle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-brand-500"
              />
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
              Affichage de {filteredSubAdmins.length} sous-administrateur(s)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Sous-Administrateur</th>
                  <th className="px-6 py-4">Rôle / Intitulé</th>
                  <th className="px-6 py-4">Permissions & Modules Autorisés</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSubAdmins.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                      Aucun sous-administrateur trouvé. Cliquez sur "Nouveau Sous-Admin" pour en créer un.
                    </td>
                  </tr>
                ) : (
                  filteredSubAdmins.map((sa) => {
                    const isSimulatingThis = simulatedSubAdmin?.id === sa.id;

                    return (
                      <tr key={sa.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-black flex items-center justify-center text-sm shadow-sm shrink-0">
                              {sa.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-900 dark:text-white text-sm">
                                {sa.full_name}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400 text-xs font-mono">
                                {sa.email}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                                  <Lock size={10} className="text-brand-500" />
                                  <span>{sa.password || '••••••••'}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const textToCopy = `Identifiants Sous-Admin DashMeals:\nEmail: ${sa.email}\nMot de passe: ${sa.password || '••••••••'}`;
                                    navigator.clipboard.writeText(textToCopy);
                                    toast.success(`Identifiants de ${sa.full_name} copiés dans le presse-papier !`);
                                  }}
                                  className="text-[10px] text-brand-600 dark:text-brand-400 font-bold hover:underline"
                                  title="Copier les identifiants de connexion"
                                >
                                  Copier
                                </button>
                              </div>
                              {sa.phone_number && (
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                  {sa.phone_number}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {sa.role_title}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5 max-w-md">
                            {(sa.permissions || []).map((p: string) => {
                              const modInfo = PERMISSION_MODULES.find(m => m.id === p);
                              return (
                                <span
                                  key={p}
                                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20"
                                >
                                  {modInfo ? modInfo.label : p}
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleSubAdminStatus(sa.id)}
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${
                              sa.is_active
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300'
                            }`}
                          >
                            {sa.is_active ? 'Actif' : 'Suspendu'}
                          </button>
                        </td>

                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => {
                              if (isSimulatingThis) {
                                setSimulatedSubAdmin(null);
                                toast.info("Fin de la simulation sous-admin.");
                              } else {
                                setSimulatedSubAdmin(sa);
                                toast.success(`Mode simulation activé pour : ${sa.full_name}`);
                              }
                            }}
                            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all inline-flex items-center gap-1 ${
                              isSimulatingThis
                                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200'
                            }`}
                            title="Tester / Simuler les permissions de ce sous-admin"
                          >
                            <ShieldAlert size={12} />
                            <span>{isSimulatingThis ? 'Stop Test' : 'Tester Rôle'}</span>
                          </button>

                          <button
                            onClick={() => handleOpenSubAdminModal(sa)}
                            className="p-1.5 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Éditer le sous-admin"
                          >
                            <Edit3 size={15} />
                          </button>

                          <button
                            onClick={() => handleDeleteSubAdmin(sa.id, sa.full_name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Supprimer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex relative transition-colors duration-300">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0d1527] dark:bg-[#070b13] border-r border-[#1e293b]/70 dark:border-slate-900/40 text-gray-200 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} overflow-y-auto shadow-2xl`}>
        <div className="p-6 border-b border-[#1e293b]/60 flex justify-between items-center">
            <div className="flex items-center space-x-3">
                <div className="bg-brand-500 rounded-[14px] shadow-md ring-2 ring-brand-500/20 flex items-center justify-center overflow-hidden w-8 h-8">
                    <img src={APP_LOGO_URL} alt="DashMeals" className="w-full h-full object-cover" />
                </div>
                <div>
                    <h1 className="text-lg font-black tracking-tighter text-white uppercase leading-none">DashMeals</h1>
                    <span className="text-[9px] text-[#38bdf8] font-bold uppercase tracking-widest mt-1.5 inline-block">
                        {isPrincipalAdmin ? 'Super Admin' : 'Admin'}
                    </span>
                </div>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-gray-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
              <X size={20} />
            </button>
        </div>
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto custom-scrollbar">
            {canAccessView('overview') && (
              <button 
                  onClick={() => handleNavigation('overview')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'overview' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'overview' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <Activity size={18} className={`transition-transform duration-300 ${activeView === 'overview' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">{t('overview')}</span>
              </button>
            )}

            {canAccessView('requests') && (
              <button 
                  onClick={() => handleNavigation('requests')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'requests' 
                      ? 'bg-gradient-to-r from-orange-550 to-orange-600 bg-orange-600 text-white font-bold shadow-lg shadow-orange-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'requests' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <Bell size={18} className={`transition-transform duration-300 ${activeView === 'requests' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-orange-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">Demandes</span>
                  {(stats.pendingVerifications + stats.subscriptionRequests) > 0 && (
                      <span className="bg-white text-orange-600 text-[9px] font-black px-2 py-0.5 rounded-full ml-auto animate-pulse">
                          {stats.pendingVerifications + stats.subscriptionRequests}
                      </span>
                  )}
              </button>
            )}

            {canAccessView('users') && (
              <button 
                  onClick={() => handleNavigation('users')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'users' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'users' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <Users size={18} className={`transition-transform duration-300 ${activeView === 'users' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">Utilisateurs</span>
              </button>
            )}

            {canAccessView('subadmins') && (
              <button 
                  onClick={() => handleNavigation('subadmins')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'subadmins' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'subadmins' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <ShieldCheck size={18} className={`transition-transform duration-300 ${activeView === 'subadmins' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">Sous-Admins</span>
                  {subAdmins.length > 0 && (
                    <span className="bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[9px] font-black px-2 py-0.5 rounded-full ml-auto">
                      {subAdmins.length}
                    </span>
                  )}
              </button>
            )}

            {canAccessView('restaurants') && (
              <button 
                  onClick={() => handleNavigation('restaurants')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'restaurants' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'restaurants' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <Store size={18} className={`transition-transform duration-300 ${activeView === 'restaurants' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">{t('restaurants')}</span>
              </button>
            )}

            {canAccessView('subscriptions') && (
              <button 
                  onClick={() => handleNavigation('subscriptions')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'subscriptions' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'subscriptions' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <CreditCard size={18} className={`transition-transform duration-300 ${activeView === 'subscriptions' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">Paiements Abonnements</span>
                  {restaurants.filter(r => r.subscriptionStatus === 'cancelled' && r.subscriptionEndDate && new Date(r.subscriptionEndDate).getTime() > new Date().getTime()).length > 0 && (
                    <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full ml-auto animate-pulse">
                      {restaurants.filter(r => r.subscriptionStatus === 'cancelled' && r.subscriptionEndDate && new Date(r.subscriptionEndDate).getTime() > new Date().getTime()).length}
                    </span>
                  )}
              </button>
            )}

            {canAccessView('publications') && (
              <button 
                  onClick={() => handleNavigation('publications')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'publications' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'publications' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <Database size={18} className={`transition-transform duration-300 ${activeView === 'publications' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">Publications</span>
              </button>
            )}

            {canAccessView('support') && (
              <button 
                  onClick={() => handleNavigation('support')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'support' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'support' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <Mail size={18} className={`transition-transform duration-300 ${activeView === 'support' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">{t('support')}</span>
                  {stats.openTickets > 0 && <span className="bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full ml-auto animate-pulse">{stats.openTickets}</span>}
              </button>
            )}

            {canAccessView('messages') && (
              <button 
                  onClick={() => handleNavigation('messages')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'messages' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'messages' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <MessageSquare size={18} className={`transition-transform duration-300 ${activeView === 'messages' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">Messages</span>
              </button>
            )}

            {canAccessView('verifications') && (
              <button 
                  onClick={() => handleNavigation('verifications')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'verifications' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'verifications' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <Shield size={18} className={`transition-transform duration-300 ${activeView === 'verifications' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">Vérifications</span>
                  {stats.pendingVerifications > 0 && <span className="bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full ml-auto animate-pulse">{stats.pendingVerifications}</span>}
              </button>
            )}

            {canAccessView('settings') && (
              <button 
                  onClick={() => handleNavigation('settings')} 
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group active:scale-[0.98] ${
                      activeView === 'settings' 
                      ? 'bg-gradient-to-r from-brand-650 to-brand-600 bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/15' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
              >
                  {activeView === 'settings' && <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-md"></div>}
                  <Settings size={18} className={`transition-transform duration-300 ${activeView === 'settings' ? 'scale-110 text-white' : 'text-slate-500 group-hover:scale-110 group-hover:text-brand-400'}`} /> 
                  <span className="text-sm font-semibold tracking-wide">Paramètres App</span>
              </button>
            )}
        </nav>
        <div className="p-4 border-t border-[#1e293b]/60 relative">
            {isBottomMenuOpen && (
              <div className="absolute bottom-full left-3 right-3 mb-2 p-4 bg-[#0a101f] border border-[#1e293b] rounded-2xl shadow-2xl z-50 space-y-4 animate-in slide-in-from-bottom-2 duration-200">
                <div>
                  <label className="text-[9px] text-slate-400 mb-1.5 block uppercase font-extrabold tracking-wider">{t('appearance')}</label>
                  <div className="flex bg-[#131c31] rounded-xl p-1.5 border border-[#1e293b]/60">
                    <button 
                      onClick={() => setTheme && setTheme('light')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${theme === 'light' ? 'bg-[#1e293b] text-white shadow-md' : 'text-[#64748b] hover:text-white'}`}
                    >
                      <Sun size={13} className="mr-1.5"/> Clair
                    </button>
                    <button 
                      onClick={() => setTheme && setTheme('dark')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${theme === 'dark' ? 'bg-[#1e293b] text-white shadow-md font-bold' : 'text-[#64748b] hover:text-white'}`}
                    >
                      <Moon size={13} className="mr-1.5"/> Sombre
                    </button>
                  </div>
                </div>

                {font && setFont && (
                  <div>
                    <label className="text-[9px] text-slate-400 mb-1.5 block uppercase font-extrabold tracking-wider">Police</label>
                    <select 
                      value={font} 
                      onChange={(e) => setFont(e.target.value as AppFont)}
                      className="w-full bg-[#131c31] text-slate-300 text-xs p-2.5 rounded-xl border border-[#1e293b]/60 outline-none focus:border-brand-500 font-medium"
                    >
                      <option value="facebook">Facebook (Défaut)</option>
                      <option value="inter">Inter</option>
                      <option value="roboto">Roboto</option>
                      <option value="opensans">Open Sans</option>
                      <option value="lato font-medium">Lato</option>
                      <option value="montserrat">Montserrat</option>
                      <option value="poppins">Poppins</option>
                      <option value="quicksand">Quicksand</option>
                      <option value="playfair">Playfair Display</option>
                    </select>
                  </div>
                )}

                <div className="pt-2 border-t border-[#1e293b]/60 space-y-1.5">
                  {onGoToClient && (
                    <button 
                      onClick={onGoToClient} 
                      className="w-full flex items-center justify-start space-x-2.5 text-sky-300 hover:text-white hover:bg-sky-950/40 px-3 py-2 rounded-xl transition-all font-semibold text-xs border border-transparent hover:border-sky-900/30 active:scale-95"
                    >
                      <ShoppingBag size={14} /> <span>Espace Client</span>
                    </button>
                  )}
                  <button onClick={onLogout} className="w-full flex items-center justify-start space-x-2.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 px-3 py-2 rounded-xl transition-all font-semibold text-xs border border-transparent hover:border-rose-900/30 active:scale-95">
                    <LogOut size={14} /> <span>{t('logout')}</span>
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setIsBottomMenuOpen(prev => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#0a101f] hover:bg-[#131c31] border border-[#1e293b]/60 rounded-2xl text-slate-300 transition-all group active:scale-[0.98]"
            >
              <div className="flex items-center space-x-2.5">
                <Sliders size={16} className="text-brand-400 group-hover:rotate-45 transition-transform" />
                <span className="text-xs font-bold tracking-wide">Options & Compte</span>
              </div>
              <ChevronUp size={16} className={`text-slate-400 transition-transform duration-300 ${isBottomMenuOpen ? 'rotate-180' : ''}`} />
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 transition-all duration-300 overflow-y-auto h-screen">
         {simulatedSubAdmin && (
           <div className="mb-6 p-4 bg-amber-500/15 border-2 border-amber-500/40 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg backdrop-blur-md">
             <div className="flex items-center space-x-3">
               <div className="p-2.5 bg-amber-500 text-slate-950 rounded-2xl font-black">
                 <ShieldCheck size={20} />
               </div>
               <div>
                 <p className="text-xs font-black text-amber-500 uppercase tracking-wider">Mode Simulation Sous-Admin Actif</p>
                 <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                   Compte: <span className="text-amber-600 dark:text-amber-400 font-extrabold">{simulatedSubAdmin.name}</span> ({simulatedSubAdmin.role})
                 </p>
               </div>
             </div>
             <button 
               onClick={() => setSimulatedSubAdmin(null)}
               className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2"
             >
               <span>Quitter la simulation</span>
             </button>
           </div>
         )}

         <div className="md:hidden mb-6 flex items-center justify-between bg-white dark:bg-gray-800 p-4 -mx-4 -mt-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-30">
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)} 
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-gray-600 dark:text-gray-300 transition-colors"
            >
              <Menu size={24} />
            </button>
            <span className="font-black text-lg text-gray-900 dark:text-white tracking-tighter">DashMeals Admin</span>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-gray-900 dark:text-white leading-none">{user.name}</p>
              <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Active</span>
            </div>
            {onGoToClient && (
              <button 
                onClick={onGoToClient}
                className="p-2 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/20 rounded-xl transition-colors flex items-center space-x-1"
                title="Espace Client"
              >
                <ShoppingBag size={20} />
              </button>
            )}
            <button 
              onClick={onLogout} 
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
              title="Déconnexion"
            >
              <LogOut size={20} />
            </button>
          </div>
         </div>

         <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
             <div>
                 <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                     {activeView === 'overview' && 'Tableau de bord'}
                     {activeView === 'users' && 'Utilisateurs'}
                     {activeView === 'subadmins' && 'Sous-Admins & Permissions'}
                     {activeView === 'restaurants' && 'Restaurants Partenaires'}
                     {activeView === 'publications' && 'Publications'}
                     {activeView === 'verifications' && 'Vérifications'}
                     {activeView === 'support' && 'Support Client'}
                     {activeView === 'messages' && 'Messages Commandes'}
                     {activeView === 'subscriptions' && 'Abonnements & Paiements DashMeals Pay'}
                     {activeView === 'settings' && "Paramètres de l'Application"}
                 </h2>
                 <p className="text-gray-500 dark:text-gray-400 text-sm">Bienvenue, {user.name}</p>
             </div>
             <div className="flex items-center space-x-4">
                 <div className="flex items-center px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-bold">
                     <CheckCircle size={14} className="mr-1" /> Système Opérationnel
                 </div>
                 <button 
                   onClick={() => {
                       fetchStats();
                       if (activeView === 'users') fetchUsers();
                       if (activeView === 'restaurants') fetchRestaurants();
                       if (activeView === 'verifications') fetchPendingVerifications();
                       if (activeView === 'publications') fetchPublications();
                       if (activeView === 'support') fetchSupportTickets();
                       if (activeView === 'messages') fetchOrderMessages();
                       if (activeView === 'requests') { fetchPendingVerifications(); fetchSupportTickets(); }
                       toast.success("Données actualisées");
                   }}
                   className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all shadow-sm"
                   title="Actualiser les données"
                 >
                   <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                 </button>
                 {onGoToClient && (
                    <button 
                      onClick={onGoToClient}
                      className="hidden md:flex items-center space-x-2 px-4 py-2 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 rounded-xl hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-all font-bold text-sm mr-2"
                     >
                       <ShoppingBag size={16} />
                       <span>Espace Client</span>
                     </button>
                  )}
                 <button 
                   onClick={onLogout}
                   className="hidden md:flex items-center space-x-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-all font-bold text-sm"
                 >
                   <LogOut size={16} />
                   <span>{t('logout')}</span>
                 </button>
             </div>
         </header>

         {activeView === 'overview' && renderOverview()}
         {activeView === 'requests' && (
           <div className="space-y-6">
               <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-brand-100 dark:border-brand-900/30 overflow-hidden">
                   <div className="p-4 bg-brand-50 dark:bg-brand-900/10 border-b border-brand-100 dark:border-brand-900/30">
                       <h3 className="font-black text-brand-600 dark:text-brand-400 flex items-center gap-2">
                           <Shield size={18} />
                           Vérifications d'Identité ({pendingVerifications.length})
                       </h3>
                   </div>
                   {renderVerifications()}
               </div>

               <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-orange-100 dark:border-orange-900/30 overflow-hidden">
                   <div className="p-4 bg-orange-50 dark:bg-orange-900/10 border-b border-orange-100 dark:border-orange-900/30">
                       <h3 className="font-black text-orange-600 dark:text-orange-400 flex items-center gap-2">
                           <CreditCard size={18} />
                           Demandes d'Abonnement Manuel ({supportTickets.filter(t => t.status === 'open' && (t.subject?.toLowerCase().includes('abonnement') || t.message?.toLowerCase().includes('abonne'))).length})
                       </h3>
                   </div>
                   <div className="overflow-x-auto">
                       <table className="w-full text-left text-sm">
                           <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase text-[10px]">
                               <tr>
                                   <th className="px-6 py-4">Utilisateur</th>
                                   <th className="px-6 py-4">Détails de la demande</th>
                                   <th className="px-6 py-4 text-right">Action</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                               {supportTickets.filter(t => t.status === 'open' && (t.subject?.toLowerCase().includes('abonnement') || t.message?.toLowerCase().includes('abonne'))).length === 0 ? (
                                   <tr>
                                       <td colSpan={3} className="p-8 text-center text-gray-500">Aucune demande d'abonnement en attente</td>
                                   </tr>
                               ) : (
                                   supportTickets.filter(t => t.status === 'open' && (t.subject?.toLowerCase().includes('abonnement') || t.message?.toLowerCase().includes('abonne'))).map(ticket => (
                                       <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                           <td className="px-6 py-4">
                                               <div className="font-bold text-gray-900 dark:text-white">{ticket.profiles?.full_name}</div>
                                               <div className="text-[10px] text-gray-400">{ticket.profiles?.email}</div>
                                           </td>
                                           <td className="px-6 py-4">
                                               <div className="font-bold text-orange-600 text-xs">{ticket.subject}</div>
                                               <div className="text-xs text-gray-500 line-clamp-1">{ticket.message}</div>
                                           </td>
                                           <td className="px-6 py-4 text-right space-x-2">
                                               <button 
                                                   onClick={() => {
                                                       const restoIdMatch = (ticket.message || '').match(/ID: ([a-f0-9-]+)/i);
                                                       const restoId = restoIdMatch ? restoIdMatch[1] : null;
                                                       const resto = isPrincipalAdmin ? restaurants.find(r => r.id === restoId) : null;
                                                       if (resto) {
                                                           setSelectedTier(ticket.subject?.toUpperCase().includes('BASIC') ? 'basic' : ticket.subject?.toUpperCase().includes('PREMIUM') ? 'premium' : 'enterprise');
                                                           setSubEndDate(''); // Admin chooses
                                                           setSubscriptionModal({ isOpen: true, restaurant: resto });
                                                       } else {
                                                           setSelectedTicket(ticket);
                                                           setActiveView('support');
                                                       }
                                                   }}
                                                   className="bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-brand-700 shadow-md inline-flex items-center"
                                               >
                                                   {isPrincipalAdmin ? "Gérer" : "Répondre"}
                                               </button>
                                                <button 
                                                    onClick={() => deleteTicket(ticket.id)}
                                                    className="p-2 text-gray-400 hover:text-red-500 transition-colors inline-flex items-center"
                                                    title="Supprimer la demande"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                           </td>
                                       </tr>
                                   ))
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>
           </div>
         )}
         {activeView === 'users' && canAccessView('users') && renderUsers()}
         {activeView === 'subadmins' && canAccessView('subadmins') && renderSubAdmins()}
         {activeView === 'restaurants' && canAccessView('restaurants') && renderRestaurants()}
         {activeView === 'subscriptions' && canAccessView('subscriptions') && renderSubscriptions()}
         {activeView === 'publications' && canAccessView('publications') && renderPublications()}
         {activeView === 'verifications' && canAccessView('verifications') && renderVerifications()}
         {activeView === 'support' && canAccessView('support') && renderSupport()}
         {activeView === 'messages' && canAccessView('messages') && renderMessages()}
         {activeView === 'settings' && canAccessView('settings') && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
              <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-lg text-gray-800 dark:text-white">Paramètres Généraux</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Configurez les informations globales de l'application</p>
              </div>
              <div className="p-6 space-y-6">
                {!isPrincipalAdmin && (
                   <div className="p-4 bg-amber-100/50 dark:bg-amber-950/20 border border-amber-200/45 dark:border-amber-900/30 rounded-2xl flex items-center gap-3 mb-6">
                     <Shield size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 animate-bounce" />
                     <div>
                       <p className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider">Privilèges Limités (Espace Admin)</p>
                       <p className="text-[11px] text-amber-600 dark:text-amber-405 mt-0.5 font-semibold">Les configurations système sont en lecture seule sous votre rôle restreint d'Admin d'établissement.</p>
                     </div>
                   </div>
                 )}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">E-mail de Support</label>
                    <input 
                      type="email"
                      value={appSettings.support_email} disabled={!isPrincipalAdmin}
                      onChange={(e) => setAppSettings({...appSettings, support_email: e.target.value})}
                      className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                      placeholder="support@dashmeals-rdc.com" style={{ opacity: isPrincipalAdmin ? 1 : 0.6 }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Téléphone (Urgent)</label>
                    <input 
                      type="text"
                      value={appSettings.support_phone} disabled={!isPrincipalAdmin}
                      onChange={(e) => setAppSettings({...appSettings, support_phone: e.target.value})}
                      className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                      placeholder="+243 81 000 0000" style={{ opacity: isPrincipalAdmin ? 1 : 0.6 }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">WhatsApp Support</label>
                    <input 
                      type="text"
                      value={appSettings.support_whatsapp} disabled={!isPrincipalAdmin}
                      onChange={(e) => setAppSettings({...appSettings, support_whatsapp: e.target.value})}
                      className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                      placeholder="+243 81 000 0001" style={{ opacity: isPrincipalAdmin ? 1 : 0.6 }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Adresse du Siège</label>
                    <input 
                      type="text"
                      value={appSettings.office_address} disabled={!isPrincipalAdmin}
                      onChange={(e) => setAppSettings({...appSettings, office_address: e.target.value})}
                      className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                      placeholder="Kinshasa, Gombe" style={{ opacity: isPrincipalAdmin ? 1 : 0.6 }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Taux de Conversion de Paiement (1 USD = ? CDF)</label>
                    <input 
                      type="number"
                      value={appSettings.payment_exchange_rate || 2850} disabled={!isPrincipalAdmin}
                      onChange={(e) => setAppSettings({...appSettings, payment_exchange_rate: Number(e.target.value) || 2850})}
                      className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white font-mono font-bold text-brand-600 dark:text-brand-400"
                      placeholder="2850" style={{ opacity: isPrincipalAdmin ? 1 : 0.6 }}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Configure le taux de change global de l'application appliqué lors du paiement DashMeals Pay (conversion automatique des dollars USD en francs congolais CDF).</p>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <button 
                    onClick={updateAppSettings} style={{ display: isPrincipalAdmin ? 'inline-flex' : 'none' }}
                    disabled={loading}
                    className="px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold font-display shadow-lg shadow-brand-500/20 active:scale-95 transition-all flex items-center gap-2"
                  >
                    {loading ? <RefreshCw size={18} className="animate-spin" /> : <Settings size={18} />}
                    Enregistrer les modifications
                  </button>
                </div>
              </div>
            </div>
          )}

          {renderEmailModal()}
          {renderRoleModal()}

          {/* ADD USER MODAL (COTE ADMIN PAR EXCELLENCE) */}
          {isAddUserModalOpen && isPrincipalAdmin && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                  <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                      <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/45">
                          <div>
                              <h3 className="font-extrabold text-[#0d1527] dark:text-white text-lg uppercase tracking-tight">Ajouter un utilisateur</h3>
                              <p className="text-xs text-gray-500">Créer un nouveau compte client, restaurateur, livreur ou un sous-administrateur</p>
                          </div>
                          <button onClick={() => setIsAddUserModalOpen(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400">
                              <X size={20} />
                          </button>
                      </div>
                      <div className="p-6 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Nom complet *</label>
                                  <input 
                                      type="text" 
                                      placeholder="Ex: Jean Dupont"
                                      value={newUserData.fullName}
                                      onChange={(e) => setNewUserData({...newUserData, fullName: e.target.value})}
                                      className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Adresse E-mail *</label>
                                  <input 
                                      type="email" 
                                      placeholder="jean.dupont@example.com"
                                      value={newUserData.email}
                                      onChange={(e) => setNewUserData({...newUserData, email: e.target.value})}
                                      className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                                  />
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Mot de passe *</label>
                                  <input 
                                      type="password" 
                                      placeholder="••••••••"
                                      value={newUserData.password}
                                      onChange={(e) => setNewUserData({...newUserData, password: e.target.value})}
                                      className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Téléphone (Optionnel)</label>
                                  <input 
                                      type="text" 
                                      placeholder="Ex: +243812345678"
                                      value={newUserData.phone || ''}
                                      onChange={(e) => setNewUserData({...newUserData, phone: e.target.value})}
                                      className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                                  />
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Rôle / Privilèges *</label>
                                  <select 
                                      value={newUserData.role}
                                      onChange={(e) => setNewUserData({...newUserData, role: e.target.value as any})}
                                      className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-650 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white font-semibold"
                                  >
                                      <option value="client">Client (Utilisateur final)</option>
                                      <option value="business">Restaurateur (Gérant d'établissement)</option>
                                      <option value="delivery">Livreur (Partenaire Coursier)</option>
                                      <option value="superadmin">Sous-Administrateur (Gestionnaire DashMeals)</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Ville d'affectation *</label>
                                  <select 
                                      value={newUserData.city}
                                      onChange={(e) => setNewUserData({...newUserData, city: e.target.value})}
                                      className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-650 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white font-semibold"
                                  >
                                      {CITIES_RDC.map(city => (
                                          <option key={city} value={city}>{city}</option>
                                      ))}
                                  </select>
                              </div>
                          </div>

                          <div className="pt-4 flex gap-3 border-t border-gray-100 dark:border-gray-700">
                              <button 
                                  onClick={() => setIsAddUserModalOpen(false)}
                                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-250 dark:bg-gray-700 dark:hover:bg-gray-650 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs transition-all active:scale-95 text-center"
                              >{t('cancel')}</button>
                              <button 
                                  onClick={handleCreateUser}
                                  disabled={loading}
                                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs transition-all tracking-wide active:scale-95 flex items-center justify-center space-x-2 shadow-lg shadow-brand-500/10"
                              >
                                  {loading && <RefreshCw size={14} className="animate-spin" />}
                                  <span>Créer le compte</span>
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* Subscription Management Modal */}
          {subscriptionModal.isOpen && subscriptionModal.restaurant && isPrincipalAdmin && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                  <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                      <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                          <div>
                              <h3 className="font-black text-gray-900 dark:text-white text-lg">Gérer l'Abonnement</h3>
                              <p className="text-xs text-gray-500">{subscriptionModal.restaurant.name}</p>
                          </div>
                          <button onClick={() => setSubscriptionModal({ isOpen: false, restaurant: null })} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                              <X size={20} />
                          </button>
                      </div>
                      <div className="p-6 space-y-5">
                          <div className="space-y-2">
                              <label className="block text-xs font-bold text-gray-500 uppercase">Niveau de Forfait</label>
                              <div className="grid grid-cols-2 gap-2">
                                  {['free', 'basic', 'premium', 'enterprise'].map(tier => (
                                      <button
                                          key={tier}
                                          onClick={() => setSelectedTier(tier as any)}
                                          className={`py-3 rounded-xl border-2 text-sm font-bold capitalize transition-all ${
                                              selectedTier === tier 
                                              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' 
                                              : 'border-gray-100 dark:border-gray-700 text-gray-500 hover:border-gray-200'
                                          }`}
                                      >
                                          {tier}
                                      </button>
                                  ))}
                              </div>
                          </div>

                          <div className="space-y-2">
                              <label className="block text-xs font-bold text-gray-500 uppercase">Date d'expiration</label>
                              <div className="relative">
                                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                  <input 
                                      type="date"
                                      value={subEndDate}
                                      onChange={(e) => setSubEndDate(e.target.value)}
                                      className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white"
                                  />
                              </div>
                              <p className="text-[10px] text-gray-400">Laissez vide pour un accès permanent (ou gérez manuellement)</p>
                          </div>

                          <div className="pt-4 flex gap-3">
                              <button 
                                  onClick={() => setSubscriptionModal({ isOpen: false, restaurant: null })}
                                  className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"
                              >{t('cancel')}</button>
                              <button 
                                  onClick={updateSubscription}
                                  disabled={loading}
                                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center gap-2"
                              >
                                  {loading && <RefreshCw size={16} className="animate-spin" />}
                                  Enregistrer
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* Refund Modal */}
          {refundModal.isOpen && refundModal.restaurant && isPrincipalAdmin && (() => {
              const r = refundModal.restaurant;
              const basePrice = r.subscriptionTier === 'enterprise' || r.subscriptionTier === 'elite' ? 99 :
                                r.subscriptionTier === 'premium' || r.subscriptionTier === 'pro' ? 49 :
                                r.subscriptionTier === 'basic' ? 29 : 0;

              const endDate = r.subscriptionEndDate ? new Date(r.subscriptionEndDate) : null;
              const now = new Date();
              let remainingDays = 30;
              let consumedDays = 0;

              if (endDate) {
                  const diffMs = endDate.getTime() - now.getTime();
                  remainingDays = Math.max(0, Math.min(30, Math.ceil(diffMs / (1000 * 60 * 60 * 24))));
                  consumedDays = Math.max(0, 30 - remainingDays);
              }

              // Formula requested: ((Prix / 30) * joursConsommes) + taxes (frais de transaction inclus)
              const dailyRate = basePrice / 30;
              const consumedValue = dailyRate * consumedDays;
              const taxAndFeeRate = 0.025; // 2.5% taxes & DashMeals Pay transaction fees
              const taxAndFeeAmount = basePrice * taxAndFeeRate;
              
              // Net refund = Base Price - Consumed Value - Tax/Fees
              const netRefundAmount = Math.max(0, basePrice - consumedValue - taxAndFeeAmount);

              const kpayTxRef = `KPAY-REFUND-${Math.floor(100000 + Math.random() * 900000)}`;

              return (
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
                      <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700 flex flex-col max-h-[90vh] my-auto">
                          <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white flex justify-between items-center shrink-0">
                              <div className="flex items-center gap-2.5">
                                  <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-400/30 backdrop-blur-md shrink-0">
                                      <RotateCcw size={18} className="text-blue-400" />
                                  </div>
                                  <div className="min-w-0">
                                      <h3 className="font-black text-base sm:text-lg truncate">
                                          Remboursement DashMeals Pay
                                      </h3>
                                      <p className="text-[11px] text-slate-300 font-medium truncate">{r.name} • Calcul selon formule</p>
                                  </div>
                              </div>
                              <button 
                                  onClick={() => setRefundModal({ isOpen: false, restaurant: null, reason: '', returnToFree: true })} 
                                  className="p-1.5 hover:bg-white/20 rounded-full text-white transition-colors shrink-0 ml-2"
                                  title="Fermer"
                              >
                                  <X size={20} />
                              </button>
                          </div>

                          <div className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
                              {/* Formula Formula Notice */}
                              <div className="bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 p-3 rounded-xl sm:rounded-2xl text-xs space-y-1">
                                  <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-[11px] sm:text-xs">
                                      <ShieldCheck size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                      Formule : Prix - ((Prix / 30) × Jours Consommés) - Taxes & Frais
                                  </p>
                                  <p className="text-slate-600 dark:text-slate-300 text-[10px] sm:text-[11px] leading-relaxed">
                                      Seule la partie inutilisée est restituée, déduction faite des frais de transaction et taxes DashMeals Pay.
                                  </p>
                              </div>

                              {/* Transaction Reference Banner */}
                              <div className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-900 text-white rounded-xl sm:rounded-2xl text-xs">
                                  <span className="text-slate-400 font-bold uppercase text-[9px] sm:text-[10px]">Réf. Transaction</span>
                                  <span className="font-mono font-black text-emerald-400 bg-slate-800 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl border border-slate-700 text-[11px]">
                                      {kpayTxRef}
                                  </span>
                              </div>

                              {/* Detailed Formula Breakdown */}
                              <div className="bg-slate-50 dark:bg-slate-700/50 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-600 space-y-2">
                                  <div className="flex justify-between items-center text-xs">
                                      <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[9px] sm:text-[10px]">Prix de l'Abonnement</span>
                                      <span className="font-extrabold text-slate-800 dark:text-slate-200">${basePrice}.00 USD ({r.subscriptionTier?.toUpperCase()})</span>
                                  </div>

                                  <div className="flex justify-between items-center text-xs">
                                      <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[9px] sm:text-[10px]">Jours Consommés ({consumedDays} j/30)</span>
                                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                                          -${consumedValue.toFixed(2)} USD <span className="text-[9px] text-slate-400">(${dailyRate.toFixed(2)}/j)</span>
                                      </span>
                                  </div>

                                  <div className="flex justify-between items-center text-xs">
                                      <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[9px] sm:text-[10px]">Taxes & Frais de Service (2.5%)</span>
                                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                                          -${taxAndFeeAmount.toFixed(2)} USD
                                      </span>
                                  </div>

                                  <div className="flex justify-between items-center text-xs pt-2 border-t-2 border-slate-300 dark:border-slate-500">
                                      <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[10px] sm:text-[11px]">Net à Rembourser</span>
                                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-base sm:text-lg">
                                          ${netRefundAmount.toFixed(2)} USD
                                      </span>
                                  </div>
                              </div>

                              <div>
                                  <label className="block text-[10px] sm:text-xs font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                                      Motif d'annulation
                                  </label>
                                  <textarea
                                      rows={2}
                                      value={refundModal.reason}
                                      onChange={(e) => setRefundModal({ ...refundModal, reason: e.target.value })}
                                      placeholder="Ex: Résiliation anticipée..."
                                      className="w-full p-2.5 sm:p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                  />
                              </div>

                              <div className="flex items-center gap-2.5 p-2.5 sm:p-3 bg-slate-100 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
                                  <input
                                      type="checkbox"
                                      id="returnToFree"
                                      checked={refundModal.returnToFree}
                                      onChange={(e) => setRefundModal({ ...refundModal, returnToFree: e.target.checked })}
                                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer shrink-0"
                                  />
                                  <label htmlFor="returnToFree" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer leading-tight">
                                      Repasser l'établissement au forfait Gratuit
                                  </label>
                              </div>
                          </div>

                          <div className="p-4 sm:p-5 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700 shrink-0 flex gap-2.5">
                              <button 
                                  onClick={() => setRefundModal({ isOpen: false, restaurant: null, reason: '', returnToFree: true })}
                                  className="flex-1 py-2.5 sm:py-3 text-slate-600 dark:text-slate-400 font-extrabold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all text-xs uppercase"
                              >
                                  Annuler
                              </button>
                              <button 
                                  onClick={async () => {
                                      if (!refundModal.restaurant) return;
                                      setLoading(true);
                                      try {
                                          const updateData: any = {
                                              subscription_status: 'refunded',
                                              ...(refundModal.returnToFree ? {
                                                  subscription_tier: 'free',
                                                  subscription_end_date: null
                                              } : {})
                                          };

                                          const { error } = await supabase
                                              .from('restaurants')
                                              .update(updateData)
                                              .eq('id', r.id);

                                          if (error) throw error;

                                          // Notifier le partenaire/restaurant (In-app notification + Email)
                                          const ownerUserId = r.ownerId || (r as any).owner_id;
                                          if (ownerUserId) {
                                              try {
                                                  await supabase.from('notifications').insert({
                                                      user_id: ownerUserId,
                                                      restaurant_id: r.id,
                                                      title: "Remboursement DashMeals Pay Effectué",
                                                      message: `Votre remboursement DashMeals Pay d'un montant net de $${netRefundAmount.toFixed(2)} USD pour l'établissement "${r.name}" a été traité avec succès (Réf: ${kpayTxRef}).${refundModal.reason ? ` Motif : ${refundModal.reason}` : ''}`,
                                                      type: 'refund',
                                                      data: {
                                                          restaurant_id: r.id,
                                                          amount: netRefundAmount,
                                                          tx_ref: kpayTxRef,
                                                          reason: refundModal.reason,
                                                          refunded_at: new Date().toISOString()
                                                      }
                                                  });
                                              } catch (notifErr) {
                                                  console.warn('Notification in-app error:', notifErr);
                                              }

                                              try {
                                                  const { data: ownerProfile } = await supabase
                                                      .from('profiles')
                                                      .select('email')
                                                      .eq('id', ownerUserId)
                                                      .single();

                                                  if (ownerProfile?.email) {
                                                      await sendSubscriptionRefundEmail(
                                                          r.name,
                                                          ownerProfile.email,
                                                          netRefundAmount,
                                                          kpayTxRef,
                                                          refundModal.reason
                                                      );
                                                      await sendTransactionInvoiceEmail({ clientEmail: ownerProfile.email, clientName: r.name, restaurantName: r.name, invoiceNumber: 'AVOIR-' + Math.floor(100000 + Math.random() * 900000), invoiceType: 'refund', grossAmount: basePrice, feeAmount: taxAndFeeAmount, netAmount: netRefundAmount, paymentChannel: 'DashMeals Pay Gateway', txRef: kpayTxRef, date: new Date().toISOString(), notes: refundModal.reason ? 'Remboursement au prorata: ' + refundModal.reason : 'Remboursement au prorata (résiliation)' });
                                                  }
                                              } catch (emailErr) {
                                                  console.warn('Notification email error:', emailErr);
                                              }
                                          }

                                          // Enregistrer la transaction de remboursement dans le journal DashMeals Pay en temps réel
                                          const refundTxRecord = {
                                              id: 'kpay_refund_' + Date.now(),
                                              txRef: kpayTxRef,
                                              createdAt: new Date().toISOString(),
                                              restaurantId: r.id,
                                              restaurantName: r.name,
                                              payerName: (r as any).ownerId || r.name,
                                              type: 'refund',
                                              grossAmount: -basePrice,
                                              feeAmount: -taxAndFeeAmount,
                                              netAmount: -netRefundAmount,
                                              currency: 'USD',
                                              status: 'refunded',
                                              paymentChannel: 'DashMeals Pay Gateway',
                                              notes: refundModal.reason ? `Remboursement au prorata: ${refundModal.reason}` : 'Remboursement au prorata (résiliation)'
                                          };

                                          setKpayTransactions(prev => [refundTxRecord, ...prev]);

                                          toast.success(
                                              `Remboursement DashMeals Pay de ${netRefundAmount.toFixed(2)} USD effectué et notification envoyée (${kpayTxRef}).`
                                          );

                                          onRefreshData?.();
                                          fetchRestaurants();
                                          setRefundModal({ isOpen: false, restaurant: null, reason: '', returnToFree: true });
                                      } catch (err: any) {
                                          console.error('Refund error:', err);
                                          toast.error('Erreur de remboursement: ' + err.message);
                                      } finally {
                                          setLoading(false);
                                      }
                                  }}
                                  disabled={loading}
                                  className="flex-1 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                  {loading && <RefreshCw size={14} className="animate-spin" />}
                                  Rembourser ${netRefundAmount.toFixed(2)} USD
                              </button>
                          </div>
                      </div>
                  </div>
              );
          })()}

          {/* Edit Restaurant Modal */}
          {editRestaurantModal.isOpen && editRestaurantModal.restaurant && isPrincipalAdmin && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-8 animate-in zoom-in-95 duration-200">
                      <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                          <div>
                              <h3 className="font-black text-gray-900 dark:text-white text-lg flex items-center gap-2">
                                  <Store size={20} className="text-brand-600" /> Modifier l'Établissement
                              </h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{editRestoForm.name}</p>
                          </div>
                          <button 
                              onClick={() => setEditRestaurantModal({ isOpen: false, restaurant: null })} 
                              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 transition-colors"
                          >
                              <X size={20} />
                          </button>
                      </div>

                      <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nom de l'établissement</label>
                                  <input 
                                      type="text" 
                                      value={editRestoForm.name} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, name: e.target.value })}
                                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-brand-500"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Catégorie / Type</label>
                                  <select 
                                      value={editRestoForm.type} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, type: e.target.value as BusinessType })}
                                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-brand-500"
                                  >
                                      <option value="restaurant">Restaurant</option>
                                      <option value="fast_food">Fast Food</option>
                                      <option value="bakery">Boulangerie / Pâtisserie</option>
                                      <option value="grocery">Épicerie / Supermarché</option>
                                      <option value="pharmacy">Pharmacie</option>
                                  </select>
                              </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Ville</label>
                                  <select 
                                      value={editRestoForm.city} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, city: e.target.value })}
                                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-brand-500"
                                  >
                                      {CITIES_RDC.map(c => (
                                          <option key={c} value={c}>{c}</option>
                                      ))}
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Taux de conversion (1 USD = X CDF)</label>
                                  <input 
                                      type="number" 
                                      value={editRestoForm.exchangeRate} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, exchangeRate: Number(e.target.value) || 2850 })}
                                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-brand-500 font-bold"
                                  />
                              </div>
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Description</label>
                              <textarea 
                                  rows={2}
                                  value={editRestoForm.description} 
                                  onChange={e => setEditRestoForm({ ...editRestoForm, description: e.target.value })}
                                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                              />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Mode d'affichage des prix</label>
                                  <select 
                                      value={editRestoForm.displayCurrencyMode} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, displayCurrencyMode: e.target.value as any })}
                                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-brand-500"
                                  >
                                      <option value="dual">Double Affichage (USD + CDF)</option>
                                      <option value="usd">USD Uniquement ($)</option>
                                      <option value="cdf">CDF Uniquement (FC)</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Forfait d'Abonnement</label>
                                  <select 
                                      value={editRestoForm.subscriptionTier} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, subscriptionTier: e.target.value as any })}
                                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-brand-500 font-bold"
                                  >
                                      <option value="free">Gratuit (Free)</option>
                                      <option value="basic">Basic Pro</option>
                                      <option value="premium">Premium Pro</option>
                                      <option value="enterprise">Entreprise Max</option>
                                  </select>
                              </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Statut de Vérification</label>
                                  <select 
                                      value={editRestoForm.verificationStatus} 
                                      onChange={e => setEditRestoForm({ 
                                          ...editRestoForm, 
                                          verificationStatus: e.target.value as any,
                                          isVerified: e.target.value === 'verified'
                                      })}
                                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-brand-500"
                                  >
                                      <option value="unverified">Non Vérifié</option>
                                      <option value="pending">En attente de validation</option>
                                      <option value="verified">Vérifié (Badge de confiance)</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Temps de Préparation Moy. (min)</label>
                                  <input 
                                      type="number" 
                                      value={editRestoForm.preparationTime} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, preparationTime: Number(e.target.value) || 20 })}
                                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-brand-500"
                                  />
                              </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                              <label className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer">
                                  <input 
                                      type="checkbox" 
                                      checked={editRestoForm.isActive} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, isActive: e.target.checked })}
                                      className="w-4 h-4 text-brand-600 rounded accent-brand-600"
                                  />
                                  <span className="text-xs font-bold dark:text-white">Actif</span>
                              </label>

                              <label className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer">
                                  <input 
                                      type="checkbox" 
                                      checked={editRestoForm.isOpen} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, isOpen: e.target.checked })}
                                      className="w-4 h-4 text-brand-600 rounded accent-brand-600"
                                  />
                                  <span className="text-xs font-bold dark:text-white">Ouvert</span>
                              </label>

                              <label className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer">
                                  <input 
                                      type="checkbox" 
                                      checked={editRestoForm.deliveryAvailable} 
                                      onChange={e => setEditRestoForm({ ...editRestoForm, deliveryAvailable: e.target.checked })}
                                      className="w-4 h-4 text-brand-600 rounded accent-brand-600"
                                  />
                                  <span className="text-xs font-bold dark:text-white">Livraison Dispo.</span>
                              </label>
                          </div>
                      </div>

                      <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                          <button 
                              onClick={() => setEditRestaurantModal({ isOpen: false, restaurant: null })}
                              className="flex-1 py-3 text-gray-500 dark:text-gray-400 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all"
                          >
                              Annuler
                          </button>
                          <button 
                              onClick={handleSaveRestaurantDetails}
                              disabled={loading}
                              className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center gap-2"
                          >
                              {loading && <RefreshCw size={16} className="animate-spin" />}
                              Enregistrer
                          </button>
                      </div>
                  </div>
              </div>
          )}

        {renderSubAdminModal()}

        {/* Confirmation Modal */}
        {confirmModal.isOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={32} />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">{confirmModal.title}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{confirmModal.message}</p>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                                className="flex-1 py-3 text-gray-500 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"
                            >{t('cancel')}</button>
                            <button 
                                onClick={confirmModal.onConfirm}
                                disabled={confirmModal.isLoading}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                            >
                                {confirmModal.isLoading && <RefreshCw size={16} className="animate-spin" />}
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};