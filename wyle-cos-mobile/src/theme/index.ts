// ─── Wyle Brand Theme — v2 (corrected from brand guidelines PDF) ──────────────
// Source: Wyle_brand_guidelines_.pdf

export const Colors = {
  // ── Core backgrounds ───────────────────────────────────────────────────────
  background: '#002F3A',        // Jet Black (primary dark background)
  backgroundPure: '#000000',    // Pure black (splash, overlays)
  surface: '#0A3D4A',           // Slightly lighter than jet black
  surfaceElevated: '#0F4A5A',   // Cards, elevated surfaces
  surfaceHigh: '#155060',       // Active states

  // ── Primary brand colors ───────────────────────────────────────────────────
  verdigris: '#1B998B',         // PRIMARY — trust, balance, coordination
  verdigrisDark: '#157A6E',     // Pressed / deep verdigris

  // ── Secondary palette ──────────────────────────────────────────────────────
  chartreuse: '#D5FF3F',        // CTA / action / innovation spark (NOT yellow-green)
  sweetSalmon: '#FF9F8A',       // Warmth, approachability, buddy
  crimson: '#D7263D',           // Urgency, high risk, errors
  white: '#FEFFFE',             // Clarity, breathing space

  // ── Text ───────────────────────────────────────────────────────────────────
  textPrimary: '#FEFFFE',       // White — all body text
  textSecondary: '#8FB8BF',     // Muted teal-white
  textTertiary: '#4A7A85',      // Placeholder, disabled
  textInverse: '#002F3A',       // Text on bright backgrounds (chartreuse, salmon)

  // ── Semantic ───────────────────────────────────────────────────────────────
  riskHigh: '#D7263D',          // Crimson
  riskMedium: '#D5FF3F',        // Chartreuse
  riskLow: '#1B998B',           // Verdigris
  success: '#1B998B',
  warning: '#D5FF3F',
  error: '#D7263D',

  // ── UI ─────────────────────────────────────────────────────────────────────
  border: '#1A5060',
  divider: '#0F3D4A',
  overlay: 'rgba(0,47,58,0.85)',
  transparent: 'transparent',
};

// ── Typography — brand fonts from guidelines ────────────────────────────────
// Headline: Poppins Bold
// Subtitle: Montserrat
// Body: Inter
// UI/CTA: Inter
export const Fonts = {
  headline: 'Poppins_700Bold',
  headlineMedium: 'Poppins_600SemiBold',
  subtitle: 'Montserrat_600SemiBold',
  subtitleRegular: 'Montserrat_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  ui: 'Inter_600SemiBold',
};

export const Typography = {
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 30,
    display: 42,
    hero: 56,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
  // Usage map from brand doc:
  // Headlines    → Poppins Bold    (large display, screen titles)
  // Subtitles    → Montserrat      (section headers, card titles)
  // Body         → Inter           (paragraphs, descriptions)
  // UI/CTA       → Inter SemiBold  (buttons, labels, nav)
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screen: 20,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 999,
};

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  glowVerdigris: {
    shadowColor: '#1B998B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  glowChartreuse: {
    shadowColor: '#D5FF3F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  glowCrimson: {
    shadowColor: '#D7263D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
};

export default { Colors, Typography, Fonts, Spacing, Radius, Shadows };
