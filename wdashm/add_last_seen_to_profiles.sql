-- Script d'ajout de la colonne last_seen dans la table profiles pour le statut "En ligne (style Facebook)"

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen timestamp with time zone default timezone('utc'::text, now());

-- S'assurer que le profil est mis à jour si nécessaire
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role, city, last_seen)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Utilisateur'),
    new.email,
    'client',
    'Kinshasa',
    now()
  );
  return new;
end;
$$ language plpgsql security definer;
