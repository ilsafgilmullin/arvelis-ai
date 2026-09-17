import {
  validateGeoNamesDumpManifestV1,
  type GeoNamesDumpManifestV1,
  type GeoNamesLocationSeedV1,
} from './geonamesSource';
import {
  LOCATION_DIRECTORY_FOUNDATION_VERSION,
  validateLocationDirectoryRevisionV1,
  validateLocationDirectorySourceLocationV1,
  type LocationDirectoryRevisionV1,
  type LocationDirectorySourceLocationV1,
} from '../locationDirectoryFoundation';

export function geoNamesDirectoryRevision(manifest: GeoNamesDumpManifestV1): string {
  const validation = validateGeoNamesDumpManifestV1(manifest);
  if (!validation.ok) throw new Error('Invalid GeoNames manifest');
  return `geonames:${manifest.countryCode}:${manifest.sourceModifiedDate}:${manifest.archiveSha256}`;
}

export function geoNamesManifestToDirectoryRevision(
  manifest: GeoNamesDumpManifestV1,
): LocationDirectoryRevisionV1 {
  const validation = validateGeoNamesDumpManifestV1(manifest);
  if (!validation.ok) throw new Error('Invalid GeoNames manifest');

  const revision: LocationDirectoryRevisionV1 = {
    version: LOCATION_DIRECTORY_FOUNDATION_VERSION,
    source: 'geonames',
    revision: geoNamesDirectoryRevision(validation.manifest),
    countryCode: validation.manifest.countryCode,
    sourceModifiedDate: validation.manifest.sourceModifiedDate,
    retrievedAt: validation.manifest.retrievedAt,
    sourceFingerprint: validation.manifest.archiveSha256,
    license: validation.manifest.license,
    attributionUrl: validation.manifest.attributionUrl,
  };
  if (!validateLocationDirectoryRevisionV1(revision)) throw new Error('Invalid GeoNames directory revision');
  return revision;
}

/**
 * Converts an already validated GeoNames parser seed into the provider-neutral persistence
 * contract. Admin codes are deliberately not exposed as human region labels.
 */
export function geoNamesSeedToDirectoryLocation(
  seed: GeoNamesLocationSeedV1,
  sourceRevision: string,
): LocationDirectorySourceLocationV1 {
  const location: LocationDirectorySourceLocationV1 = {
    version: LOCATION_DIRECTORY_FOUNDATION_VERSION,
    source: 'geonames',
    sourceRevision,
    externalSourceId: String(seed.geonameId),
    displayName: seed.displayName,
    searchNames: structuredClone(seed.searchNames),
    type: seed.type,
    countryCode: seed.countryCode,
    timezone: seed.timezone,
    latitude: seed.latitude,
    longitude: seed.longitude,
    population: seed.population,
  };
  if (!validateLocationDirectorySourceLocationV1(location)) {
    throw new Error('Invalid GeoNames location seed for directory persistence');
  }
  return location;
}
