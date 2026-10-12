\set ON_ERROR_STOP on
SET lock_timeout='5s';
SET statement_timeout='30s';
\if :apply
\if :paper_only
\else
-- Foreign-key checks otherwise scan these child tables once per deleted
-- candidate. These small indexes preserve referential checks and bound cleanup.
CREATE INDEX IF NOT EXISTS retention_selection_auto_candidate_idx
 ON oiis_live.selection_run(auto_paper_candidate_id);
CREATE INDEX IF NOT EXISTS retention_watchlist_candidate_idx
 ON oiis_live.watchlist_item(candidate_id);
CREATE INDEX IF NOT EXISTS retention_candidate_change_candidate_idx
 ON oiis_live.candidate_run_change(candidate_id);
CREATE INDEX IF NOT EXISTS retention_oiss_source_candidate_idx
 ON oiss.candidate(source_oiis_candidate_id);
\endif
\endif
