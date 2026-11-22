-- Add round_off_paise column to orders table for integer-only round-half-up payable adjustments
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS round_off_paise bigint DEFAULT 0;
COMMENT ON COLUMN public.orders.round_off_paise IS 'Integer round-off in paise (+/-) to bring grossPayable to nearest rupee';
