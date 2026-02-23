
-- Add detailed breakdown columns to statement_items
ALTER TABLE public.statement_items
  ADD COLUMN IF NOT EXISTS incentivo_ifood numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incentivo_loja numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incentivo_rede numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_servico numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxas_comissoes numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_liquido_conciliado numeric DEFAULT 0;
