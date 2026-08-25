from market_status.delivery import retryable_status


def test_retry_classification():
    for status in (408, 425, 429, 500, 503):
        assert retryable_status(status)
    for status in (400, 401, 403, 404, 409, 422):
        assert not retryable_status(status)
