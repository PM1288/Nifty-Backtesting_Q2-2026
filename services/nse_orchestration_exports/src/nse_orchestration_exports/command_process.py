"""Bounded subprocess output and process-group cleanup for trusted operator jobs."""
from __future__ import annotations

import os
import signal
import subprocess
import threading


def execute_command(command: str, timeout_sec: float, tail_bytes: int = 8000) -> tuple[int, str, str]:
    """Shell syntax is supported only for configured operator commands, not API input."""
    tails = [bytearray(), bytearray()]
    with subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          start_new_session=True) as process:
        def read_tail(stream, buffer):
            try:
                while chunk := stream.read(4096):
                    buffer.extend(chunk)
                    if len(buffer) > tail_bytes:
                        del buffer[:-tail_bytes]
            finally:
                stream.close()

        readers = [threading.Thread(target=read_tail, args=(stream, tails[index]), daemon=True)
                   for index, stream in enumerate((process.stdout, process.stderr))]
        for reader in readers:
            reader.start()
        timed_out = False
        try:
            process.wait(timeout=timeout_sec)
        except subprocess.TimeoutExpired:
            timed_out = True
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
        # Descendants may inherit the pipes even after their parent exits.
        for reader in readers:
            reader.join(timeout=1)
        if any(reader.is_alive() for reader in readers):
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            for reader in readers:
                reader.join(timeout=1)
        stdout, stderr = (bytes(tail).decode("utf-8", errors="replace") for tail in tails)
        return (-1 if timed_out else process.returncode, stdout,
                (stderr + "\nTIMEOUT")[-tail_bytes:] if timed_out else stderr)
