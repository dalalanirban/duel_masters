---
version: "1.0"
name: duel-masters-arena
description: >-
  A dark sci-fi / fantasy tactical card game design system built around deep void canvas (#070b14),
  slate container surfaces (#0b1220 to #17233d), and five high-resonance civilization color accents
  (Light gold, Water cyan, Darkness purple, Fire red, Nature green). Engineered for a 100vh
  viewport-locked duel arena requiring zero vertical page scrolling, high-density HUD telemetry,
  subtle zone watermarks, and precision card inspection.

colors:
  # Base Canvas & Surface Elevation
  canvas: "#070b14"
  surface-1: "#0b1220"
  surface-2: "#0f172a"
  surface-3: "#17233d"
  surface-elevated: "#1e293b"
  
  # Borders & Dividers
  hairline: "#1e293b"
  hairline-strong: "#334155"
  hairline-glow: "rgba(255, 255, 255, 0.12)"
  
  # Ink & Typography
  ink: "#f8fafc"
  ink-muted: "#94a3b8"
  ink-subtle: "#64748b"
  ink-disabled: "#475569"
  
  # Brand & Primary CTAs
  primary: "#f59e0b"
  primary-hover: "#d97706"
  primary-active: "#b45309"
  on-primary: "#070b14"
  
  # Five Core Civilizations
  civ-light: "#facc15"
  civ-light-glow: "rgba(250, 204, 21, 0.35)"
  civ-light-surface: "rgba(250, 204, 21, 0.08)"
  
  civ-water: "#38bdf8"
  civ-water-glow: "rgba(56, 189, 248, 0.35)"
  civ-water-surface: "rgba(56, 189, 248, 0.08)"
  
  civ-darkness: "#c084fc"
  civ-darkness-glow: "rgba(192, 132, 252, 0.35)"
  civ-darkness-surface: "rgba(192, 132, 252, 0.08)"
  
  civ-fire: "#f87171"
  civ-fire-glow: "rgba(248, 113, 113, 0.35)"
  civ-fire-surface: "rgba(248, 113, 113, 0.08)"
  
  civ-nature: "#4ade80"
  civ-nature-glow: "rgba(74, 222, 128, 0.35)"
  civ-nature-surface: "rgba(74, 222, 128, 0.08)"

  # Duel State & Mechanics
  shield-intact: "#f59e0b"
  shield-broken: "#64748b"
  mana-tapped: "#334155"
  mana-untapped: "#38bdf8"
  battle-summoning-sickness: "rgba(148, 163, 184, 0.4)"

typography:
  font-family-display: "Cinzel, 'Cinzel Decorative', Georgia, serif"
  font-family-body: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  font-family-mono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace"

  scale:
    title-xl:
      fontSize: "24px"
      fontWeight: 700
      lineHeight: 1.2
      letterSpacing: "0.05em"
      textTransform: "uppercase"
    headline:
      fontSize: "18px"
      fontWeight: 600
      lineHeight: 1.3
      letterSpacing: "0.02em"
    body:
      fontSize: "14px"
      fontWeight: 400
      lineHeight: 1.5
    body-sm:
      fontSize: "12px"
      fontWeight: 400
      lineHeight: 1.4
    caption:
      fontSize: "10px"
      fontWeight: 600
      lineHeight: 1.2
      letterSpacing: "0.06em"
      textTransform: "uppercase"
    badge:
      fontSize: "10px"
      fontWeight: 700
      letterSpacing: "0.04em"
      fontFamily: "mono"

layout:
  # Viewport Rules
  viewportLock: "100vh"
  overflowPolicy: "No vertical scrolling in root arena; individual utility panels scroll internally if needed"
  
  # Three-Column Structure
  gridColumns: "minmax(240px, 20vw) 1fr minmax(240px, 20vw)"
  
  # Center Arena Vertical Rhythm (Top to Bottom)
  arenaRows:
    - name: "opponent-hand"
      height: "compact (card fan or mini backs)"
    - name: "opponent-shields-row"
      layout: "Graveyard (left) | 5 Shield Cards (center) | Deck (right)"
    - name: "opponent-battle-zone"
      watermark: "OPPONENT BATTLE ZONE"
      alignment: "flex-center"
    - name: "player-battle-zone"
      watermark: "YOUR BATTLE ZONE"
      alignment: "flex-center"
    - name: "player-shields-row"
      layout: "Graveyard (left) | 5 Shield Cards (center) | Deck (right)"
    - name: "player-mana-row"
      watermark: "YOUR MANA ZONE"
      orientation: "horizontal tapped/untapped pills"
    - name: "player-hand"
      watermark: "YOUR HAND"
      interactive: "playable cards with hover elevation"

components:
  card:
    aspectRatio: "2.5 / 3.5"
    borderRadius: "8px"
    borderWidth: "1px"
    borderColor: "var(--hairline-strong)"
    hoverTransform: "translateY(-4px) scale(1.04)"
    transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)"
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.5)"
    
  zoneWatermark:
    position: "absolute"
    inset: "0"
    display: "flex"
    alignItems: "center"
    justifyContent: "center"
    pointerEvents: "none"
    opacity: 0.12
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.15em"
    textTransform: "uppercase"
    fontFamily: "var(--font-family-display)"

  inspectorPane:
    width: "100%"
    background: "var(--surface-1)"
    borderRight: "1px solid var(--hairline)"
    padding: "16px"
    overflowY: "auto"
    cardArtDisplay: "Large centered preview with civilization border"
    mechanicsBreakdown: "Civilization badges, mana cost orb, power value, ability rulebook"

  duelLog:
    width: "100%"
    background: "var(--surface-1)"
    borderLeft: "1px solid var(--hairline)"
    padding: "12px"
    fontFamily: "var(--font-family-mono)"
    cardTagLink: "Interactive underlined text showing card details in Inspector on hover/click"

  actionButtonPrimary:
    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
    color: "#070b14"
    fontWeight: 700
    borderRadius: "6px"
    boxShadow: "0 0 16px rgba(245, 158, 11, 0.3)"
    hoverBoxShadow: "0 0 24px rgba(245, 158, 11, 0.5)"
---

# Duel Masters Design System

This document is the authoritative design specification for the **Duel Masters Web Client**.
AI agents generating UI components, styles, or arena layouts must conform to the tokens and rules defined in the YAML frontmatter above.

## Core Design Tenets

1. **Zero-Scroll Viewport Lock**: The entire battle arena (both players' hands, mana, shields, graveyards, decks, and battle zones) must remain visible in a single 100vh frame. Any layout adjustment that introduces root page scrolling is prohibited.
2. **Subtle Watermarks over Heavy Banners**: Arena zones use high-tracking, low-opacity (12%) centered background text watermarks instead of vertical container headers to maximize card canvas area.
3. **Civilization Color Fidelity**: Every card, mana orb, and zone interaction must use the precise civilization color values (Light gold, Water cyan, Darkness purple, Fire red, Nature green).
4. **Instant Card Inspection**: Any card in the arena, hand, graveyard, or duel log is immediately previewed in the left-hand Card Inspector on hover.
