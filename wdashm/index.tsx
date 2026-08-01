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
      const isNative = origin.startsWith('file:') || origin.startsWith('capacitor:');
      
      if (isNative) {
        const backendUrl = 'https://dashmeals-rdc.onrender.com';
        
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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

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