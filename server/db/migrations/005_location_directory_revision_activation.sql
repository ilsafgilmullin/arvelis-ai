CREATE TABLE travel_location_directory_active_revisions (
  source text NOT NULL,
  country_code char(2) NOT NULL,
  revision text NOT NULL,
  activated_at timestamptz NOT NULL,
  PRIMARY KEY (source, country_code),
  FOREIGN KEY (source, revision)
    REFERENCES travel_location_directory_revisions(source, revision) ON DELETE RESTRICT,
  CONSTRAINT travel_location_active_source CHECK (source IN ('geonames')),
  CONSTRAINT travel_location_active_country CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT travel_location_active_revision CHECK (revision ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$')
);

CREATE TABLE travel_location_directory_activation_audit (
  activation_id bigserial PRIMARY KEY,
  source text NOT NULL,
  country_code char(2) NOT NULL,
  revision text NOT NULL,
  previous_revision text,
  activated_at timestamptz NOT NULL,
  FOREIGN KEY (source, revision)
    REFERENCES travel_location_directory_revisions(source, revision) ON DELETE RESTRICT,
  FOREIGN KEY (source, previous_revision)
    REFERENCES travel_location_directory_revisions(source, revision) ON DELETE RESTRICT,
  CONSTRAINT travel_location_activation_audit_source CHECK (source IN ('geonames')),
  CONSTRAINT travel_location_activation_audit_country CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT travel_location_activation_audit_revision CHECK (revision ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$'),
  CONSTRAINT travel_location_activation_audit_previous CHECK (
    previous_revision IS NULL OR previous_revision ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$'
  ),
  CONSTRAINT travel_location_activation_audit_change CHECK (previous_revision IS NULL OR previous_revision <> revision)
);

CREATE INDEX travel_location_directory_activation_audit_lookup_idx
  ON travel_location_directory_activation_audit(source, country_code, activation_id DESC);
