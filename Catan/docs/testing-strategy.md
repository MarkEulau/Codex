# Testing Strategy

## Purpose

This repo is still a browser-first prototype, so the testing strategy should protect the highest-risk logic without introducing a heavy build pipeline. The current priority is correctness of save, resume, turn-state, and 5-6 player extension data.

## Principles

- Keep unit tests deterministic and fast.
- Unit-test pure game-state logic, not DOM rendering.
- Save and resume behavior gets the first test coverage because state loss is a product risk.
- Extension setup and extra-player turn order need explicit coverage because the 5-6 player flow changes the board and setup rhythm.
- Use browser smoke tests for click flow, layout, and animation.
- Add new pure modules when logic in `app.js` becomes important enough to test directly.

## Current Layers

### 1. Unit Tests

- Runner: Node's built-in `node:test`.
- Target: shared pure helpers in `catan-save-utils.js`.
- Focus:
  - snapshot serialization
  - snapshot restore and normalization
  - save-index cleanup
  - hand normalization and clamping
  - high-risk edge cases such as pending robber state or invalid saves

### 2. Manual Smoke Tests

Use the browser app for flows that depend on the DOM or timing:

- start a new game
- place setup settlement and road
- refresh and resume during setup
- roll, build, trade, and end turn
- refresh and resume during the main phase
- confirm the intended save appears in the resume picker
- create a room, join from additional browser tabs, and start a room game
- start a 5-player game, then a 6-player game, and confirm the extension setup stays clickable and legible
- verify the extra setup pass and turn order behave correctly for 5-6 players
- verify only the active room player can take turn actions
- trigger room rollback and confirm the prior saved state is restored
- verify a room game can still be created, started, resumed, and rolled back when configured for 5-6 players

## Commands

From the repo root:

```bash
npm test
```

Optional coverage run:

```bash
npm run test:coverage
```

## What To Test Next

- Extract more pure turn-flow helpers out of `app.js` and give them the same Node test treatment.
- Add a small browser-level smoke suite later if the repo grows beyond manual verification.
- Add regression cases whenever a save or resume bug is fixed so the same state shape cannot break twice.
- Add dedicated smoke coverage for 5-6 player extension setup whenever the board or turn-flow changes touch setup order, click targets, or room start validation.
