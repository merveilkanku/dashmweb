import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Try to parse out the supabase URL from .env, if not there, .env.example
let envStr = '';
try {
  envStr = fs.readFileSync('.env', 'utf-8');
} catch (e) {
  envStr = fs.readFileSync('.env.example', 'utf-8');
}

const env = {};
envStr.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k) env[k] = v.join('=');
});

const supaUrl = env.VITE_SUPABASE_URL;
const supaKey = env.VITE_SUPABASE_ANON_KEY;

if (!supaUrl || !supaKey || supaUrl.includes('YOUR_')) {
  console.log("No valid Supabase credentials to query.");
  process.exit(0);
}

const supabase = createClient(supaUrl, supaKey);
async function run() {
  const { data, error } = await supabase.from('app_settings').select('*');
  console.log(JSON.stringify({data, error}));
}
run();
