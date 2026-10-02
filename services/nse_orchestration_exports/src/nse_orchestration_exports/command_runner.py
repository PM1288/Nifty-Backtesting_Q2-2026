from __future__ import annotations

import socket
import uuid
from dataclasses import dataclass

from .db import execute
from .command_process import execute_command
from .logging_utils import get_logger
from .utils import now_utc

log = get_logger(__name__)


@dataclass
class CommandResult:
    run_id: str
    exit_code: int
    stdout_tail: str
    stderr_tail: str
    duration_ms: int


def run_logged_command(job_key: str, command_text: str, trigger_type: str, timeout_sec: int) -> CommandResult:
    run_id = str(uuid.uuid4())
    host_name = socket.gethostname()
    execute(
        """
        insert into nse_ops.job_run (run_id, job_key, trigger_type, host_name, status, command_text, requested_at, started_at)
        values (%(run_id)s, %(job_key)s, %(trigger_type)s, %(host_name)s, 'running', %(command_text)s, now(), now())
        """,
        {
            "run_id": run_id,
            "job_key": job_key,
            "trigger_type": trigger_type,
            "host_name": host_name,
            "command_text": command_text,
        },
    )
    started = now_utc()
    try:
        exit_code, stdout_tail, stderr_tail = execute_command(command_text, timeout_sec)
    except OSError as exc:
        # Record a failed run even when the operating system cannot start a child.
        # Avoid persisting command arguments or environment values in exception text.
        exit_code, stdout_tail, stderr_tail = 127, "", f"Process could not start (errno={exc.errno})"
    duration_ms = int((now_utc() - started).total_seconds() * 1000)
    status = "timeout" if exit_code == -1 else "success" if exit_code == 0 else "failed"
    execute(
        """
        update nse_ops.job_run
        set status = %(status)s, finished_at = now(), duration_ms = %(duration_ms)s,
            exit_code = %(exit_code)s, stdout_tail = %(stdout_tail)s, stderr_tail = %(stderr_tail)s
        where run_id = %(run_id)s
        """,
        {"run_id": run_id, "status": status, "duration_ms": duration_ms,
         "exit_code": exit_code, "stdout_tail": stdout_tail, "stderr_tail": stderr_tail},
    )
    return CommandResult(run_id=run_id, exit_code=exit_code, stdout_tail=stdout_tail,
                         stderr_tail=stderr_tail, duration_ms=duration_ms)
