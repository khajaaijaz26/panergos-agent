import { parseColor, THEME_PRESET_PALETTES, type ThemePresetPalette } from "@panergos/shared";
import type {
  DashboardTheme,
  ThemeColorOverrides,
  ThemeLayout,
  ThemePalette,
  ThemeTypography,
} from "./types";

/**
 * Built-in dashboard themes.
 *
 * Each theme defines its own palette, typography, and layout so switching
 * themes produces visible changes beyond just color — fonts, density, and
 * corner-radius all shift to match the theme's personality.
 *
 * Theme names must stay in sync with the backend's
 * `_BUILTIN_DASHBOARD_THEMES` list in `panergos_cli/web_server.py`.
 *
 * Presets that also ship on the desktop (midnight, ember, mono, cyberpunk)
 * take their colours from `@panergos/shared` `THEME_PRESET_PALETTES` so both
 * surfaces render one palette; only typography/layout/overrides live here.
 */

// ---------------------------------------------------------------------------
// Shared typography / layout presets
// ---------------------------------------------------------------------------

/** Default system stack — neutral, safe fallback for every platform. */
const SYSTEM_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_MONO =
  'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  fontSans: SYSTEM_SANS,
  fontMono: SYSTEM_MONO,
  baseSize: "15px",
  lineHeight: "1.55",
  letterSpacing: "0",
};

const DEFAULT_LAYOUT: ThemeLayout = {
  radius: "0.5rem",
  density: "comfortable",
};

/**
 * Project a shared (desktop-shaped) preset palette onto the dashboard's
 * 3-slot model. `foreground` owns readable text, while `midground` remains
 * the branded action/stroke colour. Dark palettes are the dashboard's home
 * turf, so a preset shipping `darkColors` is read from that side.
 */
export function webPresetFromShared(
  preset: ThemePresetPalette,
): Omit<ThemePalette, "noiseOpacity"> {
  const colors = preset.darkColors ?? preset.colors;
  const [r, g, b] = parseColor(colors.midground ?? colors.ring) ?? [255, 255, 255];
  return {
    background: { hex: colors.background, alpha: 1 },
    midground: { hex: colors.midground ?? colors.ring, alpha: 1 },
    foreground: { hex: colors.foreground, alpha: 1 },
    warmGlow: `rgba(${r}, ${g}, ${b}, 0.3)`,
  };
}

/** Preserve the shared palette's semantic roles instead of tinting every
 * dashboard surface with the single `midground` brand colour. */
