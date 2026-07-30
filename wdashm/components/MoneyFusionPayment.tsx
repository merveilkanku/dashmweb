import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, AlertCircle, ExternalLink, CreditCard, Landmark, Phone, Smartphone, ArrowRight, HelpCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { fetchWithRetry, parseJsonResponse } from '../utils/fetch';
import { supabase } from '../lib/supabase';

interface MoneyFusionPaymentProps {
  planId: string;
  restaurantId: string;
  initialAmount: number;
  currency?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  language?: string;
  type?: 'subscription' | 'order';
}

export const MoneyFusionPayment: React.FC<MoneyFusionPaymentProps> = ({ 
  planId, 
  restaurantId, 
  initialAmount, 
  currency = 'USD', 
  onSuccess,
  onCancel,
  language = 'fr',
  type = 'subscription' 
}) => {
  const [activeTab, setActiveTab] = useState<'gateway' | 'ussd'>('ussd');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatewayRedirectUrl, setGatewayRedirectUrl] = useState<string | null>(null);
  
  // USSD Fields
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState('VODACOM_MPESA_COD');
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [currentPaymentId, setCurrentPaymentId] = useState<string | null>(null);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Attempt to get the restaurant's phone number during mount
    const fetchRestaurantPhone = async () => {
      try {
        if (restaurantId) {
          const { data } = await supabase
            .from('restaurants')
            .select('phone')
            .eq('id', restaurantId)
            .single();
          if (data?.phone) {
            // Normalize phone number (remove leading +, remove space)
            const normalized = data.phone.replace(/[^0-9]/g, '');
            setPhoneNumber(normalized);
          }
        }
      } catch (err) {
        console.warn('Error fetching restaurant phone:', err);
      }
    };
    fetchRestaurantPhone();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [restaurantId]);

  const formatPrice = (amt: number, curr: string) => {
    if (curr.toUpperCase() === 'CDF') return `${amt.toLocaleString()} FC`;
    return `${amt.toFixed(2)} $`;
  };

  const handleGatewayPayment = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data?.session?.access_token || '';

      const response = await fetchWithRetry('/api/kpay/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ 
          orderId: `${restaurantId}:${planId}`, 
          amount: initialAmount,
          currency: currency.toUpperCase(),
          type,
          baseUrl: "https://dashmeals-rdc.onrender.com"
        }),
      });

      const resData = await parseJsonResponse(response);
      
      if (resData.mode === "USSD" || resData.paymentId) {
        setCurrentPaymentId(resData.paymentId);
        setPaymentStatus('PENDING');
        setPaymentMessage(resData.message || "Paiement USSD initié. Veuillez valider le pop-up sur votre téléphone.");
        startPollingPaymentStatus(resData.paymentId);
        return;
      }

      if (!resData.url) {
        throw new Error('URL de redirection non reçue du service de paiement');
      }

      setGatewayRedirectUrl(resData.url);
      toast.info('Redirection vers le paiement sécurisé DashMeals Pay...');
      
      // Attempt to open in a new tab if inside an iframe (AI Studio Preview)
      try {
        if (window.self !== window.top) {
          const newWindow = window.open(resData.url, '_blank');
          if (newWindow) {
            toast.success("Le portail DashMeals Pay s'est ouvert dans un nouvel onglet.");
          } else {
            toast.warning("L'ouverture automatique a été bloquée par votre navigateur. Veuillez utiliser le lien ci-dessous.");
          }
        } else {
          window.location.href = resData.url;
        }
      } catch (e) {
        window.open(resData.url, '_blank');
      }
      setIsLoading(false);

    } catch (err: any) {
      console.error('Payment Gateway Init Error:', err);
      setError(err.message || 'Impossible d\'initialiser la redirection vers le paiement');
      toast.error(err.message || 'Impossible d\'initialiser le paiement');
      setIsLoading(false);
    }
  };

  const startPollingPaymentStatus = (paymentId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    let attempts = 0;
    const maxAttempts = 40; // Poll for 2 minutes (40 * 3s)

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setError("Le délai d'attente pour la validation de la transaction a expiré. Veuillez réessayer.");
        setPaymentStatus(null);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/kpay/payment-status/${paymentId}`);
        if (!response.ok) {
          console.warn("Error polling payment status, will retry...");
          return;
        }

        const text = await response.text();
        let data: any = {};
        try {
          data = JSON.parse(text);
        } catch (pErr) {
          console.warn("Non-JSON status response during polling, will retry...", text.slice(0, 100));
          return;
        }

        console.log("Transaction status polled:", data.status, data);

        setPaymentStatus(data.status);
        if (data.status === 'COMPLETED' || data.status === 'SUCCESSFUL') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          toast.success("Abonnement activé avec succès !");
          setPaymentStatus('COMPLETED');
          setIsLoading(false);
          if (onSuccess) {
            setTimeout(() => {
              onSuccess();
            }, 2000);
          }
        } else if (data.status === 'FAILED') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setError(data.failureReason || "La transaction a échoué. Veuillez vérifier votre solde ou votre code PIN.");
          setPaymentStatus(null);
          setIsLoading(false);
        } else if (data.status === 'CANCELLED') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setError("Vous avez annulé la transaction.");
          setPaymentStatus(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);
  };

  const handleUssdPayment = async () => {
    if (!phoneNumber) {
      toast.error("Veuillez saisir votre numéro Mobile Money.");
      return;
    }

    // Basic cleaning of phone number
    const cleanedPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanedPhone.length < 8) {
      toast.error("Format de numéro de téléphone incorrect.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setPaymentStatus('PENDING_PUSH');
    setPaymentMessage(null);

    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data?.session?.access_token || '';

      const response = await fetchWithRetry('/api/kpay/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ 
          orderId: `${restaurantId}:${planId}`, 
          amount: initialAmount,
          currency: currency.toUpperCase(),
          type,
          phoneNumber: cleanedPhone,
          provider,
          baseUrl: "https://dashmeals-rdc.onrender.com"
        }),
      });

      const resData = await parseJsonResponse(response);

      if (resData.url && !resData.paymentId) {
        setGatewayRedirectUrl(resData.url);
        toast.info("Redirection vers le paiement sécurisé DashMeals Pay...");
        try {
          if (window.self !== window.top) {
            window.open(resData.url, '_blank');
          } else {
            window.location.href = resData.url;
          }
        } catch (e) {
          window.location.href = resData.url;
        }
        return;
      }

      setCurrentPaymentId(resData.paymentId);
      setPaymentStatus('PENDING');
      setPaymentMessage(resData.message || "Paiement initié. Veuillez valider sur votre téléphone.");
      
      // Start polling status
      if (resData.paymentId) {
        startPollingPaymentStatus(resData.paymentId);
      }

    } catch (err: any) {
      console.error('KPay USSD Error:', err);
      setError(err.message || 'Échec du lancement de la requête USSD');
      toast.error(err.message || 'Échec de la requête USSD');
      setPaymentStatus(null);
      setIsLoading(false);
    }
  };

  const getProviderName = (code: string) => {
    switch (code) {
      case 'VODACOM_COD': return 'M-Pesa RDC (Vodacom)';
      case 'AIRTEL_COD': return 'Airtel Money RDC';
      case 'ORANGE_COD': return 'Orange Money RDC';
      case 'MTN_MOMO_CMR': return 'MTN MoMo Cameroun';
      case 'ORANGE_CMR': return 'Orange Money Cameroun';
      default: return code;
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800 p-4 rounded-xl flex items-start gap-3">
          <Smartphone className="text-purple-600 mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-xs font-bold text-purple-900 dark:text-purple-200">Paiement Mobile Direct (M-Pesa, Airtel, Orange)</p>
            <p className="text-[10px] text-purple-800 dark:text-purple-300 leading-relaxed mt-1">
              Saisissez votre numéro et validez le paiement directement depuis votre téléphone portable.
            </p>
          </div>
        </div>

        {paymentStatus && paymentStatus !== 'COMPLETED' ? (
          <div className="bg-gray-50 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-800 p-6 rounded-xl text-center space-y-4 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center">
              <Loader2 className="animate-spin text-brand-600" size={48} />
            </div>
            <h4 className="font-bold text-gray-900 dark:text-white">Validation Mobile Money en cours...</h4>
            <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
              {paymentMessage || "Une invite de paiement a été envoyée sur votre téléphone. Veuillez entrer votre code PIN pour valider."}
            </p>
            <div className="bg-brand-50 dark:bg-brand-900/10 p-3 rounded-lg border border-brand-100 dark:border-brand-800 inline-flex items-center gap-2">
              <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider animate-pulse">Statut transaction : {paymentStatus}</span>
            </div>
            <p className="text-[10px] text-gray-400">Ne fermez pas cette page pendant le traitement de l'opération.</p>
          </div>
        ) : paymentStatus === 'COMPLETED' ? (
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800 p-6 rounded-xl text-center space-y-3 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center">
              <CheckCircle2 className="text-green-500 animate-bounce" size={48} />
            </div>
            <h4 className="font-bold text-green-900 dark:text-green-200">Paiement Réussi !</h4>
            <p className="text-xs text-green-800 dark:text-green-300">Votre abonnement a été activé avec succès. Redirection en cours...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">Opérateur</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full p-3.5 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-xl text-xs font-bold focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="VODACOM_MPESA_COD">M-Pesa RDC (Vodacom)</option>
                  <option value="AIRTEL_COD">Airtel RDC</option>
                  <option value="ORANGE_COD">Orange RDC</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">Numéro Mobile Money</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Ex: 243810000001"
                    className="w-full p-3.5 pl-9 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-xl text-xs font-bold focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800 p-4 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                <AlertCircle className="text-red-600 mt-0.5 shrink-0" size={18} />
                <p className="text-xs text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            <button
              onClick={handleUssdPayment}
              disabled={isLoading}
              className="w-full bg-brand-600 text-white py-4 px-6 rounded-2xl font-black shadow-lg shadow-brand-200 dark:shadow-none hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center justify-center text-lg gap-2 group"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={24} />
                  Validation en cours...
                </>
              ) : (
                <>
                  <Smartphone size={24} className="group-hover:scale-110 transition-transform" />
                  <span>Valider le paiement {formatPrice(initialAmount, currency)}</span>
                  <ArrowRight size={16} className="ml-1 opacity-50" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center space-y-2 py-2">
        <div className="flex items-center justify-center text-[10px] text-gray-400 space-x-1">
          <ShieldCheck size={12} />
          <span>Paiement Mobile Money 100% sécurisé et instantané</span>
        </div>
      </div>
    </div>
  );
};
