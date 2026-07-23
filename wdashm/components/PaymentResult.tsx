import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertCircle, ArrowLeft, Landmark, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';

interface Props {
  status: 'success' | 'cancel' | 'failed';
  onReturn: () => void;
}

export const PaymentResult: React.FC<Props> = ({ status, onReturn }) => {
  const [isActivating, setIsActivating] = useState(status === 'success');
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activatedPlan, setActivatedPlan] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'success') return;

    const activatePayment = async () => {
      try {
        const queryParams = new URLSearchParams(window.location.search);
        const ref = queryParams.get('ref');
        
        if (!ref) {
          setIsActivating(false);
          return;
        }

        console.log("[PaymentResult] Processing success ref:", ref);

        // Clear the query params from the browser address bar immediately so that refresh/bookmark doesn't repeat this payment activation
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
          console.warn("[PaymentResult] Failed to clean URL params:", e);
        }

        if (ref.includes(':')) {
          // ── SUBSCRIPTION PAYMENT ──
          const [restaurantId, planId] = ref.split(':');
          if (restaurantId && planId) {
            const planNames: Record<string, string> = {
              free: "Gratuit",
              premium: "Premium Pro",
              business: "Business Max",
              enterprise: "Entreprise"
            };

            // First, fetch the current subscription status of this restaurant
            const { data: restData } = await supabase
              .from('restaurants')
              .select('subscription_tier, subscription_end_date, settings')
              .eq('id', restaurantId)
              .single();

            const now = new Date();
            const hasActiveSub = restData && 
              restData.subscription_tier === planId && 
              restData.subscription_end_date && 
              new Date(restData.subscription_end_date) > now;

            const nextMonth = new Date();
            if (hasActiveSub && restData?.subscription_end_date) {
              console.log("[PaymentResult] Restaurant already has an active subscription to", planId, ". Skipping end date recalculation.");
              nextMonth.setTime(new Date(restData.subscription_end_date).getTime());
              setActivatedPlan(planNames[planId] || planId.toUpperCase());
            } else {
              nextMonth.setMonth(nextMonth.getMonth() + 1);

              // Update restaurant subscription status in Supabase instantly
              const { error: subError } = await supabase
                .from('restaurants')
                .update({
                  subscription_tier: planId,
                  subscription_status: 'active',
                  subscription_end_date: nextMonth.toISOString(),
                  settings: {
                    ...(restData?.settings || {}),
                    subscriptionStartDate: restData?.settings?.subscriptionStartDate || now.toISOString()
                  }
                })
                .eq('id', restaurantId);

              if (subError) {
                console.error("[PaymentResult] DB Update error:", subError);
                throw subError;
              }

              setActivatedPlan(planNames[planId] || planId.toUpperCase());
            }

            // Send confirmation email asynchronously
            try {
              const { data: restaurant } = await supabase
                .from('restaurants')
                .select('owner_id, name')
                .eq('id', restaurantId)
                .single();

              if (restaurant?.owner_id) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('email, full_name, name')
                  .eq('id', restaurant.owner_id)
                  .single();

                if (profile?.email) {
                  const planName = planNames[planId] || planId.toUpperCase();
                  const nextMonthStr = nextMonth.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                  
                  const emailHtml = `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                      <div style="background: linear-gradient(135deg, #ea580c 0%, #ff7e33 100%); padding: 30px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Forfait Activé 🎉</h1>
                        <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Votre restaurant ${restaurant.name} passe au niveau supérieur !</p>
                      </div>
                      <div style="padding: 30px; color: #1f2937; line-height: 1.6;">
                        <p style="font-size: 16px; margin-top: 0;">Bonjour <strong>${profile.full_name || profile.name || "Partenaire"}</strong>,</p>
                        <p>Nous vous confirmons l'activation de votre abonnement <strong>DashMeals Business</strong> suite à votre paiement.</p>
                        
                        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; border-radius: 12px; margin: 25px 0;">
                          <h3 style="margin-top: 0; color: #ea580c; font-size: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; text-transform: uppercase;">Détails du Forfait</h3>
                          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <tr>
                              <td style="padding: 6px 0; color: #4b5563; font-weight: 500;">Établissement :</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #111827;">${restaurant.name}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #4b5563; font-weight: 500;">Forfait Activé :</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ea580c;">${planName}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #4b5563; font-weight: 500;">Statut :</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #10b981;">Actif ✅</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #4b5563; font-weight: 500;">Date de renouvellement :</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #111827;">${nextMonthStr}</td>
                            </tr>
                          </table>
                        </div>
                        
                        <p>Toutes les fonctionnalités de votre forfait sont désormais actives sur votre tableau de bord partenaire.</p>
                        
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;" />
                        <p style="font-size: 12px; color: #6b7280; text-align: center; margin-bottom: 0;">L'équipe DashMeals Partner.</p>
                      </div>
                    </div>
                  `;

                  const { data: { session } } = await supabase.auth.getSession();
                  const token = session?.access_token;

                  if (token) {
                    await fetch('/api/email/send', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({
                        to: profile.email,
                        subject: `[DashMeals] Confirmation d'activation de votre forfait ${planName}`,
                        html: emailHtml
                      })
                    });
                    console.log("[PaymentResult] Confirmation email sent successfully via client trigger.");
                  }
                }
              }
            } catch (emailErr) {
              console.error("[PaymentResult] Non-blocking error sending confirmation email:", emailErr);
            }
          }
        } else {
          // ── STANDARD ORDER PAYMENT ──
          // Recover original order ID from the potentially unique suffixed ID
          const originalOrderId = ref.includes('__') ? ref.split('__')[0] : ref;
          
          // Fetch the order
          const { data: order, error: fetchErr } = await supabase
            .from('orders')
            .select('*')
            .eq('id', originalOrderId)
            .single();

          if (fetchErr) {
            console.error("[PaymentResult] Order fetch error:", fetchErr);
            throw fetchErr;
          }

          if (order) {
            let updatedItems = order.items;
            if (Array.isArray(updatedItems)) {
              updatedItems = updatedItems.map((item: any, idx: number) => {
                if (idx === 0) {
                  return { ...item, paymentStatus: 'paid' };
                }
                return item;
              });
            }

            const { error: orderUpdateErr } = await supabase
              .from('orders')
              .update({ 
                paymentStatus: 'paid',
                items: updatedItems
              })
              .eq('id', originalOrderId);

            if (orderUpdateErr) {
              console.error("[PaymentResult] Order update error:", orderUpdateErr);
              throw orderUpdateErr;
            }
          }
        }
        
        setIsActivating(false);
      } catch (err: any) {
        console.error("[PaymentResult] Activation error:", err);
        setActivationError(err.message || "Une erreur est survenue lors de l'activation.");
        setIsActivating(false);
      }
    };

    activatePayment();
  }, [status]);

  const config = {
    success: {
      icon: isActivating ? (
        <Loader2 size={64} className="text-brand-600 animate-spin" />
      ) : activationError ? (
        <XCircle size={64} className="text-red-500" />
      ) : (
        <CheckCircle2 size={64} className="text-green-500 animate-bounce" />
      ),
      title: isActivating 
        ? "Activation en cours..." 
        : activationError 
          ? "Erreur d'activation" 
          : "Paiement Réussi !",
      message: isActivating 
        ? "Veuillez patienter pendant que nous activons instantanément vos services..." 
        : activationError 
          ? `Le paiement a été reçu mais nous n'avons pas pu activer le forfait automatiquement : ${activationError}. Notre support va régler cela très vite.` 
          : activatedPlan 
            ? `Félicitations ! Votre forfait ${activatedPlan} est maintenant actif instantanément ! Un email de confirmation vous a également été envoyé.` 
            : "Merci pour votre confiance. Votre commande a été payée avec succès et est maintenant active !",
      color: isActivating 
        ? "bg-brand-50 border-brand-100 text-brand-800" 
        : activationError 
          ? "bg-red-50 border-red-100 text-red-800" 
          : "bg-green-50 border-green-100 text-green-800",
      btnColor: "bg-brand-600 hover:bg-brand-700"
    },
    cancel: {
      icon: <AlertCircle size={64} className="text-amber-500" />,
      title: "Paiement Annulé",
      message: "L'opération a été annulée. Aucun montant n'a été débité de votre compte.",
      color: "bg-amber-50 border-amber-100 text-amber-800",
      btnColor: "bg-amber-600 hover:bg-amber-700"
    },
    failed: {
      icon: <XCircle size={64} className="text-red-500" />,
      title: "Échec du Paiement",
      message: "Désolé, une erreur est survenue lors de la transaction. Veuillez vérifier vos fonds ou contacter votre banque.",
      color: "bg-red-50 border-red-100 text-red-800",
      btnColor: "bg-red-600 hover:bg-red-700"
    }
  };

  const { icon, title, message, color, btnColor } = config[status];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100"
      >
        <div className="p-8 text-center">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 12 }}
            className="flex justify-center mb-6"
          >
            {icon}
          </motion.div>
          
          <h1 className="text-2xl font-black text-gray-900 mb-4">{title}</h1>
          
          <div className={`p-4 rounded-2xl border ${color} text-sm font-medium leading-relaxed mb-8`}>
            {message}
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={onReturn}
              className={`w-full py-4 rounded-xl text-white font-bold shadow-lg transition-all transform active:scale-95 ${btnColor}`}
            >
              Retour au Tableau de Bord
            </button>
            <div className="flex items-center justify-center gap-2 text-gray-400">
                <Landmark size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Sécurisé par KPay</span>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 flex justify-center">
          <button 
            onClick={onReturn}
            className="text-xs font-bold text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
          >
            <ArrowLeft size={14} />
            Tableau de bord
          </button>
        </div>
      </motion.div>
    </div>
  );
};
