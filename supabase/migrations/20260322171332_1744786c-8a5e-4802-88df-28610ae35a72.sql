INSERT INTO fee_rules (name, type, platform_id, user_id, percentage, fixed_amount, description, base_field, marca)
VALUES
  ('Comissão 12%', 'comissao', '57099f44-323d-4009-88d9-e944a1e19275', '7b470f28-e56d-4e44-b2f3-f412d5994da4', 12, NULL, 'Comissão padrão iFood', 'ValorItens', NULL),
  ('Taxa Transação 2,7%', 'taxa', '57099f44-323d-4009-88d9-e944a1e19275', '7b470f28-e56d-4e44-b2f3-f412d5994da4', 2.7, NULL, 'Taxa de transação iFood', 'ValorItens', NULL),
  ('Comissão 12%', 'comissao', '329113ed-9e65-4ad0-ac9d-d897a2b5b919', '7b470f28-e56d-4e44-b2f3-f412d5994da4', 12, NULL, 'Comissão padrão 99Food', 'ValorItens', NULL);