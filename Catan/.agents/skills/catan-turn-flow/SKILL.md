---
name: catan-turn-flow
description: Maintain Catan setup and turn-state behavior. Use when changing setup placement, two-step confirmations, dice flow, roll gating, robber handling, build or trade availability, turn timers, timeout automation, action popups, or any state-machine logic that decides what the player can do next.
---

# Catan Turn Flow

## Overview

Use this skill when the task changes how a turn progresses from setup through end turn. Keep the state machine explicit, keep the UI honest about what actions are available, and prefer clickability and clarity over flashy motion.

## Workflow

1. Read `docs/product-context.md` and inspect the current turn and setup state before changing behavior.
2. Enumerate the affected phases explicitly.
   - Common phases include pregame, setup settlement selection, setup road selection, main turn before roll, rolling, robber resolution, build or trade window, end turn, and victory.
3. Change availability rules before changing visuals.
   - Decide exactly when an action is legal.
   - Then make the UI expose that rule clearly through button state, highlight state, popup visibility, or status text.
4. Keep setup interactions deliberate.
   - Favor stable click targets over motion-heavy affordances.
   - Use confirm-on-second-click or other explicit confirmation only when it reduces misclick risk.
5. Keep timeout logic deterministic.
   - Distinguish setup timeouts from main-turn timeouts.
   - Route automated actions through the same state transitions that manual actions use whenever possible.
6. Block conflicting actions during transient states.
   - Avoid letting build, trade, or end-turn actions fire during roll animations or pending robber flows.
   - Reset temporary UI state between turns.

## Verification

- Run `node --check app.js` after JavaScript changes.
- Manually cover the specific branches touched by the change:
  - setup placement
  - dice roll and post-roll gating
  - robber or discard flow if relevant
  - build and trade availability
  - timer countdown and timeout behavior if relevant
- Verify that status copy and controls match the actual underlying state.

## Gotchas

- Do not let UI overlays overlap or imply actions that the state machine disallows.
- Do not derive critical game phase only from button labels or CSS classes.
- Do not make animated highlights so aggressive that legal targets become harder to click.
- Do not change timer or timeout behavior without checking how save or resume logic should reflect it.
