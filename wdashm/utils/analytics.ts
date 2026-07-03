import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export const analytics = {
  /**
   * Set the user ID in Firebase Analytics
   */
  async setUserId(userId: string | null) {
    console.log(`📊 [Analytics] setUserId: ${userId}`);
    if (isNative) {
      try {
        await FirebaseAnalytics.setUserId({ userId });
      } catch (e) {
        console.warn('⚠️ [Analytics] Error setting user ID:', e);
      }
    }
  },

  /**
   * Set user property for targeting / segmentation
   */
  async setUserProperty(name: string, value: string | null) {
    console.log(`📊 [Analytics] setUserProperty: ${name} = ${value}`);
    if (isNative) {
      try {
        await FirebaseAnalytics.setUserProperty({ key: name, value });
      } catch (e) {
        console.warn('⚠️ [Analytics] Error setting user property:', e);
      }
    }
  },

  /**
   * Track custom event with optional parameters
   */
  async logEvent(name: string, params?: Record<string, any>) {
    console.log(`📊 [Analytics] logEvent: ${name}`, params || '');
    if (isNative) {
      try {
        await FirebaseAnalytics.logEvent({
          name,
          params
        });
      } catch (e) {
        console.warn('⚠️ [Analytics] Error logging event:', e);
      }
    }
  },

  /**
   * Set screen/page view tracking
   */
  async setScreenName(screenName: string) {
    console.log(`📊 [Analytics] setScreenName: ${screenName}`);
    if (isNative) {
      try {
        // Handle screen name tracking with standard current_screen property or fallbacks
        await FirebaseAnalytics.setCurrentScreen({ screenName });
      } catch (e) {
        // Fallback trace
        try {
          await FirebaseAnalytics.logEvent({
            name: 'screen_view',
            params: { firebase_screen: screenName }
          });
        } catch (innerErr) {
          console.warn('⚠️ [Analytics] Error setting screen name:', innerErr);
        }
      }
    }
  }
};
