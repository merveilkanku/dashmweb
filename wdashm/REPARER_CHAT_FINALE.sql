-- REPARATION DU CHAT ET DES POLITIQUES RLS (MESSAGES)
-- Exécutez ce script dans l'éditeur SQL de Supabase (Supabase > SQL Editor) pour réparer le chat.

-- 1. S'assurer que le type de order_id est text (pour pouvoir supporter les salons abonnés type 'sub-...')
ALTER TABLE public.messages ALTER COLUMN order_id TYPE TEXT USING order_id::text;

-- 2. S'assurer que la colonne recipient_id existe pour l'indexation directe si nécessaire
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='recipient_id') THEN
        ALTER TABLE public.messages ADD COLUMN recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Activer la sécurité RLS sur la table des messages
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;

-- 4. Supprimer toutes les anciennes politiques potentiellement restrictives ou conflictuelles
DROP POLICY IF EXISTS "Public Access Messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Recipient can mark as read" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages for their orders" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages for their orders" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can read own conversations" ON public.messages;
DROP POLICY IF EXISTS "Recipient can update messages" ON public.messages;
DROP POLICY IF EXISTS "Senders/Superadmins can delete messages" ON public.messages;

-- 5. Créer la politique de lecture robuste (SELECT)
-- Un utilisateur peut lire les messages s'il est l'expéditeur, le destinataire, ou s'il fait partie de la commande ou de l'abonnement
CREATE POLICY "Users can read own conversations" 
ON public.messages FOR SELECT 
USING (
  -- Cas 1: L'expéditeur du message
  auth.uid() = sender_id 
  
  -- Cas 2: Le destinataire du message (si défini)
  OR (recipient_id IS NOT NULL AND auth.uid() = recipient_id)
  
  -- Cas 3: Commande classique (order_id est un UUID valide)
  OR (
    order_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    AND (
      -- Le client qui a passé la commande
      auth.uid() IN (SELECT o.user_id FROM public.orders o WHERE o.id = order_id::uuid)
      -- Le livreur assigné à la commande
      OR auth.uid() IN (SELECT o.delivery_person_id FROM public.orders o WHERE o.id = order_id::uuid)
      -- Le propriétaire de l'établissement
      OR auth.uid() IN (
        SELECT r.owner_id 
        FROM public.restaurants r 
        JOIN public.orders o ON r.id = o.restaurant_id 
        WHERE o.id = order_id::uuid
      )
      -- Les membres du personnel (staff) de l'établissement
      OR auth.uid() IN (
        SELECT s.user_id 
        FROM public.staff_members s
        JOIN public.orders o ON s.restaurant_id = o.restaurant_id
        WHERE o.id = order_id::uuid
      )
    )
  )
  
  -- Cas 4: Discussion d'abonné direct (Format: sub-user_id-restaurant_id)
  -- Nous utilisons position(...) pour tester la présence de l'UUID pour supporter les tirets des UUIDs
  OR (
    order_id LIKE 'sub-%' 
    AND (
      -- L'utilisateur abonné lui-même
      position(auth.uid()::text in order_id) > 0
      -- Le propriétaire ou personnel du restaurant
      OR auth.uid() IN (
        SELECT owner_id 
        FROM public.restaurants 
        WHERE position(id::text in order_id) > 0
      )
      -- Les membres du personnel (staff) du restaurant
      OR auth.uid() IN (
        SELECT s.user_id 
        FROM public.staff_members s
        WHERE position(s.restaurant_id::text in order_id) > 0
      )
    )
  )
  
  -- Cas 5: Administrateur suprême ou accès de secours
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- 6. Créer la politique d'envoi robuste (INSERT)
CREATE POLICY "Users can send messages" 
ON public.messages FOR INSERT 
WITH CHECK (
  -- Tout le monde peut envoyer un message s'il est authentifié
  auth.uid() IS NOT NULL
);

-- 7. Créer la politique de mise à jour (UPDATE, e.g. marquer comme lu)
CREATE POLICY "Recipient can update messages" 
ON public.messages FOR UPDATE 
USING (
  auth.uid() = sender_id
  OR (recipient_id IS NOT NULL AND auth.uid() = recipient_id)
  -- Si c'est pour l'order, autoriser les parties prenantes
  OR (
    order_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    AND (
      auth.uid() IN (SELECT o.user_id FROM public.orders o WHERE o.id = order_id::uuid)
      OR auth.uid() IN (SELECT o.delivery_person_id FROM public.orders o WHERE o.id = order_id::uuid)
      OR auth.uid() IN (SELECT r.owner_id FROM public.restaurants r JOIN public.orders o ON r.id = o.restaurant_id WHERE o.id = order_id::uuid)
      OR auth.uid() IN (SELECT s.user_id FROM public.staff_members s JOIN public.orders o ON s.restaurant_id = o.restaurant_id WHERE o.id = order_id::uuid)
    )
  )
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- 8. Créer la politique de suppression (DELETE)
CREATE POLICY "Senders/Superadmins can delete messages" 
ON public.messages FOR DELETE 
USING (
  auth.uid() = sender_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com')
);

-- 9. Forcer la présence en temps réel pour la table des messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- 10. Recharger le schéma PostgREST
NOTIFY pgrst, 'reload schema';
