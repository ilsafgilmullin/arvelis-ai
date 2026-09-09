CREATE TABLE travel_trips (
  account_id text NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  id text NOT NULL,
  document_json jsonb NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY (account_id, id),
  CONSTRAINT travel_trips_id_length CHECK (char_length(id) BETWEEN 1 AND 128),
  CONSTRAINT travel_trips_document_object CHECK (jsonb_typeof(document_json) = 'object'),
  CONSTRAINT travel_trips_timestamps CHECK (created_at >= 0 AND updated_at >= created_at)
);

CREATE INDEX travel_trips_account_updated_idx
  ON travel_trips(account_id, updated_at DESC, id ASC);
