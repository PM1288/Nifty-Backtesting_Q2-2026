from nifty_stratlab.cli import build_parser
from nifty_stratlab.v2_programme import COMMANDS, programme_audit


def test_every_v2_frozen_command_parses_help_without_external_access():
    parser = build_parser()
    assert sum(len(commands) for commands in COMMANDS.values()) == 49
    for phase, commands in COMMANDS.items():
        for command in commands:
            try:
                parser.parse_args([phase, command, "--help"])
            except SystemExit as exc:
                assert exc.code == 0, (phase, command)


def test_programme_audit_never_forges_owner_acceptance():
    audit = programme_audit()
    assert len(audit["criteria"]) == 50
    assert audit["programme_accepted"] is False
    assert all(row["owner_acceptance"] == "PENDING" for row in audit["criteria"])
    assert audit["counts"]["BLOCKED"] > 0
    assert audit["order_authority"] is False
