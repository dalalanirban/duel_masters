---
name: awesome-design-md
description: >-
  Curated collection of 84+ production DESIGN.md specifications extracted from real-world
  developer tools, AI platforms, fintech, and modern websites (VoltAgent / Google Stitch standard).
  Use when designing, restyling, or generating frontend components, palettes, typography hierarchies,
  or design systems inspired by specific real-world brands (Linear, Raycast, Vercel, Supabase, Claude, etc.).
---

# Awesome DESIGN.md

A curated collection of production `DESIGN.md` specifications extracted and standardized from 84+ real-world developer tools, modern web applications, and AI platforms.

Each `DESIGN.md` defines a complete visual language in plain markdown that AI coding agents read directly:
- Semantic color tokens (canvas, surfaces, ink, accents, borders, status)
- Typography scales (families, sizes, line heights, letter tracking)
- Elevation, borders, and shadows
- Component archetypes (cards, buttons, badges, navigation, inputs)
- Layout rhythms and density rules

---

## How to Use This Skill

1. **Find an Archetype**: Identify the brand aesthetic or visual direction that best fits your task (e.g. `linear.app` for technical luxury, `vercel` for monochrome developer tooling, `raycast` for keyboard-centric dark density).
2. **Read the Spec**: Open the corresponding `design-md/<brand>/DESIGN.md` file using `read_file`.
3. **Extract Tokens & Patterns**: Adapt the color values, typography ratios, and surface hierarchy into your project's design system or components.
4. **Maintain Cohesion**: When building project components, align with the active project `DESIGN.md` at the workspace root, using these brand specs as references for micro-interactions, contrast, and depth.

---

## Curated Design Systems Index

### Developer Tools & Infrastructure
- [**Linear**](./design-md/linear.app/DESIGN.md): Deep charcoal (`#010102`), lavender-blue accent (`#5e6ad2`), technical luxury, tight letter-spacing.
- [**Vercel**](./design-md/vercel/DESIGN.md): Pure monochrome minimalism, high-contrast borders, geometric sans.
- [**Raycast**](./design-md/raycast/DESIGN.md): Dense dark HUD, red/coral accent, keyboard-shortcut-driven surfaces.
- [**Supabase**](./design-md/supabase/DESIGN.md): Emerald green accent (`#3ecf8e`), dark slate surfaces, database clarity.
- [**Cursor**](./design-md/cursor/DESIGN.md): Developer-centric dark canvas, syntax-inspired neutral tones.
- [**PostHog**](./design-md/posthog/DESIGN.md): Playful hedgehog retro-modern, warm accents, high-density data.
- [**Sentry**](./design-md/sentry/DESIGN.md): Deep purple/slate, developer error tooling, focused contrast.
- [**Warp**](./design-md/warp/DESIGN.md): Modern terminal aesthetic, neon blue/cyan accents.
- [**Resend**](./design-md/resend/DESIGN.md): Pure black and white, crisp hairline borders, minimalist email API aesthetic.

### AI Labs & Intelligence
- [**Claude**](./design-md/claude/DESIGN.md): Warm terracotta accent, editorial warmth, calm reading cadence.
- [**x.ai**](./design-md/x.ai/DESIGN.md): Pure black canvas, crisp technical typography, high-impact minimalism.
- [**Runway**](./design-md/runwayml/DESIGN.md): Editorial film-festival aesthetic, cinematic dark heroes, paper-white bands.
- [**ElevenLabs**](./design-md/elevenlabs/DESIGN.md): Audio-waveform dark UI, cinematic glow, precision sliders.
- [**Ollama**](./design-md/ollama/DESIGN.md): Terminal-first simplicity, monochrome monospace accents.
- [**VoltAgent**](./design-md/voltagent/DESIGN.md): Void-black canvas, emerald green accents, terminal-native agent UI.
- [**Cohere**](./design-md/cohere/DESIGN.md): Vibrant gradients, data-rich enterprise AI dashboard aesthetic.
- [**Mistral AI**](./design-md/mistral.ai/DESIGN.md): French-engineered minimalism, subtle purple tones.

### Creative & Product Design
- [**Figma**](./design-md/figma/DESIGN.md): Vibrant multi-color accents, clean collaborative canvas, tool-dense UI.
- [**Framer**](./design-md/framer/DESIGN.md): Sleek dark gradients, fluid motion, interactive component design.
- [**Webflow**](./design-md/webflow/DESIGN.md): Structured designer layout, clean panel hierarchy.
- [**Notion**](./design-md/notion/DESIGN.md): Warm ivory/paper canvas, clean typography, document-first density.

### FinTech & Modern Finance
- [**Stripe**](./design-md/stripe/DESIGN.md): Iconic mesh gradients, indigo primary, pixel-perfect documentation.
- [**Mercury**](./design-md/mercury/DESIGN.md): Elegant banking dark blue/slate, refined serif display headings.
- [**Revolut**](./design-md/revolut/DESIGN.md): High-contrast mobile-first fintech, bold typography, electric blue accents.
- [**Coinbase**](./design-md/coinbase/DESIGN.md): Crisp royal blue, clean financial cards, accessible contrast.

### Consumer, Hardware & Automotive
- [**Apple**](./design-md/apple/DESIGN.md): Precision typography, SF Pro tracking, subtle surface blurs (glassmorphism).
- [**Tesla**](./design-md/tesla/DESIGN.md): Stark futuristic minimalism, ultra-wide typography, bold imagery.
- [**PlayStation**](./design-md/playstation/DESIGN.md): Deep immersive gaming navy/black, glowing blue energy, dynamic HUD panels.
- [**Ferrari** / **Lamborghini** / **BMW M**](./design-md/ferrari/DESIGN.md): High-performance racing aesthetics, aggressive accents, carbon surfaces.

---

## Directory Structure
```
awesome-design-md/
├── SKILL.md                  # This guide and index
└── design-md/
    ├── <brand-name>/
    │   ├── DESIGN.md         # Full design system tokens and rules
    │   └── README.md         # Overview and preview link
```
