-- =============================================================
-- Fix: adiciona campos necessários para o módulo iFood
-- =============================================================

-- 1. platform_slug em statement_imports (causava o erro no save)
ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS platform_slug text;

-- Preenche retroativamente
UPDATE public.statement_imports si
SET platform_slug = LOWER(REPLACE(REPLACE(p.name, ' ', ''), '.', ''))
FROM public.platforms p
WHERE p.id = si.platform_id
  AND si.platform_slug IS NULL;

-- 2. Campos iFood em statement_items (para o novo parser)
ALTER TABLE public.statement_items
  ADD COLUMN IF NOT EXISTS id_completo_pedido text,
  ADD COLUMN IF NOT EXISTS id_curto_pedido    text,
  ADD COLUMN IF NOT EXISTS canal_venda        text,
  ADD COLUMN IF NOT EXISTS produto_logistico  text,
  ADD COLUMN IF NOT EXISTS turno              text,
  ADD COLUMN IF NOT EXISTS forma_entrega      text,
  ADD COLUMN IF NOT EXISTS valor_total_cliente numeric DEFAULT 0;

-- Índice para evitar duplicatas no reimport
CREATE INDEX IF NOT EXISTS idx_stmt_items_id_completo
  ON public.statement_items (user_id, id_completo_pedido)
  WHERE id_completo_pedido IS NOT NULL;

-- 3. divergencia_tipo precisa aceitar os novos valores do parser
-- (já existe como text, sem constraint — ok)

-- 4. order_status: garantir que 'cancelamento_parcial' é aceito
-- (coluna é text sem constraint — ok)
