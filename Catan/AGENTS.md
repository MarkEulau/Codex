# Catan Repo Guide

## Scope

- Treat this repository as a browser-first Catan prototype with a secondary terminal implementation.
- Use `docs/product-context.md` for the distilled product direction from prior planning conversations.
- Treat the checked-in code as the source of truth for what exists today.

## Repo Layout

- `index.html`, `style.css`, `app.js`: main browser client.
- `catan.py`: terminal prototype.
- `README.md`: current run instructions for this worktree.
- `docs/product-context.md`: target-state product context and roadmap notes.
- `.agents/skills/`: repo-local workflows for recurring Catan tasks.

## Current Reality

- This worktree currently contains the static browser prototype and the CLI version.
- Do not assume online multiplayer, `server.js`, room-code flows, Cloudflare hosting, or backend save APIs exist unless they are present in the current checkout.
- When roadmap context conflicts with the code, trust the code and call out the mismatch explicitly.

## Run And Verify

- Run the browser client with `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000/index.html`.
- Run the terminal version with `python3 catan.py`.
- After JavaScript edits, run `node --check app.js`.
- Prefer manual smoke tests for the exact flow you changed because this repo does not currently include automated frontend tests.

## Priorities

- Preserve game-state correctness before visual polish.
- Treat save, rollback, and resume behavior as high-risk areas when they exist or are introduced.
- Keep turn-state affordances obvious: what the player can do, what is blocked, and why.
- Preserve desktop and mobile usability.
- Respect reduced-motion when adding animation.

## Working Style

- Make small, targeted changes that keep rules logic and presentation concerns easy to review.
- Separate behavior changes from cosmetic changes when practical.
- Update `docs/product-context.md` when the intended product direction materially changes.
- Use the matching repo skill from `.agents/skills/` when the task fits one of those workflows.

## Done Means

- The requested behavior is implemented in code, not just described.
- Relevant syntax checks and manual verification steps have been run or explicitly called out as not run.
- Assumptions about missing backend or multiplayer pieces are stated clearly.
