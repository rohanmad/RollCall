export type TitleInput = {
  startAt: number;
  endAt: number;
  /** Short place token for the title, e.g. "Coronado" or "Yosemite" */
  placeName?: string | null;
  photoCount?: number;
  /**
   * Stable variety seed (e.g. joined photo ids) so similar-time clusters
   * without location don't all get the exact same generic title.
   */
  seed?: string;
};

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_HOUR = 60 * 60 * 1000;

const SMALL_WORDS = new Set(['at', 'in', 'of', 'the', 'a', 'an', 'and', 'to']);

function titleCase(words: string[]): string {
  return words
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function wordCount(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function clampTitle(title: string): string {
  const words = wordCount(title);
  if (words.length <= 5) return words.join(' ');
  return words.slice(0, 5).join(' ');
}

function calendarDaysSpanned(startAt: number, endAt: number): number {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startDay = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endDay - startDay) / MS_DAY) + 1;
}

function weekdayName(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'long' });
}

function monthName(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'long' });
}

type DayPart = 'morning' | 'afternoon' | 'sunset' | 'evening' | 'night';

function dayPart(ts: number): DayPart {
  const hour =
    new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 19.5) return 'sunset';
  if (hour >= 19.5 && hour < 22) return 'evening';
  return 'night';
}

function dominantDayPart(startAt: number, endAt: number): DayPart {
  const mid = startAt + (endAt - startAt) / 2;
  return dayPart(mid);
}

