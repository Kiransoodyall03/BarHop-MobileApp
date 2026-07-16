// BarHop "Neon Sunset" theme — ported from the Creator webapp's design tokens
// (tailwind.config.js + index.css CSS variables) so both apps share one brand:
// coral primary, gold accent, plum surfaces in dark, warm cream in light.

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  // Surfaces (webapp: surface / surface-raised / surface-overlay)
  background: string;
  surface: string;
  surfaceLight: string;
  // Edges (webapp: edge / edge-strong)
  border: string;
  borderStrong: string;
  // Brand (webapp: primary / secondary)
  primary: string;
  primaryHover: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  // Content
  text: string;
  textMuted: string;
  textFaint: string;
  // Semantic (webapp: success / danger)
  like: string;
  nope: string;
  danger: string;
  // Component-specific
  tabBarBg: string;
  actionButtonBg: string;
  chipActiveBg: string;
  authGradient: [string, string, string];
  buttonGradient: [string, string];
}

export const lightColors: ThemeColors = {
  background: '#FFFBF7', // --color-surface
  surface: '#FBF2EE', // --color-surface-raised
  surfaceLight: '#F6E8E2', // --color-surface-overlay
  border: '#F0E0DA', // --color-edge
  borderStrong: '#E3CDC6', // --color-edge-strong
  primary: '#E63A5B', // --color-primary
  primaryHover: '#D22C4E',
  onPrimary: '#FFFFFF',
  accent: '#B45309', // --color-secondary (gold darkened for light bg)
  onAccent: '#FFFFFF',
  text: '#241629', // --color-content
  textMuted: '#6B5A70',
  textFaint: '#9C8AA1',
  like: '#0D9488', // --color-success
  nope: '#DC2626', // --color-danger
  danger: '#DC2626',
  tabBarBg: 'rgba(255, 251, 247, 0.94)',
  actionButtonBg: 'rgba(255, 251, 247, 0.92)',
  chipActiveBg: 'rgba(230, 58, 91, 0.12)',
  // hero-glow: coral→gold wash fading into the cream surface
  authGradient: ['#FBE7E1', '#FCF3EC', '#FFFBF7'],
  // coral→amber sunset; right stop kept deep enough for white label text
  buttonGradient: ['#E63A5B', '#C25715'],
};

export const darkColors: ThemeColors = {
  background: '#120B14', // --color-surface (dark)
  surface: '#1E1220', // --color-surface-raised
  surfaceLight: '#2A1830', // --color-surface-overlay
  border: '#362A3D', // --color-edge
  borderStrong: '#4E3F58', // --color-edge-strong
  primary: '#FF4D6D', // --color-primary
  primaryHover: '#FF6B85',
  onPrimary: '#FFFFFF',
  accent: '#FFB84D', // --color-secondary (neon gold)
  onAccent: '#2A1424',
  text: '#F7F2F5', // --color-content
  textMuted: '#B4A6B8',
  textFaint: '#7E6D84',
  like: '#2DD4BF', // --color-success
  nope: '#F87171', // --color-danger
  danger: '#F87171',
  tabBarBg: 'rgba(18, 11, 20, 0.94)',
  actionButtonBg: 'rgba(18, 11, 20, 0.88)',
  chipActiveBg: 'rgba(255, 77, 109, 0.22)',
  authGradient: ['#2A1830', '#1E1220', '#120B14'],
  // coral→warm orange midpoint of the sunset ramp (full gold washes out text)
  buttonGradient: ['#FF4D6D', '#FF9057'],
};
