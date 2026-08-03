from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ReportPattern:
    report_name: str
    parser_name: str
    regex: str


REPORT_PATTERNS = [
    ReportPattern("sec_bhavdata_full", "sec_bhavdata_full", r"^sec_bhavdata_full_\d{8}\.csv$"),
    ReportPattern("bhavcopy_udiff", "bhavcopy_udiff", r"^BhavCopy_NSE_CM_0_0_0_\d{8}_F_0000\.csv\.zip$"),
    ReportPattern("security_master", "security_master", r"^NSE_CM_security_\d{8}\.csv\.gz$"),
    ReportPattern("cmvolt", "cmvolt", r"^CMVOLT_\d{8}\.CSV$"),
    ReportPattern("market_activity", "market_activity", r"^MA\d{6}\.csv$"),
    ReportPattern("shortselling", "shortselling", r"^shortselling_\d{8}\.csv$"),
    ReportPattern("reg_ind", "reg_ind", r"^REG_IND\d{6}\.csv$"),
    ReportPattern("reg1_ind", "reg1_ind", r"^REG1_IND\d{6}\.csv$"),
    ReportPattern("high_low_52w", "high_low_52w", r"^CM_52_wk_High_low_\d{8}\.csv$"),
    ReportPattern("pr_zip", "pr_zip", r"^PR\d{6}\.zip$"),
    ReportPattern("margin_trading", "margin_trading", r"^mrg_trading_\d{6}\.zip$"),
    ReportPattern("var_margin", "var_margin", r"^C_VAR1_\d{8}_\d\.DAT$"),
    ReportPattern("bulk", "bulk", r"^bulk\.csv$"),
    ReportPattern("block", "block", r"^block\.csv$"),
]


def match_report(file_name: str) -> ReportPattern | None:
    for rp in REPORT_PATTERNS:
        if re.fullmatch(rp.regex, file_name, flags=re.IGNORECASE):
            return rp
    return None
