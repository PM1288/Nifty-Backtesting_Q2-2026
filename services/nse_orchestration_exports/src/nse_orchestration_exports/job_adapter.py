"""
Optional direct adapter layer.

By default the scheduler invokes shell commands from JOB_CMD_*.
If your integrated application already exposes Python callables, replace the shell command path
with direct function calls here and then call those functions from the scheduler.

This file is intentionally minimal so a coding agent can patch it without touching the rest of the package.
"""
