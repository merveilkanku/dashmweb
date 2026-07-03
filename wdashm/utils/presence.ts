/**
 * Utilitaires pour gérer l'état de présence (style Facebook) des utilisateurs (Clients, Restaurants, Livreurs).
 */

/**
 * Détermine si un utilisateur est en ligne en se basant sur son "last_seen" timestamp.
 * Un utilisateur est considéré comme "en ligne" s'il a été actif durant les 60 dernières secondes.
 */
export const isUserOnline = (lastSeen: string | Date | null | undefined): boolean => {
  if (!lastSeen) return false;
  
  try {
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - lastSeenDate.getTime();
    
    // Si la différence est inférieure à 60 secondes (60 000 ms), on considère comme en ligne.
    // Les timestamps futurs (diffMs < 0) signifient que l'utilisateur est en ligne mais son horloge (ou celle du serveur) est en avance.
    return diffMs <= 60000;
  } catch (err) {
    console.error("Error parsing lastSeen date:", err);
    return false;
  }
};

/**
 * Formate la date de dernière connexion de l'utilisateur de manière conviviale.
 */
export const formatLastSeen = (lastSeen: string | Date | null | undefined): string => {
  if (!lastSeen) return "Hors ligne";
  
  if (isUserOnline(lastSeen)) {
    return "En ligne";
  }
  
  try {
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - lastSeenDate.getTime()); // clamp to 0 minimum to avoid negative
    
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);
    
    if (diffMin < 1) {
      return "En ligne il y a moins d'une minute";
    }
    if (diffMin < 60) {
      return `En ligne il y a ${diffMin} min`;
    }
    if (diffHr < 24) {
      return `En ligne il y a ${diffHr} h`;
    }
    if (diffDays === 1) {
      return "En ligne hier";
    }
    if (diffDays < 7) {
      return `En ligne il y a ${diffDays} j`;
    }
    
    return `Dernière connexion : ${lastSeenDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  } catch (err) {
    return "Hors ligne";
  }
};
