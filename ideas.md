# Oh API Playground — Design Brainstorm

## Three stylistic approaches

### Theme Name: Ember Terminal
**Very Brief Intro:** An elevated developer workbench inspired by precision instruments and early terminal hardware, with a carefully restrained ember-orange energy on deep aubergine surfaces. It feels technical, confident, and intensely readable rather than decorative.
**Probability:** 0.07

### Theme Name: Lunar Studio
**Very Brief Intro:** A pale, editorial interface with black ink typography, warm lilac shadows, and generous gallery-like spacing. It would frame avatar and generated media as curated creative work.
**Probability:** 0.04

### Theme Name: Signal Workshop
**Very Brief Intro:** A steel-blue industrial dashboard that brings a physical control-room quality to API testing through dense status readouts, dividers, and mechanical motion. It prioritizes operational calm and diagnostic clarity.
**Probability:** 0.09

## Chosen approach: Ember Terminal

### Design Movement
**Contemporary instrument-panel design** fused with the restraint of editorial technical documentation. The experience should feel like a professional testing console rather than a consumer chat app.

### Core Principles
1. Create a strong hierarchy through split-screen zones, not a centered card stack.
2. Treat orange as a controlled signal color, reserved for direct action, selected state, and meaningful live status.
3. Use thin plum hairlines, cool lavender metadata, and tactile dark surfaces to keep dense information legible.
4. Pair procedural details, readable diagnostics, and calm empty states so every API outcome is explainable.

### Color Philosophy
Near-black plum backgrounds create a quiet field that lets imagery and generated media carry visual weight. Burnt orange is the energetic, ownable action color, while amethyst provides secondary wayfinding without competing. Tinted charcoal panels and subtle mauve borders produce depth through material contrast instead of loud gradients.

### Layout Paradigm
The desktop experience is a **three-station workbench**: a fixed navigation rail, a compact command/status header, and a flexible playground canvas that divides into browsing and working zones. On small screens the stations collapse into a scrollable sequence with contextual controls preserved.

### Signature Elements
1. An orange **signal line** and small status dot that appear in navigation, progress, and active request states.
2. Fine **coordinate-label metadata** (endpoint, method, persistence status) set in an uppercase mono face.
3. Soft **aperture glow** behind the current work area, used sparingly to focus attention without neon effects.

### Interaction Philosophy
Each interaction should act like an instrument: crisp selected states, immediate tactile button feedback, deliberate loading feedback, and always-visible diagnostics. Actions create clear toasts and results open into visual output without disorienting page jumps.

### Animation
Use a 160–220ms custom ease-out for button presses, tabs, and selection borders. Character cards lift by two pixels and reveal their selection rail on hover; request indicators pulse gently only while active. Entrances use short opacity-and-translate transitions, respect reduced-motion preferences, and never block typing or keyboard navigation.

### Typography System
**Space Grotesk** drives display and interface headings with variable weight contrast; **DM Mono** carries endpoint labels, IDs, badges, and technical diagnostics. Headings are compact and assertive while descriptive copy has an open line-height and lower visual weight.

### Brand Essence
**Oh API Playground is the hands-on testing desk for creators building with expressive AI characters—faster to inspect, clearer to diagnose, and more visual by design.** Personality: exacting, expressive, composed.

### Brand Voice
Headlines are direct and operative; CTAs name the action precisely; microcopy anticipates the next technical decision without jargon for its own sake. Example: “Send a live message, see the character answer.” Example: “Paste a key to unlock the workbench.” Generic filler such as “Welcome to our website” and “Get started today” is prohibited.

### Wordmark & Logo
The logo is a compact asymmetric **O aperture**: a rounded, orange open ring interrupted by a diagonal amethyst signal stroke. It is used as a bold standalone symbol next to the custom-spaced `oh /` wordmark, never as default unmodified text.

### Signature Brand Color
**Signal Ember — #FC7A1D.**

## Style Decisions

- The first viewport always carries the asymmetric O aperture and custom-spaced `oh /` wordmark as a primary brand anchor.
- Desktop composition reads as three stations: a persistent navigation rail, a compact command/status header, and a divided playground canvas.
- The orange signal line is reserved for selected navigation, direct action, request readiness, and live status; it is never decorative.
