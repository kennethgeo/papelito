-- Papelito — Incremental Migration: 12-Month Retention & Exchange Lifecycle (2026-10-17)
-- Compatible with Neon Serverless Postgres (PG 15+) and PGlite
-- Adds terminal timestamp (closed_at) to public.exchanges with a conservative backfill
-- using now() so no existing closed exchange can be immediately purged upon migration.

ALTER TABLE public.exchanges
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Backfill conservador: para intercambios que ya estuvieran en estado terminal
-- ('finalizado' o 'cancelado') sin closed_at, se asigna now() al aplicar la migración
-- para iniciar el cómputo de 12 meses desde este momento sin borrar datos actuales.
UPDATE public.exchanges
SET closed_at = now()
WHERE status IN ('finalizado', 'cancelado')
  AND closed_at IS NULL;

UPDATE public.exchanges
SET closed_at = NULL
WHERE status NOT IN ('finalizado', 'cancelado')
  AND closed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exchanges_retention
  ON public.exchanges (status, closed_at)
  WHERE status IN ('finalizado', 'cancelado');
