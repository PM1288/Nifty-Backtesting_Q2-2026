# State machines

Validated states are defined in `src/papertrade/domain.py` and constrained in the schema. A closed group cannot reopen, quantities cannot overfill, target first hits are unique, and a group is fully closed only after every leg has zero remaining quantity. BUILDING groups accept legs only before commit. Close intents produce exit orders; receipt alone does not close a position.
