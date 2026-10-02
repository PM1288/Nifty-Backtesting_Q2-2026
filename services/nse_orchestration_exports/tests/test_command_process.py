import shlex
import sys
import time
import unittest
from nse_orchestration_exports.command_process import execute_command

class CommandProcessTests(unittest.TestCase):
    def test_output_is_bounded_and_decoded(self):
        command = shlex.join([sys.executable, "-c", "import sys;sys.stdout.write('x'*1000000+'done');sys.stderr.buffer.write(b'bad\\xff')"])
        code, stdout, stderr = execute_command(command, 5)
        self.assertEqual(code, 0)
        self.assertEqual(len(stdout), 8000)
        self.assertTrue(stdout.endswith("done"))
        self.assertIn("bad", stderr)

    def test_timeout_kills_shell_and_child_with_partial_output(self):
        command = shlex.join([sys.executable, "-c", "import time;print('started',flush=True);time.sleep(10)"])
        started = time.monotonic()
        code, stdout, stderr = execute_command(command, .2)
        self.assertEqual(code, -1)
        self.assertIn("started", stdout)
        self.assertIn("TIMEOUT", stderr)
        self.assertLess(time.monotonic()-started, 3)

if __name__ == "__main__": unittest.main()
