-- Consulta de diagnóstico, SOMENTE LEITURA. Não é migração.
-- Resultado esperado: duas FKs de request_items para materials.
SELECT
  c.conname AS nome_da_relacao,
  pg_get_constraintdef(c.oid) AS definicao
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'request_items'
  AND c.contype = 'f'
  AND c.confrelid = 'public.materials'::regclass
ORDER BY c.conname;
