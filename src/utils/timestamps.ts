import type { FirestoreTimestamp } from '../types';

/**
 * Normalizes the two shapes a Firestore date arrives in — a raw
 * { seconds, nanoseconds } map when read from a document, or a JS Date when
 * written locally before the server round-trip. Returns null for anything else
 * (missing field, serverTimestamp() sentinel that hasn't resolved yet).
 */
export function toDate(value: FirestoreTimestamp | Date | undefined | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as FirestoreTimestamp).seconds === 'number') {
    return new Date((value as FirestoreTimestamp).seconds * 1000);
  }
  return null;
}

/** True when `value` is a real date still in the future. */
export function isFuture(
  value: FirestoreTimestamp | Date | undefined | null,
  now: Date = new Date()
): boolean {
  const date = toDate(value);
  return date != null && date.getTime() > now.getTime();
}
