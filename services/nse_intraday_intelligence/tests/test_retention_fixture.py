"""Run only against isolated retention_fixture PostgreSQL, never production."""
import os
import unittest
from unittest.mock import patch
from urllib.parse import urlparse
from nse_intraday_intelligence.retention import cleanup, MINUTE_TABLES
from nse_intraday_intelligence.db import get_conn

class RetentionFixture(unittest.TestCase):
    # Archival has separate tests. This fixture exercises the SQL deletion gate
    # after that prerequisite has completed, against a disposable database only.
    @patch("nse_intraday_intelligence.retention.archive_recent_sessions", return_value={"state": "COMPLETED"})
    def test_gate_and_idempotency(self, _archive):
        self.assertEqual(urlparse(os.environ['PG_DSN']).path, '/retention_fixture')
        with get_conn() as conn:
            conn.execute('CREATE SCHEMA nse_intraday')
            for name in MINUTE_TABLES:
                conn.execute(f'CREATE TABLE nse_intraday.{name}(trade_date date)')
                conn.execute(f"INSERT INTO nse_intraday.{name} VALUES(current_date-100),(current_date)")
            conn.commit()
        blocked=cleanup()
        self.assertEqual(sum(x['rows_deleted'] for x in blocked['tables'].values()),0)
        with get_conn() as conn:
            conn.execute("""INSERT INTO operations.retention_gate(relation_name,retain_from,expires_at,
                daily_coverage_verified,paper_evidence_verified,dependencies_verified,restore_verified,evidence_uri,approved_by)
                VALUES('nse_intraday.raw_security_1m',current_date-15,now()+interval '1 hour',true,true,true,true,'fixture','test')""")
            conn.commit()
        applied=cleanup()
        self.assertEqual(applied['tables']['nse_intraday.raw_security_1m']['rows_deleted'],1)
        repeated=cleanup()
        self.assertEqual(repeated['tables']['nse_intraday.raw_security_1m']['rows_deleted'],0)
        self.assertEqual(repeated['tables']['nse_intraday.raw_index_1m']['state'],'BLOCKED_UNVERIFIED')

if __name__=='__main__':unittest.main()
