from __future__ import annotations

import base64
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    events: list[dict] = []

    def do_POST(self) -> None:  # noqa: N802
        expected = (
            "Basic "
            + base64.b64encode(f"{os.environ['MOCK_USER']}:{os.environ['MOCK_PASSWORD']}".encode()).decode()
        )
        if self.headers.get("Authorization") != expected:
            self.send_response(401)
            self.end_headers()
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        self.events.append(json.loads(body))
        self.send_response(202)
        self.end_headers()
        self.wfile.write(b'{"accepted":true}')

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/events":
            body = json.dumps(self.events).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.end_headers()

    def log_message(self, *_: object) -> None:
        return


ThreadingHTTPServer(("0.0.0.0", 8099), Handler).serve_forever()
