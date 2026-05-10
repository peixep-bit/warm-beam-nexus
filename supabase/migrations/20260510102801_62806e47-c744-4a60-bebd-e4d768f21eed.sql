
-- 1. Estender statement_items com campos operacionais
ALTER TABLE public.statement_items
  ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'entregue',
  ADD COLUMN IF NOT EXISTS divergencia_valor numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS divergencia_tipo text NOT NULL DEFAULT 'nenhuma',
  ADD COLUMN IF NOT EXISTS tratativa_status text NOT NULL DEFAULT 'nao_tratado',
  ADD COLUMN IF NOT EXISTS tratativa_observacao text,
  ADD COLUMN IF NOT EXISTS tratativa_atualizada_em timestamptz;

-- Índices para filtros rápidos
CREATE INDEX IF NOT EXISTS idx_statement_items_divergencia
  ON public.statement_items (user_id, divergencia_tipo);
CREATE INDEX IF NOT EXISTS idx_statement_items_tratativa
  ON public.statement_items (user_id, tratativa_status);
CREATE INDEX IF NOT EXISTS idx_statement_items_order_status
  ON public.statement_items (user_id, order_status);

-- 2. Tabela de contestações (histórico de ações)
CREATE TABLE IF NOT EXISTS public.contestacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  statement_item_id uuid NOT NULL,
  valor_contestado numeric NOT NULL DEFAULT 0,
  valor_recuperado numeric NOT NULL DEFAULT 0,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'em_contestacao',
  observacao text,
  anexo_url text,
  data_abertura timestamptz NOT NULL DEFAULT now(),
  data_resolucao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contestacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contestacoes"
  ON public.contestacoes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_contestacoes_user_status
  ON public.contestacoes (user_id, status);
CREATE INDEX IF NOT EXISTS idx_contestacoes_item
  ON public.contestacoes (statement_item_id);

-- 3. Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_contestacoes_updated_at ON public.contestacoes;
CREATE TRIGGER update_contestacoes_updated_at
  BEFORE UPDATE ON public.contestacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
