---
name: catan-save-resume
description: Maintain Catan game persistence, rollback, and resume flows. Use when changing autosave, per-move snapshots, save-file formats, localStorage persistence, rollback or undo behavior, resume-game pickers, migration of stored state, or any feature where losing game state would be a product risk.
---

# Catan Save Resume

## Overview

Use this skill when work touches how the game state is captured, stored, restored, or rewound. Preserve recoverability first, and treat current code structure as the source of truth rather than assuming a backend exists.

## Workflow

1. Read `docs/product-context.md`, `README.md`, and the persistence-related code paths before proposing changes.
2. Identify the actual storage boundary in the current worktree.
   - If only browser files exist, design around client-side persistence first.
   - If backend files exist, map which state is owned by the client and which state is owned by the server before editing.
3. Preserve a stable state contract.
   - Capture enough data to restore the exact phase, current player, resources, pieces, dice or histogram state, timer state, pending setup choices, and pending robber or discard flows when those features exist.
   - Add explicit versioning or migration handling before changing stored shape in incompatible ways.
4. Save on resolved state transitions, not on pure rendering.
   - Write snapshots after meaningful player or system actions.
   - Avoid duplicate saves caused by rerenders or display-only updates.
5. Keep resume selection trustworthy.
   - Show metadata that helps the player choose the right game, such as date, time, players, phase, or source.
   - Handle missing, partial, or corrupt saves gracefully.
   - Never silently load the wrong save.
6. Treat rollback as recovery, not as a hidden destructive rewrite.
   - Make the rollback target explicit.
   - Preserve auditability when practical.

## Verification

- Run `node --check app.js` after JavaScript changes.
- Exercise the affected flows manually:
  - start a game
  - perform several state-changing actions
  - refresh or restart
  - resume the intended save
  - confirm multiple saves do not overwrite each other unintentionally
- If backend persistence exists, verify the client and server agree on the saved state shape and identifiers.

## Gotchas

- Do not assume `server.js` or a hosted persistence layer exists in this checkout.
- Do not persist DOM state when the underlying game state should be persisted instead.
- Do not let timeout-generated or automated actions bypass the same save paths as manual actions.
- Do not introduce resume behavior that only works for the latest save if the task is about preserving multiple games.
