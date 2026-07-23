import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const PORT = 3000;

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

  app.post("/api/moneyfusion/create-payment", async (req, res) => {
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
                          <p>Nous vous confirmons l'activation de votre abonnement <strong>DashMeals Business</strong> suite à votre paiement KPay.</p>
                          
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
                      <p>Votre paiement KPay a bien été reçu et votre commande est maintenant confirmée par le restaurant.</p>
                      
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
                          <p>La commande <strong>#${externalId.slice(0, 8)}</strong> a été entièrement payée via KPay.</p>
                          
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

  app.post("/api/kpay/create-payment", async (req, res) => {
    const { orderId, amount, currency = "USD", phoneNumber, provider, baseUrl: clientBaseUrl } = req.body;

    try {
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const baseUrl = "https://dashmeals-rdc.onrender.com";
        
      const successUrl = `${baseUrl}?payment_status=success&ref=${orderId}`;
      const cancelUrl = `${baseUrl}?payment_status=cancel&ref=${orderId}`;

      const apiKey = process.env.KPAY_API_KEY;
      const secretKey = process.env.KPAY_SECRET_KEY;

      if (!apiKey || !secretKey) {
        throw new Error("Les clés d'API KPay ne sont pas configurées.");
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
        let clean = String(phoneNumber).replace(/\s+/g, "").replace(/-/g, "");
        if (clean.startsWith("+")) {
          clean = clean.substring(1);
        }
        if (clean.startsWith("0")) {
          clean = "243" + clean.substring(1);
        }
        if (!clean.startsWith("243") && clean.length === 9) {
          clean = "243" + clean;
        }
        resolvedPhone = clean;
      }

      // Generate a unique externalId to avoid KPay DUPLICATE_RESOURCE (Conflict) errors on retry
      const uniqueExternalId = `${orderId}__${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Prepare request payload with returnUrl and cancelUrl always included to prevent GATEWAY requirements errors
      const isUssdMode = !!(resolvedPhone && resolvedProvider);
      const payload: any = {
        amount: finalAmount,
        externalId: uniqueExternalId,
        description: `Paiement DashMeals #${orderId.includes(':') ? orderId.split(':')[1] : orderId}`,
        returnUrl: successUrl,
        cancelUrl: cancelUrl
      };

      if (isUssdMode) {
        payload.phoneNumber = resolvedPhone;
        payload.provider = resolvedProvider;
        console.log(`[KPay] USSD Mode Payment Init: ${resolvedProvider} on ${resolvedPhone} for amount ${finalAmount} (Return URL: ${successUrl})`);
      } else {
        console.log(`[KPay] GATEWAY Mode Payment Init for amount ${finalAmount} (Success URL: ${successUrl}, Cancel URL: ${cancelUrl})`);
      }

      const response = await fetch("https://admin.kpay.site/api/v1/payments/init", {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "X-Secret-Key": secretKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log(`[KPay] Payments Init API response status: ${response.status}`, JSON.stringify(data));

      if (!response.ok) {
        console.error("KPay API Error Response:", data);
        throw new Error(data.message || "Erreur lors de l'initialisation du paiement KPay");
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
      } else if (isUssdMode && data.id) {
        console.log(`✅ [KPay] USSD initié sans redirection directe (ID: ${data.id})`);
        res.json({ 
          success: true, 
          mode: "USSD", 
          paymentId: data.id, 
          status: data.status || "PENDING", 
          message: data.message || "Paiement en attente de validation USSD" 
        });
      } else {
        console.warn(`[KPay] API Response had no gateway URL or valid payment ID:`, data);
        throw new Error("L'API KPay n'a pas renvoyé d'URL de redirection ni de détails de transaction valides.");
      }
    } catch (error: any) {
      console.error("KPay Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/kpay/payment-status/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const apiKey = process.env.KPAY_API_KEY;
      const secretKey = process.env.KPAY_SECRET_KEY;

      if (!apiKey || !secretKey) {
        throw new Error("Les clés d'API KPay ne sont pas configurées.");
      }

      const response = await fetch(`https://admin.kpay.site/api/v1/payments/${id}`, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          "X-Secret-Key": secretKey,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("KPay Status Fetch Error:", data);
        throw new Error(data.message || "Impossible de récupérer le statut");
      }

      res.json(data);
    } catch (error: any) {
      console.error("KPay Status Route Error:", error);
      res.status(500).json({ error: error.message });
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

  // SECURE GEMINI AI PROXY (Handles voice assistant, support, and business suggestions)
  app.post("/api/gemini", async (req, res) => {
    const { action, payload } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ [Gemini Server] GEMINI_API_KEY is not configured on the server.");
      return res.status(503).json({ error: "Le service d'intelligence artificielle n'est pas configuré sur le serveur." });
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

      const modelName = "gemini-3.5-flash";

      const generateContentWithFallback = async (params: any) => {
        try {
          return await ai.models.generateContent(params);
        } catch (error: any) {
          console.warn(`⚠️ [Gemini Server] API call failed with model ${params.model}. Retrying/Falling back... Error:`, error.message || error);
          
          // Wait briefly
          await new Promise((resolve) => setTimeout(resolve, 1000));
          
          if (params.model === "gemini-3.5-flash") {
            try {
              console.log(`🔄 [Gemini Server] Falling back to stable model 'gemini-flash-latest'`);
              return await ai.models.generateContent({
                ...params,
                model: "gemini-flash-latest"
              });
            } catch (fallbackError: any) {
              console.error(`❌ [Gemini Server] Fallback model 'gemini-flash-latest' also failed:`, fallbackError);
              throw fallbackError;
            }
          }
          throw error;
        }
      };

      if (action === "processVoiceCommand") {
        const { command, role = "delivery" } = payload || {};
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
      } 
      
      if (action === "getSmartSupportResponse") {
        const { userMessage, context } = payload || {};
        const response = await generateContentWithFallback({
          model: modelName,
          contents: `Tu es le support client de DashMeals, une app de livraison en RDC.
          Contexte de l'utilisateur : ${JSON.stringify(context)}
          Message de l'utilisateur : "${userMessage}"
          Réponds de manière polie, concise et utile. Utilise un ton amical.`,
        });
        return res.json({ text: response.text || "Désolé, je ne peux pas répondre pour le moment." });
      }

      if (action === "getBusinessInsights") {
        const { orderHistory } = payload || {};
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
      }

      return res.status(400).json({ error: "Action inconnue" });
    } catch (error: any) {
      console.error("❌ [Gemini Server] Error:", error);
      return res.status(500).json({ error: error.message || "Erreur interne de traitement IA." });
    }
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
