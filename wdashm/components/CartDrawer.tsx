import React, { useState } from 'react';
import { X, Trash2, ShoppingBag, CreditCard, Banknote, ArrowLeft, Phone, CheckCircle2, Smartphone, MapPin, Map, Camera } from 'lucide-react';
import { CartItem, RestaurantPaymentConfig, PaymentMethod, MobileMoneyNetwork, Language } from '../types';
import { formatDualPrice } from '../utils/format';
import { LocationPicker } from './LocationPicker';
import { useTranslation } from '../lib/i18n';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onRemove: (id: string) => void;
  onUpdateQuantity?: (id: string, newQuantity: number) => void;
  onCheckout: (
    paymentMethod: PaymentMethod,
    network?: MobileMoneyNetwork,
    isUrgent?: boolean,
    paymentProof?: string,
    deliveryLocation?: { lat: number; lng: number; address: string },
    customName?: string,
    customPhone?: string,
    deliveryFee?: number
  ) => void;
  total: number;
  currency?: 'USD' | 'CDF';
  exchangeRate?: number;
  displayCurrencyMode?: 'dual' | 'usd' | 'cdf';
  isLoading?: boolean;
  paymentConfig?: RestaurantPaymentConfig;
  language?: Language;
  userRole?: string;
  userName?: string;
  userPhone?: string;
  discountPercentage?: number;
  discountName?: string;
}

