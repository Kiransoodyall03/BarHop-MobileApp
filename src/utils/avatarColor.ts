// Sunset-family avatar backgrounds (initials are always white). Shared by
// every initials-fallback avatar in the app so a given uid always hashes to
// the same color everywhere it appears.
const AVATAR_COLORS = ['#E63A5B', '#D97706', '#0D9488', '#B45309', '#C2410C', '#BE185D'];

export function avatarColorFor(seed: string): string {
  const sum = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
