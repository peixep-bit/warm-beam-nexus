
-- Add source_type to statement_items for easier filtering
ALTER TABLE public.statement_items ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'pdv';

-- Update existing items based on their import's source_type
UPDATE public.statement_items si
SET source_type = sim.source_type
FROM public.statement_imports sim
WHERE si.import_id = sim.id;
