-- REPARATION DEFINITIVE DE LA BASE DE DONNEES
-- Exécutez ce script dans l'éditeur SQL de Supabase pour régler les problèmes d'affichage des noms.

-- 1. Réparation de la table des profils et des permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;

-- Correction des contraintes de rôles trop restrictives qui font planter la synchronisation
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check1;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check2;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('client', 'business', 'delivery', 'superadmin', 'staff', 'guest'));

-- 2. S'assurer que tous les utilisateurs ont un profil (SANS DOUBLONS) ET ACTUALISER LEUR ROLE / VILLE
INSERT INTO public.profiles (id, email, full_name, role, city)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
    COALESCE(raw_user_meta_data->>'role', 'client'),
    COALESCE(raw_user_meta_data->>'city', 'Kinshasa')
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role, -- Met à jour le rôle si modifié dans auth (crucial pour le sous-admin !)
    city = EXCLUDED.city, -- Met à jour la ville
    full_name = COALESCE(profiles.full_name, EXCLUDED.full_name);

-- 2b. Mettre à jour la fonction RPC de synchronisation des utilisateurs pour l'actualisation des rôles
CREATE OR REPLACE FUNCTION public.sync_users_to_profiles()
RETURNS void AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, city)
  SELECT 
    id, 
    COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', 'Utilisateur'),
    email,
    CASE 
      WHEN email = 'irmerveilkanku@gmail.com' THEN 'superadmin'
      ELSE COALESCE(raw_user_meta_data->>'role', 'client')
    END,
    COALESCE(raw_user_meta_data->>'city', 'Kinshasa')
  FROM auth.users
  ON CONFLICT (id) DO UPDATE SET 
    email = EXCLUDED.email,
    role = EXCLUDED.role, -- Permet d'actualiser les rôles comme superadmin lors du clic sur le bouton "Sync" !
    city = EXCLUDED.city,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2c. Corriger le déclencheur pour les nouvelles inscriptions/comptes créés
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger as $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, city)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Utilisateur'),
    new.email,
    CASE 
      WHEN new.email = 'irmerveilkanku@gmail.com' THEN 'superadmin'
      ELSE COALESCE(new.raw_user_meta_data->>'role', 'client')
    END,
    COALESCE(new.raw_user_meta_data->>'city', 'Kinshasa')
  )
  ON CONFLICT (id) DO UPDATE SET 
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    city = EXCLUDED.city,
    full_name = COALESCE(excluded.full_name, profiles.full_name);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Correction des clés étrangères pour les jointures fluides
ALTER TABLE IF EXISTS public.reviews DROP CONSTRAINT IF EXISTS reviews_user_id_fkey;
ALTER TABLE IF EXISTS public.reviews ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.followers DROP CONSTRAINT IF EXISTS followers_user_id_fkey;
ALTER TABLE IF EXISTS public.followers ADD CONSTRAINT followers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.loyalty_points DROP CONSTRAINT IF EXISTS loyalty_points_user_id_fkey;
ALTER TABLE IF EXISTS public.loyalty_points ADD CONSTRAINT loyalty_points_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4. Nettoyage des RLS pour garantir l'accès en lecture aux profils
DROP POLICY IF EXISTS "Public Access Profiles" ON public.profiles;
CREATE POLICY "Public Access Profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Public Service Update Profiles" ON public.profiles FOR UPDATE USING (auth.uid() = id OR (auth.jwt() ->> 'email' = 'irmerveilkanku@gmail.com'));

-- 5. Forcer le rechargement du cache Supabase
NOTIFY pgrst, 'reload schema';
