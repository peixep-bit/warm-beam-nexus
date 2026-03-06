
ALTER TABLE public.fee_rules ADD COLUMN IF NOT EXISTS base_field text NOT NULL DEFAULT 'LiqPDV';
ALTER TABLE public.fee_rules ADD COLUMN IF NOT EXISTS marca text;
