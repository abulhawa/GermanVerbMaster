CREATE TYPE job_run_status AS ENUM ('running', 'success', 'failed');

CREATE TABLE background_job_runs (
    id SERIAL PRIMARY KEY,
    job_name TEXT NOT NULL,
    status job_run_status NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    duration_ms DOUBLE PRECISION,
    stats JSONB,
    error JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX background_job_runs_job_name_started_idx
    ON background_job_runs (job_name, started_at DESC);

CREATE INDEX background_job_runs_status_idx
    ON background_job_runs (status);