function cleanPlace(placeName?: string | null): string | undefined {
  if (!placeName) return undefined;
  const trimmed = placeName.trim();
  if (!trimmed) return undefined;
  const words = trimmed.split(/\s+/);
  if (words.length > 3) return words.slice(0, 2).join(' ');
  return trimmed;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(options: T[], seed: string, salt = ''): T {
  const idx = hashSeed(`${seed}|${salt}`) % options.length;
  return options[idx]!;
}

function endAtSpansWeekend(startAt: number, endAt: number): boolean {
  const duration = endAt - startAt;
  if (duration < 20 * MS_HOUR) return false;
  const startDay = new Date(startAt).getDay();
  const endDay = new Date(endAt).getDay();
  return (
    (startDay === 5 || startDay === 6 || startDay === 0) &&
    (endDay === 0 || endDay === 6 || endDay === 5)
  );
}

function isWeekendDay(ts: number): boolean {
  const d = new Date(ts).getDay();
  return d === 0 || d === 6;
}

/**
 * Titles when we have a place — event-shaped, not photo-shaped.
 */
function titleWithPlace(
  place: string,
  part: DayPart,
  multiDay: boolean,
  seed: string,
): string {
  if (multiDay) {
    return pick(
      [`${place} Weekend`, `${place} Trip`, `Weekend in ${place}`],
      seed,
      'place-multi',
    );
  }

  switch (part) {
    case 'sunset':
      return pick(
        [`Sunset at ${place}`, `Golden Hour at ${place}`, `Evening in ${place}`],
        seed,
        'place-sunset',
      );
    case 'morning':
      return pick(
        [`Morning in ${place}`, `${place} Morning`, `Day in ${place}`],
        seed,
        'place-morning',
      );
    case 'afternoon':
      return pick(
        [`Afternoon in ${place}`, `Day in ${place}`, `${place} Afternoon`],
        seed,
        'place-afternoon',
      );
    case 'evening':
      return pick(
        [`Evening in ${place}`, `Night in ${place}`, `${place} Evening`],
        seed,
        'place-evening',
      );
    case 'night':
      return pick(
        [`Night in ${place}`, `${place} Night`, `Evening in ${place}`],
        seed,
        'place-night',
      );
    default:
      return `Day in ${place}`;
  }
}

/**
 * Titles when GPS/place is missing — use time span, size, and month,
 * with seeded variety so every draft isn't identical.
 */
function titleWithoutPlace(input: {
  startAt: number;
  endAt: number;
  part: DayPart;
  multiDay: boolean;
  photoCount: number;
  seed: string;
}): string {
  const { startAt, endAt, part, multiDay, photoCount, seed } = input;
  const durationMs = Math.max(0, endAt - startAt);
  const weekday = weekdayName(startAt);
  const month = monthName(startAt);
  const weekend = isWeekendDay(startAt);

  if (multiDay) {
    return pick(
      ['Weekend Getaway', 'Weekend Trip', `${month} Weekend`, 'Little Getaway'],
      seed,
      'noplace-multi',
    );
  }

  // Burst of nearly-simultaneous imports (common on Simulator).
  if (durationMs < 15 * 60 * 1000) {
    if (photoCount >= 12) {
      return pick(
        ['Photo Dump', 'Camera Roll Day', 'Big Photo Set', `${month} Highlights`],
        seed,
        'burst-big',
      );
    }
    if (photoCount >= 6) {
      return pick(
        [
          'Snapshot Set',
          `${weekday} Snapshots`,
          `${month} Moments`,
          'Quick Collection',
        ],
        seed,
        'burst-mid',
      );
    }
    return pick(
      ['Quick Moments', 'Little Set', `${weekday} Snaps`, 'Short Outing'],
      seed,
      'burst-small',
    );
  }

  if (photoCount >= 12) {
    return pick(
      [
        `${weekday} Adventures`,
        `${month} Photo Dump`,
        'Big Day Out',
        `${weekday} Highlights`,
      ],
      seed,
      'many',
    );
  }

  if (weekend) {
    return pick(
      [
        `${weekday} Wander`,
        'Weekend Outing',
        `${month} Weekend`,
        `${weekday} Adventures`,
      ],
      seed,
      'weekend',
    );
  }

  switch (part) {
    case 'morning':
      return pick(
        [
          `${weekday} Morning`,
          'Morning Outing',
          `${month} Morning`,
          'Early Adventures',
        ],
        seed,
        'morning',
      );
    case 'sunset':
      return pick(
        ['Golden Hour', 'Sunset Moments', `${weekday} Sunset`, 'Evening Light'],
        seed,
        'sunset',
      );
    case 'evening':
      return pick(
        [
          `${weekday} Evening`,
          'Evening Out',
          `${month} Evening`,
          'Nighttime Moments',
        ],
        seed,
        'evening',
      );
    case 'night':
      return pick(
        [`${weekday} Night`, 'Late Night Set', `${month} Night`, 'After Dark'],
        seed,
        'night',
      );
    case 'afternoon':
    default:
      return pick(
        [
          `${weekday} Outing`,
          `${month} Afternoon`,
          'Afternoon Wander',
          'Daylight Moments',
          `${weekday} Adventures`,
        ],
        seed,
        'afternoon',
      );
  }
}

/**
 * Generate a short, natural memory title (2–5 words) from time + place metadata.
 * Describes the event, not the photo. No captions.
 *
 * Without location (typical for Simulator imports), falls back to duration /
 * photo-count / month templates with stable seeded variety.
 */
export function generateMemoryTitle(input: TitleInput): string {
  const place = cleanPlace(input.placeName);
  const days = calendarDaysSpanned(input.startAt, input.endAt);
  const multiDay = days >= 2 || endAtSpansWeekend(input.startAt, input.endAt);
  const part = dominantDayPart(input.startAt, input.endAt);
  const photoCount = input.photoCount ?? 0;
  const seed =
    input.seed ||
    `${input.startAt}-${input.endAt}-${photoCount}-${place ?? ''}`;

  let title = place
    ? titleWithPlace(place, part, multiDay, seed)
    : titleWithoutPlace({
        startAt: input.startAt,
        endAt: input.endAt,
        part,
        multiDay,
        photoCount,
        seed,
      });

  title = clampTitle(titleCase(wordCount(title)));

  if (wordCount(title).length < 2) {
    title = place
      ? clampTitle(`${place} Day`)
      : `${weekdayName(input.startAt)} Out`;
  }

  return title;
}
