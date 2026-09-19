import { contrastRatio, THEME_PRESET_PALETTES, type ThemePresetPalette } from "@panergos/shared";
import { describe, expect, it } from "vitest";

import {
  BUILTIN_THEMES,
  webOverridesFromShared,
  webPresetFromShared,
} from "./presets";

// Every preset the dashboard shares with the desktop must render the shared
// table's palette, not a private copy — that is the whole point of the table.
// The assertions keep the projection honest: foreground owns readable text,
// while component surfaces retain the shared palette's semantic roles.
describe("dashboard presets derive from the shared palette table", () => {
  const shared = Object.keys(BUILTIN_THEMES).filter(
    (name): name is keyof typeof THEME_PRESET_PALETTES => name in THEME_PRESET_PALETTES,
  );

  it("covers the presets both surfaces ship", () => {
    expect(shared).toEqual(expect.arrayContaining(["cyberpunk", "ember", "midnight", "mono"]));
  });

  it.each(shared)("%s: canvas, text, and semantic surfaces stay shared", (name) => {
    const preset: ThemePresetPalette = THEME_PRESET_PALETTES[name];
    const colors = preset.darkColors ?? preset.colors;
    const derived = webPresetFromShared(preset);
    const overrides = webOverridesFromShared(preset);
    const palette = BUILTIN_THEMES[name].palette;

    expect(palette.background.hex).toBe(colors.background);
    expect(palette.midground.hex).toBe(derived.midground.hex);
    expect(palette.foreground.hex).toBe(colors.foreground);
    expect(overrides).toMatchObject({
      card: colors.card,
      cardForeground: colors.cardForeground,
      primary: colors.primary,
      primaryForeground: colors.primaryForeground,
      border: colors.border,
      ring: colors.ring,
    });
    expect(contrastRatio(palette.midground.hex, palette.background.hex)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.foreground.hex, palette.background.hex)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the Panergos palette for both default appearances", () => {
    const dark = BUILTIN_THEMES.default.palette;
    const light = BUILTIN_THEMES["porcelain"].palette;

    expect(dark.background.hex).toBe("#120b1f");
    expect(dark.midground.hex).toBe("#2ee6a6");
    expect(dark.foreground.hex).toBe("#f7f2ff");
    expect(BUILTIN_THEMES.default.colorOverrides).toMatchObject({
      primary: "#2ee6a6",
      accent: "#ff6b5e",
      ring: "#f7c453",
    });
    expect(light.background.hex).toBe("#fff9f6");
    expect(light.midground.hex).toBe("#14755d");
    expect(light.foreground.hex).toBe("#20142b");
    expect(contrastRatio(dark.midground.hex, dark.background.hex)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.foreground.hex, dark.background.hex)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.midground.hex, light.background.hex)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.foreground.hex, light.background.hex)).toBeGreaterThanOrEqual(4.5);
  });
});
