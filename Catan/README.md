# Graphical Catan Prototype

This repo now includes a browser-based Catan experience with a real hex map and click interactions.

## Run (Graphical)

Install dependencies and start the Node server:

```bash
npm install
npm start
```

Then open:

- `http://localhost:8000`

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
- Online room codes + realtime game state sync (WebSocket).
- Host-controlled online lobby with joinable room code.

## Controls

- `Start New Game` to deal a board.
- `Roll Dice` and, when you can afford builds, use the build popup on the left side of the board:
- `Road`
- `Settlement`
- `City`
- `Clear`
- Click legal spots highlighted on the board.
- `End Turn` to pass to the next player.
- `Online Room` card:
- Enter your name.
- `Create Room` to generate a code.
- Friends use `Join Room` with that code.
- Host starts once 3-4 players have joined.

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
- Reconnect support if a player refreshes/disconnects.
