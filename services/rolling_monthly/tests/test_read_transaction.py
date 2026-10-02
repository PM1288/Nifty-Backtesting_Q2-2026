from datetime import date
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch
from rolling_monthly import service


class ReadTransactionTests(TestCase):
    def test_monthly_releases_read_transaction_before_calculation(self):
        for method, evaluator in [
            (service.execute_absolute_months, "evaluate_absolute_months"),
            (service.execute_absolute_open_months, "evaluate_absolute_open_months"),
            (service.execute_absolute_first_sessions, "evaluate_absolute_first_sessions"),
        ]:
            conn = Mock()
            conn.__enter__ = Mock(return_value=conn)
            conn.__exit__ = Mock(return_value=False)
            run = {"evaluation_month": date(2026, 10, 1), "qualified_count": 1,
                   "eligible_setup_count": 1, "entered_scenario_count": 1}
            def evaluate(*args):
                conn.commit.assert_called_once()
                return SimpleNamespace(runs=[run], candidates=[])
            with patch.object(service.psycopg, "connect", return_value=conn), \
                 patch.object(service, "_absolute_month_frame", return_value=(Mock(), {"ONE"}, {}, [], date(2026,10,1))), \
                 patch.object(service, evaluator, side_effect=evaluate), \
                 patch.object(service, "_persist_absolute_months"), \
                 patch.object(service, "_persist_absolute_first_sessions"):
                method("unused", months=1)
