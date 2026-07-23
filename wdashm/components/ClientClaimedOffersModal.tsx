import React, { useState, useEffect } from 'react';
import { X, Ticket, Copy, Check, QrCode, Store, Clock, ChevronRight, Tag, Search, Sparkles } from 'lucide-react';
import { ClaimedOffer, User } from '../types';
import { getUserClaimedOffers } from '../utils/claimedOffers';
import { ClaimedOfferModal } from './ClaimedOfferModal';

interface Props {
  user: User;
  onClose: () => void;
}

export const ClientClaimedOffersModal: React.FC<Props> = ({ user, onClose }) => {
  const [offers, setOffers] = useState<ClaimedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<ClaimedOffer | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'redeemed'>('active');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadOffers = async () => {
    setLoading(true);
    const data = await getUserClaimedOffers(user.id);
    setOffers(data);
    setLoading(false);
  };

  useEffect(() => {
    loadOffers();

    const handleUpdate = () => loadOffers();
    window.addEventListener('dashmeals_claimed_offers_updated', handleUpdate);
    return () => window.removeEventListener('dashmeals_claimed_offers_updated', handleUpdate);
  }, [user.id]);

  const copyCode = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredOffers = offers.filter(o => {
    if (activeFilter === 'active') return o.status === 'active';
    if (activeFilter === 'redeemed') return o.status === 'redeemed';
    return true;
  });

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl max-w-md w-full h-[85vh] flex flex-col shadow-2xl relative overflow-hidden text-gray-900 dark:text-white">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-brand-500/10 text-brand-500 rounded-2xl flex items-center justify-center">
              <Ticket size={22} />
            </div>
            <div>
              <h3 className="font-black text-base tracking-tight">Mes Offres & Codes Promo</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                {offers.filter(o => o.status === 'active').length} offre(s) prête(s) à consommer
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-md transition-all active:scale-90 flex items-center justify-center cursor-pointer z-30"
            title="Fermer"
            aria-label="Fermer"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex space-x-2 bg-white dark:bg-gray-900">
          <button
            onClick={() => setActiveFilter('active')}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all ${
              activeFilter === 'active'
                ? 'bg-brand-500 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            Actives ({offers.filter(o => o.status === 'active').length})
          </button>
          <button
            onClick={() => setActiveFilter('redeemed')}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all ${
              activeFilter === 'redeemed'
                ? 'bg-brand-500 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            Consommées ({offers.filter(o => o.status === 'redeemed').length})
          </button>
          <button
            onClick={() => setActiveFilter('all')}
            className={`py-2 px-3 rounded-xl font-bold text-xs transition-all ${
              activeFilter === 'all'
                ? 'bg-brand-500 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            Toutes ({offers.length})
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-gray-400 font-bold">Chargement de vos codes promo...</p>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center p-6">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center mb-3 text-gray-400">
                <Ticket size={32} />
              </div>
              <h4 className="font-extrabold text-sm text-gray-700 dark:text-gray-300">
                {activeFilter === 'active' ? 'Aucune offre active pour le moment' : 'Aucune offre trouvée'}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                Activez les promotions et stories des restaurants pour obtenir vos codes de réduction exclusifs !
              </p>
            </div>
          ) : (
            filteredOffers.map((offer) => {
              const isRedeemed = offer.status === 'redeemed';
              return (
                <div
                  key={offer.id}
                  onClick={() => setSelectedOffer(offer)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                    isRedeemed
                      ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 opacity-80'
                      : 'bg-white dark:bg-gray-800/80 border-brand-200/80 dark:border-brand-900/40 hover:shadow-lg hover:border-brand-500'
                  }`}
                >
                  {/* Left accent bar */}
                  <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                    isRedeemed ? 'bg-gray-400' : 'bg-brand-500'
                  }`}></div>

                  <div className="pl-2">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center space-x-1.5">
                        <Store size={13} className="text-brand-500 shrink-0" />
                        <span className="font-extrabold text-xs text-gray-800 dark:text-gray-200 truncate">
                          {offer.restaurantName}
                        </span>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                        isRedeemed
                          ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                      }`}>
                        {isRedeemed ? 'Consommé' : 'Prêt à Utiliser'}
                      </span>
                    </div>

                    <h4 className="font-black text-sm text-gray-900 dark:text-white mt-1 leading-snug">
                      {offer.title}
                    </h4>

                    {/* CODE BOX */}
                    <div className="mt-3 p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <QrCode size={16} className="text-brand-500 shrink-0" />
                        <div>
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                            Code Promotionnel
                          </span>
                          <span className="font-mono font-black text-sm text-brand-600 dark:text-brand-400 tracking-wider">
                            {offer.code}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => copyCode(offer.code, e)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px] font-extrabold text-gray-700 dark:text-gray-200 hover:bg-brand-500 hover:text-white transition-all shadow-xs"
                      >
                        {copiedCode === offer.code ? (
                          <>
                            <Check size={12} className="text-emerald-500" />
                            <span>Copié</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                      <span>Activé le {new Date(offer.createdAt).toLocaleDateString('fr-FR')}</span>
                      <span className="flex items-center text-brand-500 font-bold group-hover:translate-x-1 transition-transform">
                        Voir le QR Code <ChevronRight size={12} className="ml-0.5" />
                      </span>
                    </div>

                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Offer Detail Modal */}
        {selectedOffer && (
          <ClaimedOfferModal
            offer={selectedOffer}
            onClose={() => setSelectedOffer(null)}
          />
        )}

      </div>
    </div>
  );
};