export const CartDrawer: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  items, 
  onRemove, 
  onUpdateQuantity,
  onCheckout, 
  total, 
  currency = 'USD', 
  exchangeRate,
  displayCurrencyMode = 'dual',
  isLoading = false,
  paymentConfig = { acceptCash: true, acceptMobileMoney: false, airtelNumber: '', orangeNumber: '', mpesaNumber: '' },
  language = 'fr' as Language,
  userRole = 'guest',
  userName = '',
  userPhone = '',
  discountPercentage = 0,
  discountName = ''
}) => {
  const t = useTranslation(language as Language);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fulfillmentMode, setFulfillmentMode] = useState<'delivery' | 'pickup'>('delivery');
  const [restaurantDetails, setRestaurantDetails] = useState<any | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<MobileMoneyNetwork | null>(null);
  const [isUrgent, setIsUrgent] = useState(false);
  const [paymentProof, setPaymentProof] = useState<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [addressDetails, setAddressDetails] = useState('');
  const [customName, setCustomName] = useState(userName || '');
  const [customPhone, setCustomPhone] = useState(userPhone || '');
  const [kpayPhone, setKpayPhone] = useState(userPhone || '');
  const [kpayProvider, setKpayProvider] = useState<'VODACOM_MPESA_COD' | 'AIRTEL_COD' | 'ORANGE_COD'>('VODACOM_MPESA_COD');

  React.useEffect(() => {
    if (userName) setCustomName(userName);
  }, [userName]);

  React.useEffect(() => {
    if (userPhone) {
      setCustomPhone(userPhone);
      setKpayPhone(userPhone);
    }
  }, [userPhone]);

  React.useEffect(() => {
    if (items[0]?.restaurantId) {
      supabase
        .from('restaurants')
        .select('*')
        .eq('id', items[0].restaurantId)
        .single()
        .then(({ data }) => {
          if (data) setRestaurantDetails(data);
        });
    }
  }, [items[0]?.restaurantId]);

  const DELIVERY_FEE_USD = 2.5;
  const exchangeRateVal = exchangeRate || 2850;
  const isCDF = currency === 'CDF';
  const deliveryFeeInCurrency = fulfillmentMode === 'pickup' ? 0 : (isCDF ? (DELIVERY_FEE_USD * exchangeRateVal) : DELIVERY_FEE_USD);

  const formatPrice = (amount: number) => {
      return formatDualPrice(amount, currency as 'USD' | 'CDF', exchangeRateVal, displayCurrencyMode as 'dual' | 'usd' | 'cdf');
  };

   const handleNextStep = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (!customName || customName.trim() === '') {
        toast.error("Veuillez saisir un nom complet pour la commande ! Cette information est obligatoire pour le restaurant.");
        return;
      }
      if (fulfillmentMode === 'delivery' && !deliveryLocation) {
        toast.error(t('select_location_error'));
        return;
      }
      setStep(3);
    } else {
      if (!selectedMethod) return;
      if (selectedMethod === 'mobile_money' && !selectedNetwork) return;
      if (selectedMethod === 'mobile_money' && !paymentProof) {
        toast.error(t('payment_proof_error'));
        return;
      }
      if (selectedMethod === 'kpay' && !kpayPhone) {
        toast.error("Veuillez saisir votre numéro Mobile Money pour KPay.");
        return;
      }

      const fullLocation = fulfillmentMode === 'pickup'
        ? {
            lat: restaurantDetails?.latitude || -4.312,
            lng: restaurantDetails?.longitude || 15.310,
            address: `À emporter : Récupération directe sur place au restaurant : ${restaurantDetails?.name || items[0]?.restaurantName || 'Restaurant'}`
          }
        : (deliveryLocation ? {
            ...deliveryLocation,
            address: addressDetails ? `${addressDetails}` : deliveryLocation.address
          } : undefined);

      if (selectedMethod === 'kpay') {
        onCheckout('kpay', kpayProvider as any, isUrgent, undefined, fullLocation, customName, kpayPhone, deliveryFeeInCurrency);
      } else {
        onCheckout(selectedMethod, selectedNetwork || undefined, isUrgent, paymentProof || undefined, fullLocation, customName, customPhone, deliveryFeeInCurrency);
      }
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setSelectedMethod(null);
    setSelectedNetwork(null);
    setIsUrgent(false);
    setPaymentProof(null);
    setDeliveryLocation(null);
    setAddressDetails('');
    onClose();
  };

  if (!isOpen) return null;

  const canProceed = () => {
    if (step === 1) return items.length > 0;
    if (step === 2) {
      if (!customName || customName.trim() === '') return false;
      return fulfillmentMode === 'pickup' || deliveryLocation !== null;
    }
    if (step === 3) return (selectedMethod === 'cash' || (selectedMethod === 'mobile_money' && selectedNetwork) || (selectedMethod === 'kpay' && kpayPhone && kpayProvider));
    return false;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={resetAndClose}></div>
      
      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <div className="flex items-center">
            {step > 1 && (
              <button onClick={() => setStep(step - 1 as 1 | 2 | 3)} className="mr-3 p-2 hover:bg-gray-200 rounded-full transition-colors">
                <ArrowLeft size={20} className="text-gray-700" />
              </button>
            )}
            <h2 className="text-xl font-bold flex items-center text-gray-900">
              {step === 1 && <><ShoppingBag className="mr-2 text-brand-600" /> Votre Panier</>}
              {step === 2 && <><MapPin className="mr-2 text-brand-600" /> Livraison</>}
              {step === 3 && <><CreditCard className="mr-2 text-brand-600" /> Paiement</>}
            </h2>
          </div>
          <button onClick={resetAndClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X size={24} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-100 h-1.5">
          <div 
            className="bg-brand-600 h-1.5 transition-all duration-300 ease-out" 
            style={{ width: `${(step / 3) * 100}%` }}
          ></div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {step === 1 && (
            items.length === 0 ? (
              <div className="text-center text-gray-500 mt-20 flex flex-col items-center">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <ShoppingBag size={40} className="text-gray-400" />
                </div>
                <p className="text-lg font-medium text-gray-900">Votre panier est vide</p>
                <p className="text-sm mt-2">Découvrez nos restaurants et ajoutez de délicieux plats.</p>
                <button onClick={resetAndClose} className="mt-6 px-6 py-2 bg-brand-50 text-brand-700 rounded-full font-bold hover:bg-brand-100 transition-colors">Explorer</button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="flex gap-4 bg-white border border-gray-100 rounded-2xl p-3 shadow-sm hover:shadow-md transition-shadow">
                    {item.image && (
                      <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-gray-900 leading-tight">{item.name}</h4>
                          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mt-1">{item.restaurantName}</p>
                        </div>
                        <button onClick={() => onRemove(item.id)} className="text-gray-400 hover:text-red-500 p-1 transition-colors">
                            <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <p className="font-black text-brand-600">{formatPrice(item.price)}</p>
                        <div className="flex items-center bg-gray-100 rounded-full p-1">
                          <button 
                            onClick={() => onUpdateQuantity && onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:bg-white hover:shadow-sm rounded-full transition-all"
                          >-</button>
                          <span className="text-xs font-bold w-6 text-center">{item.quantity}</span>
                          <button 
                            onClick={() => onUpdateQuantity && onUpdateQuantity(item.id, item.quantity + 1)}
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:bg-white hover:shadow-sm rounded-full transition-all"
                          >+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Option Mode de Retrait (Livraison vs À emporter) */}
              <div className="grid grid-cols-2 gap-3 p-1 bg-gray-100 rounded-2xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setFulfillmentMode('delivery')}
                  className={`py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5 ${fulfillmentMode === 'delivery' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <span className="text-base">🛵</span>
                  <span>Livraison</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentMode('pickup')}
                  className={`py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5 ${fulfillmentMode === 'pickup' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <span className="text-base">🥡</span>
                  <span>À emporter</span>
                </button>
              </div>

              {/* Informations du destinataire personnalisées - EN HAUT POUR MOBILES */}
              <div className="bg-brand-50/50 border border-brand-100/80 p-5 rounded-2xl space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="text-base font-extrabold text-gray-900">Destinataire de la commande</span>
                  <span className="bg-brand-600 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">Requis</span>
                </div>
                <p className="text-xs text-gray-600">Saisissez le nom sous lequel le restaurant préparera et étiquettera votre commande.</p>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Nom complet pour la commande *</label>
                    <input 
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Ex: Merveil Kanku, Kevin Kabeya..."
                      className="w-full p-3 border-2 border-brand-200 bg-white rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm font-sans font-semibold text-gray-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5 font-display">Numéro de téléphone direct (Optionnel)</label>
                    <input 
                      type="text"
                      value={customPhone}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      placeholder="Ex: +243 ..."
                      className="w-full p-3 border-2 border-gray-150 bg-white rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-mono text-sm font-semibold text-gray-800"
                    />
                  </div>
                </div>
              </div>

              {fulfillmentMode === 'delivery' ? (
                <>
                  <div className="border-t border-gray-100 pt-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">Où devons-nous livrer ?</h3>
                    <p className="text-sm text-gray-500 mb-4 font-normal">Placez le repère sur votre position exacte.</p>
                    
                    <LocationPicker 
                      initialLocation={deliveryLocation ? { lat: deliveryLocation.lat, lng: deliveryLocation.lng } : undefined}
                      onLocationSelect={(loc) => setDeliveryLocation({ ...loc, address: loc.address || 'Position sélectionnée sur la carte' })} 
                    />
                  </div>

                  {deliveryLocation && (
                    <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex items-start animate-in fade-in duration-200">
                      <MapPin className="text-brand-600 mt-0.5 mr-3 flex-shrink-0" size={20} />
                      <div>
                        <p className="font-bold text-brand-900 text-sm">Position enregistrée</p>
                        <p className="text-xs text-brand-700 mt-1">{deliveryLocation.address}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Précisions sur l'adresse (Optionnel)</label>
                    <textarea 
                      value={addressDetails}
                      onChange={(e) => setAddressDetails(e.target.value)}
                      placeholder="Ex: Appartement 4B, Bâtiment bleu, à côté de la pharmacie..."
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none h-24 text-sm font-sans"
                    />
                  </div>
                </>
              ) : (
                <div className="bg-amber-50/50 border-2 border-dashed border-amber-200 rounded-2xl p-5 space-y-3 animate-in fade-in duration-300">
                  <div className="flex items-center space-x-2 text-amber-800">
                    <span className="text-xl">🥡</span>
                    <span className="text-sm font-extrabold font-display">Retrait direct au restaurant</span>
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed font-sans">
                    Vous avez choisi de récupérer vous-même votre commande. Les frais de livraison sont totalement gratuits (<strong className="font-extrabold">0,00 $</strong>).
                  </p>
                  
                  {restaurantDetails ? (
                    <div className="bg-white p-3.5 rounded-xl border border-amber-100 space-y-2 shadow-sm">
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest leading-none">Adresse de récupération</p>
                      <p className="text-sm font-extrabold text-gray-800 leading-tight">{restaurantDetails.name}</p>
                      {restaurantDetails.address && (
                        <p className="text-xs text-gray-500 leading-normal">{restaurantDetails.address}</p>
                      )}
                      {restaurantDetails.phone_number && (
                        <p className="text-xs font-mono text-brand-600 font-bold flex items-center pt-1">
                          📞 {restaurantDetails.phone_number}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-white/50 animate-pulse text-center rounded-xl text-xs text-gray-450">
                      Chargement des coordonnées du restaurant...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              
              {/* Urgent Mode Toggle */}
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-xl">🚀</span>
                  </div>
                  <div>
                    <p className="font-bold text-red-800">Mode Urgent</p>
                    <p className="text-[10px] text-red-600 mt-0.5 font-medium uppercase tracking-wide">Priorité maximale</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsUrgent(!isUrgent)}
                  className={`w-14 h-8 rounded-full transition-colors relative shadow-inner ${isUrgent ? 'bg-red-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-6 h-6 rounded-full bg-white absolute top-1 shadow-md transition-transform ${isUrgent ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4">Mode de paiement</h3>
                <div className="grid grid-cols-1 gap-3">
                  {paymentConfig.acceptCash && (
                    <button 
                      onClick={() => setSelectedMethod('cash')}
                      className={`flex items-center p-4 border-2 rounded-2xl transition-all ${selectedMethod === 'cash' ? 'border-brand-500 bg-brand-50 shadow-md' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 transition-colors ${selectedMethod === 'cash' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        <Banknote size={24} />
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-bold text-gray-900">Cash à la livraison</p>
                        <p className="text-xs text-gray-500 mt-0.5">Payez en espèces à la réception</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'cash' ? 'border-brand-500 bg-brand-500' : 'border-gray-300'}`}>
                        {selectedMethod === 'cash' && <CheckCircle2 className="text-white" size={16} />}
                      </div>
                    </button>
                  )}

                  {paymentConfig.acceptMobileMoney && (
                    <button 
                      onClick={() => setSelectedMethod('mobile_money')}
                      className={`flex items-center p-4 border-2 rounded-2xl transition-all ${selectedMethod === 'mobile_money' ? 'border-brand-500 bg-brand-50 shadow-md' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 transition-colors ${selectedMethod === 'mobile_money' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        <Smartphone size={24} />
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-bold text-gray-900">Mobile Money</p>
                        <p className="text-xs text-gray-500 mt-0.5">Airtel, Orange ou M-Pesa</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'mobile_money' ? 'border-brand-500 bg-brand-500' : 'border-gray-300'}`}>
                        {selectedMethod === 'mobile_money' && <CheckCircle2 className="text-white" size={16} />}
                      </div>
                    </button>
                  )}

                  <button 
                    onClick={() => setSelectedMethod('kpay')}
                    className={`flex items-center p-4 border-2 rounded-2xl transition-all ${selectedMethod === 'kpay' ? 'border-brand-500 bg-brand-50 shadow-md' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 transition-colors ${selectedMethod === 'kpay' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <CreditCard size={24} />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-bold text-gray-900">KPay</p>
                      <p className="text-xs text-gray-500 mt-0.5">Paiement sécurisé via KPay</p>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'kpay' ? 'border-brand-500 bg-brand-500' : 'border-gray-300'}`}>
                      {selectedMethod === 'kpay' && <CheckCircle2 className="text-white" size={16} />}
                    </div>
                  </button>
                </div>
              </div>

              {selectedMethod === 'mobile_money' && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300 bg-gray-50 p-4 rounded-2xl border border-gray-200">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Sélectionnez votre réseau</p>
                  <div className="grid grid-cols-3 gap-3">
                    {paymentConfig.mpesaNumber && (
                      <button 
                        onClick={() => setSelectedNetwork('mpesa')}
                        className={`flex flex-col items-center p-3 border-2 rounded-xl transition-all ${selectedNetwork === 'mpesa' ? 'border-brand-500 bg-white shadow-sm' : 'border-transparent bg-gray-100 hover:bg-gray-200'}`}
                      >
                        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white font-black text-[10px] mb-2 shadow-sm">M-PESA</div>
                        <span className="text-xs font-bold text-gray-700">M-Pesa</span>
                      </button>
                    )}
                    {paymentConfig.airtelNumber && (
                      <button 
                        onClick={() => setSelectedNetwork('airtel')}
                        className={`flex flex-col items-center p-3 border-2 rounded-xl transition-all ${selectedNetwork === 'airtel' ? 'border-brand-500 bg-white shadow-sm' : 'border-transparent bg-gray-100 hover:bg-gray-200'}`}
                      >
                        <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-black text-[10px] mb-2 shadow-sm">AIRTEL</div>
                        <span className="text-xs font-bold text-gray-700">Airtel</span>
                      </button>
                    )}
                    {paymentConfig.orangeNumber && (
                      <button 
                        onClick={() => setSelectedNetwork('orange')}
                        className={`flex flex-col items-center p-3 border-2 rounded-xl transition-all ${selectedNetwork === 'orange' ? 'border-brand-500 bg-white shadow-sm' : 'border-transparent bg-gray-100 hover:bg-gray-200'}`}
                      >
                        <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-black text-[10px] mb-2 shadow-sm">ORANGE</div>
                        <span className="text-xs font-bold text-gray-700">Orange</span>
                      </button>
                    )}
                  </div>

                  {selectedNetwork && (
                    <div className="mt-6 animate-in fade-in duration-300">
                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-4">
                        <p className="text-xs text-gray-500 mb-1">Montant à envoyer (Plats + Livraison) :</p>
                        <p className="text-2xl font-black text-brand-600 mb-4">{formatPrice(total + deliveryFeeInCurrency)}</p>
                        
                        <p className="text-xs text-gray-500 mb-1">Numéro {selectedNetwork.toUpperCase()} :</p>
                        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <div className="flex items-center">
                            <Phone size={16} className="text-gray-400 mr-2" />
                            <span className="font-mono font-bold text-lg text-gray-800">
                              {selectedNetwork === 'mpesa' ? paymentConfig.mpesaNumber : 
                               selectedNetwork === 'airtel' ? paymentConfig.airtelNumber : 
                               paymentConfig.orangeNumber}
                            </span>
                          </div>
                          <button 
                            onClick={() => {
                              const num = selectedNetwork === 'mpesa' ? paymentConfig.mpesaNumber : 
                                         selectedNetwork === 'airtel' ? paymentConfig.airtelNumber : 
                                         paymentConfig.orangeNumber;
                              if (num) navigator.clipboard.writeText(num);
                            }}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-sm"
                          >
                            Copier
                          </button>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-bold text-gray-900 mb-1">Preuve de paiement</label>
                        <p className="text-xs text-gray-500 mb-3">Joignez une capture d'écran du message de confirmation.</p>
                        
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors bg-white">
                          {paymentProof ? (
                            <div className="relative w-full h-full p-2">
                              <img src={paymentProof} alt="Preuve" className="w-full h-full object-contain rounded-lg" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                <span className="text-white font-bold text-sm">Changer l'image</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <Camera className="w-8 h-8 text-gray-400 mb-2" />
                              <p className="text-sm text-gray-500 font-medium">
                                {isUploadingProof ? "Upload en cours..." : "Cliquez pour uploader"}
                              </p>
                            </div>
                          )}
                          <input 
                            type="file" 
                            accept="image/*"
                            className="hidden"
                            disabled={isUploadingProof}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setIsUploadingProof(true);
                                try {
                                  const fileExt = file.name.split('.').pop();
                                  const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                                  const filePath = `payment_proofs/${fileName}`;
                                  
                                  const { error: uploadError } = await supabase.storage
                                    .from('images')
                                    .upload(filePath, file);

                                  if (uploadError) throw uploadError;

                                  const { data } = supabase.storage
                                    .from('images')
                                    .getPublicUrl(filePath);

                                  setPaymentProof(data.publicUrl);
                                } catch (error) {
                                  console.error('Error uploading payment proof:', error);
                                  toast.error("Erreur lors de l'upload de l'image");
                                } finally {
                                  setIsUploadingProof(false);
                                }
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedMethod === 'kpay' && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300 bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sélectionnez votre réseau pour KPay USSD</p>
                  <div className="grid grid-cols-3 gap-3">
                    <button 
                      type="button"
                      onClick={() => setKpayProvider('VODACOM_MPESA_COD')}
                      className={`flex flex-col items-center p-3 border-2 rounded-xl transition-all ${kpayProvider === 'VODACOM_MPESA_COD' ? 'border-brand-500 bg-white shadow-sm' : 'border-transparent bg-gray-100 hover:bg-gray-200'}`}
                    >
                      <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white font-black text-[10px] mb-2 shadow-sm">M-PESA</div>
                      <span className="text-xs font-bold text-gray-700">M-Pesa</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setKpayProvider('AIRTEL_COD')}
                      className={`flex flex-col items-center p-3 border-2 rounded-xl transition-all ${kpayProvider === 'AIRTEL_COD' ? 'border-brand-500 bg-white shadow-sm' : 'border-transparent bg-gray-100 hover:bg-gray-200'}`}
                    >
                      <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-black text-[10px] mb-2 shadow-sm">AIRTEL</div>
                      <span className="text-xs font-bold text-gray-700">Airtel</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setKpayProvider('ORANGE_COD')}
                      className={`flex flex-col items-center p-3 border-2 rounded-xl transition-all ${kpayProvider === 'ORANGE_COD' ? 'border-brand-500 bg-white shadow-sm' : 'border-transparent bg-gray-100 hover:bg-gray-200'}`}
                    >
                      <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-black text-[10px] mb-2 shadow-sm">ORANGE</div>
                      <span className="text-xs font-bold text-gray-700">Orange</span>
                    </button>
                  </div>

                  {/* Converted Amount Info Block */}
                  <div className="bg-brand-50/70 dark:bg-brand-950/10 border border-brand-100 dark:border-brand-900/30 p-3.5 rounded-xl space-y-1">
                    <p className="text-[10px] font-black text-brand-700 dark:text-brand-400 uppercase tracking-wider">Montant converti en CDF (Franc Congolais)</p>
                    <div className="flex justify-between items-baseline">
                      <span className="text-lg font-black text-brand-600 dark:text-brand-400">
                        {new Intl.NumberFormat('fr-FR').format(Math.round((total + deliveryFeeInCurrency) * exchangeRateVal))} FC
                      </span>
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                        Taux : 1 USD = {exchangeRateVal} CDF
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 leading-tight">Le paiement s'effectue en Francs Congolais conformément au taux configuré par les administrateurs.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest font-display">Numéro de téléphone Mobile Money *</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input 
                        type="text"
                        value={kpayPhone}
                        onChange={(e) => setKpayPhone(e.target.value)}
                        placeholder="Ex: 0821234567, 0991234567..."
                        className="w-full pl-10 p-3.5 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none font-mono text-sm font-semibold text-gray-800"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 leading-normal">Un message de confirmation USSD Push sera envoyé sur ce téléphone pour valider le montant.</p>
                  </div>

                  {/* Sandbox helper block */}
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 p-3 rounded-xl space-y-1.5">
                    <p className="text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      Mode Test (Sandbox) - Numéros de simulation
                    </p>
                    <p className="text-[10px] text-amber-700/80 dark:text-amber-500 leading-normal">
                      Cliquez sur un numéro de test ci-dessous pour remplir le champ :
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {kpayProvider === 'VODACOM_MPESA_COD' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setKpayPhone('243810000001')}
                            className="bg-white hover:bg-amber-100 border border-amber-200 dark:bg-gray-900 text-[10px] font-bold py-1 px-2 rounded-md text-amber-800 dark:text-amber-300 shadow-sm transition-all"
                          >
                            Vodacom (Succès) : 243810000001
                          </button>
                          <button
                            type="button"
                            onClick={() => setKpayPhone('243810000002')}
                            className="bg-white hover:bg-amber-100 border border-amber-200 dark:bg-gray-900 text-[10px] font-bold py-1 px-2 rounded-md text-amber-800 dark:text-amber-300 shadow-sm transition-all"
                          >
                            Vodacom (Échec) : 243810000002
                          </button>
                        </>
                      )}
                      {kpayProvider === 'AIRTEL_COD' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setKpayPhone('243990000001')}
                            className="bg-white hover:bg-amber-100 border border-amber-200 dark:bg-gray-900 text-[10px] font-bold py-1 px-2 rounded-md text-amber-800 dark:text-amber-300 shadow-sm transition-all"
                          >
                            Airtel (Succès) : 243990000001
                          </button>
                          <button
                            type="button"
                            onClick={() => setKpayPhone('243990000002')}
                            className="bg-white hover:bg-amber-100 border border-amber-200 dark:bg-gray-900 text-[10px] font-bold py-1 px-2 rounded-md text-amber-800 dark:text-amber-300 shadow-sm transition-all"
                          >
                            Airtel (Échec) : 243990000002
                          </button>
                        </>
                      )}
                      {kpayProvider === 'ORANGE_COD' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setKpayPhone('243890000001')}
                            className="bg-white hover:bg-amber-100 border border-amber-200 dark:bg-gray-900 text-[10px] font-bold py-1 px-2 rounded-md text-amber-800 dark:text-amber-300 shadow-sm transition-all"
                          >
                            Orange (Succès) : 243890000001
                          </button>
                          <button
                            type="button"
                            onClick={() => setKpayPhone('243890000002')}
                            className="bg-white hover:bg-amber-100 border border-amber-200 dark:bg-gray-900 text-[10px] font-bold py-1 px-2 rounded-md text-amber-800 dark:text-amber-300 shadow-sm transition-all"
                          >
                            Orange (Échec) : 243890000002
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t p-4 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="space-y-1.5 text-xs mb-3 border-b border-gray-100 pb-3">
              {discountPercentage > 0 ? (
                <>
                  <div className="flex justify-between text-gray-500">
                    <span>Sous-total plats</span>
                    <span className="font-semibold line-through text-gray-400">{formatPrice(total / (1 - discountPercentage / 100))}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-bold bg-emerald-50 px-2 py-1.5 rounded-lg">
                    <span className="flex items-center">🏷️ Réduction IA (-{discountPercentage}%)</span>
                    <span>-{formatPrice((total / (1 - discountPercentage / 100)) * (discountPercentage / 100))}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-gray-500">
                  <span>Sous-total plats</span>
                  <span className="font-semibold">{formatPrice(total)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-500">
                <span>Frais de livraison ({isCDF ? "Prix adapté" : "Livreur"}) 🛵</span>
                <span className="font-semibold">{formatPrice(deliveryFeeInCurrency)}</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-900 font-extrabold text-sm uppercase">Total général</span>
              <span className="text-2xl font-black text-brand-600">{formatPrice(total + deliveryFeeInCurrency)}</span>
            </div>
            
            {userRole === 'guest' && step === 3 && (
                <div className="mb-4 p-3 bg-brand-50 border border-brand-100 rounded-xl text-center">
                    <p className="text-xs font-bold text-brand-700">Connectez-vous pour finaliser votre commande</p>
                </div>
            )}

            <button 
              onClick={handleNextStep}
              disabled={isLoading || !canProceed() || (userRole === 'guest' && step === 3)}
              className={`w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-xl shadow-lg transform active:scale-[0.98] transition-all flex justify-center items-center text-lg ${isLoading || !canProceed() || (userRole === 'guest' && step === 3) ? 'opacity-50 cursor-not-allowed saturate-50' : ''}`}
            >
              {isLoading ? (
                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                step === 1 ? 'Valider le panier' : 
                step === 2 ? 'Continuer vers le paiement' : 
                (userRole === 'guest' ? 'Connexion requise' : 'Confirmer la commande')
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
