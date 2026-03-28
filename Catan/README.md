# Graphical Catan Prototype

This repo now includes a browser-based Catan experience with a real hex map and click interactions.

## Run (Graphical)

Install dependencies and start the local Node server:

```bash
npm install
npm start
```

Then open:

- `http://localhost:8000`

On Windows, you can also double-click `run-catan.bat`. It installs dependencies if needed, starts the local server, and opens the app in your browser.

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
- 4:1 bank trade.
- 10 VP win condition.
- Player dashboard with VP, pieces, and hand counts.
- Room-code online lobby with realtime room sync over WebSockets.
- Host-controlled room start for 3-4 players.
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
- The host can use `Undo Last Action` during a room game to roll back to the previous saved state.
- The game autosaves locally in the browser and also journals snapshots through the local server when available.

## Terminal Version

The original CLI implementation is still available:

```bash
python3 catan.py
```

## Current Gaps

This is still a base prototype and does not yet include:

- Development cards.
- Longest Road / Largest Army points.
- Harbor-specific trade rates.
- Bank resource limits.
- Reconnect support if a player refreshes or disconnects mid-room.
