import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, MapPin, Plus, ShoppingBag, Sparkles, Ticket } from 'lucide-react';
import { Promotion, Restaurant, MenuItem, User, ClaimedOffer } from '../types';
import { parsePromoCaption } from './CustomerView';
import { claimOffer } from '../utils/claimedOffers';
import { ClaimedOfferModal } from './ClaimedOfferModal';

interface Props {
  restaurant: Restaurant;
  promotions: Promotion[];
  onClose: () => void;
  onVisitRestaurant: () => void;
  initialIndex?: number;
  onAddToCart?: (item: MenuItem, restaurant: Restaurant) => void;
  currentUser?: User;
}

export const StoryViewer: React.FC<Props> = ({ 
  restaurant, 
  promotions, 
  onClose, 
  onVisitRestaurant, 
  initialIndex = 0,
  onAddToCart,
  currentUser
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [activatedOffer, setActivatedOffer] = useState<ClaimedOffer | null>(null);
  const [activating, setActivating] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const currentPromo = promotions[currentIndex];
  const DURATION = 5000; // 5 seconds per image

  useEffect(() => {
    setProgress(0);
    const interval = setInterval(() => {
      if (currentPromo && currentPromo.mediaType === 'image' && !activatedOffer) {
        setProgress(old => {
          const newProgress = old + (100 / (DURATION / 50)); // Update every 50ms
          if (newProgress >= 100) {
             return 100;
          }
          return newProgress;
        });
      }
    }, 50);

    return () => clearInterval(interval);
  }, [currentIndex, currentPromo, activatedOffer]);

  // Handle Activer Offre
  const handleActivateOffer = async () => {
    if (!currentPromo) return;
    setActivating(true);

    const parsedPromo = parsePromoCaption(currentPromo.caption);
    const linkedItem = parsedPromo.isPromoProduct && parsedPromo.menuItemId
      ? restaurant.menu?.find(item => item.id === parsedPromo.menuItemId)
      : null;

    const offerTitle = linkedItem ? linkedItem.name : (parsedPromo.caption || 'Offre Spéciale ' + restaurant.name);

    const defaultUser: User = currentUser || {
      id: 'client_' + Date.now(),
      name: 'Client',
      email: '',
      role: 'client',
      city: restaurant.city || 'Kinshasa'
    };

    const newClaimed = await claimOffer({
      user: defaultUser,
      restaurant,
      promo: currentPromo,
      title: offerTitle,
      caption: parsedPromo.caption,
      badgeText: parsedPromo.badgeText || '-15%',
      promoPrice: parsedPromo.promoPrice,
      originalPrice: linkedItem?.price
    });

    setActivating(false);
    setActivatedOffer(newClaimed);
  };

  // Watch progress to trigger next story
  useEffect(() => {
      if (progress >= 100 && !activatedOffer) {
          if (currentPromo && currentPromo.mediaType === 'image') {
              nextStory();
          }
      }
  }, [progress, activatedOffer]);

  // Handle Video Progress manually via event listeners
  const handleVideoUpdate = () => {
      if (videoRef.current && !activatedOffer) {
          const percent = (videoRef.current.currentTime / videoRef.current.duration) * 100;
          setProgress(percent);
      }
  };

  const handleVideoEnd = () => {
      if (!activatedOffer) nextStory();
  };

  const nextStory = () => {
    if (currentIndex < promotions.length - 1) {
      setCurrentIndex(c => c + 1);
    } else {
      onClose();
    }
  };

  const prevStory = () => {
    if (currentIndex > 0) {
      setCurrentIndex(c => c - 1);
    }
  };
  
  if (!currentPromo) return null;

  // Parse custom serialized promotions
  const parsedPromo = parsePromoCaption(currentPromo.caption);
  const linkedItem = parsedPromo.isPromoProduct && parsedPromo.menuItemId
    ? restaurant.menu?.find(item => item.id === parsedPromo.menuItemId)
    : null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      {/* Container simulating mobile screen on desktop */}
      <div className="relative w-full h-full md:w-[400px] md:h-[800px] md:rounded-2xl overflow-hidden bg-gray-900">
        
        {/* Progress Bars */}
        <div className="absolute top-2 left-2 right-2 flex space-x-1 z-20">
          {promotions.map((_, idx) => (
            <div key={idx} className="h-1 bg-white/30 flex-1 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-white transition-all duration-100 linear`}
                style={{ 
                    width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%' 
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 left-4 right-4 z-20 flex justify-between items-center">
            <div className="flex items-center space-x-2">
                <img src={restaurant.coverImage} className="w-8 h-8 rounded-full border-2 border-brand-500 object-cover animate-pulse" />
                <span className="text-white font-bold text-sm shadow-black drop-shadow-md">{restaurant.name}</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-full bg-black/20 text-white backdrop-blur-md">
                <X size={24} />
            </button>
        </div>

        {/* Content */}
        <div className="w-full h-full flex items-center justify-center bg-black">
            {currentPromo.mediaType === 'video' ? (
                <video 
                    ref={videoRef}
                    src={currentPromo.mediaUrl} 
                    className="w-full h-full object-cover"
                    autoPlay 
                    playsInline
                    onTimeUpdate={handleVideoUpdate}
                    onEnded={handleVideoEnd}
                />
            ) : (
                <img 
                    src={currentPromo.mediaUrl} 
                    className="w-full h-full object-cover animate-in fade-in zoom-in duration-500" 
                    alt="Story"
                />
            )}
        </div>

        {/* Click Areas for Navigation */}
        <div className="absolute inset-0 z-10 flex">
            <div className="w-1/3 h-full" onClick={prevStory}></div>
            <div className="w-2/3 h-full" onClick={nextStory}></div>
        </div>

        {/* Footer / Caption */}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-20 bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-24">
            
            {/* Promo Caption */}
            {parsedPromo.caption && (
                <p className="text-white text-base font-black mb-4 drop-shadow-md text-center leading-snug uppercase tracking-tight">
                    {parsedPromo.caption}
                </p>
            )}

            {/* Linked Promo Product Card */}
            {linkedItem && (
              <div className="mb-4 bg-white/10 dark:bg-black/40 backdrop-blur-md border border-white/20 p-3.5 rounded-2xl flex items-center justify-between text-left transition-all hover:bg-white/15 animate-in slide-in-from-bottom duration-500 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-brand-500/10 rounded-full blur-xl"></div>
                <div className="flex items-center space-x-3.5 truncate relative z-10">
                  <img src={linkedItem.image} className="w-14 h-14 rounded-xl object-cover border border-white/20 shadow-md flex-shrink-0" alt={linkedItem.name} />
                  <div className="truncate">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[8px] font-black bg-brand-500 text-white px-1.5 py-0.5 rounded-md uppercase tracking-wider animate-bounce">
                        {parsedPromo.badgeText}
                      </span>
                      <span className="text-white text-[9px] font-black opacity-60 uppercase tracking-widest">Offre Flash</span>
                    </div>
                    <h4 className="text-white text-xs font-black truncate uppercase mt-1 leading-tight tracking-tight">{linkedItem.name}</h4>
                    <div className="flex items-center space-x-2 mt-1">
                      {parsedPromo.promoPrice !== undefined && parsedPromo.promoPrice !== null ? (
                        <>
                          <span className="text-brand-400 font-black text-sm">${parsedPromo.promoPrice.toFixed(2)}</span>
                          <span className="text-white/40 line-through text-[10px] font-bold">${linkedItem.price.toFixed(2)}</span>
                        </>
                      ) : (
                        <span className="text-white font-black text-sm">${linkedItem.price.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
                {onAddToCart && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const promoItem: MenuItem = {
                        ...linkedItem,
                        price: parsedPromo.promoPrice !== undefined && parsedPromo.promoPrice !== null ? parsedPromo.promoPrice : linkedItem.price
                      };
                      onAddToCart(promoItem, restaurant);
                    }}
                    className="flex items-center justify-center bg-brand-500 text-white p-3 rounded-xl hover:bg-brand-600 hover:scale-105 active:scale-95 transition-all shadow-lg z-10"
                    title="Ajouter au panier"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            )}
            
            {/* ACTION BUTTONS */}
            <div className="space-y-2">
              <button 
                  onClick={handleActivateOffer}
                  disabled={activating}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-black py-3.5 rounded-[20px] flex items-center justify-center space-x-2 shadow-xl hover:shadow-2xl transition-all active:scale-95 text-xs uppercase tracking-widest border border-brand-400/50"
              >
                  <Ticket size={16} className="text-white animate-bounce" />
                  <span>{activating ? 'Génération du Code...' : 'Activer l\'Offre & Obtenir le Code'}</span>
              </button>

              <button 
                  onClick={() => { onClose(); onVisitRestaurant(); }}
                  className="w-full bg-white/90 hover:bg-white text-black font-extrabold py-3 rounded-[20px] flex items-center justify-center space-x-2 shadow-md transition-all active:scale-95 text-[11px] uppercase tracking-wider"
              >
                  <Sparkles size={14} className="text-brand-500" />
                  <span>{linkedItem ? "Découvrir l'établissement" : "Commander maintenant"}</span>
              </button>
            </div>
        </div>

      </div>

      {/* CLAIMED OFFER MODAL POPUP */}
      {activatedOffer && (
        <ClaimedOfferModal
          offer={activatedOffer}
          onClose={() => setActivatedOffer(null)}
        />
      )}
    </div>
  );
};
