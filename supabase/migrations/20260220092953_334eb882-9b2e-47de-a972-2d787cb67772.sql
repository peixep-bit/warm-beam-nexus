
-- Adicionar campos de conciliação detalhada em statement_items
ALTER TABLE public.statement_items
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS loja text,
  ADD COLUMN IF NOT EXISTS quantidade_pedidos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_pdv numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_taxa_entrega numeric DEFAULT 0;

-- Adicionar campo cnpj/loja no statement_imports para identificação
ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS loja text;
