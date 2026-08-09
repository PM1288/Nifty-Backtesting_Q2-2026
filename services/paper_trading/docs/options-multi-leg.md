# Options and multi-leg groups

Every contract snapshot stores token, symbol, underlying, expiry, strike, right, lot size and multiplier. Lots are converted once to units. Group P&L is synchronous leg P&L less costs; percentage performance needs a positive governed denominator. Atomic entry requires synchronized bars. Partial leg closure leaves the group open; the group closure event is emitted once only when every leg is resolved. Missing settlement data must remain `AWAITING_SETTLEMENT`; no settlement price may be fabricated.
