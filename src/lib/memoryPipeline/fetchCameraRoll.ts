import {
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-media-library';
import type { PhotoAsset } from '../../types/moment';

/** First / full scan looks back this far so we don't ingest the whole library. */
export const INITIAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
/** Hard cap per scan — large libraries stay fast and predictable. */
export const MAX_ASSETS_PER_SCAN = 50;

export type CameraRollFetchResult = {
  assets: PhotoAsset[];
  permission: 'granted' | 'denied' | 'undetermined' | 'limited';
  rawCount: number;
};

function normalizeTimestamp(value: number): number {
  // Some platforms may return seconds — normalize to ms.
  return value < 1e12 ? value * 1000 : value;
}

/**
 * Fetches camera-roll images (and videos) newer than `sinceMs`.
 * Uses Expo SDK 57 Query API. Location is best-effort.
 */
export async function fetchCameraRollAssets(
  sinceMs: number,
  options?: { requestPermission?: boolean },
): Promise<CameraRollFetchResult> {
  const requestPermission = options?.requestPermission ?? false;

  let permission = await getPermissionsAsync();
  if (permission.status !== 'granted' && requestPermission) {
    permission = await requestPermissionsAsync();
  }

  if (permission.status !== 'granted') {
    return {
      assets: [],
      rawCount: 0,
      permission: permission.status === 'denied' ? 'denied' : 'undetermined',
    };
  }

  let assets;
  try {
    assets = await new Query()
      .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
      .gte(AssetField.CREATION_TIME, sinceMs)
      .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
      .limit(MAX_ASSETS_PER_SCAN)
      .exe();
  } catch (error) {
    console.warn('[memoryPipeline] Query failed', error);
    return {
      assets: [],
      rawCount: 0,
      permission:
        permission.accessPrivileges === 'limited' ? 'limited' : 'granted',
    };
  }

  const mapped: PhotoAsset[] = [];

  for (const asset of assets) {
    try {
      const [createdAtRaw, uri, width, height, location, subtypes] =
        await Promise.all([
          asset.getCreationTime(),
          asset.getUri(),
          asset.getWidth().catch(() => undefined),
          asset.getHeight().catch(() => undefined),
          asset.getLocation().catch(() => null),
          typeof asset.getMediaSubtypes === 'function'
            ? asset.getMediaSubtypes().catch(() => [] as string[])
            : Promise.resolve([] as string[]),
        ]);

      if (!createdAtRaw || !uri) continue;
      const createdAt = normalizeTimestamp(createdAtRaw);
      const isScreenshot = (subtypes ?? []).some(
        (s) => String(s).toLowerCase() === 'screenshot',
      );

      mapped.push({
        id: `cam-${asset.id}`,
        uri,
        createdAt,
        width: width || undefined,
        height: height || undefined,
        location: location
          ? {
              latitude: location.latitude,
              longitude: location.longitude,
            }
          : undefined,
        isScreenshot,
      });
    } catch (error) {
      console.warn('[memoryPipeline] Skipping asset', asset.id, error);
    }
  }

  return {
    assets: mapped,
    rawCount: assets.length,
    permission:
      permission.accessPrivileges === 'limited' ? 'limited' : 'granted',
  };
}
