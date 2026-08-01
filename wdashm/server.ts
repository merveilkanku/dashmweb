import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type } from "@google/genai";
import { calculateFullNavigationRoute, formatNavigationAssistantText } from "./utils/routing.js";

const currentFilename = typeof __filename !== "undefined"
  ? __filename
  : (typeof import.meta !== "undefined" && import.meta.url ? fileURLToPath(import.meta.url) : process.cwd());

const currentDirname = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(currentFilename);

// Simple In-Memory Rate Limiter for Admin endpoints
const adminLimiter = new Map();
const checkRateLimit = (req: any, res: any, next: any) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const count = adminLimiter.get(ip) || 0;
  if (count > 20) {
    console.warn(`[Security] Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({ error: "Trop de requêtes. Veuillez patienter avant de réessayer." });
  }
  adminLimiter.set(ip, count + 1);
  setTimeout(() => adminLimiter.set(ip, (adminLimiter.get(ip) || 1) - 1), 60000); // reset after 1 min
  next();
};

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Universal CORS middleware handling origin, headers, credentials, and OPTIONS preflight for all endpoints
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin || 'https://dashmeals-rdc.onrender.com';
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Allow-Headers, Access-Control-Request-Method, Access-Control-Request-Headers');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).send('OK');
    }
    next();
  });

  app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Headers', 'Access-Control-Request-Method', 'Access-Control-Request-Headers']
  }));

  app.use(express.json({ limit: '10mb' }));

  const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

  // Supabase Admin Client for Webhooks & Settings (bypasses RLS if service role key is used)
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xistgrankjxcaqypncar.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_YOmcbJpTN480mcFdf4FeqA_-9nS0O5d';
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Database Self-Healing Check on Startup
  if (supabaseAdmin) {
    (async () => {
      try {
        console.log("[Startup] 🛡️ Running database self-healing checks...");
        
        // 1. Ensure 'irmerveilkanku@gmail.com' has the 'superadmin' role in profiles table
        const { data: profile, error: pError } = await supabaseAdmin
          .from('profiles')
          .select('id, role')
          .eq('email', 'irmerveilkanku@gmail.com')
          .maybeSingle();
        
        if (pError) {
          console.error("❌ [Startup] Error fetching superadmin profile:", pError.message);
        } else if (profile) {
          if (profile.role !== 'superadmin') {
            console.log(`[Startup] 🔄 Updating user ${profile.id} (${profile.role}) role to 'superadmin'...`);
            const { error: uError } = await supabaseAdmin
              .from('profiles')
              .update({ role: 'superadmin' })
              .eq('id', profile.id);
            if (uError) {
              console.error("❌ [Startup] Error updating superadmin role:", uError.message);
            } else {
              console.log("✅ [Startup] Superadmin role successfully restored in database profiles!");
            }
          } else {
            console.log("✅ [Startup] User is already configured as superadmin in database profiles.");
          }
        } else {
          console.log("⚠️ [Startup] Profile not found for irmerveilkanku@gmail.com yet.");
        }

        // 2. Ensure 'app_settings' table has 'global' row
        const { data: settingsData, error: sError } = await supabaseAdmin
          .from('app_settings')
          .select('*')
          .eq('id', 'global')
          .maybeSingle();
        
        if (sError) {
          console.error("❌ [Startup] Error fetching global settings:", sError.message);
        } else if (!settingsData) {
          console.log("[Startup] 'global' row missing in app_settings table. Inserting default settings...");
          const defaultValue = {
            support_email: "support@dashmeals-rdc.com",
            support_phone: "+243 81 000 0000",
            support_whatsapp: "+243 81 000 0001",
            office_address: "Boulevard du 30 Juin, Gombe, Kinshasa, RDC",
            payment_exchange_rate: 2850
          };
          const { error: iError } = await supabaseAdmin
            .from('app_settings')
            .insert({ id: 'global', value: defaultValue });
          if (iError) {
            console.error("❌ [Startup] Error inserting default app_settings row:", iError.message);
          } else {
            console.log("✅ [Startup] Default app_settings inserted successfully.");
          }
        } else {
          // Ensure payment_exchange_rate is inside the value field
          const val = settingsData.value || {};
          if (!val.payment_exchange_rate) {
            console.log("[Startup] 'payment_exchange_rate' missing in global settings value. Injecting default 2850...");
            val.payment_exchange_rate = 2850;
            const { error: uError } = await supabaseAdmin
              .from('app_settings')
              .update({ value: val })
              .eq('id', 'global');
            if (uError) {
              console.error("❌ [Startup] Error updating global settings with default rate:", uError.message);
            } else {
              console.log("✅ [Startup] Updated global app_settings with default exchange rate.");
            }
          } else {
            console.log(`✅ [Startup] Global app settings validated. payment_exchange_rate: ${val.payment_exchange_rate} CDF`);
          }
        }
      } catch (err) {
        console.error("❌ [Startup] Error running database self-healing checks:", err);
      }
    })();
  }

  // Admin App Settings API Endpoints
  app.get("/api/admin/settings", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase Admin not initialized" });
      }
      const { data, error } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('id', 'global')
        .single();
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      const val = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value;
      return res.json({ settings: val });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/settings", express.json(), async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase Admin not initialized" });
      }
      const settings = req.body;
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: "Invalid settings payload" });
      }
      const cleanSettings = {
        support_email: settings.support_email ? String(settings.support_email).trim() : 'support@dashmeals-rdc.com',
        support_phone: settings.support_phone ? String(settings.support_phone).trim() : '+243 81 000 0000',
        support_whatsapp: settings.support_whatsapp ? String(settings.support_whatsapp).trim() : '+243 81 000 0001',
        office_address: settings.office_address ? String(settings.office_address).trim() : 'Boulevard du 30 Juin, Gombe, Kinshasa, RDC.',
        payment_exchange_rate: Number(settings.payment_exchange_rate) || 2850
      };

      const { error } = await supabaseAdmin
        .from('app_settings')
        .upsert({ id: 'global', value: cleanSettings, updated_at: new Date().toISOString() });

      if (error) {
        console.error("❌ [API] Error saving app settings:", error.message);
        return res.status(400).json({ error: error.message });
      }

      console.log("✅ [API] App settings updated via admin API:", cleanSettings);
      return res.json({ success: true, settings: cleanSettings });
    } catch (err: any) {
      console.error("❌ [API] Error in POST /api/admin/settings:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Money Fusion Webhook
  app.post("/api/moneyfusion/webhook", express.json(), async (req, res) => {
    // Basic Auth Check for Webhook Security
    const signature = req.headers['x-moneyfusion-signature'] || req.headers['authorization'];
    const expectedSecret = process.env.MONEYFUSION_WEBHOOK_SECRET || 'mf_wh_sec_dashmeals123';
    
    if (signature !== expectedSecret && !req.headers['authorization']?.includes(expectedSecret)) {
      console.warn("⚠️ Unauthorized webhook attempt.");
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Money Fusion typical webhook sends data in body or query
    const { reference, status, amount, transaction_id } = req.body;
    
    console.log(`MoneyFusion Webhook received:`, { reference, status, amount });

    if (status === 'completed' || status === 'success') {
      // reference is expected to be restaurantId:planId
      const [restaurantId, planId] = (reference || "").split(':');

      if (restaurantId && planId && supabaseAdmin) {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        // Fetch current settings to preserve them
        const { data: restData } = await supabaseAdmin
          .from('restaurants')
          .select('settings')
          .eq('id', restaurantId)
          .single();

        const currentSettings = restData?.settings || {};

        const { error } = await supabaseAdmin
          .from('restaurants')
          .update({
            subscription_tier: planId,
            subscription_status: 'active',
            subscription_end_date: nextMonth.toISOString(),
            settings: {
              ...currentSettings,
              subscriptionStartDate: currentSettings.subscriptionStartDate || new Date().toISOString()
            }
          })
          .eq('id', restaurantId);

        if (error) {
          console.error("Webhook Error updating database:", error);
        } else {
          console.log(`Webhook: Successfully updated restaurant ${restaurantId} via MoneyFusion`);

          // Send confirmation email
          try {
            const { data: restaurant } = await supabaseAdmin
              .from('restaurants')
              .select('owner_id, name')
              .eq('id', restaurantId)
              .single();

            if (restaurant?.owner_id) {
              const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('email, full_name, name')
                .eq('id', restaurant.owner_id)
                .single();

              if (profile?.email && resend) {
                const planNames: Record<string, string> = {
                  free: "Gratuit",
                  premium: "Premium Pro",
                  business: "Business Max",
                  enterprise: "Entreprise"
                };
                const planName = planNames[planId] || planId.toUpperCase();
                
                const emailHtml = `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, #ea580c 0%, #ff7e33 100%); padding: 30px; text-align: center; color: white;">
                      <h1 style="margin: 0; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Forfait Activé 🎉</h1>
                      <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Votre restaurant ${restaurant.name} passe au niveau supérieur !</p>
                    </div>
                    <div style="padding: 30px; color: #1f2937; line-height: 1.6;">
                      <p style="font-size: 16px; margin-top: 0;">Bonjour <strong>${profile.full_name || profile.name || "Partenaire"}</strong>,</p>
                      <p>Nous vous confirmons l'activation de votre abonnement <strong>DashMeals Business</strong> suite à votre paiement MoneyFusion.</p>
                      
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
                            <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #111827;">${nextMonth.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                          </tr>
                        </table>
                      </div>
                      
                      <p>Toutes les fonctionnalités de votre forfait sont désormais actives sur votre tableau de bord partenaire.</p>
                      
                      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;" />
                      <p style="font-size: 12px; color: #6b7280; text-align: center; margin-bottom: 0;">L'équipe DashMeals Partner.</p>
                    </div>
                  </div>
                `;

                let toEmail = profile.email;
                let subjectStr = `[DashMeals] Confirmation d'activation de votre forfait ${planName}`;
                const isSandbox = process.env.RESEND_SANDBOX === 'true';
                if (isSandbox) {
                  const verifiedEmail = "irmerveilkanku@gmail.com";
                  if (toEmail.toLowerCase() !== verifiedEmail.toLowerCase()) {
                    console.warn(`[Sandbox] Redirecting email from ${toEmail} to ${verifiedEmail}`);
                    toEmail = verifiedEmail;
                    subjectStr = `[SANDBOX FOR ${profile.email}] ${subjectStr}`;
                  }
                }

                await resend.emails.send({
                  from: "DashMeals <onboarding@resend.dev>",
                  to: toEmail,
                  subject: subjectStr,
                  html: emailHtml
                });
                console.log(`[Webhook] Subscription email sent successfully to ${toEmail}`);
              }
            }
          } catch (subEmailErr) {
            console.error("Error sending sub confirmation email from MoneyFusion webhook:", subEmailErr);
          }
        }
      }
    }

    res.json({ received: true });
  });

  app.use(express.json());

  app.post(["/api/moneyfusion/create-payment", "/api/moneyfusion/create-payment/"], async (req, res) => {
    const { planId, restaurantId, amount, currency = "USD", baseUrl: clientBaseUrl } = req.body;
    
    // Safety authorization validation
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn("⚠️ [Security] Unauthorized attempt to create-payment API: Missing Authorization header");
        return res.status(401).json({ error: "Authentification requise pour initier un paiement." });
      }

      const token = authHeader.split(' ')[1];
      const standardAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpc3RncmFua2p4Y2FxeXBuY2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDQ0NzIsImV4cCI6MjA4NjcyMDQ3Mn0.ApIRZ1awMUn2bqX8fIR5z28_XeMPDDs3_dI6MEAGSgo';
      const clientToVerify = supabaseAdmin || createClient(supabaseUrl, standardAnonKey);
      
      const { data: { user: callingUser }, error: authError } = await clientToVerify.auth.getUser(token);
      
      if (authError || !callingUser) {
        console.warn("⚠️ [Security] Unauthorized attempt to create-payment API: Invalid or expired token", authError);
        return res.status(403).json({ error: "Session invalide ou expirée." });
      }
    } catch (authExc: any) {
      console.error("⚠️ [Security] Authorization exception in create-payment API:", authExc);
      return res.status(500).json({ error: "Erreur d'authentification serveur." });
    }

    const merchantId = process.env.MONEY_FUSION_MERCHANT_ID;
    const apiKey = process.env.MONEY_FUSION_API_KEY;

    if (!merchantId || !apiKey) {
      return res.status(500).json({ error: "Money Fusion is not configured on the server" });
    }

    // Server-side price calculation
    const PLAN_PRICES: Record<string, number> = {
      'basic': 5,
      'premium': 20,
      'enterprise': 50,
      'starter': 5,
      'pro': 20,
      'elite': 50
    };

    const price = PLAN_PRICES[planId] || amount || 5;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = "https://dashmeals-rdc.onrender.com";

    console.log(`🔗 [MoneyFusion] Génération lien paiement. Base URL détectée : ${baseUrl}`);

    try {
      // reference is expected to be restaurantId:planId
      const reference = `${restaurantId}:${planId}`;
      
      const successUrl = `${baseUrl}?payment_status=success`;
      const cancelUrl = `${baseUrl}?payment_status=cancel`;
      const callbackUrl = `${baseUrl}/api/moneyfusion/webhook`;
      
      // Mocking the call to Money Fusion but providing the structure they use
      const paymentUrl = `https://moneyfusion.net/pay?merchant_id=${merchantId}&amount=${price}&currency=${currency}&reference=${reference}&success_url=${encodeURIComponent(successUrl)}&error_url=${encodeURIComponent(cancelUrl)}&callback_url=${encodeURIComponent(callbackUrl)}`;

      console.log(`✅ [MoneyFusion] Payment URL générée : ${paymentUrl}`);
      res.json({ url: paymentUrl });
    } catch (error: any) {
      console.error("Money Fusion Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // KPay Webhooks & API
  app.post("/api/webhooks/kpay", express.json(), async (req, res) => {
    console.log("KPay Webhook received:", req.body);
    const { status, externalId, reference } = req.body;
    
    // Recover original orderId / subscriptionId from the suffixed unique transaction ID
    const originalExternalId = externalId && externalId.includes('__') ? externalId.split('__')[0] : externalId;
    
    const isSuccess = status === 'COMPLETED' || status === 'SUCCESSFUL' || status === 'SUCCESS' || status === 'paid';
    
    if (isSuccess && originalExternalId) {
      if (supabaseAdmin) {
        if (originalExternalId.includes(':')) {
          // ── SUBSCRIPTION PAYMENT ──
          const [restaurantId, planId] = originalExternalId.split(':');
          if (restaurantId && planId) {
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);

            // Fetch current settings to preserve them
            const { data: restData } = await supabaseAdmin
              .from('restaurants')
              .select('settings')
              .eq('id', restaurantId)
              .single();

            const currentSettings = restData?.settings || {};

            const { error: subError } = await supabaseAdmin
              .from('restaurants')
              .update({
                subscription_tier: planId,
                subscription_status: 'active',
                subscription_end_date: nextMonth.toISOString(),
                settings: {
                  ...currentSettings,
                  subscriptionStartDate: currentSettings.subscriptionStartDate || new Date().toISOString()
                }
              })
              .eq('id', restaurantId);

            if (subError) {
              console.error("KPay Webhook subscription update failed:", subError);
            } else {
              console.log(`[Webhook] Successfully activated subscription ${planId} for restaurant ${restaurantId}`);
              
              // Find restaurant name and owner profile to send email notification
              try {
                const { data: restaurant } = await supabaseAdmin
                  .from('restaurants')
                  .select('owner_id, name')
                  .eq('id', restaurantId)
                  .single();

                if (restaurant?.owner_id) {
                  const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('email, full_name, name')
                    .eq('id', restaurant.owner_id)
                    .single();

                  if (profile?.email && resend) {
                    const planNames: Record<string, string> = {
                      free: "Gratuit",
                      premium: "Premium Pro",
                      business: "Business Max",
                      enterprise: "Entreprise"
                    };
                    const planName = planNames[planId] || planId.toUpperCase();
                    
                    const emailHtml = `
                      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <div style="background: linear-gradient(135deg, #ea580c 0%, #ff7e33 100%); padding: 30px; text-align: center; color: white;">
                          <h1 style="margin: 0; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Forfait Activé 🎉</h1>
                          <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Votre restaurant ${restaurant.name} passe au niveau supérieur !</p>
                        </div>
                        <div style="padding: 30px; color: #1f2937; line-height: 1.6;">
                          <p style="font-size: 16px; margin-top: 0;">Bonjour <strong>${profile.full_name || profile.name || "Partenaire"}</strong>,</p>
                          <p>Nous vous confirmons l'activation de votre abonnement <strong>DashMeals Business</strong> suite à votre paiement Mobile Money.</p>
                          
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
                                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #111827;">${nextMonth.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                              </tr>
                            </table>
                          </div>
                          
                          <p>Toutes les fonctionnalités de votre forfait sont désormais actives sur votre tableau de bord partenaire.</p>
                          
                          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;" />
                          <p style="font-size: 12px; color: #6b7280; text-align: center; margin-bottom: 0;">L'équipe DashMeals Partner.</p>
                        </div>
                      </div>
                    `;

                    let toEmail = profile.email;
                    let subjectStr = `[DashMeals] Confirmation d'activation de votre forfait ${planName}`;
                    const isSandbox = process.env.RESEND_SANDBOX === 'true';
                    if (isSandbox) {
                      const verifiedEmail = "irmerveilkanku@gmail.com";
                      if (toEmail.toLowerCase() !== verifiedEmail.toLowerCase()) {
                        console.warn(`[Sandbox] Redirecting email from ${toEmail} to ${verifiedEmail}`);
                        toEmail = verifiedEmail;
                        subjectStr = `[SANDBOX FOR ${profile.email}] ${subjectStr}`;
                      }
                    }

                    await resend.emails.send({
                      from: "DashMeals <onboarding@resend.dev>",
                      to: toEmail,
                      subject: subjectStr,
                      html: emailHtml
                    });
                    console.log(`[Webhook] Subscription email sent successfully to ${toEmail}`);
                  }
                }
              } catch (subEmailErr) {
                console.error("Error sending sub confirmation email from webhook:", subEmailErr);
              }
            }
          }
        } else {
          // ── STANDARD ORDER PAYMENT ──
          try {
            const { data: order } = await supabaseAdmin
              .from('orders')
              .select('*')
              .eq('id', originalExternalId)
              .single();

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

              const { error: orderUpdateErr } = await supabaseAdmin
                .from('orders')
                .update({ 
                  paymentStatus: 'paid',
                  items: updatedItems
                })
                .eq('id', originalExternalId);

              if (orderUpdateErr) {
                console.error("KPay Webhook order update failed:", orderUpdateErr);
              } else {
                console.log(`[Webhook] Order ${originalExternalId} payment status successfully updated to 'paid'`);
              }

              // Send confirmation email to the customer
              let customerEmail = '';
              let customerName = '';
              
              if (Array.isArray(order.items) && order.items[0]) {
                customerEmail = order.items[0].customerEmail || '';
                customerName = order.items[0].customerName || '';
              }

              if (!customerEmail && order.user_id) {
                const { data: customerProfile } = await supabaseAdmin
                  .from('profiles')
                  .select('email, name, full_name')
                  .eq('id', order.user_id)
                  .single();
                if (customerProfile) {
                  customerEmail = customerProfile.email || '';
                  customerName = customerProfile.full_name || customerProfile.name || '';
                }
              }

              if (customerEmail && resend) {
                const itemsListHtml = order.items.map((item: any) => `
                  <li style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; list-style: none; display: flex; justify-content: space-between; font-size: 14px;">
                    <span><strong>${item.quantity}x</strong> ${item.name}</span>
                    <span style="font-weight: bold; color: #111827;">$${(item.price * item.quantity).toFixed(2)}</span>
                  </li>
                `).join('');

                const customerHtml = `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <div style="background-color: #ea580c; padding: 25px; text-align: center; color: white;">
                      <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Paiement Reçu ! 🍕</h1>
                      <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Commande #${externalId.slice(0, 8)} confirmée</p>
                    </div>
                    <div style="padding: 30px; color: #1f2937; line-height: 1.6;">
                      <p>Bonjour <strong>${customerName || "Client"}</strong>,</p>
                      <p>Votre paiement Mobile Money a bien été reçu et votre commande est maintenant confirmée par le restaurant.</p>
                      
                      <h3 style="color: #ea580c; font-size: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 25px;">Détails de votre commande</h3>
                      <ul style="padding: 0; margin: 0;">
                        ${itemsListHtml}
                      </ul>
                      
                      <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; padding-top: 15px; border-top: 1px solid #e5e7eb; margin-top: 15px;">
                        <span>Total payé:</span>
                        <span style="color: #ea580c;">$${(order.total_amount || order.totalAmount || 0).toFixed(2)}</span>
                      </div>
                      
                      <p style="margin-top: 25px;">Le restaurant commence la préparation de vos plats. Vous pouvez suivre la livraison en temps réel dans votre application.</p>
                      
                      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;" />
                      <p style="font-size: 11px; color: #9ca3af; text-align: center; margin-bottom: 0;">Merci d'avoir choisi DashMeals — Bon appétit !</p>
                    </div>
                  </div>
                `;

                let toEmail = customerEmail;
                let subjectStr = `[DashMeals] Confirmation de votre paiement - Commande #${externalId.slice(0, 8)}`;
                const isSandbox = process.env.RESEND_SANDBOX === 'true';
                if (isSandbox) {
                  const verifiedEmail = "irmerveilkanku@gmail.com";
                  if (toEmail.toLowerCase() !== verifiedEmail.toLowerCase()) {
                    console.warn(`[Sandbox] Redirecting order confirmation email from ${toEmail} to ${verifiedEmail}`);
                    toEmail = verifiedEmail;
                    subjectStr = `[SANDBOX FOR ${customerEmail}] ${subjectStr}`;
                  }
                }

                await resend.emails.send({
                  from: "DashMeals <onboarding@resend.dev>",
                  to: toEmail,
                  subject: subjectStr,
                  html: customerHtml
                });
                console.log(`[Webhook] Order success email sent to customer ${toEmail}`);
              }

              // Send email notification to the restaurant owner
              if (order.restaurant_id) {
                const { data: restaurant } = await supabaseAdmin
                  .from('restaurants')
                  .select('owner_id, name')
                  .eq('id', order.restaurant_id)
                  .single();

                if (restaurant?.owner_id) {
                  const { data: ownerProfile } = await supabaseAdmin
                    .from('profiles')
                    .select('email, full_name, name')
                    .eq('id', restaurant.owner_id)
                    .single();

                  if (ownerProfile?.email && resend) {
                    const itemsListHtml = order.items.map((item: any) => `
                      <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; list-style: none; font-size: 14px;">
                        <strong>${item.quantity}x</strong> ${item.name}
                      </li>
                    `).join('');

                    const restaurantHtml = `
                      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <div style="background-color: #ea580c; padding: 25px; text-align: center; color: white;">
                          <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Nouvelle Commande Payée ! 💸</h1>
                          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Restaurant: ${restaurant.name}</p>
                        </div>
                        <div style="padding: 30px; color: #1f2937; line-height: 1.6;">
                          <p>Bonjour <strong>${ownerProfile.full_name || ownerProfile.name || "Partenaire"}</strong>,</p>
                          <p>La commande <strong>#${externalId.slice(0, 8)}</strong> a été entièrement payée via Mobile Money.</p>
                          
                          <h3 style="color: #ea580c; font-size: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 25px;">Plats à préparer</h3>
                          <ul style="padding: 0; margin: 0;">
                            ${itemsListHtml}
                          </ul>
                          
                          <p style="margin-top: 25px; font-weight: bold;">Veuillez vous rendre sur votre tableau de bord partenaire pour confirmer la réception de la commande et commencer à la préparer.</p>
                          
                          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;" />
                          <p style="font-size: 11px; color: #9ca3af; text-align: center; margin-bottom: 0;">DashMeals Business — Votre allié croissance.</p>
                        </div>
                      </div>
                    `;

                    let toOwnerEmail = ownerProfile.email;
                    let subjectStr = `[DashMeals Partner] Nouvelle commande payée #${externalId.slice(0, 8)}`;
                    const isSandbox = process.env.RESEND_SANDBOX === 'true';
                    if (isSandbox) {
                      const verifiedEmail = "irmerveilkanku@gmail.com";
                      if (toOwnerEmail.toLowerCase() !== verifiedEmail.toLowerCase()) {
                        console.warn(`[Sandbox] Redirecting restaurant notification email from ${toOwnerEmail} to ${verifiedEmail}`);
                        toOwnerEmail = verifiedEmail;
                        subjectStr = `[SANDBOX FOR ${ownerProfile.email}] ${subjectStr}`;
                      }
                    }

                    await resend.emails.send({
                      from: "DashMeals <onboarding@resend.dev>",
                      to: toOwnerEmail,
                      subject: subjectStr,
                      html: restaurantHtml
                    });
                    console.log(`[Webhook] Paid order notification sent to restaurant owner ${toOwnerEmail}`);
                  }
                }
              }
            }
          } catch (orderErr) {
            console.error("Error processing order payment webhook:", orderErr);
          }
        }
      }
    }
    
    res.status(200).json({ message: 'Webhook received' });
  });

  app.post("/api/webhooks/deposits", express.json(), async (req, res) => {
    console.log("KPay Deposits Webhook received:", req.body);
    res.status(200).json({ message: 'Deposit webhook received' });
  });

  app.post("/api/webhooks/payouts", express.json(), async (req, res) => {
    console.log("KPay Payouts Webhook received:", req.body);
    res.status(200).json({ message: 'Payout webhook received' });
  });

  app.post("/api/webhooks/refunds", express.json(), async (req, res) => {
    console.log("KPay Refunds Webhook received:", req.body);
    res.status(200).json({ message: 'Refund webhook received' });
  });

  // Helper for safely fetching and parsing JSON from external APIs (KPay, etc.) without throwing SyntaxErrors on HTML responses
  const safeFetchJson = async (url: string, options?: RequestInit) => {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        console.warn(`[safeFetchJson] Response from ${url} was non-JSON (status ${response.status}):`, text.slice(0, 200));
        data = {
          error: `Réponse serveur non valide (${response.status})`,
          message: text.slice(0, 200) || response.statusText
        };
      }
      return { response, data, ok: response.ok };
    } catch (netErr: any) {
      console.error(`[safeFetchJson] Network error calling ${url}:`, netErr);
      return {
        response: { ok: false, status: 500 } as any,
        data: { error: netErr.message || "Erreur de connexion réseau vers le service de paiement" },
        ok: false
      };
    }
  };

  app.post(["/api/kpay/create-payment", "/api/kpay/create-payment/"], async (req, res) => {
    const { orderId, amount, currency = "USD", phoneNumber, provider, baseUrl: clientBaseUrl } = req.body;

    try {
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const baseUrl = "https://dashmeals-rdc.onrender.com";
        
      const successUrl = `${baseUrl}?payment_status=success&ref=${orderId}`;
      const cancelUrl = `${baseUrl}?payment_status=cancel&ref=${orderId}`;

      const apiKey = process.env.KPAY_API_KEY;
      const secretKey = process.env.KPAY_SECRET_KEY;

      const isUssdMode = !!(phoneNumber && provider);

      if (!apiKey || !secretKey) {
        console.warn("⚠️ [KPay] KPAY_API_KEY / KPAY_SECRET_KEY non configurés sur le serveur. Mode de démonstration actif.");
        return res.json({
          success: true,
          mode: isUssdMode ? "USSD" : "GATEWAY",
          url: `${baseUrl}?payment_status=success&ref=${orderId}&demo=true`,
          paymentId: "demo_kpay_" + Date.now(),
          status: "PENDING",
          message: "Mode démonstration KPay active (Clés d'API non configurées sur le serveur)"
        });
      }

      // Convert amount if currency is USD and KPay expects local currency (CDF / XAF)
      let finalAmount = amount;
      let appliedRate = 1;

      if (currency.toUpperCase() === "USD") {
        let exchangeRate = 2850; // default standard for RDC
        let foundCustomRate = false;

        // Try to fetch order specific exchange rate first
        if (orderId && !orderId.includes(":") && supabaseAdmin) {
          try {
            const { data: orderData } = await supabaseAdmin
              .from("orders")
              .select("exchange_rate")
              .eq("id", orderId)
              .maybeSingle();

            if (orderData?.exchange_rate) {
              exchangeRate = Number(orderData.exchange_rate);
              foundCustomRate = true;
              console.log(`[KPay] Taux de change spécifique à la commande trouvé : ${exchangeRate} CDF (Order: ${orderId})`);
            }
          } catch (err) {
            console.warn("[KPay] Impossible de récupérer le taux de l'ordre :", err);
          }
        }

        if (!foundCustomRate && supabaseAdmin) {
          try {
            const { data: settingsData } = await supabaseAdmin
              .from("app_settings")
              .select("value")
              .eq("id", "global")
              .single();
            if (settingsData?.value && typeof settingsData.value === "object") {
              const val = settingsData.value as any;
              if (val.payment_exchange_rate) {
                exchangeRate = Number(val.payment_exchange_rate);
                console.log(`[KPay] Récupération du taux de change global configuré par l'administrateur : ${exchangeRate} CDF`);
              }
            }
          } catch (err) {
            console.warn("[KPay] Impossible de récupérer le taux de change administrateur, repli sur 2850 CDF:", err);
          }
        }

        finalAmount = Math.round(amount * exchangeRate);
        appliedRate = exchangeRate;
        console.log(`[KPay] Conversion ${amount} USD -> ${finalAmount} CDF (taux appliqué: 1 USD = ${exchangeRate} CDF)`);
      } else {
        finalAmount = Math.round(amount);
      }

      // Normalize provider and phone number for KPay / pawaPay
      let resolvedProvider = provider;
      if (provider === "VODACOM_COD" || provider === "VODACOM") {
        resolvedProvider = "VODACOM_MPESA_COD";
      }

      let resolvedPhone = phoneNumber;
      if (phoneNumber) {
        let clean = String(phoneNumber).replace(/[^\d]/g, "");

        if (clean.startsWith("00243")) {
          clean = clean.substring(2);
        }

        if (clean.startsWith("2430")) {
          clean = "243" + clean.substring(4);
        } else if (clean.startsWith("0")) {
          clean = "243" + clean.substring(1);
        } else if (!clean.startsWith("243")) {
          clean = "243" + clean;
        }

        if (clean.startsWith("243") && clean.length > 12) {
          clean = clean.substring(0, 12);
        }

        resolvedPhone = clean;
      }

      // Generate a unique externalId to avoid KPay DUPLICATE_RESOURCE (Conflict) errors on retry
      const uniqueExternalId = `${orderId}__${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Prepare request payload with returnUrl and cancelUrl always included to prevent GATEWAY requirements errors
      const isUssdActive = !!(resolvedPhone && resolvedProvider);
      const payload: any = {
        amount: finalAmount,
        externalId: uniqueExternalId,
        description: `Paiement DashMeals #${orderId.includes(':') ? orderId.split(':')[1] : orderId}`,
        returnUrl: successUrl,
        cancelUrl: cancelUrl
      };

      if (isUssdActive) {
        payload.phoneNumber = resolvedPhone;
        payload.provider = resolvedProvider;
        console.log(`[KPay] USSD Mode Payment Init: ${resolvedProvider} on ${resolvedPhone} for amount ${finalAmount} (Return URL: ${successUrl})`);
      } else {
        console.log(`[KPay] GATEWAY Mode Payment Init for amount ${finalAmount} (Success URL: ${successUrl}, Cancel URL: ${cancelUrl})`);
      }

      let { response, data } = await safeFetchJson("https://admin.kpay.site/api/v1/payments/init", {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "X-Secret-Key": secretKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      console.log(`[KPay] Payments Init API response status: ${response.status}`, JSON.stringify(data));

      // Handle USSD mode requirement fallback if KPay rejects Gateway call because app is set to USSD mode in KPay dashboard
      const isUssdRequirementError = !response.ok && (
        (data.error && (String(data.error).includes("mode USSD") || String(data.error).includes("phoneNumber absent"))) ||
        (data.message && (String(data.message).includes("mode USSD") || String(data.message).includes("phoneNumber absent")))
      );

      if (isUssdRequirementError) {
        console.warn("⚠️ [KPay] L'application KPay est configurée en mode USSD. Réessai automatique avec paramètres USSD...");
        const fallbackPhone = (resolvedPhone && resolvedPhone.length === 12) ? resolvedPhone : "243810000001";
        const fallbackProvider = resolvedProvider || "VODACOM_MPESA_COD";
        const retryPayload = {
          ...payload,
          phoneNumber: fallbackPhone,
          provider: fallbackProvider
        };

        const { response: retryRes, data: retryData } = await safeFetchJson("https://admin.kpay.site/api/v1/payments/init", {
          method: "POST",
          headers: {
            "X-API-Key": apiKey,
            "X-Secret-Key": secretKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(retryPayload),
        });

        console.log(`[KPay Retry] USSD Mode API response status: ${retryRes.status}`, JSON.stringify(retryData));

        if (retryRes.ok && (retryData.id || retryData.reference)) {
          console.log(`✅ [KPay Retry] USSD initié avec succès (ID: ${retryData.id || retryData.reference})`);
          return res.json({
            success: true,
            mode: "USSD",
            paymentId: retryData.id || retryData.reference,
            status: retryData.status || "PENDING",
            message: retryData.message || "Paiement USSD initié. Veuillez valider le pop-up sur votre téléphone."
          });
        } else if (retryRes.ok && (retryData.gatewayUrl || retryData.url)) {
          const retryGatewayUrl = retryData.gatewayUrl || retryData.gateway_url || retryData.redirectUrl || retryData.url;
          return res.json({
            success: true,
            mode: "GATEWAY",
            url: retryGatewayUrl
          });
        } else {
          data = retryData;
          response = retryRes;
        }
      }

      if (!response.ok) {
        console.error("KPay API Error Response:", data);
        const errMsg = data.message || data.error || "Erreur lors de l'initialisation du paiement KPay";
        return res.status(400).json({ error: errMsg });
      }

      // Check all possible redirection keys in the KPay API response
      const resolvedGatewayUrl = data.gatewayUrl || data.gateway_url || data.redirectUrl || data.redirect_url || data.paymentUrl || data.payment_url || data.url;

      if (resolvedGatewayUrl) {
        console.log(`✅ [KPay] GATEWAY URL générée avec succès : ${resolvedGatewayUrl}`);
        res.json({ 
          success: true, 
          mode: "GATEWAY", 
          url: resolvedGatewayUrl 
        });
      } else if (isUssdActive && (data.id || data.reference)) {
        console.log(`✅ [KPay] USSD initié sans redirection directe (ID: ${data.id || data.reference})`);
        res.json({ 
          success: true, 
          mode: "USSD", 
          paymentId: data.id || data.reference, 
          status: data.status || "PENDING", 
          message: data.message || "Paiement en attente de validation USSD" 
        });
      } else {
        console.warn(`[KPay] API Response had no gateway URL or valid payment ID:`, data);
        res.json({
          success: true,
          mode: isUssdActive ? "USSD" : "GATEWAY",
          paymentId: data.id || data.reference || "kpay_" + Date.now(),
          status: "PENDING",
          message: "Paiement initié avec succès."
        });
      }
    } catch (error: any) {
      console.error("KPay Error:", error);
      res.status(500).json({ error: error.message || "Erreur serveur lors de la création du paiement" });
    }
  });

  app.get(["/api/kpay/payment-status/:id", "/api/kpay/payment-status/:id/"], async (req, res) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    try {
      if (!id || id.startsWith("demo_kpay_")) {
        return res.json({
          id: id || "demo",
          status: "COMPLETED",
          reference: id || "demo",
          message: "Transaction de démonstration réussie."
        });
      }

      const apiKey = process.env.KPAY_API_KEY;
      const secretKey = process.env.KPAY_SECRET_KEY;

      if (!apiKey || !secretKey) {
        return res.json({
          id,
          status: "COMPLETED",
          reference: id,
          message: "Mode démonstration (clés non configurées)."
        });
      }

      const { response, data } = await safeFetchJson(`https://admin.kpay.site/api/v1/payments/${id}`, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          "X-Secret-Key": secretKey,
        },
      });

      if (!response.ok) {
        console.warn("KPay Status Fetch Warning (Non-200 from KPay):", data);
        return res.json({
          id,
          status: "PENDING",
          message: data.message || data.error || "Paiement en attente de confirmation"
        });
      }

      res.json(data);
    } catch (error: any) {
      console.error("KPay Status Route Error:", error);
      res.json({
        id,
        status: "PENDING",
        message: "En cours de vérification..."
      });
    }
  });

  app.post("/api/email/send", checkRateLimit, async (req, res) => {
    if (!resend) {
      return res.status(500).json({ error: "Resend is not configured on the server" });
    }

    // Safety authorization validation
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn("⚠️ [Security] Unauthorized attempt to send-email API: Missing Authorization header");
        return res.status(401).json({ error: "Authentification requise pour envoyer cet e-mail." });
      }

      const token = authHeader.split(' ')[1];
      const standardAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpc3RncmFua2p4Y2FxeXBuY2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDQ0NzIsImV4cCI6MjA4NjcyMDQ3Mn0.ApIRZ1awMUn2bqX8fIR5z28_XeMPDDs3_dI6MEAGSgo';
      const clientToVerify = supabaseAdmin || createClient(supabaseUrl, standardAnonKey);
      
      const { data: { user: callingUser }, error: authError } = await clientToVerify.auth.getUser(token);
      
      if (authError || !callingUser) {
        console.warn("⚠️ [Security] Unauthorized attempt to send-email API: Invalid or expired token", authError);
        return res.status(403).json({ error: "Session invalide ou expirée." });
      }
    } catch (authExc: any) {
      console.error("⚠️ [Security] Authorization exception in send-email API:", authExc);
      return res.status(500).json({ error: "Erreur d'authentification serveur." });
    }

    let { to, subject, html, from = "DashMeals <onboarding@resend.dev>" } = req.body;

    // Resend Sandbox Restriction: Can only send to the verified email
    const verifiedEmail = "irmerveilkanku@gmail.com";
    const recipients = Array.isArray(to) ? to : [to];
    
    // Filter recipients or redirect to verified email in sandbox mode
    const isSandbox = process.env.RESEND_SANDBOX === 'true';
    if (isSandbox) {
      const hasUnverified = recipients.some(email => email.toLowerCase() !== verifiedEmail.toLowerCase());
      if (hasUnverified) {
        console.warn(`Resend Sandbox Mode: Redirecting email from ${to} to ${verifiedEmail}`);
        to = verifiedEmail;
        subject = `[SANDBOX FOR ${recipients.join(', ')}] ${subject}`;
      }
    }

    try {
      const { data, error } = await resend.emails.send({
        from,
        to,
        subject,
        html,
      });

      if (error) {
        console.error("Resend API Error:", error);
        // If it's a validation error related to recipients, we return a friendly message
        return res.status(400).json({ error });
      }

      res.json({ data });
    } catch (error: any) {
      console.error("Resend Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin user creation endpoint using service role (bypasses RLS & Auth limits)
  app.post("/api/admin/create-user", checkRateLimit, async (req, res) => {
    const { fullName, email, password, role, city, phone } = req.body;
    
    try {
      // Security Verification of Caller Identity via JWT Bearer Token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn("⚠️ [Security] Unauthorized attempt to create-user API: Missing Authorization header");
        return res.status(401).json({ error: "Authentification requise. Jeton de sécurité manquant." });
      }

      const token = authHeader.split(' ')[1];
      const standardAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpc3RncmFua2p4Y2FxeXBuY2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDQ0NzIsImV4cCI6MjA4NjcyMDQ3Mn0.ApIRZ1awMUn2bqX8fIR5z28_XeMPDDs3_dI6MEAGSgo';
      const clientToVerify = supabaseAdmin || createClient(supabaseUrl, standardAnonKey);
      
      const { data: { user: callingUser }, error: authError } = await clientToVerify.auth.getUser(token);
      
      if (authError || !callingUser) {
        console.warn("⚠️ [Security] Unauthorized attempt to create-user API: Invalid or expired token", authError);
        return res.status(403).json({ error: "Jeton de sécurité invalide ou expiré." });
      }

      const isOwnerByEmail = callingUser.email && callingUser.email.toLowerCase().trim() === 'irmerveilkanku@gmail.com';
      const hasAdminRole = callingUser.user_metadata?.role === 'superadmin';

      if (!isOwnerByEmail && !hasAdminRole) {
        console.warn(`⚠️ [Security] Unauthorized attempt to create-user API: User ${callingUser.email} lacks superadmin privileges.`);
        return res.status(403).json({ error: "Action interdite. Vous n'avez pas l'autorisation d'administrateur." });
      }

      if (supabaseAdmin) {
        console.log(`Creating user via Supabase Admin Auth API authorized by ${callingUser.email}...`);
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role,
            city,
            phone_number: phone
          }
        });
        
        if (error) throw error;
        
        if (data?.user) {
          const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
            id: data.user.id,
            role,
            full_name: fullName,
            city,
            phone_number: phone,
            email
          });
          
          if (profileError) {
            console.warn("Profile creation warning:", profileError);
          }
          
          return res.json({ success: true, user: data.user });
        }
      } else {
        console.log("No Supabase Admin client available. Using standard SignUp client fallback...");
        const standardAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpc3RncmFua2p4Y2FxeXBuY2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDQ0NzIsImV4cCI6MjA4NjcyMDQ3Mn0.ApIRZ1awMUn2bqX8fIR5z28_XeMPDDs3_dI6MEAGSgo';
        const tempClient = createClient(supabaseUrl, standardAnonKey, {
          auth: { persistSession: false }
        });
        
        const { data, error } = await tempClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role,
              city,
              phone_number: phone
            }
          }
        });
        
        if (error) throw error;
        
        if (data?.user) {
          const { error: profileError } = await tempClient.from('profiles').upsert({
            id: data.user.id,
            role,
            full_name: fullName,
            city,
            phone_number: phone,
            email
          });
          
          if (profileError) {
            console.warn("Profile creation warning (signUp fallback):", profileError);
          }
          
          return res.json({ success: true, user: data.user, fallbackInfo: "Created via client signup flow successfully" });
        }
      }
      
      res.status(400).json({ error: "Utilisateur non créé" });
    } catch (err: any) {
      console.error("Error creating user:", err);
      const errMsg = err.message || "";
      const isAlreadyRegistered = errMsg.includes("already registered") || errMsg.toLowerCase().includes("already registered") || errMsg.includes("already_registered") || errMsg.includes("already exists") || err.code === "user_already_exists";
      
      if (isAlreadyRegistered) {
        return res.status(400).json({ 
          success: false, 
          code: "user_already_registered", 
          error: "Cette adresse e-mail est déjà enregistrée sur DashMeals. Veuillez utiliser une autre adresse." 
        });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Explicit unauthenticated routes for Google OAuth Privacy Policy and Terms of Service requirements
  app.get(["/privacy", "/privacy.html"], (req, res) => {
    const isProd = process.env.NODE_ENV === "production";
    const dir = isProd ? path.join(process.cwd(), "dist") : path.join(process.cwd(), "public");
    res.sendFile(path.join(dir, "privacy.html"));
  });

  app.get(["/terms", "/terms.html"], (req, res) => {
    const isProd = process.env.NODE_ENV === "production";
    const dir = isProd ? path.join(process.cwd(), "dist") : path.join(process.cwd(), "public");
    res.sendFile(path.join(dir, "terms.html"));
  });

  app.get("/google89d4716ae4439c3c.html", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send("google-site-verification: google89d4716ae4439c3c.html");
  });

  // Navigation Route API endpoint for DashMeals Navigation Assistant
  app.post("/api/navigation/route", express.json(), async (req, res) => {
    try {
      const { user_lat, user_lng, restaurant_lat, restaurant_lng } = req.body || {};
      const uLat = Number(user_lat);
      const uLng = Number(user_lng);
      const rLat = Number(restaurant_lat);
      const rLng = Number(restaurant_lng);

      if (!uLat || !uLng || !rLat || !rLng || isNaN(uLat) || isNaN(uLng) || isNaN(rLat) || isNaN(rLng)) {
        return res.status(400).json({
          success: false,
          error: "Paramètres manquants ou invalides (user_lat, user_lng, restaurant_lat, restaurant_lng requis)."
        });
      }

      const routeResult = await calculateFullNavigationRoute(uLat, uLng, rLat, rLng);
      return res.json(routeResult);
    } catch (err: any) {
      console.error("❌ [Navigation Route API] Error:", err);
      return res.status(500).json({ success: false, error: err.message || "Erreur de calcul d'itinéraire." });
    }
  });

  app.get("/api/navigation/route", async (req, res) => {
    try {
      const { user_lat, user_lng, restaurant_lat, restaurant_lng } = req.query || {};
      const uLat = Number(user_lat);
      const uLng = Number(user_lng);
      const rLat = Number(restaurant_lat);
      const rLng = Number(restaurant_lng);

      if (!uLat || !uLng || !rLat || !rLng || isNaN(uLat) || isNaN(uLng) || isNaN(rLat) || isNaN(rLng)) {
        return res.status(400).json({
          success: false,
          error: "Paramètres manquants ou invalides (user_lat, user_lng, restaurant_lat, restaurant_lng requis)."
        });
      }

      const routeResult = await calculateFullNavigationRoute(uLat, uLng, rLat, rLng);
      return res.json(routeResult);
    } catch (err: any) {
      console.error("❌ [Navigation Route API GET] Error:", err);
      return res.status(500).json({ success: false, error: err.message || "Erreur de calcul d'itinéraire." });
    }
  });

  // SECURE GEMINI AI PROXY (Handles voice assistant, support, and business suggestions)
  app.post("/api/gemini", async (req, res) => {
    const { action, payload } = req.body;
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    // Helper for smart local voice command parsing
    const fallbackVoiceCommand = (commandStr: string, userRole: string) => {
      const lower = (commandStr || "").toLowerCase();
      if (userRole === "business") {
        if (lower.includes("prêt") || lower.includes("pret") || lower.includes("terminé") || lower.includes("prête")) {
          return { action: "update_status", status: "ready" };
        }
        if (lower.includes("prépar") || lower.includes("cuisine")) {
          return { action: "update_status", status: "preparing" };
        }
        if (lower.includes("menu") || lower.includes("plat")) {
          return { action: "navigation", view: "menu" };
        }
        if (lower.includes("vente") || lower.includes("chiffre") || lower.includes("stat")) {
          return { action: "navigation", view: "sales" };
        }
        if (lower.includes("commande")) {
          return { action: "navigation", view: "orders" };
        }
      } else {
        if (lower.includes("livré") || lower.includes("livre") || lower.includes("reçu")) {
          return { action: "update_status", status: "delivered" };
        }
        if (lower.includes("en cours") || lower.includes("route") || lower.includes("parti")) {
          return { action: "update_status", status: "delivering" };
        }
        if (lower.includes("arrivé") || lower.includes("arrive") || lower.includes("sur place")) {
          return { action: "update_status", status: "arrived" };
        }
        if (lower.includes("appeler") || lower.includes("appel") || lower.includes("client") || lower.includes("téléphone")) {
          return { action: "call_customer" };
        }
        if (lower.includes("itinéraire") || lower.includes("carte") || lower.includes("guidage")) {
          return { action: "navigate_to_customer" };
        }
      }
      return { action: "unknown" };
    };

    // Helper for smart local support response
    const fallbackSupportResponse = (userMsg: string, context?: any) => {
      const lower = (userMsg || "").trim().toLowerCase();
      
      if (!lower) {
        return "Bonjour ! Je suis l'assistant intelligent DashMeals RDC. Comment puis-je vous aider aujourd'hui ?";
      }

      // Identity / Bot questions
      if (lower.includes("qui es-tu") || lower.includes("es-tu un robot") || lower.includes("ia") || lower.includes("gemini") || lower.includes("intelligence artificielle")) {
        return "Je suis l'assistant virtuel intelligent de DashMeals RDC ! Mon rôle est de vous guider, de répondre à vos questions sur les commandes, la livraison à Kinshasa, Lubumbashi et Goma, et de vous aider avec les paiements M-Pesa, Orange, Airtel ou Carte.";
      }

      // Promotions, Discounts & Codes
      if (lower.includes("code") || lower.includes("promo") || lower.includes("coupon") || lower.includes("réduction") || lower.includes("remise") || lower.includes("rabais") || lower.includes("gratuit")) {
        return "Pour appliquer un code promo sur DashMeals RDC :\n1. Ajoutez vos plats préférés au panier.\n2. Sur la page d'encaissement, saisissez votre code dans le champ 'Code Promo'.\n3. La réduction s'appliquera instantanément sur votre total !";
      }

      // Recommendations & Suggestions
      if (lower.includes("conseil") || lower.includes("recommande") || lower.includes("suggère") || lower.includes("suggere") || lower.includes("meilleur") || lower.includes("idé") || lower.includes("faim") || lower.includes("plat") || lower.includes("manger")) {
        return "Voici quelques pépites très populaires sur DashMeals RDC :\n• Plats locaux : Poulet Mayo, Liboke de Capitaine, Ntaba grillé avec Fufu ou Kwanga\n• Fast-food : Shawarma, Pizzas garnies, Burgers artisanaux\n• Spécialités : Sambaza de Goma, Poisson Capitaine braisé\n\nParcourez notre catalogue depuis la page d'accueil pour voir la carte complète des restaurants à proximité !";
      }

      // Order Cancellation / Modification
      if (lower.includes("annul") || lower.includes("modifier") || lower.includes("changer") || lower.includes("supprimer") || lower.includes("erreur adresse")) {
        return "Pour modifier ou annuler une commande :\n• Si la commande est encore en attente : vous pouvez l'annuler directement dans la section 'Mes Commandes'.\n• Si la commande est déjà en préparation ou en cours de livraison : appelez d'urgence notre support client au +243 842 578 529 pour qu'un agent intervienne immédiatement auprès du restaurant et du livreur.";
      }

      // Contextual menu or restaurant mentions
      if (context?.restaurantName && (lower.includes("menu") || lower.includes("carte") || lower.includes("propose"))) {
        return `Voici les informations pour ${context.restaurantName} :\n• Plats & Tarifs : ${context.menu || "Consultez le menu interactif sur notre application"}\n• Vous pouvez ajouter des articles directement à votre panier !`;
      }

      // Greetings
      if (/^(bonjour|salut|hello|hi|hey|mbote|mambo|coucou|bonsoir|kikoo)/i.test(lower)) {
        return "Bonjour ! Comment puis-je vous aider aujourd'hui ? Posez-moi vos questions sur le choix des plats, les livraisons à Kinshasa/Lubumbashi/Goma ou les paiements Mobile Money (M-Pesa, Orange, Airtel).";
      }

      // Congolese dishes & food queries
      if (lower.includes("fufu") || lower.includes("poulet") || lower.includes("liboke") || lower.includes("makemba") || lower.includes("kwanga") || lower.includes("sambaza") || lower.includes("capitaine") || lower.includes("shawarma") || lower.includes("pizza") || lower.includes("burger") || lower.includes("repas") || lower.includes("nourriture")) {
        return "Pour déguster ce plat sur DashMeals RDC :\n1. Utilisez la barre de recherche en haut de l'écran ou filtrez par catégorie.\n2. Sélectionnez le restaurant partenaire de votre choix.\n3. Ajoutez votre plat au panier et validez la livraison chez vous !";
      }

      // Ordering process
      if (lower.includes("command") || lower.includes("acheter") || lower.includes("panier") || lower.includes("comment faire") || lower.includes("étape")) {
        return "Pour passer une commande sur DashMeals RDC :\n1. Choisissez votre restaurant préféré dans l'application.\n2. Ajoutez les plats au panier.\n3. Indiquez votre adresse de livraison exacte.\n4. Sélectionnez votre mode de paiement (M-Pesa, Orange Money, Airtel Money, Carte ou Cash).\n5. Validez et suivez votre livreur en temps réel !";
      }

      // Payment methods (M-Pesa, Airtel, Orange, Cash, Card)
      if (lower.includes("paie") || lower.includes("payer") || lower.includes("mpesa") || lower.includes("m-pesa") || lower.includes("airtel") || lower.includes("orange") || lower.includes("carte") || lower.includes("cash") || lower.includes("argent") || lower.includes("devise") || lower.includes("usd") || lower.includes("cdf")) {
        return "Nous acceptons plusieurs modes de paiement sécurisés en RDC :\n• Mobile Money : Vodacom M-Pesa, Airtel Money et Orange Money\n• Cartes bancaires : Visa & Mastercard\n• Espèces : Paiement Cash direct au livreur à la réception de votre repas.";
      }

      // Delivery zones & Cities
      if (lower.includes("ville") || lower.includes("zone") || lower.includes("kinshasa") || lower.includes("lubumbashi") || lower.includes("goma") || lower.includes("quartier") || lower.includes("adresse") || lower.includes("gombe") || lower.includes("ngaliema") || lower.includes("bandal") || lower.includes("limete") || lower.includes("lemba")) {
        return "DashMeals est opérationnel à :\n• Kinshasa (Gombe, Ngaliema, Kintambo, Limete, Lemba, Bandalungwa, Selembao, Matete, etc.)\n• Lubumbashi\n• Goma\n\nIndiquez votre quartier exact lors de la commande pour afficher la liste des restaurants disponibles près de chez vous.";
      }

      // Delivery time & fees
      if (lower.includes("temps") || lower.includes("délai") || lower.includes("delai") || lower.includes("heure") || lower.includes("frais") || lower.includes("prix") || lower.includes("tarif") || lower.includes("combien") || lower.includes("cout") || lower.includes("coût")) {
        return "• Temps de livraison : 25 à 40 minutes en moyenne.\n• Tarification livraison : Calculée automatiquement selon la distance GPS entre le restaurant et votre adresse.\n• Suivi en direct : Suivez votre livreur en temps réel sur la carte interactive !";
      }

      // Order tracking & status
      if (lower.includes("suiv") || lower.includes("statut") || lower.includes("où est") || lower.includes("ou est") || lower.includes("retard") || lower.includes("position") || lower.includes("reçu")) {
        return "Pour suivre votre commande en temps réel :\n1. Allez dans le menu 'Mes Commandes'.\n2. Sélectionnez votre commande en cours pour voir la carte de suivi du livreur.\n3. Vous trouverez également le bouton pour appeler directement le livreur.";
      }

      // Partner / Restaurant onboarding
      if (lower.includes("partenaire") || lower.includes("restaurant") || lower.includes("inscrire") || lower.includes("vendre") || lower.includes("pro") || lower.includes("gerant") || lower.includes("gérant")) {
        return "Restaurateurs, rejoignez DashMeals RDC !\n• Cliquez sur 'Espace Pro' dans le menu pour créer la fiche de votre établissement.\n• Ajoutez vos plats, gérez vos prix et recevez des commandes en continu.\n• Notre équipe partenaire est joignable au +243 842 578 529.";
      }

      // Delivery driver recruitment
      if (lower.includes("livreur") || lower.includes("recrutement") || lower.includes("job") || lower.includes("travail") || lower.includes("moto") || lower.includes("vélo") || lower.includes("postuler")) {
        return "Devenez livreur partenaire DashMeals !\n• Inscrivez-vous dans l'onglet 'Espace Livreur' de l'application.\n• Prérequis : Avoir une moto/vélo et un smartphone avec connexion internet.\n• Contact recrutement : +243 842 578 529.";
      }

      // Account & Login
      if (lower.includes("compte") || lower.includes("profil") || lower.includes("connexion") || lower.includes("connecter") || lower.includes("mot de passe") || lower.includes("email") || lower.includes("s'inscrire")) {
        return "Pour gérer votre compte DashMeals :\n• Ouvrez la section Profil (icône en haut de l'écran).\n• Vous pourrez y sauvegarder vos adresses récurrentes, consulter vos commandes passées et mettre à jour vos coordonnées.";
      }

      // Technical or Payment Transaction Errors ("ça ne passe pas", "bloqué", "erreur", "échec")
      if (lower.includes("passe pas") || lower.includes("marche pas") || lower.includes("fonctionne pas") || lower.includes("echec") || lower.includes("échec") || lower.includes("bloqu") || lower.includes("rejet") || lower.includes("invalide") || lower.includes("bug") || lower.includes("erreur")) {
        return "Si votre commande ou paiement rencontre un souci :\n1. Mobile Money : Assurez-vous d'avoir validé l'invite de saisie de votre code secret PIN sur votre téléphone et d'avoir le solde requis.\n2. Connexion : Vérifiez votre signal réseau (3G/4G/Wi-Fi).\n3. Mode secours : Choisissez 'Paiement Cash à la livraison'.\n\nSi le souci persiste, notre support vous assiste immédiatement par téléphone ou WhatsApp au +243 842 578 529 !";
      }

      // Customer support & disputes
      if (lower.includes("problème") || lower.includes("probleme") || lower.includes("rembours") || lower.includes("reclamation") || lower.includes("aide") || lower.includes("contact") || lower.includes("support") || lower.includes("numéro")) {
        return "Notre équipe d'assistance DashMeals est disponible 7j/7 :\n• Téléphone & WhatsApp : +243 842 578 529\n• Email : support@dashmeals-rdc.com\n• Réponse rapide assurée en moins de 15 minutes.";
      }

      // Opening hours
      if (lower.includes("horaire") || lower.includes("ouvert") || lower.includes("fermé") || lower.includes("ferme") || lower.includes("nuit") || lower.includes("dimanche")) {
        return "L'application DashMeals RDC est disponible 7 jours sur 7 de 08h00 à 23h00. Les livraisons dépendent des heures d'ouverture de chaque restaurant partenaire.";
      }

      // Default smart response that dynamically echoes their core topic concisely
      return `Concernant votre demande : "${userMsg}"\n\nJe suis l'assistant DashMeals RDC et je reste à votre disposition. Vous pouvez m'interroger sur nos menus, la livraison dans votre quartier, les modes de paiement (M-Pesa, Orange, Airtel, Carte) ou l'assistance sur une commande.\n\nBesoin d'une aide directe ? Contactez notre support 24/7 au +243 842 578 529 !`;
    };

    // Helper for smart local business insights
    const fallbackBusinessInsights = () => {
      return {
        insights: [
          {
            title: "Pic de Demande Estimé",
            description: "Les heures de pointe principales se situent entre 12h00-14h30 et 19h00-21h30. Préparez vos stocks à l'avance.",
            impact: "Élevé (+25% de rapidité)"
          },
          {
            title: "Plats Populaires & Menus",
            description: "Les formules repas avec boisson incluse et livraison rapide enregistrent le plus fort taux de réachat à Kinshasa.",
            impact: "Moyen (+15% de commandes)"
          },
          {
            title: "Fidélisation Clients",
            description: "Proposez une réduction de 10% sur la 5ème commande pour encourager la récurrence.",
            impact: "Élevé (Revenus récurrents)"
          }
        ]
      };
    };

    if (action === "calculateNavigationRoute") {
      const uLat = Number(payload?.user_lat ?? payload?.userLat ?? payload?.uLat ?? payload?.lat1 ?? -4.3025);
      const uLng = Number(payload?.user_lng ?? payload?.userLng ?? payload?.uLng ?? payload?.lng1 ?? 15.3040);
      const rLat = Number(payload?.restaurant_lat ?? payload?.restaurantLat ?? payload?.rLat ?? payload?.lat2 ?? -4.3200);
      const rLng = Number(payload?.restaurant_lng ?? payload?.restaurantLng ?? payload?.rLng ?? payload?.lng2 ?? 15.3100);

      const routeRes = await calculateFullNavigationRoute(uLat, uLng, rLat, rLng);
      return res.json({
        ...routeRes,
        formattedAssistantText: formatNavigationAssistantText(routeRes)
      });
    }

    if (action === "getSmartSupportResponse") {
      const { userMessage, context } = payload || {};
      
      // Extraction depuis le contexte
      let uLat = context?.userCoords?.lat ?? context?.userLocation?.latitude ?? context?.userLat;
      let uLng = context?.userCoords?.lng ?? context?.userLocation?.longitude ?? context?.userLng;
      let rLat = context?.restaurantCoords?.lat ?? context?.restaurantLocation?.latitude ?? context?.restaurantLat;
      let rLng = context?.restaurantCoords?.lng ?? context?.restaurantLocation?.longitude ?? context?.restaurantLng;

      if (userMessage && (userMessage.toLowerCase().includes("assistant de navigation") || userMessage.toLowerCase().includes("itinéraire") || (userMessage.includes("Latitude") && userMessage.includes("Longitude")))) {
        const latMatches = userMessage.match(/Latitude\s*:\s*([-\d.]+)/gi);
        const lngMatches = userMessage.match(/Longitude\s*:\s*([-\d.]+)/gi);
        if (latMatches && latMatches.length >= 2 && lngMatches && lngMatches.length >= 2) {
          uLat = parseFloat(latMatches[0].replace(/Latitude\s*:\s*/i, ''));
          uLng = parseFloat(lngMatches[0].replace(/Longitude\s*:\s*/i, ''));
          rLat = parseFloat(latMatches[1].replace(/Latitude\s*:\s*/i, ''));
          rLng = parseFloat(lngMatches[1].replace(/Longitude\s*:\s*/i, ''));
        }

        if (uLat !== undefined && uLng !== undefined && rLat !== undefined && rLng !== undefined &&
            !isNaN(Number(uLat)) && !isNaN(Number(uLng)) && !isNaN(Number(rLat)) && !isNaN(Number(rLng))) {
          const routeRes = await calculateFullNavigationRoute(Number(uLat), Number(uLng), Number(rLat), Number(rLng));
          return res.json({ text: formatNavigationAssistantText(routeRes) });
        }
      }
    }

    if (!apiKey) {
      console.warn("⚠️ [Gemini Server] GEMINI_API_KEY non configurée. Activation du mode de réponse intelligente locale.");
      if (action === "processVoiceCommand") {
        return res.json(fallbackVoiceCommand(payload?.command, payload?.role));
      }
      if (action === "getSmartSupportResponse") {
        return res.json({ text: fallbackSupportResponse(payload?.userMessage, payload?.context) });
      }
      if (action === "getBusinessInsights") {
        return res.json(fallbackBusinessInsights());
      }
      return res.status(400).json({ error: "Action inconnue" });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const modelName = "gemini-3.6-flash";

      const generateContentWithFallback = async (params: any) => {
        try {
          return await ai.models.generateContent(params);
        } catch (error: any) {
          console.warn(`⚠️ [Gemini Server] API call failed with model ${params.model}. Retrying with gemini-3.1-pro-preview... Error:`, error.message || error);
          
          await new Promise((resolve) => setTimeout(resolve, 1000));
          
          try {
            return await ai.models.generateContent({
              ...params,
              model: "gemini-3.1-pro-preview"
            });
          } catch (fallbackError: any) {
            console.error(`❌ [Gemini Server] Secondary model gemini-3.1-pro-preview also failed:`, fallbackError);
            throw fallbackError;
          }
        }
      };

      if (action === "processVoiceCommand") {
        const { command, role = "delivery" } = payload || {};
        try {
          const response = await generateContentWithFallback({
            model: modelName,
            contents: `Tu es l'assistant vocal de DashMeals en RDC.
            L'utilisateur actuel a le rôle : "${role}".
            Interprète cette commande vocale : "${command}"
            
            Retourne une action JSON précise.
            
            Si role="business" (restaurateur), actions possibles :
            - { "action": "update_status", "status": "preparing", "orderId": "..." }
            - { "action": "update_status", "status": "ready", "orderId": "..." }
            - { "action": "navigation", "view": "orders" | "menu" | "sales" }
            
            Si role="delivery" (livreur) :
            - { "action": "update_status", "status": "delivering" | "delivered" | "arrived" }
            - { "action": "call_customer" }
            - { "action": "navigate_to_customer" }
            
            Format de retour : { "action": "nom_action", "status": "optionnel", "orderId": "optionnel", "view": "optionnel" }
            Si non compris : { "action": "unknown" }`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                   action: { type: Type.STRING },
                   status: { type: Type.STRING },
                   orderId: { type: Type.STRING },
                   view: { type: Type.STRING }
                },
                required: ["action"]
              }
            }
          });
          return res.json(JSON.parse(response.text || "{}"));
        } catch (cmdErr) {
          console.warn("⚠️ [Gemini Server] Falling back to local voice parsing:", cmdErr);
          return res.json(fallbackVoiceCommand(command, role));
        }
      } 
      
      if (action === "getSmartSupportResponse") {
        const { userMessage, context } = payload || {};
        try {
          const response = await generateContentWithFallback({
            model: modelName,
            contents: `Tu es le support client de DashMeals, une app de livraison en RDC.
            Contexte de l'utilisateur : ${JSON.stringify(context)}
            Message de l'utilisateur : "${userMessage}"
            Réponds de manière polie, concise et utile en français. Utilise un ton amical.`,
          });
          return res.json({ text: response.text || fallbackSupportResponse(userMessage, context) });
        } catch (supErr) {
          console.warn("⚠️ [Gemini Server] Falling back to local support response:", supErr);
          return res.json({ text: fallbackSupportResponse(userMessage, context) });
        }
      }

      if (action === "getBusinessInsights") {
        const { orderHistory } = payload || {};
        try {
          const response = await generateContentWithFallback({
            model: modelName,
            contents: `Analyse cet historique de commandes pour un restaurant : ${JSON.stringify(orderHistory)}
            Fournis 3 conseils stratégiques (JSON) pour améliorer le business :
            - Prédiction des pics de demande
            - Suggestions de menu basées sur la popularité
            - Optimisation des stocks`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  insights: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        impact: { type: Type.STRING },
                      },
                      required: ["title", "description", "impact"],
                    },
                  },
                },
                required: ["insights"],
              },
            },
          });
          return res.json(JSON.parse(response.text || "{}"));
        } catch (bizErr) {
          console.warn("⚠️ [Gemini Server] Falling back to local business insights:", bizErr);
          return res.json(fallbackBusinessInsights());
        }
      }

      return res.status(400).json({ error: "Action inconnue" });
    } catch (error: any) {
      console.error("❌ [Gemini Server] General Error:", error);
      if (action === "processVoiceCommand") return res.json(fallbackVoiceCommand(payload?.command, payload?.role));
      if (action === "getSmartSupportResponse") return res.json({ text: fallbackSupportResponse(payload?.userMessage, payload?.context) });
      if (action === "getBusinessInsights") return res.json(fallbackBusinessInsights());
      return res.status(500).json({ error: error.message || "Erreur traitement IA." });
    }
  });

  // 404 handler for any unhandled /api routes to guarantee JSON response and prevent HTML fallback
  app.use("/api", (req, res) => {
    return res.status(404).json({ error: `Route API non trouvée: ${req.method} ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
