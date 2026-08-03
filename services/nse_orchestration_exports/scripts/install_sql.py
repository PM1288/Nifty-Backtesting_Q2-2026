from nse_orchestration_exports.logging_utils import configure_logging
from nse_orchestration_exports.sql_loader import install_sql

if __name__ == "__main__":
    configure_logging()
    install_sql()
