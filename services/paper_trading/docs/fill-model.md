# Fill model

Market orders use the first eligible bar strictly after order acceptance and its open. Limits require a post-order low/high crossing and receive the valid better open on gaps. Stops use the worse opening price when the market gaps through the stop. STOP_LIMIT requires both conditions. Atomic groups require all entry legs at the same eligible timestamp. OHLC cannot resolve target/adverse ordering inside one bar; the default execution policy is conservative worst case and diagnostics retain ambiguity.
