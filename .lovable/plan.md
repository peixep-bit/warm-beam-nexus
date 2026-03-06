

## Plano: Regras de Taxas Dinâmicas (estilo Claude AI)

### Contexto
Atualmente as taxas (12% comissão e 2,7% transação) estão **hardcoded** no `ReconciliationDashboard.tsx`. O objetivo é torná-las configuráveis por marca/plataforma, armazenadas no banco de dados, e consumidas dinamicamente na conciliação.

### Mudanças

**1. Migração do banco de dados**
- Adicionar coluna `base_field` (text, default `'LiqPDV'`) na tabela `fee_rules` para indicar sobre qual valor a taxa incide.
- Adicionar coluna `marca` (text, nullable) na tabela `fee_rules` para vincular regras a marcas específicas.
- Inserir as duas regras default para "001 - IFOOD - DK Barra Funda":
  - Comissão iFood: percentual -12% sobre LiqPDV
  - Tx Transação iFood: percentual -2.7% sobre LiqPDV

**2. Atualizar `FeeRulesManager.tsx`**
- Adicionar campo "Base" (select: LiqPDV, ValorItens, etc.) no formulário de criação.
- Adicionar campo "Marca" (preenchido com marcas existentes dos imports).
- Exibir a base na tabela de listagem.

**3. Atualizar `ReconciliationDashboard.tsx`**
- Na aba **Conciliação**: buscar as `fee_rules` da marca selecionada e aplicar dinamicamente em vez dos 12% e 2,7% fixos. As colunas de taxa serão geradas a partir das regras cadastradas.
- Na aba **Regras**: exibir as regras do banco com nome, tipo, base e valor (igual à screenshot do Claude).

**4. Atualizar `calculo-conciliacao.ts`**
- Adicionar função `aplicarRegras(liqPDV, rules[])` que recebe o valor base e aplica cada regra percentual/fixa sequencialmente, retornando o valor conciliado final.

### Resultado
- Usuário cadastra regras na aba "Taxas" (já existente) com marca, nome, %, e base.
- A conciliação aplica automaticamente as regras da marca selecionada.
- Fácil adicionar novas marcas com taxas diferentes (ex: Rappi com 15%).

