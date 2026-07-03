-- ====================================================================
-- DASHMEALS SECURITY & ROW LEVEL SECURITY (RLS) POLICIES AUDIT & SECURIZATION
-- ====================================================================
-- Ce script remplace les anciennes politiques trop permissives ("Passoire")
-- par des règles d'accès strictes basées sur le rôle et la propriété.
--
-- Exécutez ce script dans l'éditeur SQL de votre tableau de bord Supabase.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. SECURISATION DE LA TABLE PROFILES
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public Read Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Superadmin Access Profiles" ON public.profiles;

-- Tout utilisateur authentifié ou public peut lire les profils basiques (essentiel pour afficher les noms de livreurs, clients et restaurants)
CREATE POLICY "Public Read Profiles" 
ON public.profiles FOR SELECT 
USING (true);

-- Seul l'utilisateur lui-même peut insérer son propre profil
CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Seul l'utilisateur lui-même (ou un superadmin) peut modifier son profil
CREATE POLICY "Users/Admins can update own profile" 
ON public.profiles FOR UPDATE 
USING (
  auth.uid() = id 
  OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- Seul un superadmin peut supprimer un profil
CREATE POLICY "Only superadmins can delete profiles" 
ON public.profiles FOR DELETE 
USING (
  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);


-- --------------------------------------------------------------------
-- 2. SECURISATION DE LA TABLE RESTAURANTS
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Owners can update their restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "Owners and Admins can update restaurant" ON public.restaurants;

-- Lecture publique de tous les restaurants
CREATE POLICY "Public Read Restaurants" 
ON public.restaurants FOR SELECT 
USING (true);

-- Seuls les utilisateurs avec le rôle 'business' ou 'superadmin' peuvent ajouter un restaurant
CREATE POLICY "Business partners can insert restaurants" 
ON public.restaurants FOR INSERT 
WITH CHECK (
  auth.uid() = owner_id 
  AND (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('business', 'superadmin'))
    OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
  )
);

