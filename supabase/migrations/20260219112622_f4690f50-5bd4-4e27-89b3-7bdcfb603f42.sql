
-- Plataformas de delivery
CREATE TABLE public.platforms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own platforms" ON public.platforms FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Regras de taxas por plataforma
CREATE TABLE public.fee_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_id UUID NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('taxa', 'desconto', 'repasse', 'comissao', 'promocao', 'outro')),
  percentage NUMERIC(6,4),
  fixed_amount NUMERIC(12,2),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own fee_rules" ON public.fee_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Importações de extratos
CREATE TABLE public.statement_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform_id UUID NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  total_bruto NUMERIC(12,2) DEFAULT 0,
  total_taxas NUMERIC(12,2) DEFAULT 0,
  total_descontos NUMERIC(12,2) DEFAULT 0,
  total_repasse NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processado', 'conciliado', 'divergente')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.statement_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own imports" ON public.statement_imports FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Itens individuais do extrato
CREATE TABLE public.statement_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.statement_imports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  data_transacao DATE NOT NULL,
  descricao TEXT,
  valor_bruto NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxa NUMERIC(12,2) DEFAULT 0,
  desconto NUMERIC(12,2) DEFAULT 0,
  valor_liquido NUMERIC(12,2) NOT NULL DEFAULT 0,
  numero_pedido TEXT,
  forma_pagamento TEXT,
  status TEXT DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.statement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own items" ON public.statement_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
