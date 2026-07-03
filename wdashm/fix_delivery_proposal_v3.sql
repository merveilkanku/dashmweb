-- Script pour corriger l'assignation des livreurs et activer le statut d'acceptation
-- À exécuter dans l'éditeur SQL de Supabase

-- 1. Ajouter la colonne de statut d'acceptation si elle n'existe pas
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_acceptance_status text 
CHECK (delivery_acceptance_status IN ('pending', 'accepted', 'rejected')) 
DEFAULT 'pending';

-- 2. S'assurer que les colonnes de livreur existent
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_person_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS delivery_lat double precision,
ADD COLUMN IF NOT EXISTS delivery_lng double precision;

-- 3. Mettre à jour les types de notifications pour inclure les propositions de livraison
-- (Si une contrainte sur le type existe, on l'ajuste, sinon les inserts fonctionneront)

-- 4. Notifier PostgREST pour recharger le schéma
NOTIFY pgrst, 'reload schema';