-- Seul le propriétaire du restaurant (owner_id) ou le superadmin peut modifier le restaurant
CREATE POLICY "Owners and Admins can update restaurants" 
ON public.restaurants FOR UPDATE 
USING (
  auth.uid() = owner_id 
  OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- Seul un superadmin ou le propriétaire actuel peut supprimer l'établissement
CREATE POLICY "Owners and Admins can delete restaurants" 
ON public.restaurants FOR DELETE 
USING (
  auth.uid() = owner_id 
  OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);


-- --------------------------------------------------------------------
-- 3. SECURISATION DE LA TABLE MENU_ITEMS (PLATS)
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Menu" ON public.menu_items;

-- Tout le monde peut voir les cartes/menus des restaurants
CREATE POLICY "Public Read Menu Items" 
ON public.menu_items FOR SELECT 
USING (true);

-- Seul le propriétaire du restaurant concerné peut insérer de nouveaux plats
CREATE POLICY "Owners can insert menu items" 
ON public.menu_items FOR INSERT 
WITH CHECK (
  EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  OR (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin'))
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- Seul le propriétaire ou admin peut modifier ou supprimer des plats
CREATE POLICY "Owners can update menu items" 
ON public.menu_items FOR UPDATE 
USING (
  EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  OR (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin'))
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

CREATE POLICY "Owners can delete menu items" 
ON public.menu_items FOR DELETE 
USING (
  EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  OR (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin'))
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);


-- --------------------------------------------------------------------
-- 4. SECURISATION DE LA TABLE ORDERS (COMMANDES) - CRITIQUE HAUTE
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view their related orders" ON public.orders;

-- SELECT : Accès restreint uniquement aux acteurs concernés par cette commande
CREATE POLICY "Secured Related Orders Select" 
ON public.orders FOR SELECT 
USING (
  -- Le client qui a passé la commande
  auth.uid() = user_id 
  -- Le livreur assigné à la commande
  OR auth.uid() = delivery_person_id 
  -- Le restaurant qui a reçu la commande
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  -- Tous les livreurs actifs pour leur permettre de voir les commandes en attente/prêtes
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('delivery', 'superadmin'))
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- INSERT : Seul le client lui-même peut passer une commande en son nom
CREATE POLICY "Clients can place their own orders" 
ON public.orders FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
);

-- UPDATE : Seuls le client (pour annulation), le restaurant (pour preparation) ou le livreur (pour livraison) peuvent modifier le statut de la commande
CREATE POLICY "Secured Related Orders Update" 
ON public.orders FOR UPDATE 
USING (
  auth.uid() = user_id 
  OR auth.uid() = delivery_person_id 
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
)
WITH CHECK (
  auth.uid() = user_id 
  OR auth.uid() = delivery_person_id 
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- DELETE : Personne ne peut supprimer les commandes historiques sauf le superadmin
CREATE POLICY "Only superadmins can delete orders" 
ON public.orders FOR DELETE 
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);


-- --------------------------------------------------------------------
-- 5. SECURISATION DE LA TABLE MESSAGES (COMMUNICATIONS CHAT)
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Recipient can mark as read" ON public.messages;

-- Un message ne peut être lu que par son expéditeur ou son destinataire (ou admin)
CREATE POLICY "Users can read own conversations" 
ON public.messages FOR SELECT 
USING (
  auth.uid() = sender_id 
  OR auth.uid() = recipient_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- Seul l'expéditeur authentifié peut insérer un message
CREATE POLICY "Users can send messages" 
ON public.messages FOR INSERT 
WITH CHECK (
  auth.uid() = sender_id
);

-- Seul le destinataire peut marquer un message comme "lu" ou modifier son état
CREATE POLICY "Recipient can update messages" 
ON public.messages FOR UPDATE 
USING (
  auth.uid() = recipient_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- Seul superadmin ou l'expéditeur peut supprimer un message
CREATE POLICY "Senders/Superadmins can delete messages" 
ON public.messages FOR DELETE 
USING (
  auth.uid() = sender_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);


-- --------------------------------------------------------------------
-- 6. SECURISATION DE LA TABLE REVIEWS (AVIS & NOTES)
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public Read Reviews" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated users can review" ON public.reviews;

-- Tout le monde peut lire les commentaires publics
CREATE POLICY "Public Read Reviews" 
ON public.reviews FOR SELECT 
USING (true);

-- Seul un utilisateur authentifié peut laisser un avis en son propre nom
CREATE POLICY "Users can compose reviews" 
ON public.reviews FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
);

-- Le compositeur de l'avis ou l'établissement (pour répondre) peut faire un update
CREATE POLICY "Creators or Restaurants can update reviews" 
ON public.reviews FOR UPDATE 
USING (
  auth.uid() = user_id 
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- Seul l'utilisateur ou superadmin peut supprimer un avis
CREATE POLICY "Creators and Admins can delete reviews" 
ON public.reviews FOR DELETE 
USING (
  auth.uid() = user_id 
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);


-- --------------------------------------------------------------------
-- 7. SECURISATION DE LA TABLE NOTIFICATIONS (NOTIFS SYSTEME)
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view relevant notifications" ON public.notifications;
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;

-- Seuls les utilisateurs destinataires ou propriétaires des restaurants concernés peuvent lire les notifications
CREATE POLICY "Users can read relevant notifications" 
ON public.notifications FOR SELECT 
USING (
  auth.uid() = user_id 
  OR (restaurant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = notifications.restaurant_id AND r.owner_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- N'importe quel élément de l'application (en passant commande, ou acceptation livreur) peut émettre une notification
CREATE POLICY "Anyone can insert notifications" 
ON public.notifications FOR INSERT 
WITH CHECK (true);

-- Seul le destinataire peut supprimer/marquer comme lu
CREATE POLICY "Users can modify their notifications" 
ON public.notifications FOR UPDATE 
USING (
  auth.uid() = user_id 
  OR (restaurant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = notifications.restaurant_id AND r.owner_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

CREATE POLICY "Users can delete their notifications" 
ON public.notifications FOR DELETE 
USING (
  auth.uid() = user_id 
  OR (restaurant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = notifications.restaurant_id AND r.owner_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);


-- --------------------------------------------------------------------
-- 8. SECURISATION DE LA TABLE PROMOTIONS (PUB & STORIES)
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Promotions" ON public.promotions;

-- Tout le monde lit les promos
CREATE POLICY "Public Read Promotions" 
ON public.promotions FOR SELECT 
USING (true);

-- Seul le resto concerné peut manipuler ses stories / promos
CREATE POLICY "Owners can manage promotions" 
ON public.promotions FOR ALL 
USING (
  EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);


-- --------------------------------------------------------------------
-- 9. SECURISATION DE LA TABLE CITIES
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Cities" ON public.cities;

-- Tout le monde lit les villes disponibles
CREATE POLICY "Public Read Cities" 
ON public.cities FOR SELECT 
USING (true);

-- Seul l'admin peut modifier la liste des villes prises en charge
CREATE POLICY "Admins can manage cities" 
ON public.cities FOR ALL 
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);


-- --------------------------------------------------------------------
-- 10. SECURISATION DE LA TABLE FOLLOWERS (ABONNÉS DES RESTOS)
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read followers" ON public.followers;
DROP POLICY IF EXISTS "Users can follow/unfollow" ON public.followers;

CREATE POLICY "Public Read Followers" 
ON public.followers FOR SELECT 
USING (true);

CREATE POLICY "Users can subscribe/unsubscribe" 
ON public.followers FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Envoi d'une notification de rechargement de schéma aux clients PostgREST
NOTIFY pgrst, 'reload schema';
