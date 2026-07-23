import { ClaimedOffer, User, Restaurant, Promotion } from '../types';
import { supabase } from '../lib/supabase';

const LOCAL_STORAGE_KEY = 'dashmeals_claimed_offers';

// Utility to generate a unique short code like DM-8A92
export function generateOfferCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'DM-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get all claimed offers stored locally
export function getLocalClaimedOffers(): ClaimedOffer[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading local claimed offers:', err);
    return [];
  }
}

// Save claimed offers locally
function saveLocalClaimedOffers(offers: ClaimedOffer[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(offers));
    // Trigger custom event for reactivity across UI
    window.dispatchEvent(new Event('dashmeals_claimed_offers_updated'));
  } catch (err) {
    console.error('Error saving local claimed offers:', err);
  }
}

// Claim a new offer for a client
export async function claimOffer(params: {
  user: User;
  restaurant: Restaurant;
  promo?: Promotion;
  promoId?: string;
  title: string;
  caption?: string;
  badgeText?: string;
  promoPrice?: number;
  originalPrice?: number;
}): Promise<ClaimedOffer> {
  const { user, restaurant, promo, promoId, title, caption, badgeText, promoPrice, originalPrice } = params;

  // Generate unique code
  let code = generateOfferCode();
  const existingLocal = getLocalClaimedOffers();
  while (existingLocal.some(o => o.code === code)) {
    code = generateOfferCode();
  }

  const newOffer: ClaimedOffer = {
    id: 'claimed_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    code,
    userId: user.id || 'client_' + Date.now(),
    userName: user.name || 'Client DashMeals',
    userPhone: user.phoneNumber || '',
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    promoId: promoId || promo?.id,
    title: title || 'Offre Spéciale',
    caption: caption || '',
    badgeText: badgeText || 'OFFRE',
    promoPrice,
    originalPrice,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  // 1. Save locally
  const updatedLocal = [newOffer, ...existingLocal];
  saveLocalClaimedOffers(updatedLocal);

  // 2. Try inserting into Supabase
  try {
    const { error } = await supabase.from('claimed_offers').insert({
      id: newOffer.id,
      code: newOffer.code,
      user_id: newOffer.userId,
      user_name: newOffer.userName,
      user_phone: newOffer.userPhone,
      restaurant_id: newOffer.restaurantId,
      restaurant_name: newOffer.restaurantName,
      promo_id: newOffer.promoId,
      title: newOffer.title,
      caption: newOffer.caption,
      badge_text: newOffer.badgeText,
      promo_price: newOffer.promoPrice,
      original_price: newOffer.originalPrice,
      status: newOffer.status,
      created_at: newOffer.createdAt,
    });

    if (error) {
      console.warn('Supabase insert warning (falling back to local):', error.message);
    }
  } catch (err) {
    console.warn('Supabase insert error (using local storage):', err);
  }

  // 3. Send notification message to restaurant & client
  try {
    const messageContent = `🎟️ NOUVELLE OFFRE ACTIVÉE PAR UN CLIENT !
Client : ${newOffer.userName} (${newOffer.userPhone || 'Téléphone non précisé'})
Offre : ${newOffer.title} ${newOffer.badgeText ? `[${newOffer.badgeText}]` : ''}
CODE D'ACTIVATION : ${newOffer.code}
📌 Le client se présentera en restaurant avec ce code pour en bénéficier. Veuillez le valider dans votre Dashboard.`;

    // Send to restaurant chat/messages
    try {
      await supabase.from('messages').insert({
        id: 'msg_' + Date.now(),
        order_id: 'promo_' + newOffer.id,
        sender_id: user.id || 'system',
        content: messageContent,
        created_at: new Date().toISOString(),
        is_read: false,
      });
    } catch {
      // Ignore notification insertion errors
    }
  } catch (err) {
    // Non-blocking notification attempt
  }

  return newOffer;
}

// Fetch claimed offers for a specific user
export async function getUserClaimedOffers(userId: string): Promise<ClaimedOffer[]> {
  const local = getLocalClaimedOffers().filter(o => o.userId === userId);

  try {
    const { data, error } = await supabase
      .from('claimed_offers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const dbOffers: ClaimedOffer[] = data.map(d => ({
        id: d.id,
        code: d.code,
        userId: d.user_id,
        userName: d.user_name,
        userPhone: d.user_phone,
        restaurantId: d.restaurant_id,
        restaurantName: d.restaurant_name,
        promoId: d.promo_id,
        title: d.title,
        caption: d.caption,
        badgeText: d.badge_text,
        promoPrice: d.promo_price,
        originalPrice: d.original_price,
        status: d.status,
        createdAt: d.created_at,
        redeemedAt: d.redeemed_at,
      }));

      // Merge local and DB, preferring DB if exists
      const mergedMap = new Map<string, ClaimedOffer>();
      local.forEach(item => mergedMap.set(item.id, item));
      dbOffers.forEach(item => mergedMap.set(item.id, item));
      const mergedList = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      saveLocalClaimedOffers(mergedList);
      return mergedList;
    }
  } catch (err) {
    console.warn('Error fetching DB claimed offers:', err);
  }

  return local;
}

