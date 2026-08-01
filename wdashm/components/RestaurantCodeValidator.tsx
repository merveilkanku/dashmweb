import React, { useState, useEffect } from 'react';
import { QrCode, Search, CheckCircle2, AlertTriangle, Clock, User, Phone, Tag, Store, RefreshCw, Sparkles, Check, X } from 'lucide-react';
import { ClaimedOffer, Restaurant } from '../types';
import { getRestaurantClaimedOffers, findOfferByCode, redeemOfferCode } from '../utils/claimedOffers';
import { toast } from 'sonner';

interface Props {
  restaurant: Restaurant;
  onUpdateRestaurant?: (updated: Restaurant) => void;
}

export const RestaurantCodeValidator: React.FC<Props> = ({ restaurant, onUpdateRestaurant }) => {
  const [codeInput, setCodeInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [foundOffer, setFoundOffer] = useState<ClaimedOffer | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  const [history, setHistory] = useState<ClaimedOffer[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'redeemed'>('all');
  const [historySearch, setHistorySearch] = useState('');

  const loadHistory = async () => {
    setLoadingHistory(true);
    const data = await getRestaurantClaimedOffers(restaurant.id);
    setHistory(data);
    setLoadingHistory(false);
  };

  useEffect(() => {
    loadHistory();

    const handleUpdate = () => loadHistory();
    window.addEventListener('dashmeals_claimed_offers_updated', handleUpdate);
    return () => window.removeEventListener('dashmeals_claimed_offers_updated', handleUpdate);
  }, [restaurant.id]);

  // Handle live code lookup
  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!codeInput.trim()) {
      setErrorMessage('Veuillez entrer un code (ex: DM-8A92).');
      setFoundOffer(null);
      return;
    }

    setVerifying(true);
    setErrorMessage(null);
    setFoundOffer(null);

    const result = await findOfferByCode(codeInput.trim(), restaurant.id);
    setVerifying(false);

    if (result.offer) {
      setFoundOffer(result.offer);
      if (result.errorReason) {
        setErrorMessage(result.errorReason);
      }
    } else {
      setErrorMessage(result.errorReason || 'Code invalide ou introuvable.');
    }
  };

  // Handle final redemption
  const handleRedeem = async (targetCode?: string) => {
    const codeToUse = targetCode || foundOffer?.code || codeInput;
    if (!codeToUse) return;

    setRedeeming(true);
    const res = await redeemOfferCode(codeToUse, restaurant.id);
    setRedeeming(false);

    if (res.success) {
      toast.success(res.message);
      if (foundOffer && foundOffer.code === codeToUse) {
        setFoundOffer(res.offer || null);
      }
      if (res.updatedMenu && onUpdateRestaurant) {
        onUpdateRestaurant({
          ...restaurant,
          menu: res.updatedMenu
        });
      }
      loadHistory();
    } else {
      toast.error(res.message);
      setErrorMessage(res.message);
    }
  };

  const filteredHistory = history.filter(item => {
    if (filterStatus === 'active' && item.status !== 'active') return false;
    if (filterStatus === 'redeemed' && item.status !== 'redeemed') return false;
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      return (
        item.code.toLowerCase().includes(q) ||
        item.userName.toLowerCase().includes(q) ||
        (item.userPhone && item.userPhone.includes(q)) ||
        item.title.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-brand-600 to-orange-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/10 rounded-l-full blur-2xl pointer-events-none"></div>
        <div className="relative z-10 max-w-xl">
          <div className="flex items-center space-x-2 text-brand-200 text-xs font-black uppercase tracking-widest mb-1">
            <QrCode size={16} />
            <span>Validation des Offres Client</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Saisir & Valider un Code Promo</h2>
          <p className="text-white/80 text-xs mt-1 leading-relaxed">
            Lorsqu'un client présente son code d'activation sur son téléphone, saisissez-le ci-dessous pour afficher le contenu exact de son offre et la valider.
          </p>
        </div>
      </div>

      {/* CODE INPUT & VERIFIER BOX */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-100 dark:border-gray-700 shadow-md">
        <h3 className="font-extrabold text-base text-gray-900 dark:text-white mb-3 flex items-center">
          <Search size={18} className="mr-2 text-brand-500" />
          Vérification d'un Code Client
        </h3>

        <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="Saisir le code (ex: DM-8A92)..."
              className="w-full px-4 py-3.5 pl-11 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl text-lg font-mono font-black tracking-wider uppercase focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white"
            />
            <QrCode size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            {codeInput && (
              <button
                type="button"
                onClick={() => { setCodeInput(''); setFoundOffer(null); setErrorMessage(null); }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={verifying || !codeInput.trim()}
            className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-extrabold px-6 py-3.5 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center space-x-2 text-sm uppercase tracking-wider"
          >
            {verifying ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Recherche...</span>
              </>
            ) : (
              <>
                <Search size={16} />
                <span>Vérifier le Code</span>
              </>
            )}
          </button>
        </form>

        {/* ERROR MESSAGE */}
        {errorMessage && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-2xl flex items-start space-x-3 text-red-700 dark:text-red-300 text-xs font-medium animate-in fade-in">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-500" />
            <div>
              <p className="font-bold">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* FOUND OFFER RESULT CARD */}
        {foundOffer && (
          <div className="mt-5 p-5 bg-gradient-to-br from-brand-50/50 via-white to-orange-50/50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 border-2 border-brand-300 dark:border-brand-700/80 rounded-2xl shadow-lg animate-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 dark:border-gray-700 pb-4 mb-4 gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-600 dark:text-brand-400 bg-brand-100 dark:bg-brand-900/50 px-2.5 py-1 rounded-md">
                  Contenu de l'Offre Reçue
                </span>
                <h4 className="text-xl font-black text-gray-900 dark:text-white mt-1">
                  {foundOffer.title}
                </h4>
              </div>

              <div className="text-right">
                <span className="font-mono text-2xl font-black text-brand-600 dark:text-brand-400">
                  {foundOffer.code}
                </span>
                <span className={`block text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full mt-1 ${
                  foundOffer.status === 'redeemed'
                    ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 animate-pulse'
                }`}>
                  {foundOffer.status === 'redeemed' ? 'Déjà Utilisé' : 'Code Valide & Actif'}
                </span>
              </div>
            </div>

            {/* DETAILS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mb-5">
              <div className="p-3 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center space-x-3">
                <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950/50 text-blue-500 rounded-lg flex items-center justify-center shrink-0">
                  <User size={18} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Client</span>
                  <p className="font-black text-gray-900 dark:text-white text-sm">{foundOffer.userName}</p>
                  {foundOffer.userPhone && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center">
                      <Phone size={10} className="mr-1" /> {foundOffer.userPhone}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center space-x-3">
                <div className="w-9 h-9 bg-brand-50 dark:bg-brand-950/50 text-brand-500 rounded-lg flex items-center justify-center shrink-0">
                  <Tag size={18} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Avantage Client</span>
                  <p className="font-black text-brand-600 dark:text-brand-400 text-sm">
                    {foundOffer.badgeText || 'Réduction Promo'}
                  </p>
                  {foundOffer.promoPrice !== undefined && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold">
                      Prix spécial : ${foundOffer.promoPrice.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ACTION BUTTON */}
            {foundOffer.status === 'active' ? (
              <button
                onClick={() => handleRedeem()}
                disabled={redeeming}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl shadow-xl transition-all active:scale-95 flex items-center justify-center space-x-2 text-sm uppercase tracking-wider"
              >
                {redeeming ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Validation en cours...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    <span>Valider et Appliquer l'Offre au Client</span>
                  </>
                )}
              </button>
            ) : (
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-center text-xs font-bold text-gray-500 dark:text-gray-400">
                Ce code a été validé le {foundOffer.redeemedAt ? new Date(foundOffer.redeemedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'auparavant'}.
              </div>
            )}
          </div>
        )}

      </div>

      {/* HISTORIQUE ET CODES REÇUS */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-100 dark:border-gray-700 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center">
              <Sparkles size={18} className="mr-2 text-brand-500" />
              Historique des Codes Activés par les Clients ({history.length})
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Consultez la liste des clients ayant activé des promotions pour votre établissement.
            </p>
          </div>

          <button
            onClick={loadHistory}
            className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-brand-500 hover:text-white transition-all text-xs font-bold flex items-center space-x-1"
            title="Rafraîchir"
          >
            <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
            <span>Actualiser</span>
          </button>
        </div>

        {/* SEARCH & FILTERS */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Rechercher par client, code ou offre..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex space-x-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'all'
                  ? 'bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Tous ({history.length})
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'active'
                  ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              À Valider ({history.filter(h => h.status === 'active').length})
            </button>
            <button
              onClick={() => setFilterStatus('redeemed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'redeemed'
                  ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Consommés ({history.filter(h => h.status === 'redeemed').length})
            </button>
          </div>
        </div>

        {/* HISTORY TABLE */}
        <div className="overflow-x-auto">
          {loadingHistory ? (
            <div className="py-12 text-center text-xs text-gray-400 font-bold flex items-center justify-center space-x-2">
              <RefreshCw size={16} className="animate-spin text-brand-500" />
              <span>Chargement des codes...</span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400 font-medium">
              Aucun code trouvé.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-400 font-bold uppercase text-[10px]">
                  <th className="py-3 px-2">Code</th>
                  <th className="py-3 px-2">Client</th>
                  <th className="py-3 px-2">Offre</th>
                  <th className="py-3 px-2">Activé le</th>
                  <th className="py-3 px-2">Statut</th>
                  <th className="py-3 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filteredHistory.map((item) => {
                  const isActive = item.status === 'active';
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-2 font-mono font-black text-brand-600 dark:text-brand-400 text-sm">
                        {item.code}
                      </td>
                      <td className="py-3 px-2 font-bold text-gray-800 dark:text-gray-200">
                        <div>{item.userName}</div>
                        {item.userPhone && <div className="text-[10px] text-gray-400 font-normal">{item.userPhone}</div>}
                      </td>
                      <td className="py-3 px-2 font-medium text-gray-700 dark:text-gray-300">
                        <span className="font-bold">{item.title}</span>
                        {item.badgeText && (
                          <span className="ml-1.5 text-[9px] font-black bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded">
                            {item.badgeText}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-gray-500 font-medium text-[11px]">
                        {new Date(item.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                            : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {isActive ? 'À Valider' : 'Consommé'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        {isActive ? (
                          <button
                            onClick={() => {
                              setCodeInput(item.code);
                              handleVerify();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider shadow-xs transition-all active:scale-95"
                          >
                            Valider
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-bold">Validé</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>

    </div>
  );
};
