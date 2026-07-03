// AI Services for DashMeals
// Client-side calls are routed through our secure server proxy at /api/gemini 
// to avoid exposing our GEMINI_API_KEY to the client bundle.

// 1. Assistant Vocal Multi-Rôles
export const processVoiceCommand = async (command: string, role: "business" | "delivery" | "user" = "delivery") => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'processVoiceCommand',
        payload: { command, role }
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    return await response.json();
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getSmartSupportResponse',
        payload: { userMessage, context }
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    return data.text || "Désolé, je ne peux pas répondre pour le moment.";
  } catch (e) {
    console.error("AI Error:", e);
    return "Le service de support est temporairement indisponible.";
  }
};

// 3. Analyses Prédictives pour Restaurateurs
export const getBusinessInsights = async (orderHistory: any[]) => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getBusinessInsights',
        payload: { orderHistory }
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    return await response.json();
  } catch (e) {
    console.error("AI Error:", e);
    return null;
  }
};
