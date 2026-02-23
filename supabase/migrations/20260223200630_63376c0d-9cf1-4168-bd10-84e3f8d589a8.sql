
-- Add source_type to distinguish extrato vs pdv
ALTER TABLE public.statement_imports ADD COLUMN source_type text NOT NULL DEFAULT 'extrato';

-- Add marca (brand) to imports and items
ALTER TABLE public.statement_imports ADD COLUMN marca text;
ALTER TABLE public.statement_items ADD COLUMN marca text;
