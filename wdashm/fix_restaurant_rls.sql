-- Allow staff members to update the restaurant status, mainly is_open/is_online
DROP POLICY IF EXISTS "Owners can update their restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "Staff can update restaurant status" ON public.restaurants;

CREATE POLICY "Owners can update their restaurant" ON public.restaurants 
FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Staff can update restaurant status" ON public.restaurants 
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm 
    WHERE sm.restaurant_id = restaurants.id 
    AND sm.user_id = auth.uid() 
    AND sm.role IN ('admin', 'manager', 'cook')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff_members sm 
    WHERE sm.restaurant_id = restaurants.id 
    AND sm.user_id = auth.uid() 
    AND sm.role IN ('admin', 'manager', 'cook')
  )
);