export function webOverridesFromShared(
  preset: ThemePresetPalette,
): ThemeColorOverrides {
  const colors = preset.darkColors ?? preset.colors;
  return {
    card: colors.card,
    cardForeground: colors.cardForeground,
    popover: colors.popover,
    popoverForeground: colors.popoverForeground,
    primary: colors.primary,
    primaryForeground: colors.primaryForeground,
    secondary: colors.secondary,
    secondaryForeground: colors.secondaryForeground,
    muted: colors.muted,
    mutedForeground: colors.mutedForeground,
    accent: colors.accent,
    accentForeground: colors.accentForeground,
    destructive: colors.destructive,
    destructiveForeground: colors.destructiveForeground,
    border: colors.border,
    input: colors.input,
    ring: colors.ring,
  };
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

const ECLIPSE_DARK = THEME_PRESET_PALETTES.eclipse.darkColors!;
const ECLIPSE_LIGHT = THEME_PRESET_PALETTES.eclipse.colors;
const PANERGOS_JADE = "#2ee6a6";
const PANERGOS_AMBER = "#f7c453";
const PORCELAIN_JADE = "#14755d";
const PORCELAIN_AMBER = "#8a6110";

export const defaultTheme: DashboardTheme = {
  name: "default",
  label: "Panergos Eclipse",
  description: "Eclipse plum with coral, jade, and gold signals",
  palette: {
    ...webPresetFromShared(THEME_PRESET_PALETTES.eclipse),
    midground: { hex: PANERGOS_JADE, alpha: 1 },
    warmGlow: "rgba(46, 230, 166, 0.2)",
    noiseOpacity: 1,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: DEFAULT_LAYOUT,
  terminalBackground: ECLIPSE_DARK.background,
  terminalForeground: ECLIPSE_DARK.foreground,
  colorOverrides: {
    ...webOverridesFromShared(THEME_PRESET_PALETTES.eclipse),
    primary: PANERGOS_JADE,
    primaryForeground: ECLIPSE_DARK.background,
    accent: ECLIPSE_DARK.primary,
    accentForeground: ECLIPSE_DARK.primaryForeground,
    ring: PANERGOS_AMBER,
    success: PANERGOS_JADE,
    warning: PANERGOS_AMBER,
  },
  seriesColors: {
    inputTokenAccent: PANERGOS_AMBER,
    outputTokenAccent: PANERGOS_JADE,
  },
  swatchColors: [ECLIPSE_DARK.background, ECLIPSE_DARK.primary, PANERGOS_JADE],
};

export const midnightTheme: DashboardTheme = {
  name: "midnight",
  label: "Midnight",
  description: "Deep blue-violet with cool accents",
  palette: {
    ...webPresetFromShared(THEME_PRESET_PALETTES.midnight),
    noiseOpacity: 0.8,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Inter", ${SYSTEM_SANS}`,
    fontMono: `"JetBrains Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
    letterSpacing: "-0.005em",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0.75rem",
  },
  colorOverrides: webOverridesFromShared(THEME_PRESET_PALETTES.midnight),
};

export const emberTheme: DashboardTheme = {
  name: "ember",
  label: "Ember",
  description: "Warm crimson and bronze — forge vibes",
  palette: {
    ...webPresetFromShared(THEME_PRESET_PALETTES.ember),
    noiseOpacity: 1,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Spectral", Georgia, "Times New Roman", serif`,
    fontMono: `"IBM Plex Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0.25rem",
  },
  colorOverrides: {
    ...webOverridesFromShared(THEME_PRESET_PALETTES.ember),
    destructive: "#c92d0f",
    warning: "#f97316",
  },
};

export const monoTheme: DashboardTheme = {
  name: "mono",
  label: "Mono",
  description: "Clean grayscale — minimal and focused",
  palette: {
    ...webPresetFromShared(THEME_PRESET_PALETTES.mono),
    noiseOpacity: 0.6,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    fontMono: `"IBM Plex Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0",
  },
  colorOverrides: webOverridesFromShared(THEME_PRESET_PALETTES.mono),
};

export const cyberpunkTheme: DashboardTheme = {
  name: "cyberpunk",
  label: "Cyberpunk",
  description: "Neon green on black — matrix terminal",
  palette: {
    ...webPresetFromShared(THEME_PRESET_PALETTES.cyberpunk),
    noiseOpacity: 1.2,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Share Tech Mono", "JetBrains Mono", ${SYSTEM_MONO}`,
    fontMono: `"Share Tech Mono", "JetBrains Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@400;700&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0",
  },
  colorOverrides: {
    ...webOverridesFromShared(THEME_PRESET_PALETTES.cyberpunk),
    success: "#00ff88",
    warning: "#f7c453",
    destructive: "#ff0055",
  },
};

export const roseTheme: DashboardTheme = {
  name: "rose",
  label: "Rosé",
  description: "Soft pink and warm ivory — easy on the eyes",
  palette: {
    background: { hex: "#1a0f15", alpha: 1 },
    midground: { hex: "#ffd4e1", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(249, 168, 212, 0.3)",
    noiseOpacity: 0.9,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Fraunces", Georgia, serif`,
    fontMono: `"DM Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=DM+Mono:wght@400;500&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "1rem",
  },
};

/** Light mode — deep coral accents on a warm porcelain canvas. */
export const porcelainTheme: DashboardTheme = {
  name: "porcelain",
  label: "Panergos Porcelain",
  description: "Light mode — deep coral on warm porcelain",
  palette: {
    background: { hex: ECLIPSE_LIGHT.background, alpha: 1 },
    midground: { hex: PORCELAIN_JADE, alpha: 1 },
    foreground: { hex: ECLIPSE_LIGHT.foreground, alpha: 1 },
    warmGlow: "rgba(46, 230, 166, 0.1)",
    noiseOpacity: 0,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: DEFAULT_LAYOUT,
  terminalBackground: ECLIPSE_LIGHT.background,
  terminalForeground: ECLIPSE_LIGHT.foreground,
  colorOverrides: {
    ...webOverridesFromShared({ colors: ECLIPSE_LIGHT }),
    primary: PORCELAIN_JADE,
    primaryForeground: "#ffffff",
    accent: ECLIPSE_LIGHT.primary,
    accentForeground: ECLIPSE_LIGHT.primaryForeground,
    ring: PORCELAIN_AMBER,
    success: PORCELAIN_JADE,
    destructive: "#b42342",
    destructiveForeground: "#ffffff",
    warning: PORCELAIN_AMBER,
  },
  seriesColors: {
    inputTokenAccent: PORCELAIN_AMBER,
    outputTokenAccent: PORCELAIN_JADE,
  },
  swatchColors: [ECLIPSE_LIGHT.background, ECLIPSE_LIGHT.primary, PANERGOS_JADE],
};

/**
 * Same look as ``defaultTheme`` but with a larger root font size, looser
 * line-height, and ``spacious`` density so every rem-based size in the
 * dashboard scales up. For users who find the default 15px UI too dense.
 */
export const defaultLargeTheme: DashboardTheme = {
  name: "default-large",
  label: "Panergos Eclipse (Large)",
  description: "Panergos Eclipse with bigger fonts and roomier spacing",
  palette: defaultTheme.palette,
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    baseSize: "18px",
    lineHeight: "1.65",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    density: "spacious",
  },
  terminalBackground: defaultTheme.terminalBackground,
  terminalForeground: defaultTheme.terminalForeground,
  colorOverrides: defaultTheme.colorOverrides,
  seriesColors: defaultTheme.seriesColors,
  swatchColors: defaultTheme.swatchColors,
};

export const BUILTIN_THEMES: Record<string, DashboardTheme> = {
  default: defaultTheme,
  "default-large": defaultLargeTheme,
  "porcelain": porcelainTheme,
  midnight: midnightTheme,
  ember: emberTheme,
  mono: monoTheme,
  cyberpunk: cyberpunkTheme,
  rose: roseTheme,
};
