import json

import httpx

from ai_stock_research.whatsapp import send_message


def test_delivery_sends_only_the_research_message_with_idempotency() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-API-Token"] == "secret"
        assert request.headers["Idempotency-Key"] == "provider-1"
        assert json.loads(request.content) == {
            "chatId": "group@g.us",
            "message": "research output",
        }
        return httpx.Response(200, json={"ok": True})

    row = {
        "chat_id": "group@g.us",
        "message": "research output",
        "provider_evaluation_id": "provider-1",
        "delivery_id": "delivery-1",
    }
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        status, _, error, _ = send_message("https://gateway.test/send", "secret", row, client=client)
    assert status == 200 and error is None


def test_delivery_failure_returns_an_error_but_never_builds_an_error_message() -> None:
    with httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(530, text="gateway unavailable"))
    ) as client:
        status, excerpt, error, _ = send_message(
            "https://gateway.test/send",
            "secret",
            {
                "chat_id": "group@g.us",
                "message": "research output",
                "provider_evaluation_id": "provider-1",
                "delivery_id": "delivery-1",
            },
            client=client,
        )
    assert status == 530 and error == "HTTP_530"
    assert excerpt == "gateway unavailable"
