import { parseJsonResponse } from '../utils/fetch';

// AI Services for DashMeals
// Client-side requests are securely routed through our backend proxy at /api/gemini.

// 1. Assistant Vocal Multi-Rôles
export const processVoiceCommand = async (command: string, role: "business" | "delivery" | "user" = "delivery") => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'processVoiceCommand',
        payload: { command, role }
      })
    });

    return await parseJsonResponse(response);
  } catch (e) {
    console.error("AI Error:", e);
    return { action: "unknown" };
  }
};

// 2. Support Client Intelligent
export const getSmartSupportResponse = async (userMessage: string, context: any) => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getSmartSupportResponse',
        payload: { userMessage, context }
      })
    });

    const data = await parseJsonResponse(response);
    return data.text || "Désolé, je ne peux pas répondre pour le moment. Notre support reste joignable au +243 842 578 529.";
  } catch (e) {
    console.error("AI Error:", e);
    return "Le service d'assistance IA est temporairement indisponible. Notre équipe reste joignable au +243 842 578 529 ou par email à support@dashmeals-rdc.com.";
  }
};

// 3. Analyses Prédictives pour Restaurateurs
export const getBusinessInsights = async (orderHistory: any[]) => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getBusinessInsights',
        payload: { orderHistory }
      })
    });

    return await parseJsonResponse(response);
  } catch (e) {
    console.error("AI Error:", e);
    return null;
  }
};

