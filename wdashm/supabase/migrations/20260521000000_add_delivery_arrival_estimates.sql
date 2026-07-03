-- SQL Migration: Add estimated arrival times and delivery fee for delivery drivers
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS estimated_arrival_restaurant text,
ADD COLUMN IF NOT EXISTS estimated_arrival_customer text,
ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0;

-- Notify PostgREST to reload the schema and make new columns visible immediately
NOTIFY pgrst, 'reload schema';
