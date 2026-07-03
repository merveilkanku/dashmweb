-- SCRIPT DE RÉPARATION SUPARED (MAI 2026)
-- Ce script ajoute toutes les colonnes manquantes et répare les relations.
-- À exécuter dans le SQL Editor de Supabase (https://supabase.com/dashboard/project/_/sql)

DO $$ 
BEGIN
    -- 1. RÉPARATION DE LA TABLE ORDERS
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='exchange_rate') THEN
        ALTER TABLE public.orders ADD COLUMN exchange_rate double precision;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_location') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_location jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='proof_url') THEN
        ALTER TABLE public.orders ADD COLUMN proof_url text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_person_id') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_person_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_acceptance_status') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_acceptance_status text CHECK (delivery_acceptance_status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending';
    END IF;

    -- 2. RÉPARATION DE LA TABLE RESTAURANTS
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='restaurants' AND column_name='exchange_rate') THEN
        ALTER TABLE public.restaurants ADD COLUMN exchange_rate double precision DEFAULT 2800;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='restaurants' AND column_name='currency') THEN
        ALTER TABLE public.restaurants ADD COLUMN currency text DEFAULT 'USD';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='restaurants' AND column_name='display_currency_mode') THEN
        ALTER TABLE public.restaurants ADD COLUMN display_currency_mode text DEFAULT 'dual';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='restaurants' AND column_name='is_verified') THEN
        ALTER TABLE public.restaurants ADD COLUMN is_verified boolean DEFAULT false;
    END IF;

    -- 3. RÉPARATION DE LA TABLE MESSAGES (CHAT)
    -- S'assurer que order_id est de type TEXT
    ALTER TABLE public.messages ALTER COLUMN order_id TYPE TEXT;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='recipient_id') THEN
        ALTER TABLE public.messages ADD COLUMN recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    -- 4. RÉPARATION DES NOTIFICATIONS
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='restaurant_id') THEN
        ALTER TABLE public.notifications ADD COLUMN restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='type') THEN
        ALTER TABLE public.notifications ADD COLUMN type text;
    END IF;

    -- 5. RÉPARATION DE LA TABLE PROFILES (RLS)
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public Read Profiles" ON public.profiles;
    CREATE POLICY "Public Read Profiles" ON public.profiles FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Public Access Profiles" ON public.profiles;
    CREATE POLICY "Public Access Profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

    -- 6. RÉPARATION DE STAFF_MEMBERS (si elle existe)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='staff_members') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff_members' AND column_name='role') THEN
            ALTER TABLE public.staff_members ADD COLUMN role text;
        END IF;

        -- Fix relationship for joined queries (Join with profiles instead of auth.users for PostgREST)
        ALTER TABLE public.staff_members DROP CONSTRAINT IF EXISTS staff_members_user_id_fkey;
        ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

END $$;

-- Correction forcée de la contrainte de clé étrangère (Elle doit pointer vers PROFILES, pas staff_members)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_person_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_person_id_fkey 
FOREIGN KEY (delivery_person_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. RELAXATION DU RLS POUR LE DÉVELOPPEMENT
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Orders" ON public.orders;
CREATE POLICY "Public Access Orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Messages" ON public.messages;
CREATE POLICY "Public Access Messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Notifications" ON public.notifications;
CREATE POLICY "Public Access Notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Restaurants" ON public.restaurants;
CREATE POLICY "Public Access Restaurants" ON public.restaurants FOR ALL USING (true) WITH CHECK (true);

-- 6. ACTIVATION DU REALTIME
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
COMMIT;

NOTIFY pgrst, 'reload schema';
