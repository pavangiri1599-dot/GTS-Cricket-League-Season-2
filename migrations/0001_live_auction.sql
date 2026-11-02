CREATE TABLE IF NOT EXISTS gts_auction_state (
  id integer PRIMARY KEY CHECK (id = 1),
  version integer NOT NULL CHECK (version >= 1),
  state jsonb NOT NULL
);
