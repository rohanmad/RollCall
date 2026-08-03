import { File } from 'expo-file-system';
import type { PhotoAsset } from '../../types/moment';
import { rankCoverPhotos } from './selectCoverPhoto';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_VISION_CANDIDATES = 4;

export type VisionEnrichmentResult = {
  title: string;
  coverPhotoId: string;
  model: string;
};

function openaiApiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim();
  return key || undefined;
}

export function isVisionEnrichmentReady(): boolean {
  return Boolean(openaiApiKey());
}

function guessMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function isRemoteUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

async function toImageUrlPart(uri: string): Promise<{
  type: 'image_url';
  image_url: { url: string; detail: 'low' };
} | null> {
  try {
    if (isRemoteUrl(uri)) {
      return {
        type: 'image_url',
        image_url: { url: uri, detail: 'low' },
      };
    }
    const lower = uri.toLowerCase();
    // gpt-4o vision is unreliable on HEIC; skip those candidates.
    if (lower.includes('.heic') || lower.includes('.heif')) {
      return null;
    }
    const file = new File(uri);
    const base64 = await file.base64();
    const mime = guessMime(uri);
    return {
      type: 'image_url',
      image_url: {
        url: `data:${mime};base64,${base64}`,
        detail: 'low',
      },
    };
  } catch (error) {
    console.warn('[vision] failed to encode image', uri, error);
    return null;
  }
}

function clampTitleWords(raw: string): string {
  const cleaned = raw
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length <= 5) return words.join(' ');
  return words.slice(0, 5).join(' ');
}

type VisionJson = {
  title?: string;
  coverIndex?: number;
};

/**
 * Use a vision LLM to pick a cover among heuristic shortlist candidates
 * and write a short 2–5 word event title.
 *
 * Returns null when the API key is missing or the call fails — callers
 * should keep heuristic title/cover.
 */
export async function enrichMemoryWithVision(input: {
  photos: PhotoAsset[];
  placeName?: string | null;
  locationLabel?: string | null;
  startAt: number;
  endAt: number;
}): Promise<VisionEnrichmentResult | null> {
  const apiKey = openaiApiKey();
  if (!apiKey || input.photos.length === 0) return null;

  const model =
    process.env.EXPO_PUBLIC_OPENAI_VISION_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const shortlist = await rankCoverPhotos(input.photos, {
      limit: Math.min(MAX_VISION_CANDIDATES, input.photos.length),
    });

    const encoded: {
      photo: PhotoAsset;
      part: {
        type: 'image_url';
        image_url: { url: string; detail: 'low' };
      };
    }[] = [];

    for (const photo of shortlist) {
      const part = await toImageUrlPart(photo.uri);
      if (part) encoded.push({ photo, part });
    }

    if (!encoded.length) return null;

    const when = new Date(input.startAt).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const place =
      input.placeName?.trim() ||
      input.locationLabel?.trim() ||
      'unknown place';

    const content: Array<
      | { type: 'text'; text: string }
      | {
          type: 'image_url';
          image_url: { url: string; detail: 'low' };
        }
    > = [
      {
        type: 'text',
        text: [
          'You are helping title a personal photo memory for a calm social app.',
          'Images are numbered starting at 0 in the order provided.',
          'Return ONLY compact JSON: {"title":"...","coverIndex":0}',
          'Rules for title: 2 to 5 words, natural event name, no quotes, no hashtags, no camera jargon.',
          'Prefer evocative but grounded titles (place/time/mood). Do not invent celebrity names.',
          'coverIndex must be the index of the best single cover photo among the provided images (sharp, well-composed, representative).',
          `Context: around ${when}; place hint: ${place}; photo count in cluster: ${input.photos.length}.`,
        ].join(' '),
      },
    ];

    encoded.forEach((item, index) => {
      content.push({
        type: 'text',
        text: `Image ${index}:`,
      });
      content.push(item.part);
    });

    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 80,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(
        '[vision] OpenAI error',
        response.status,
        errText.slice(0, 240),
      );
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    let parsed: VisionJson;
    try {
      parsed = JSON.parse(raw) as VisionJson;
    } catch {
      console.warn('[vision] invalid JSON', raw);
      return null;
    }

    const title = parsed.title ? clampTitleWords(parsed.title) : '';
    const coverIndex =
      typeof parsed.coverIndex === 'number' && Number.isFinite(parsed.coverIndex)
        ? Math.round(parsed.coverIndex)
        : 0;
    const cover =
      encoded[Math.max(0, Math.min(encoded.length - 1, coverIndex))]?.photo ??
      encoded[0]!.photo;

    if (!title || title.split(' ').length < 2) {
      return {
        title: '',
        coverPhotoId: cover.id,
        model,
      };
    }

    return {
      title,
      coverPhotoId: cover.id,
      model,
    };
  } catch (error) {
    console.warn('[vision] enrichment failed', error);
    return null;
  }
}
