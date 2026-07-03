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

  // Supabase Admin Client for Webhooks (bypasses RLS if service role key is used)
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xistgrankjxcaqypncar.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

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

        const { error } = await supabaseAdmin
          .from('restaurants')
          .update({
            subscription_tier: planId,
            subscription_status: 'active',
            subscription_end_date: nextMonth.toISOString()
          })
          .eq('id', restaurantId);

        if (error) {
          console.error("Webhook Error updating database:", error);
        } else {
          console.log(`Webhook: Successfully updated restaurant ${restaurantId} via MoneyFusion`);
        }
      }
    }

    res.json({ received: true });
  });

  app.use(express.json());

  app.post("/api/moneyfusion/create-payment", async (req, res) => {
    const { planId, restaurantId, amount, currency = "USD" } = req.body;
    
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
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${req.get('host')}` 
      : `http://${req.get('host')}`;

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
