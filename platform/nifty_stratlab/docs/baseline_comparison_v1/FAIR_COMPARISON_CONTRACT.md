# Fair Comparison Contract

A strategy comparison is valid for ranking only when all of the following match:

1. Data snapshot hash and admitted source files.
2. Point-in-time universe and universe hash.
3. Calendar/session version and bar timestamp semantics.
4. Date range and named stress windows.
5. Fee profile, execution model and slippage.
6. Ticket size, initial cash, maximum positions and cash rejection policy.
7. Missing-data, quality and corporate-action policies.
8. Worker result determinism and successful validation.

Each strategy receives an isolated portfolio with identical capital. Strategies must not compete for one shared cash pool in the primary comparison, because that would make results depend on strategy ordering. Shared-portfolio tests are a separate portfolio-construction experiment.

The UI must show an incompatibility banner and block ranking when the compatibility hash differs. It may display results side by side for diagnostic purposes, but it must not calculate a winner.
