-- Create meal_reviews table
create table if not exists public.meal_reviews (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  menu_item_id uuid references public.menu_items(id) on delete cascade not null,
  rating int check (rating >= 1 and rating <= 5) not null,
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for meal_reviews
alter table public.meal_reviews enable row level security;

-- Policies for meal_reviews
DROP POLICY IF EXISTS "Public Read Meal Reviews" ON public.meal_reviews;
CREATE POLICY "Public Read Meal Reviews" ON public.meal_reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated Users Can Review Meals" ON public.meal_reviews;
CREATE POLICY "Authenticated Users Can Review Meals" ON public.meal_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users Can Update Own Meal Reviews" ON public.meal_reviews;
CREATE POLICY "Users Can Update Own Meal Reviews" ON public.meal_reviews FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users Can Delete Own Meal Reviews" ON public.meal_reviews;
CREATE POLICY "Users Can Delete Own Meal Reviews" ON public.meal_reviews FOR DELETE USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin'));

-- Ensure meal_reviews is in realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'meal_reviews'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE meal_reviews;
    END IF;
END $$;