// Fetch claimed offers for a specific restaurant
export async function getRestaurantClaimedOffers(restaurantId: string): Promise<ClaimedOffer[]> {
  const local = getLocalClaimedOffers().filter(o => o.restaurantId === restaurantId);

  try {
    const { data, error } = await supabase
      .from('claimed_offers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const dbOffers: ClaimedOffer[] = data.map(d => ({
        id: d.id,
        code: d.code,
        userId: d.user_id,
        userName: d.user_name,
        userPhone: d.user_phone,
        restaurantId: d.restaurant_id,
        restaurantName: d.restaurant_name,
        promoId: d.promo_id,
        title: d.title,
        caption: d.caption,
        badgeText: d.badge_text,
        promoPrice: d.promo_price,
        originalPrice: d.original_price,
        status: d.status,
        createdAt: d.created_at,
        redeemedAt: d.redeemed_at,
      }));

      const mergedMap = new Map<string, ClaimedOffer>();
      local.forEach(item => mergedMap.set(item.id, item));
      dbOffers.forEach(item => mergedMap.set(item.id, item));
      const mergedList = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return mergedList;
    }
  } catch (err) {
    console.warn('Error fetching DB claimed offers for restaurant:', err);
  }

  return local;
}

// Find an offer by code for verification
export async function findOfferByCode(code: string, restaurantId?: string): Promise<{
  offer: ClaimedOffer | null;
  errorReason?: string;
}> {
  if (!code || !code.trim()) {
    return { offer: null, errorReason: 'Veuillez saisir un code.' };
  }

  const cleanCode = code.trim().toUpperCase();

  // Search local first
  const localOffers = getLocalClaimedOffers();
  let found = localOffers.find(o => o.code.toUpperCase() === cleanCode);

  // If not found in local, search DB
  if (!found) {
    try {
      const { data } = await supabase
        .from('claimed_offers')
        .select('*')
        .ilike('code', cleanCode)
        .maybeSingle();

      if (data) {
        found = {
          id: data.id,
          code: data.code,
          userId: data.user_id,
          userName: data.user_name,
          userPhone: data.user_phone,
          restaurantId: data.restaurant_id,
          restaurantName: data.restaurant_name,
          promoId: data.promo_id,
          title: data.title,
          caption: data.caption,
          badgeText: data.badge_text,
          promoPrice: data.promo_price,
          originalPrice: data.original_price,
          status: data.status,
          createdAt: data.created_at,
          redeemedAt: data.redeemed_at,
        };
      }
    } catch (err) {
      console.warn('Error querying DB for code:', err);
    }
  }

  if (!found) {
    return { offer: null, errorReason: `Aucune offre trouvée avec le code "${cleanCode}". Vérifiez la saisie.` };
  }

  if (restaurantId && found.restaurantId !== restaurantId) {
    return { 
      offer: found, 
      errorReason: `Attention : Ce code appartient à un autre établissement (${found.restaurantName}).` 
    };
  }

  return { offer: found };
}

