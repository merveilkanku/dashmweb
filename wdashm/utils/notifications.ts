// utils/notifications.ts
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '../lib/supabase';

/**
 * Demande de permission pour les notifications (adapté pour Web et Capacitor Native)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // 1. Version Native Capacitor (iOS/Android)
  if (Capacitor.isNativePlatform()) {
    try {
      console.log("🔔 [Push Native] Demande de permission Capacitor...");
      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive === 'granted') {
        console.log("🔔 [Push Native] Permission accordée, enregistrement avec FCM / APNS...");
        await PushNotifications.register();
        return true;
      } else {
        console.warn("🔔 [Push Native] Permission refusée.");
        toast.error("L'autorisation de notifications a été refusée côté système.");
        return false;
      }
    } catch (e) {
      console.error("🔔 [Push Native] Erreur de permission native:", e);
      return false;
    }
  }

  // 2. Version Web Standard
  if (!('Notification' in window)) {
    console.warn("Ce navigateur ne supporte pas les notifications");
    toast.error("Votre navigateur ne supporte pas les notifications");
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = !!window.matchMedia('(display-mode: standalone)').matches || !!(window.navigator as any).standalone;
    
    if (isIOS && !isStandalone) {
      toast.error(
        "Sur iOS, ajoutez l'application à votre écran d'accueil pour activer les notifications.",
        { duration: 8000 }
      );
    } else {
      toast.error(
        "Notifications bloquées. Activez-les dans les paramètres du site (icône cadenas).",
        { duration: 8000 }
      );
    }
    return false;
  }

  try {
    console.log("🔔 [Notif Web] Requesting permission...");
    if (window.self !== window.top) {
      console.warn("⚠️ [Notif Web] Iframe détecté.");
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      toast.success("Notifications activées !");
      return true;
    } else {
      toast.error("Notifications bloquées par le système ou l'utilisateur.");
      return false;
    }
  } catch (e) {
    console.error("Erreur lors de la demande de permission web:", e);
    return false;
  }
}

/**
 * Envoi d'une notification push locale (Web ou Capacitor)
 */
export const sendPushNotification = (title: string, options?: NotificationOptions) => {
  // 1. Version Native Capacitor
  if (Capacitor.isNativePlatform()) {
    toast(title, {
      description: options?.body || "",
      duration: 5000,
    });
    return;
  }

  // 2. Version Web
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    try {
      navigator.serviceWorker.ready.then(registration => {
        (registration as any).showNotification(title, {
          icon: '/logo.png',
          vibrate: [200, 100, 200],
          ...options
        });
      }).catch(() => {
        new Notification(title, {
          icon: '/logo.png',
          ...options
        });
      });
    } catch (e) {
      new Notification(title, {
        icon: '/logo.png',
        ...options
      });
    }
  }
};

/**
 * Initialise l'enregistrement automatique des notifications natives et lie le FCM aux profils Supabase
 */
export async function initializeCapacitorPush(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log("🔔 [Push Native] Environnement web - Pas d'initialisation native.");
    return;
  }

  if (!userId || userId.startsWith('mock-')) {
    console.log("🔔 [Push Native] ID utilisateur invalide ou invité - Pas d'enregistrement.");
    return;
  }

  try {
    console.log("🔔 [Push Native] Démarrage de la configuration native pour l'utilisateur:", userId);

    // Vérifier et s'assurer que les permissions sont valides
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn("🔔 [Push Native] Permission non accordée :", permStatus.receive);
      return;
    }

    // Nettoyer les écouteurs précédents pour éviter des doublons lors du Hot Reload ou de reconnexions
    await PushNotifications.removeAllListeners();

    // 1. Enregistrement FCM réussi
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('🔑 [Push Native] Token FCM généré avec succès:', token.value);
      localStorage.setItem('fcm_token_native', token.value);

      // Synchroniser le jeton directement avec le champ settings du profil utilisateur
      try {
        const { data: profile, error: fetchErr } = await supabase
          .from('profiles')
          .select('settings')
          .eq('id', userId)
          .maybeSingle();

        if (!fetchErr) {
          const currentSettings = profile?.settings || {};
          const updatedSettings = {
            ...currentSettings,
            fcmToken: token.value,
            lastRegisteredPlatform: Capacitor.getPlatform(),
            lastRegisteredAt: new Date().toISOString()
          };

          const { error: updateErr } = await supabase
            .from('profiles')
            .update({ settings: updatedSettings })
            .eq('id', userId);

          if (updateErr) {
            console.error('❌ [Push Native] Échec d\'enregistrement DB du token FCM:', updateErr.message);
          } else {
            console.log('✅ [Push Native] Jeton FCM enregistré avec succès dans Supabase profile.settings !');
          }
        }
      } catch (dbErr) {
        console.error('❌ [Push Native] Exception de sauvegarde DB:', dbErr);
      }
    });

    // 2. Erreur d'enregistrement
    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('❌ [Push Native] Erreur d\'enregistrement système push:', JSON.stringify(error));
    });

    // 3. Réception de notifications au premier plan (Foreground)
    await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('🔔 [Push Native] Notification reçue au premier plan:', notification);
      
      // Notification visuelle interne très propre respectant la charte orange/blanc, compatible pur .ts
      toast(notification.title || "DashMeals", {
        description: notification.body || "",
        duration: 8000,
        style: {
          border: '2px solid #f97316',
          borderRadius: '16px',
          color: '#ea580c',
          background: '#ffffff',
        },
        icon: '🔔',
        action: notification.data && notification.data.orderId ? {
          label: "Voir",
          onClick: () => {
            const event = new CustomEvent('navigate_to_order', { detail: { orderId: notification.data.orderId } });
            window.dispatchEvent(event);
          }
        } : undefined
      });
    });

    // 4. Clic de l'utilisateur sur la notification (Arrière-plan / Fermé)
    await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log('🔔 [Push Native] Action effectuée sur la notification:', action);
      const data = action.notification.data;
      
      if (data && data.orderId) {
        // Déclencher un événement global pour que le root effectue la navigation vers la commande
        setTimeout(() => {
          const event = new CustomEvent('navigate_to_order', { detail: { orderId: data.orderId } });
          window.dispatchEvent(event);
        }, 800);
      }
    });

    // Envoyer la demande d'enregistrement final à Capacitor
    await PushNotifications.register();

  } catch (error) {
    console.error("❌ [Push Native] Erreur lors de l'initialisation push:", error);
  }
}
