# Catan Product Context

## Purpose

This document captures the product direction distilled from earlier project conversations. It is intentionally broader than the current codebase. Use it to understand where the game is headed, not to infer that every discussed feature already exists in this checkout.

## Product Direction

- Build a polished digital Catan experience that feels closer to a premium board-game client than a rough prototype.
- Keep the game local-first, with optional remote or hosted play added only when the codebase actually contains the needed backend pieces.
- Make save and recovery a first-class product feature, not a side feature.

## Core Experience Goals

- Present the board as the hero surface with contextual controls on top of it.
- Use premium-feeling HUD, animation, and tactile feedback without making interactions harder to understand.
- Keep turn flow obvious: setup, roll, robber, build, trade, end turn, and timeout behavior should all be legible.
- Support both desktop and mobile play without collapsing into a generic web-app layout.

## Non-Negotiable Reliability Goals

- Save every meaningful move or state transition.
- Preserve all games rather than only the latest game.
- Allow players to resume a specific game, not only the most recent one.
- Keep rollback or undo paths available for recovery when something goes wrong.
- Avoid silent loss of state during refresh, crash, timeout, or reconnect scenarios.

## Turn-Flow Goals

- Setup placement should be easy to understand and easy to click.
- Dice rolling should feel game-like and readable.
- Build and trade affordances should appear contextually rather than as always-on clutter.
- Turn timers should be configurable and should resolve stalled turns safely.
- Timeout behavior during setup and main turns should be deterministic and recoverable.

## Visual Goals

- Aim for a premium board-game presentation inspired by polished commercial clients.
- Keep the inspiration stylistic only. Do not copy copyrighted art, textures, or branded assets.
- Use motion to reinforce state changes, not to obscure click targets.
- Provide reduced-motion fallbacks.

## Current Repo Reality

- The current repository contains a browser prototype in `index.html`, `style.css`, and `app.js`, a local Node server in `server.js`, and a CLI version in `catan.py`.
- The current worktree now includes room-code multiplayer, local save APIs, save journaling to disk, and rollback for room games.
- Hosted deployment, reconnect hardening, and production tunnel setup are still roadmap work until the matching code exists here.

## Implementation Order To Prefer

1. Keep local gameplay stable and correct.
2. Strengthen save, rollback, and resume reliability.
3. Improve turn flow and timer behavior.
4. Add premium UI and animation polish without breaking readability.
5. Expand into remote play and hosting only when the codebase contains the needed backend foundation.
