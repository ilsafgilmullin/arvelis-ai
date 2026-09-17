CREATE TABLE travel_location_directory_revisions (
  source text NOT NULL,
  revision text NOT NULL,
  country_code char(2) NOT NULL,
  source_modified_date date NOT NULL,
  retrieved_at timestamptz NOT NULL,
  source_fingerprint char(64) NOT NULL,
  license text NOT NULL,
  attribution_url text NOT NULL,
  PRIMARY KEY (source, revision),
  CONSTRAINT travel_location_revisions_source CHECK (source IN ('geonames')),
  CONSTRAINT travel_location_revisions_revision CHECK (revision ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$'),
  CONSTRAINT travel_location_revisions_country CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT travel_location_revisions_fingerprint CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT travel_location_revisions_license CHECK (char_length(license) BETWEEN 1 AND 80 AND license = btrim(license)),
  CONSTRAINT travel_location_revisions_attribution CHECK (char_length(attribution_url) BETWEEN 1 AND 240 AND attribution_url ~ '^https://'),
  CONSTRAINT travel_location_revisions_time CHECK (retrieved_at::date >= source_modified_date)
);

CREATE TABLE travel_location_identities (
  source text NOT NULL,
  external_source_id text NOT NULL,
  location_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, external_source_id),
  UNIQUE (source, external_source_id, location_id),
  CONSTRAINT travel_location_identities_source CHECK (source IN ('geonames')),
  CONSTRAINT travel_location_identities_external_id CHECK (
    char_length(external_source_id) BETWEEN 1 AND 120 AND external_source_id = btrim(external_source_id)
  ),
  CONSTRAINT travel_location_identities_location_id CHECK (
    location_id ~ '^arvelis:location:[A-Za-z0-9][A-Za-z0-9._:-]*$' AND char_length(location_id) <= 96
  )
);

CREATE TABLE travel_location_records (
  source text NOT NULL,
  source_revision text NOT NULL,
  external_source_id text NOT NULL,
  location_id text NOT NULL,
  display_name text NOT NULL,
  location_type text NOT NULL,
  country_code char(2) NOT NULL,
  region text,
  timezone text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  population bigint NOT NULL,
  PRIMARY KEY (source, source_revision, external_source_id),
  FOREIGN KEY (source, source_revision)
    REFERENCES travel_location_directory_revisions(source, revision) ON DELETE RESTRICT,
  FOREIGN KEY (source, external_source_id, location_id)
    REFERENCES travel_location_identities(source, external_source_id, location_id) ON DELETE RESTRICT,
  CONSTRAINT travel_location_records_source CHECK (source IN ('geonames')),
  CONSTRAINT travel_location_records_revision CHECK (source_revision ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$'),
  CONSTRAINT travel_location_records_external_id CHECK (
    char_length(external_source_id) BETWEEN 1 AND 120 AND external_source_id = btrim(external_source_id)
  ),
  CONSTRAINT travel_location_records_location_id CHECK (
    location_id ~ '^arvelis:location:[A-Za-z0-9][A-Za-z0-9._:-]*$' AND char_length(location_id) <= 96
  ),
  CONSTRAINT travel_location_records_display_name CHECK (
    char_length(display_name) BETWEEN 1 AND 200 AND display_name = btrim(display_name)
  ),
  CONSTRAINT travel_location_records_type CHECK (location_type IN ('city', 'station', 'airport')),
  CONSTRAINT travel_location_records_country CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT travel_location_records_region CHECK (
    region IS NULL OR (char_length(region) BETWEEN 1 AND 120 AND region = btrim(region))
  ),
  CONSTRAINT travel_location_records_timezone CHECK (
    timezone IS NULL OR (char_length(timezone) BETWEEN 1 AND 64 AND timezone = btrim(timezone))
  ),
  CONSTRAINT travel_location_records_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT travel_location_records_longitude CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT travel_location_records_population CHECK (population >= 0)
);

CREATE INDEX travel_location_records_filter_idx
  ON travel_location_records(source, source_revision, country_code, location_type, population DESC, external_source_id);

CREATE TABLE travel_location_names (
  source text NOT NULL,
  source_revision text NOT NULL,
  external_source_id text NOT NULL,
  normalized_name text NOT NULL,
  search_name text NOT NULL,
  is_primary boolean NOT NULL,
  PRIMARY KEY (source, source_revision, external_source_id, normalized_name),
  FOREIGN KEY (source, source_revision, external_source_id)
    REFERENCES travel_location_records(source, source_revision, external_source_id) ON DELETE CASCADE,
  CONSTRAINT travel_location_names_source CHECK (source IN ('geonames')),
  CONSTRAINT travel_location_names_normalized CHECK (
    char_length(normalized_name) BETWEEN 1 AND 400 AND normalized_name = btrim(normalized_name)
  ),
  CONSTRAINT travel_location_names_search CHECK (
    char_length(search_name) BETWEEN 1 AND 400 AND search_name = btrim(search_name)
  )
);

CREATE INDEX travel_location_names_exact_lookup_idx
  ON travel_location_names(source, source_revision, normalized_name, external_source_id);
