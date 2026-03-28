# Testing Strategy

## Purpose

This repo is still a browser-first prototype, so the testing strategy should protect the highest-risk logic without introducing a heavy build pipeline. The current priority is correctness of save, resume, and turn-state data.

## Principles

- Keep unit tests deterministic and fast.
- Unit-test pure game-state logic, not DOM rendering.
- Save and resume behavior gets the first test coverage because state loss is a product risk.
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
- verify only the active room player can take turn actions
- trigger room rollback and confirm the prior saved state is restored

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
