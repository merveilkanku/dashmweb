import React, { useState } from 'react';
import { X, Copy, Check, QrCode, Tag, Store, Clock, Sparkles, AlertCircle } from 'lucide-react';
import { ClaimedOffer } from '../types';

interface Props {
  offer: ClaimedOffer;
  onClose: () => void;
}

export const ClaimedOfferModal: React.FC<Props> = ({ offer, onClose }) => {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(offer.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isRedeemed = offer.status === 'redeemed';

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto text-gray-900 dark:text-white no-scrollbar">
        
        {/* Top Decorative Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-brand-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Highly Visible Red Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg transition-all active:scale-90 flex items-center justify-center cursor-pointer"
          title="Fermer"
          aria-label="Fermer"
        >
          <X size={20} strokeWidth={2.5} />
        </button>

        {/* Header Icon */}
        <div className="flex flex-col items-center text-center mt-2 mb-4">
          <div className="w-14 h-14 bg-brand-500/10 dark:bg-brand-500/20 text-brand-500 rounded-2xl flex items-center justify-center mb-3 shadow-inner">
            <Sparkles size={28} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-500 bg-brand-50 dark:bg-brand-950/40 px-3 py-1 rounded-full border border-brand-200/50 dark:border-brand-800/50 mb-1">
            {isRedeemed ? 'Offre Utilisée' : 'Offre Activée avec Succès'}
          </span>
          <h3 className="text-lg font-black tracking-tight">{offer.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center justify-center">
            <Store size={12} className="mr-1 text-brand-500" />
            <span className="font-bold">{offer.restaurantName}</span>
          </p>
        </div>

        {/* CODE DISPLAY CARD */}
        <div className="bg-gradient-to-br from-brand-50 to-orange-50 dark:from-gray-800 dark:to-gray-800/80 p-5 rounded-2xl border border-brand-200/60 dark:border-gray-700/60 my-4 text-center relative shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Votre Code d'Activation
          </p>

          <div className="flex items-center justify-center space-x-2 my-2">
            <span className="text-3xl font-black tracking-wider font-mono text-brand-600 dark:text-brand-400">
              {offer.code}
            </span>
            <button
              onClick={copyCode}
              className="p-2 rounded-xl bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-brand-500 hover:text-white transition-all shadow-sm active:scale-95"
              title="Copier le code"
            >
              {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
            </button>
          </div>

          {copied && (
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
              Code copié dans le presse-papier !
            </p>
          )}

          {/* Real Scannable QR Code Matrix */}
          <div className="mt-4 pt-3 border-t border-brand-200/50 dark:border-gray-700 flex flex-col items-center">
            <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-md flex flex-col items-center justify-center relative">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(offer.code)}&color=000000&bgcolor=ffffff`}
                alt={`QR Code ${offer.code}`}
                className="w-44 h-44 object-contain rounded-lg shadow-2xs"
                loading="eager"
                onError={(e) => {
                  // Fallback in case of network issue
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span className="text-[9px] font-mono font-black text-gray-400 mt-1 uppercase tracking-widest">
                • {offer.code} •
              </span>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-2.5 flex items-center">
              <QrCode size={13} className="text-brand-500 mr-1.5" />
              <span>QR Code 100% Scannable en Caisse / Restaurant</span>
            </p>
          </div>
        </div>

        {/* DETAILS LIST */}
        <div className="space-y-2 text-xs mb-5">
          {offer.badgeText && (
            <div className="flex justify-between items-center p-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
              <span className="text-gray-500 dark:text-gray-400 flex items-center">
                <Tag size={13} className="mr-1.5 text-brand-500" /> Avantage
              </span>
              <span className="font-extrabold text-brand-600 dark:text-brand-400 bg-brand-100 dark:bg-brand-900/40 px-2 py-0.5 rounded-lg">
                {offer.badgeText}
              </span>
            </div>
          )}

          {offer.promoPrice !== undefined && offer.promoPrice !== null && (
            <div className="flex justify-between items-center p-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
              <span className="text-gray-500 dark:text-gray-400">Prix Spécial</span>
              <div className="flex items-center space-x-1.5 font-bold">
                <span className="text-brand-600 dark:text-brand-400 font-extrabold text-sm">${offer.promoPrice.toFixed(2)}</span>
                {offer.originalPrice && (
                  <span className="line-through text-gray-400 text-[10px]">${offer.originalPrice.toFixed(2)}</span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center p-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
            <span className="text-gray-500 dark:text-gray-400 flex items-center">
              <Clock size={13} className="mr-1.5 text-blue-500" /> Activé le
            </span>
            <span className="font-bold text-gray-700 dark:text-gray-300">
              {new Date(offer.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="flex justify-between items-center p-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
            <span className="text-gray-500 dark:text-gray-400">Statut</span>
            <span className={`font-black text-[10px] uppercase px-2.5 py-0.5 rounded-full ${
              isRedeemed 
                ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' 
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 animate-pulse'
            }`}>
              {isRedeemed ? 'Validé en Restaurant' : 'Prêt à Utiliser'}
            </span>
          </div>
        </div>

        {/* NOTICE */}
        {!isRedeemed && (
          <div className="flex items-start space-x-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200/50 dark:border-amber-900/30 text-[10px] text-amber-800 dark:text-amber-300 mb-4">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
            <p>
              Le restaurant utilisera ce code dans son application pour valider la promotion et appliquer l'avantage directement sur votre note.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white font-extrabold py-3.5 rounded-2xl shadow-lg transition-all active:scale-95 text-xs uppercase tracking-wider"
        >
          Fermer & Conserver
        </button>

      </div>
    </div>
  );
};
