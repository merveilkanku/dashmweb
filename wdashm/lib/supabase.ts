import { createClient } from '@supabase/supabase-js';
import { fetchWithRetry } from '../utils/fetch';

const DEFAULT_URL = "https://xistgrankjxcaqypncar.supabase.co";
const DEFAULT_KEY = "sb_publishable_YOmcbJpTN480mcFdf4FeqA_-9nS0O5d";

const supabaseUrl = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || import.meta.env?.VITE_SUPABASE_URL || DEFAULT_URL;
const supabaseKey = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || import.meta.env?.VITE_SUPABASE_ANON_KEY || DEFAULT_KEY;

if (!supabaseUrl || supabaseUrl === DEFAULT_URL || !supabaseKey || supabaseKey === DEFAULT_KEY) {
  console.warn("⚠️ Utilisation des configurations et ressources de démonstration / fallbacks. Assurez-vous d'injecter vos variables d'environnement Supabase réelles lors du build.");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit'
  },
  global: {
    fetch: (input, init) => fetchWithRetry(input, init)
  }
});
