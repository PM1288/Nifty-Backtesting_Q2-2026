from __future__ import annotations

import socket
import subprocess
import uuid
from dataclasses import dataclass

from .db import execute
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


def _tail(text: str, limit: int = 8000) -> str:
    return text[-limit:] if len(text) > limit else text


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
        proc = subprocess.run(
            command_text,
            shell=True,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
        )
        finished = now_utc()
        duration_ms = int((finished - started).total_seconds() * 1000)
        status = "success" if proc.returncode == 0 else "failed"
        stdout_tail = _tail(proc.stdout or "")
        stderr_tail = _tail(proc.stderr or "")
        execute(
            """
            update nse_ops.job_run
            set status = %(status)s,
                finished_at = now(),
                duration_ms = %(duration_ms)s,
                exit_code = %(exit_code)s,
                stdout_tail = %(stdout_tail)s,
                stderr_tail = %(stderr_tail)s
            where run_id = %(run_id)s
            """,
            {
                "run_id": run_id,
                "status": status,
                "duration_ms": duration_ms,
                "exit_code": proc.returncode,
                "stdout_tail": stdout_tail,
                "stderr_tail": stderr_tail,
            },
        )
        return CommandResult(run_id=run_id, exit_code=proc.returncode, stdout_tail=stdout_tail, stderr_tail=stderr_tail, duration_ms=duration_ms)
    except subprocess.TimeoutExpired as exc:
        finished = now_utc()
        duration_ms = int((finished - started).total_seconds() * 1000)
        stderr_tail = _tail((exc.stderr or "") + "\nTIMEOUT")
        stdout_tail = _tail(exc.stdout or "")
        execute(
            """
            update nse_ops.job_run
            set status = 'timeout',
                finished_at = now(),
                duration_ms = %(duration_ms)s,
                exit_code = -1,
                stdout_tail = %(stdout_tail)s,
                stderr_tail = %(stderr_tail)s
            where run_id = %(run_id)s
            """,
            {
                "run_id": run_id,
                "duration_ms": duration_ms,
                "stdout_tail": stdout_tail,
                "stderr_tail": stderr_tail,
            },
        )
        return CommandResult(run_id=run_id, exit_code=-1, stdout_tail=stdout_tail, stderr_tail=stderr_tail, duration_ms=duration_ms)
