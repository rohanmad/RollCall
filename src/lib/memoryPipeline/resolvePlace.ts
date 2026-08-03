import * as Location from 'expo-location';
import type { AssetLocation } from '../../types/moment';

export type ResolvedPlace = {
  /** Display label for the memory card, e.g. "Coronado, CA" */
  locationLabel?: string;
  /** Short place token for titles, e.g. "Coronado" */
  placeName?: string;
};

const cache = new Map<string, ResolvedPlace>();

function cacheKey(location: AssetLocation): string {
  return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
}

function pickPlaceName(address: Location.LocationGeocodedAddress): string | undefined {
  const candidates = [
    address.name,
    address.district,
    address.city,
    address.subregion,
    address.street,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function regionAbbreviation(region: string | null | undefined): string | undefined {
  if (!region) return undefined;
  const trimmed = region.trim();
  if (!trimmed) return undefined;
  // Keep short region codes as-is; otherwise use as written.
  return trimmed;
}

/**
 * Reverse-geocode a cluster centroid into a human place label.
 * Soft-fails (empty result) when permissions/network/platform block geocoding.
 * Swap this module later for a Places API without touching the pipeline.
 */
export async function resolvePlace(
  centroid?: AssetLocation,
): Promise<ResolvedPlace> {
  if (!centroid) return {};

  const key = cacheKey(centroid);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: centroid.latitude,
      longitude: centroid.longitude,
    });
    const address = results[0];
    if (!address) {
      cache.set(key, {});
      return {};
    }

    const placeName = pickPlaceName(address);
    const city = address.city?.trim() || placeName;
    const region = regionAbbreviation(address.region);
    let locationLabel: string | undefined;
    if (city && region && city !== region) {
      locationLabel = `${city}, ${region}`;
    } else {
      locationLabel = city || region || placeName;
    }

    const resolved: ResolvedPlace = {
      locationLabel: locationLabel || undefined,
      placeName: placeName || city || undefined,
    };
    cache.set(key, resolved);
    return resolved;
  } catch (error) {
    console.warn('[memoryPipeline] reverse geocode failed', error);
    cache.set(key, {});
    return {};
  }
}

/** Test helper — clear geocode cache between runs. */
export function clearPlaceCache(): void {
  cache.clear();
}
