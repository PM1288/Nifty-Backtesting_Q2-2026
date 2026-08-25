BEGIN;

CREATE TABLE IF NOT EXISTS __SCHEMA__.trade_comments (
  comment_id uuid PRIMARY KEY,
  trade_group_id uuid NOT NULL REFERENCES __SCHEMA__.trade_groups(trade_group_id) ON DELETE CASCADE,
  author_uid text NOT NULL,
  author_email text,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_comments_trade_created_idx
  ON __SCHEMA__.trade_comments(trade_group_id, created_at DESC, comment_id DESC);

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('008_admin_trade_comments')
ON CONFLICT DO NOTHING;

COMMIT;
