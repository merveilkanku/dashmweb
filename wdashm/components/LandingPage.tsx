import React, { useState } from 'react';
import { Restaurant } from '../types';
import { APP_LOGO_URL } from '../constants';
import { 
  Utensils, 
  Bike, 
  Store, 
  ShieldCheck, 
  MapPin, 
  Zap, 
  Star, 
  ArrowRight, 
  Smartphone, 
  CreditCard, 
  Sparkles, 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  Users,
  ChevronRight,
  PhoneCall,
  Menu,
  X
} from 'lucide-react';

interface LandingPageProps {
  restaurants: Restaurant[];
  onExploreAsGuest: () => void;
  onOpenLogin: () => void;
  onOpenRegister: (initialRole?: 'client' | 'business' | 'delivery') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  restaurants,
  onExploreAsGuest,
  onOpenLogin,
  onOpenRegister
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const featuredRestaurants = restaurants.length > 0 ? restaurants.slice(0, 4) : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300">
      
      {/* 1. Header / Navbar */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer select-none" onClick={onExploreAsGuest}>
            <img 
              src={APP_LOGO_URL} 
              alt="DashMeals Logo" 
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl shadow-md object-contain p-1 bg-gradient-to-tr from-orange-500 to-amber-400"
            />
            <div>
              <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1">
                Dash<span className="text-orange-600 dark:text-orange-500">Meals</span>
              </span>
              <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block -mt-1">
                Kinshasa & RDC 🇨🇩
              </span>
            </div>
          </div>

          {/* Navigation Items (Desktop & Tablet) */}
          <nav className="hidden lg:flex items-center space-x-8 text-sm font-bold text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-orange-600 transition-colors">Services</a>
            <a href="#restaurants" className="hover:text-orange-600 transition-colors">Restaurants</a>
            <a href="#partners" className="hover:text-orange-600 transition-colors">Devenir Partenaire</a>
            <a href="#features" className="hover:text-orange-600 transition-colors">Paiements Sécurisés</a>
          </nav>

          {/* Action Buttons (Desktop / Tablet) */}
          <div className="hidden sm:flex items-center space-x-2.5">
            <button
              onClick={onExploreAsGuest}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-sm cursor-pointer min-h-[42px]"
            >
              <ShoppingBag size={15} className="text-orange-500" />
              <span>Explorer le menu</span>
            </button>

            <button
              onClick={onOpenLogin}
              className="px-3.5 py-2.5 rounded-xl text-slate-700 dark:text-slate-200 hover:text-orange-600 text-xs font-bold transition-colors cursor-pointer min-h-[42px]"
            >
              Se connecter
            </button>

            <button
              onClick={() => onOpenRegister('client')}
              className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold transition-all shadow-lg shadow-orange-600/25 flex items-center gap-1.5 cursor-pointer transform active:scale-95 min-h-[42px]"
            >
              <span>S'inscrire</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex sm:hidden items-center space-x-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

        </div>

        {/* Mobile Dropdown Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-3 pb-6 space-y-4 shadow-xl animate-fadeIn">
            <div className="flex flex-col space-y-3 pt-1 border-b border-slate-100 dark:border-slate-800 pb-4 text-sm font-bold text-slate-700 dark:text-slate-200">
              <a 
                href="#features" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 hover:text-orange-600 transition-colors flex items-center justify-between"
              >
                <span>Services & Avantages</span>
                <ChevronRight size={16} className="text-slate-400" />
              </a>
              <a 
                href="#restaurants" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 hover:text-orange-600 transition-colors flex items-center justify-between"
              >
                <span>Restaurants Partenaires</span>
                <ChevronRight size={16} className="text-slate-400" />
              </a>
              <a 
                href="#partners" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 hover:text-orange-600 transition-colors flex items-center justify-between"
              >
                <span>Devenir Partenaire</span>
                <ChevronRight size={16} className="text-slate-400" />
              </a>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onExploreAsGuest();
                }}
                className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                <ShoppingBag size={16} className="text-orange-500" />
                <span>Explorer le menu sans compte</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenLogin();
                  }}
                  className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold text-center cursor-pointer min-h-[44px]"
                >
                  Se connecter
                </button>

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenRegister('client');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-orange-600 text-white text-xs font-black text-center cursor-pointer min-h-[44px] shadow-md shadow-orange-600/20"
                >
                  S'inscrire
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden pt-8 pb-16 sm:pt-14 sm:pb-24 lg:pt-20 lg:pb-32 bg-gradient-to-b from-orange-50/60 via-slate-50 to-slate-50 dark:from-slate-900/60 dark:via-slate-950 dark:to-slate-950">
        {/* Subtle decorative glow blobs */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-72 sm:w-96 h-72 sm:h-96 bg-orange-500/10 dark:bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-10 w-48 sm:w-72 h-48 sm:h-72 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            
            {/* Left Content Column */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-6 text-center lg:text-left">
              
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-full bg-orange-100 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800/40 text-orange-700 dark:text-orange-300 text-[11px] sm:text-xs font-extrabold uppercase tracking-wide">
                <Sparkles size={14} className="text-orange-600 animate-pulse shrink-0" />
                <span>N°1 de la livraison de repas à Kinshasa</span>
              </div>

              {/* Title */}
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.15]">
                Vos plats préférés, <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500">
                  livrés en un éclair.
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto lg:mx-0 font-medium leading-relaxed">
                Commandez facilement auprès des meilleurs restaurants, snacks et lounges de Kinshasa et Lubumbashi.
                Livraison rapide à domicile ou au bureau, suivi GPS en direct et paiement ultra-sécurisé via <strong className="text-slate-900 dark:text-white font-black">DashMeals Pay (M-Pesa, Orange Money, Airtel, Cartes)</strong>.
              </p>

              {/* Call-to-action buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <button
                  onClick={onExploreAsGuest}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black text-sm transition-all shadow-xl shadow-orange-600/25 flex items-center justify-center gap-2.5 cursor-pointer group min-h-[48px]"
                >
                  <Utensils size={18} />
                  <span>Commander maintenant</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => onOpenRegister('business')}
                  className="w-full sm:w-auto px-6 sm:px-7 py-3.5 sm:py-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
                >
                  <Store size={18} className="text-orange-500" />
                  <span>Inscrire mon restaurant</span>
                </button>
              </div>

              {/* Stat Highlights */}
              <div className="pt-6 sm:pt-8 grid grid-cols-3 gap-2 sm:gap-4 border-t border-slate-200/80 dark:border-slate-800/80 max-w-lg mx-auto lg:mx-0">
                <div className="text-center sm:text-left">
                  <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">100%</p>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-medium">Kinshasa & RDC</p>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-xl sm:text-2xl font-black text-orange-600 dark:text-orange-400">~25 min</p>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-medium">Temps moyen</p>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">4.9/5 ⭐</p>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-medium">Avis clients</p>
                </div>
              </div>

            </div>

            {/* Right Visual Card Column */}
            <div className="lg:col-span-5 relative mt-4 lg:mt-0">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                
                {/* Main Hero Visual Card */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 shadow-2xl border border-slate-200/80 dark:border-slate-800 relative overflow-hidden">
                  
                  <div className="flex items-center justify-between pb-3 sm:pb-4 mb-3 sm:mb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center space-x-2.5 sm:space-x-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 flex items-center justify-center font-black shrink-0">
                        <Bike size={18} />
                      </div>
                      <div>
                        <h4 className="text-[10px] sm:text-xs font-black uppercase text-slate-400 tracking-wider">Suivi en direct</h4>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Commande en livraison #DM-882</p>
                      </div>
                    </div>
                    <span className="px-2 sm:px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 text-[10px] font-black rounded-full uppercase flex items-center gap-1 shrink-0">
                      <Bike size={12} />
                      <span>En route</span>
                    </span>
                  </div>

                  {/* Sample Order Preview */}
                  <div className="space-y-2.5 sm:space-y-3">
                    <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-orange-100 dark:bg-orange-950 text-orange-600 flex items-center justify-center shrink-0">
                          <Utensils size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">Poulet Grillé Kamundele & Aloco</p>
                          <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">Chez Maman Kinshasa</p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-orange-600 dark:text-orange-400 shrink-0">$12.50</span>
                    </div>

                    <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center shrink-0">
                          <ShoppingBag size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">Jus d'Ananas Frais & Vitalo</p>
                          <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">Boisson locale fraîche</p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-orange-600 dark:text-orange-400 shrink-0">$3.00</span>
                    </div>
                  </div>

                  {/* Payment Bar */}
                  <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl flex items-center justify-between shadow-md">
                    <div className="flex items-center space-x-2 min-w-0">
                      <CreditCard size={16} className="shrink-0" />
                      <span className="text-[11px] sm:text-xs font-extrabold truncate">Payé via Mobile Money & Carte</span>
                    </div>
                    <CheckCircle2 size={16} className="shrink-0 ml-1" />
                  </div>

                  {/* Rating Pill */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center">
                        <Star size={14} className="fill-amber-500 text-amber-500" />
                      </div>
                      <span className="font-extrabold text-slate-900 dark:text-white">4.9 / 5.0</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Satisfaction clients vérifiés</span>
                  </div>

                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3. Features Grid */}
      <section id="features" className="py-12 sm:py-16 bg-white dark:bg-slate-900 border-y border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
            <h2 className="text-xs font-black text-orange-600 uppercase tracking-widest mb-2">Pourquoi choisir DashMeals ?</h2>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              La solution complète pour commander, livrer et payer en RDC
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
            
            {/* Feature 1 */}
            <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50 hover:shadow-xl transition-all group">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-4 sm:mb-5 group-hover:scale-110 transition-transform">
                <Utensils size={22} />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5">Les Meilleurs Menus</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Retrouvez les spécialités congolaises, africaines et internationales préparées par vos restaurants locaux préférés.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50 hover:shadow-xl transition-all group">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 sm:mb-5 group-hover:scale-110 transition-transform">
                <Bike size={22} />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5">Suivi GPS Live</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Suivez en temps réel le trajet de votre livreur de la cuisine jusqu’à votre porte grâce à la carte interactive.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50 hover:shadow-xl transition-all group">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 sm:mb-5 group-hover:scale-110 transition-transform">
                <Smartphone size={22} />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5">Paiements Sécurisés</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Payez instantanément avec M-Pesa, Orange Money, Airtel Money ou carte bancaire en toute sécurité.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50 hover:shadow-xl transition-all group">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 sm:mb-5 group-hover:scale-110 transition-transform">
                <Store size={22} />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5">Espace Restaurateurs</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Une interface complète pour gérer vos menus, commandes, équipes de livraison et rapports financiers.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 4. Restaurants Preview Section */}
      <section id="restaurants" className="py-12 sm:py-16 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-10 gap-3">
            <div>
              <h2 className="text-xs font-black text-orange-600 uppercase tracking-widest mb-1">Nos Établissements Partenaires</h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">Découvrez les restaurants disponibles</p>
            </div>
            <button
              onClick={onExploreAsGuest}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-orange-600 hover:text-orange-700 cursor-pointer self-start sm:self-auto"
            >
              <span>Voir tout le catalogue</span>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {featuredRestaurants.map((resto) => {
              const restoImg = resto.coverImage || (resto as any).image || (resto.menu && resto.menu.length > 0 ? resto.menu[0].image : null);
              const delTime = resto.estimatedDeliveryTime ? `${resto.estimatedDeliveryTime} min` : resto.preparationTime ? `${resto.preparationTime + 15} min` : '20-30 min';
              const locationText = resto.city || (resto as any).address || 'Kinshasa';

              return (
                <div
                  key={resto.id}
                  onClick={onExploreAsGuest}
                  className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="relative h-40 sm:h-44 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center">
                      {restoImg ? (
                        <img 
                          src={restoImg} 
                          alt={resto.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="text-center p-4">
                          <Store size={36} className="text-orange-500 mx-auto mb-1 opacity-70" />
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{resto.name}</span>
                        </div>
                      )}
                      
                      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-amber-400 text-xs font-bold flex items-center gap-1">
                        <Star size={12} className="fill-amber-400" />
                        <span>{resto.rating ? Number(resto.rating).toFixed(1) : '4.8'}</span>
                      </div>
                    </div>

                    <div className="p-4 sm:p-5">
                      <h3 className="font-extrabold text-base text-slate-900 dark:text-white mb-1 group-hover:text-orange-600 transition-colors">
                        {resto.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
                        {resto.description || (resto as any).cuisine || 'Restauration & Spécialités locales'}
                      </p>

                      <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3">
                        <span className="flex items-center gap-1 font-medium">
                          <Clock size={13} className="text-orange-500" />
                          {delTime}
                        </span>
                        <span className="flex items-center gap-1 font-medium">
                          <MapPin size={13} className="text-slate-400" />
                          {locationText}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-600 dark:text-slate-300">
                      Statut: <strong className={resto.isOpen ? "text-emerald-600" : "text-amber-600"}>{resto.isOpen ? "Ouvert" : "Fermé"}</strong>
                    </span>
                    <span className="font-black text-orange-600 flex items-center gap-0.5">
                      Explorer <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* 5. Business / Delivery Partner Callout */}
      <section id="partners" className="py-12 sm:py-16 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-center">
            
            {/* Restaurant Partner */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 space-y-3.5 sm:space-y-4">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white text-orange-600 flex items-center justify-center font-black">
                <Store size={22} />
              </div>
              <h3 className="text-xl sm:text-2xl font-black">Vous possédez un restaurant ou snack ?</h3>
              <p className="text-xs sm:text-sm text-orange-100 leading-relaxed">
                Devenez partenaire DashMeals et développez vos ventes en atteignant des milliers de clients gourmands à Kinshasa et Lubumbashi.
              </p>
              <button
                onClick={() => onOpenRegister('business')}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white text-orange-700 font-extrabold text-xs shadow-lg hover:bg-orange-50 transition-all cursor-pointer inline-flex items-center justify-center gap-2 min-h-[44px]"
              >
                <span>Créer mon compte Restaurant</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Delivery Partner */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 space-y-3.5 sm:space-y-4">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white text-orange-600 flex items-center justify-center font-black">
                <Bike size={22} />
              </div>
              <h3 className="text-xl sm:text-2xl font-black">Rejoignez l'équipe des Livreurs !</h3>
              <p className="text-xs sm:text-sm text-orange-100 leading-relaxed">
                Effectuez des livraisons flexibles à moto ou véhicule, suivez vos gains en temps réel et percevez vos revenus facilement.
              </p>
              <button
                onClick={() => onOpenRegister('delivery')}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-900 text-white font-extrabold text-xs shadow-lg hover:bg-slate-800 transition-all cursor-pointer inline-flex items-center justify-center gap-2 min-h-[44px]"
              >
                <span>Devenir Livreur DashMeals</span>
                <ArrowRight size={14} />
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="mt-auto bg-slate-900 text-slate-400 py-10 sm:py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-800 pb-8 text-center md:text-left">
            
            <div className="flex items-center space-x-3">
              <img src={APP_LOGO_URL} alt="DashMeals" className="w-9 h-9 rounded-xl object-contain p-1 bg-orange-500" />
              <span className="text-xl font-black text-white">Dash<span className="text-orange-500">Meals</span> RDC</span>
            </div>

            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-xs font-bold text-slate-300">
              <button onClick={onExploreAsGuest} className="hover:text-orange-500 cursor-pointer">Explorer les menus</button>
              <button onClick={onOpenLogin} className="hover:text-orange-500 cursor-pointer">Connexion</button>
              <button onClick={() => onOpenRegister('client')} className="hover:text-orange-500 cursor-pointer">Inscription</button>
              <button onClick={() => onOpenRegister('business')} className="hover:text-orange-500 cursor-pointer">Espace Partenaire</button>
            </div>

          </div>

          <div className="pt-6 sm:pt-8 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-3 text-center sm:text-left">
            <p>© {new Date().getFullYear()} DashMeals RDC. Tous droits réservés.</p>
            <p className="flex items-center gap-1">
              <span>Fait avec passion à Kinshasa 🇨🇩</span>
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
};