// Redeem / Validate an offer code at the restaurant
export async function redeemOfferCode(code: string, restaurantId: string): Promise<{
  success: boolean;
  message: string;
  offer?: ClaimedOffer;
  updatedMenu?: any[];
}> {
  const { offer, errorReason } = await findOfferByCode(code, restaurantId);

  if (!offer) {
    return { success: false, message: errorReason || 'Code introuvable.' };
  }

  if (offer.restaurantId !== restaurantId) {
    return { success: false, message: `Ce code a été généré pour le restaurant "${offer.restaurantName}", il n'est pas valable ici.` };
  }

  if (offer.status === 'redeemed') {
    const redeemedDate = offer.redeemedAt 
      ? new Date(offer.redeemedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'récemment';
    return { 
      success: false, 
      message: `Ce code (${offer.code}) a DEJA été validé le ${redeemedDate} pour ${offer.userName}.`,
      offer 
    };
  }

  // Update offer to redeemed
  const redeemedAt = new Date().toISOString();
  const updatedOffer: ClaimedOffer = {
    ...offer,
    status: 'redeemed',
    redeemedAt,
  };

  // Update in local storage
  const localList = getLocalClaimedOffers();
  const index = localList.findIndex(o => o.id === offer.id);
  if (index >= 0) {
    localList[index] = updatedOffer;
  } else {
    localList.unshift(updatedOffer);
  }
  saveLocalClaimedOffers(localList);

  // Update in Supabase
  try {
    await supabase
      .from('claimed_offers')
      .update({
        status: 'redeemed',
        redeemed_at: redeemedAt,
      })
      .eq('id', offer.id);
  } catch (err) {
    console.warn('Error updating claimed_offer status in DB:', err);
  }

  // Deduct stock from restaurant menu item if matched
  let stockMessage = '';
  let finalUpdatedMenu: any[] | undefined = undefined;

  try {
    const { data: resto } = await supabase
      .from('restaurants')
      .select('menu')
      .eq('id', restaurantId)
      .maybeSingle();

    if (resto && Array.isArray(resto.menu)) {
      let stockDeducted = false;
      let matchedName = '';

      // Clean offer title for robust fuzzy title matching
      const cleanTargetName = (offer.title || '')
        .replace(/^cadeau\s*fidélité\s*:\s*/i, '')
        .replace(/^cadeau\s*:\s*/i, '')
        .replace(/^offre\s*spéciale\s*:\s*/i, '')
        .replace(/^récompense\s*:\s*/i, '')
        .replace(/\s*offert\s*/i, ' ')
        .replace(/\s*gratuit\s*/i, ' ')
        .trim()
        .toLowerCase();

      const newMenu = resto.menu.map((item: any) => {
        const itemNameClean = (item.name || '').toLowerCase().trim();

        const matchesId = offer.promoId && (
          offer.promoId === item.id || 
          offer.promoId === item.menu_item_id
        );

        const matchesTitle = cleanTargetName && (
          cleanTargetName === itemNameClean ||
          cleanTargetName.includes(itemNameClean) || 
          itemNameClean.includes(cleanTargetName)
        );

        if ((matchesId || matchesTitle) && !stockDeducted) {
          matchedName = item.name;
          stockDeducted = true;

          let currentStock = item.stock;
          if (typeof currentStock === 'string') {
            currentStock = parseInt(currentStock, 10);
          }

          if (typeof currentStock === 'number' && !isNaN(currentStock)) {
            const nextStock = Math.max(0, currentStock - 1);
            return {
              ...item,
              stock: nextStock,
              isAvailable: nextStock > 0 ? (item.isAvailable !== false) : false
            };
          } else {
            // If item stock was not set, set stock to 9 (assuming 10 starting stock) and keep available
            return {
              ...item,
              stock: 9,
              isAvailable: true
            };
          }
        }
        return item;
      });

      if (stockDeducted) {
        finalUpdatedMenu = newMenu;
        await supabase
          .from('restaurants')
          .update({ menu: newMenu })
          .eq('id', restaurantId);

        stockMessage = ` (Stock de "${matchedName}" déduit : -1)`;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dashmeals_menu_stock_updated', {
            detail: { restaurantId, itemName: matchedName, updatedMenu: newMenu }
          }));
        }
      }
    }
  } catch (err) {
    console.warn('Error updating menu stock on redemption:', err);
  }

  return {
    success: true,
    message: `🎉 Offre "${offer.title}" validée avec succès pour le client ${offer.userName} !${stockMessage}`,
    offer: updatedOffer,
    updatedMenu: finalUpdatedMenu
  };
}
