-- Single-installation model: one person, one phone, no accounts.
-- Records belong to a fixed installation id instead of an authenticated user.

ALTER TABLE public.work_sessions RENAME COLUMN user_id TO installation_id;
--> statement-breakpoint
ALTER TABLE public.work_sessions ALTER COLUMN installation_id DROP DEFAULT;
--> statement-breakpoint
UPDATE public.work_sessions SET installation_id = '00000000-0000-0000-0000-000000000001'::uuid;
--> statement-breakpoint
ALTER TABLE public.work_sessions ALTER COLUMN installation_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS duration_seconds integer GENERATED ALWAYS AS (
  CASE WHEN ended_at IS NULL THEN NULL
       ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (ended_at - started_at))))::integer
  END
) STORED;
--> statement-breakpoint
DROP POLICY IF EXISTS "own select" ON public.work_sessions;
--> statement-breakpoint
DROP POLICY IF EXISTS "own insert" ON public.work_sessions;
--> statement-breakpoint
DROP POLICY IF EXISTS "own update" ON public.work_sessions;
--> statement-breakpoint
DROP POLICY IF EXISTS "own delete" ON public.work_sessions;
--> statement-breakpoint
DROP INDEX IF EXISTS public.one_open_session_per_user;
--> statement-breakpoint
DROP INDEX IF EXISTS public.no_dup_start;
--> statement-breakpoint
DROP INDEX IF EXISTS public.work_sessions_user_started;
--> statement-breakpoint
CREATE UNIQUE INDEX one_open_session ON public.work_sessions(installation_id) WHERE ended_at IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX no_dup_start ON public.work_sessions(installation_id, started_at);
--> statement-breakpoint
CREATE INDEX work_sessions_started ON public.work_sessions(installation_id, started_at);
--> statement-breakpoint
REVOKE ALL ON public.work_sessions FROM anon;
--> statement-breakpoint
REVOKE ALL ON public.work_sessions FROM authenticated;
--> statement-breakpoint
GRANT ALL ON public.work_sessions TO service_role;
--> statement-breakpoint
DROP TABLE IF EXISTS public.user_settings;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.monthly_rates (
  installation_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  year integer NOT NULL,
  month integer NOT NULL,
  hourly_rate numeric(12,2),
  total_seconds integer NOT NULL DEFAULT 0,
  days_worked integer NOT NULL DEFAULT 0,
  session_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_rates_month_range CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT monthly_rates_pkey PRIMARY KEY (installation_id, year, month)
);
--> statement-breakpoint
ALTER TABLE public.monthly_rates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.monthly_rates FROM anon;
--> statement-breakpoint
REVOKE ALL ON public.monthly_rates FROM authenticated;
--> statement-breakpoint
GRANT ALL ON public.monthly_rates TO service_role;
--> statement-breakpoint
CREATE TRIGGER mr_touch BEFORE UPDATE ON public.monthly_rates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
