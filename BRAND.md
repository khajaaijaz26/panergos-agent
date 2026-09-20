# Panergos visual identity

Panergos uses the **Panergos Relay**: coral and jade work lanes converge into
one amber execution arrow. It represents many inputs becoming one visible next
action — the same mental model as the command deck, model routing, delegation,
and durable handoffs. Text-only surfaces reduce it to the three-line form
`╲` / `━━▶` / `╱`, preserving the direction instead of inventing a silhouette.

The Relay is deliberately code-native: flat geometry, round terminals, no
gradients, mascots, wings, staffs, snakes, deity imagery, orbit marks, or
generic chatbot sparkles. Do not rotate it, braid its lanes, or close it into a
loop.

## Palette

| Token | Hex | Use |
|---|---:|---|
| Eclipse plum | `#120B1F` | Dark surfaces and high-contrast structure |
| Panergos jade | `#2EE6A6` | Primary actions, links, success, and the main ribbon |
| Signal coral | `#FF6B5E` | Directional emphasis and selected brand details |
| Relay amber | `#F7C453` | Keyboard focus, sparse highlights, and warning-adjacent accents |
| Frost | `#F7F2FF` | Text and light surfaces |

Semantic danger, warning, and success colors remain distinct from brand accents.
Interfaces must keep readable foreground/background contrast and visible keyboard
focus in both light and dark modes.

## Assets

- `assets/panergos-mark.svg` — canonical, transparent vector mark.
- `assets/panergos-banner.svg` — repository banner and wordmark.
- `web/public/panergos-mark.svg` — dashboard mark and SVG favicon.
- `website/static/img/panergos-mark.svg` — documentation and OAuth mark.
- `website/static/img/favicon.svg` — self-contained favicon copy.

Raster and platform-container exports are compatibility assets. Regenerate them
from the canonical SVG when a release surface requires PNG, ICO, or ICNS.

Keep clear space around the mark, do not add a container unless the platform
requires one, and keep the lane order coral / amber / jade. The arrow must
remain amber; a single-colour rendering is reserved for constrained print or
terminal environments.
