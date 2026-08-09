# Event contracts

Events use a CloudEvents 1.0 structured envelope and immutable event ID, correlation ID, aggregate sequence, PAPER label and typed data. The common schema is `schemas/events/cloudevent-v1.schema.json`; tested examples are in `examples/events`. Multiple targets crossed by one bar are stored individually and delivered as one `newly_closed_target_tracks` event by default.
