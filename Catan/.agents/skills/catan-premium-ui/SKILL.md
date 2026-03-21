---
name: catan-premium-ui
description: Polish the Catan browser client to feel like a premium board-game app. Use when changing board presentation, HUD layout, contextual overlays, animation timing, dice visuals, motion cues, typography, materials, responsive behavior, or any UI task where the goal is stronger game feel without changing the underlying rules.
---

# Catan Premium Ui

## Overview

Use this skill when a task is about visual polish, feel, or presentation. Preserve gameplay correctness, keep the board readable, and aim for premium game-client quality rather than generic dashboard styling.

## Workflow

1. Read `docs/product-context.md` and inspect the current UI structure in `index.html`, `style.css`, and the relevant rendering logic in `app.js`.
2. Preserve rules logic unless the user explicitly asks for gameplay changes.
3. Treat the board as the hero surface.
   - Favor contextual overlays and clear board affordances over persistent side-panel clutter.
   - Make active turn, available actions, and roll outcomes easy to read at a glance.
4. Push toward premium game feel with restraint.
   - Use depth, materials, lighting, framing, and purposeful motion.
   - Avoid boilerplate web-app layouts and flat default styling.
5. Keep the inspiration stylistic, not literal.
   - Draw from polished board-game clients for feel and hierarchy.
   - Do not copy copyrighted textures, icons, or branded assets.
6. Make motion serve interaction.
   - Use animation to clarify rolls, highlights, and state changes.
   - Keep click targets stable enough to use.
   - Preserve reduced-motion support.
7. Check responsive behavior whenever changing board overlays or HUD placement.

## Verification

- Run `node --check app.js` after JavaScript changes.
- Manually verify the affected screens in the browser on both desktop-width and narrow-width layouts.
- Check that animation and polish changes do not obscure legal clicks, status text, or turn affordances.
- Check that reduced-motion handling still works when motion styles are added or changed.

## Gotchas

- Do not let presentation changes silently alter gameplay behavior.
- Do not make premium visuals depend on copyrighted third-party assets.
- Do not add motion that causes target drift or hurts click accuracy.
- Do not optimize for desktop only; overlay placement and spacing must still work on smaller screens.
