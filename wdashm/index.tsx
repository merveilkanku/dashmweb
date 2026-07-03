import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { supabase } from './lib/supabase';
import { ErrorBoundary } from './components/ErrorBoundary';

import { Toaster } from 'sonner';

// Intercept and patch window.fetch so physical/emulator native platform builds can make server calls correctly
if (typeof window !== 'undefined') {
  try {
    const originalFetch = window.fetch;
    const patchedFetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const origin = window.location.origin;
      const isNative = origin.startsWith('file:') || origin.startsWith('capacitor:') || origin.includes('localhost') || !origin.includes('.run.app');
      
      if (isNative) {
        const backendUrl = 'https://ais-pre-vhkhcvkc54fgkbq75rumca-150789858029.europe-west2.run.app';
        
        if (typeof input === 'string' && input.startsWith('/api')) {
          console.log(`🌐 [Native API Redirect] Intercepting fetch: ${input} -> ${backendUrl}${input}`);
          return originalFetch(`${backendUrl}${input}`, init);
        } else if (input instanceof URL && input.pathname.startsWith('/api')) {
          const newUrl = new URL(backendUrl + input.pathname + input.search);
          console.log(`🌐 [Native API Redirect] Intercepting URL: ${input.toString()} -> ${newUrl.toString()}`);
          return originalFetch(newUrl, init);
        }
      }
      return originalFetch(input, init);
    };

    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
      if (!desc || desc.writable || typeof desc.set === 'function') {
        try {
          window.fetch = patchedFetch;
        } catch (assignError) {
          console.warn('⚠️ [Fetch Patch] Direct assignment failed, trying defineProperty:', assignError);
          Object.defineProperty(window, 'fetch', {
            value: patchedFetch,
            configurable: true,
            writable: true,
            enumerable: true
          });
        }
      } else if (desc.configurable) {
        Object.defineProperty(window, 'fetch', {
          value: patchedFetch,
          configurable: true,
          writable: true,
          enumerable: true
        });
      } else {
        console.warn('⚠️ [Fetch Patch] window.fetch property is non-configurable and non-writable. Bypassing global patch to avoid crash.');
      }
    } catch (assignError) {
      console.error('⚠️ [Fetch Patch] All property patch attempts failed:', assignError);
    }
  } catch (err) {
    console.error('❌ [Fetch Patch] Failed to intercept fetch globally:', err);
  }
}

// Check if we are in a popup callback (OAuth redirect)
const isPopupCallback = window.opener && (window.location.hash.includes('access_token') || window.location.search.includes('code='));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

if (isPopupCallback) {
  // We are the popup! Handle the callback.
  
  const handleAuth = async () => {
    try {
        // Wait a bit for Supabase to process the URL fragments
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get the session that should have been set by the client initialization
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session) {
            // Notify opener with session data
            window.opener.postMessage({ type: 'OAUTH_SUCCESS', session }, window.location.origin);
            // Give time for message to be received before closing
            setTimeout(() => window.close(), 1000);
        } else {
            // If no session yet, listen for it
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
                if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
                    window.opener.postMessage({ type: 'OAUTH_SUCCESS', session }, window.location.origin);
                    subscription.unsubscribe();
                    setTimeout(() => window.close(), 1000);
                }
            });
            
            // Timeout after 10 seconds if no session
            setTimeout(() => {
                subscription.unsubscribe();
                if (!window.closed) {
                    window.opener.postMessage({ type: 'OAUTH_ERROR', error: "Délai d'attente dépassé" }, window.location.origin);
                    window.close();
                }
            }, 10000);
        }
    } catch (err: any) {
        console.error("Popup Auth Exception:", err);
        window.opener.postMessage({ type: 'OAUTH_ERROR', error: err.message }, window.location.origin);
        setTimeout(() => window.close(), 2000);
    }
  };

  handleAuth();

  root.render(
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mb-4"></div>
      <h2 className="text-xl font-bold text-gray-800">Authentification...</h2>
      <p className="text-gray-500">Veuillez patienter pendant que nous finalisons votre connexion.</p>
    </div>
  );
} else {
// Normal app render
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      try {
        navigator.serviceWorker.register('./sw.js').then(registration => {
          console.log('SW registered: ', registration);
        }).catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
      } catch (err) {
        console.warn('SW registration skipped or failed:', err);
      }
    });
  }

  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <Toaster position="top-center" richColors />
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}