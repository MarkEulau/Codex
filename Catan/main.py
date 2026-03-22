#!/usr/bin/env python3
# main.py — Entry point: prompt for players, launch game

from __future__ import annotations

from typing import List

from constants import MIN_PLAYERS, MAX_PLAYERS
from game import CatanGame


def prompt_players() -> List[str]:
    while True:
        raw = input(f"Number of players ({MIN_PLAYERS}-{MAX_PLAYERS}): ").strip()
        if raw.isdigit() and MIN_PLAYERS <= int(raw) <= MAX_PLAYERS:
            n = int(raw)
            break
        print(f"Please enter {MIN_PLAYERS} or {MAX_PLAYERS}.")

    players: List[str] = []
    for i in range(n):
        while True:
            name = input(f"Player {i + 1} name: ").strip()
            if name:
                players.append(name)
                break
            print("Name cannot be empty.")
    return players


def main() -> None:
    players = prompt_players()
    game = CatanGame(players=players)
    game.run()


if __name__ == "__main__":
    main()