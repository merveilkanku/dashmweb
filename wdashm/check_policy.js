import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let envStr = '';
try { envStr = fs.readFileSync('.env', 'utf-8'); } catch(e) { envStr = fs.readFileSync('.env.example', 'utf-8'); }

const env = {};
envStr.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k) env[k] = v.join('=');
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('app_settings').select('value').eq('id', 'global').single();
  console.log("TEST ANON QUERY:", JSON.stringify({data, error}));
}
run();
