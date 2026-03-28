# Graphical Catan Prototype

This repo now includes a browser-based Catan experience with a real hex map, click interactions, and 3-6 player support through the 5-6 player extension setup.

## Run (Graphical)

Install dependencies and start the local Node server:

```bash
npm install
npm start
```

Then open:

- `http://localhost:8000`

On Windows, you can also double-click `run-catan.bat`. On macOS, double-click `run-catan.command`. Both launchers install dependencies if needed, start the local server, and open the app in your browser.

## Testing

Run the current unit suite from the repo root:

```bash
npm test
```

The unit tests focus on shared save and state helpers used by the browser app. For the broader approach and the manual smoke-test checklist, see `docs/testing-strategy.md`.

## What Is Implemented (Graphical)

- Rendered 19-hex board with proper resource tiles and number tokens.
- Resource icons on each tile for quick visual scanning.
- High-probability `6` and `8` tokens are generated non-adjacent.
- Clickable board interactions:
- Place settlements on node points.
- Place roads on board edges.
- Upgrade settlements to cities.
- Move robber by clicking tiles.
- Discard and robber-victim choices are click-based (no typed prompts).
- Setup snake order with free initial placements.
- Starting resource grant from second settlement.
- Turn flow:
- Roll dice.
- Resource distribution.
- Roll-7 discard + robber handling.
- Build/trade actions then end turn.
- Development cards with Knight, Road Building, Year of Plenty, Monopoly, and hidden VP cards.
- Harbor-aware bank trade rates with 3:1 and 2:1 ports.
- Finite bank inventory with shortage handling.
- Longest Road and Largest Army awards.
- 10 VP win condition.
- Player dashboard with VP, pieces, and hand counts.
- Room-code online lobby with realtime room sync over WebSockets.
- Host-controlled room start for 3-6 players.
- Server-side save journaling to `game_saves/*.jsonl` for room games and local games.
- Resume picker that combines browser saves with server-journaled saves.
- Host rollback to the previous saved room action.

## Controls

- `Start New Game` to deal a board.
- `Resume Game` to choose from browser saves or server-journaled saves.
- `Roll Dice` and, when you can afford builds, use the build popup on the left side of the board:
- `Road`
- `Settlement`
- `City`
- `Clear`
- Click legal spots highlighted on the board.
- `End Turn` to pass to the next player.
- `Online Room` lets a host create a code and other players join before the room starts.
- If a room drops, re-entering the room code will attempt to reclaim your seat automatically when a reconnect token is available.
- The host can use `Undo Last Action` during a room game to roll back to the previous saved state.
- The game autosaves locally in the browser and also journals snapshots through the local server when available.
- Set up 3, 4, 5, or 6 players from the game setup card before starting a new game.

## Terminal Version

The original CLI implementation is still available:

```bash
python3 catan.py
```

## Current Gaps

The browser game now covers the base rules plus the 5-6 player extension flow. Remaining work is mostly polish and broader smoke coverage:

- More full-game manual passes across refresh, resume, reconnect, and rollback scenarios.
- Additional UI polish for narrow layouts and longer six-player sessions.
- The CLI version remains secondary and is not kept at feature parity with the browser game.

## 5-6 Player Extension Notes

- The setup card now exposes 5 and 6 player starts alongside the base 3 and 4 player game.
- The extension board uses the larger hex layout, added resource and development-card counts, harbors, and brown/green player colors.
- Paired turns are enabled for 5-6 player games, so players get a no-roll action turn between full turns.
- Use the extension flow for broader manual testing because turn order, setup passes, room start validation, and reconnect paths all change with 5-6 players.
- Keep the browser client as the source of truth for the extension flow; the CLI remains secondary.
