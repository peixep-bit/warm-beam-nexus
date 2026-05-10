## Fase 1 — Divergências & Cancelamentos

Objetivo: substituir a planilha de auditoria manual por um fluxo automatizado que aponta sozinho **taxa cobrada a maior**, **pedido cancelado sem reembolso** e **repasse faltante** — com status de tratativa rastreável.

---

### 1. Modelo de dados (migração)

**Estender `statement_items`** com colunas operacionais:
- `order_status` text — `entregue | cancelado | parcial | chargeback` (default `entregue`)
- `divergencia_valor` numeric — diferença calculada vs. extrato real (positivo = a recuperar)
- `divergencia_tipo` text — `taxa_excedente | repasse_faltante | cancelamento_nao_reembolsado | nenhuma`
- `tratativa_status` text — `nao_tratado | em_contestacao | recuperado | perdido` (default `nao_tratado`)
- `tratativa_observacao` text
- `tratativa_atualizada_em` timestamptz

**Nova tabela `contestacoes`** (histórico/auditoria de cada ação tomada):
- vínculo ao pedido (`statement_item_id`), valor contestado, data abertura, data resolução, valor recuperado, anexo opcional (URL), observação
- RLS por `user_id`

### 2. Lógica de detecção (frontend, em `lib/`)

Novo módulo `lib/divergencias.ts` que, ao carregar pedidos, classifica automaticamente:
- **Taxa excedente**: `taxa_real_extrato > taxa_calculada_regras` → marca `taxa_excedente` com diferença
- **Repasse faltante**: pedido existe no PDV mas não tem `valor_liquido` no extrato → `repasse_faltante`
- **Cancelado sem reembolso**: `order_status = cancelado` mas houve dedução de taxa → `cancelamento_nao_reembolsado`
- Tolerância configurável (default R$ 0,05) para evitar falso positivo de arredondamento

### 3. UI — Nova aba "Divergências" no dashboard

Nova rota/aba `Divergências` ao lado de Conciliação:
- **4 KPIs no topo**: R$ a recuperar / Em contestação / Recuperado no mês / Pedidos cancelados sem reembolso
- **Tabela filtrável** por tipo, status de tratativa, marca, plataforma, período
- Cada linha: pedido, motivo, valor da divergência, botão **"Tratar"**
- Modal "Tratar divergência": muda status (`em_contestacao`/`recuperado`/`perdido`), adiciona observação, registra em `contestacoes`
- **Exportação CSV** da lista filtrada (substitui a planilha)

### 4. Integração com dashboard atual

- Adicionar badge "⚠ N divergências" no header do `ReconciliationDashboard`
- Na linha expandida do pedido (memória de cálculo), mostrar bloco "Divergência detectada" quando aplicável

### 5. Detalhes técnicos
- Migração inclui índices em `(user_id, divergencia_tipo)` e `(user_id, tratativa_status)` para performance
- Detecção roda client-side em batches respeitando o limite de 1000 registros por query
- Persistir `divergencia_*` no banco via update em lote após classificação (idempotente)
- Reaproveitar `aplicarRegras` de `calculo-conciliacao.ts` como fonte de verdade da taxa esperada
- Nenhuma quebra de tela existente — tudo aditivo

---

### Fora do escopo desta fase (próximas)
- Previsão de fluxo de caixa (Fase 2)
- Importação de POS / adquirentes (Fase 3)
- Perfis Operador/Gestor (Fase 4)

Aprovar para eu começar pela migração?