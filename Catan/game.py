# game.py — CatanGame: all game-state logic and turn management

from **future** import annotations

import random
from typing import Dict, List, Optional, Set, Tuple

from catan_models import GameConfig, PlayerConfig

from board import build_board
from constants import (
RESOURCES, ROAD_COST, SETTLEMENT_COST, CITY_COST, VICTORY_POINTS_TO_WIN
)
from models import Player, Tile, Node, Edge
from utils import can_afford, pay_cost, add_resources

class CatanGame:
def **init**(self, players: List[str], seed: Optional[int] = None):
config = GameConfig(players=[PlayerConfig(name=name) for name in players])
self.rng = random.Random(seed)
self.players: List[Player] = [Player(name=p.name) for p in config.players]
self.tiles: List[Tile]
self.nodes: List[Node]
self.edges: List[Edge]
self.tiles, self.nodes, self.edges, self.robber_tile = build_board(self.rng)
self.current_player: int = 0
self.round_num: int = 1

```
# ── Graph helpers ─────────────────────────────────────────────────────────

def node_neighbors(self, node_idx: int) -> Set[int]:
    out: Set[int] = set()
    node = self.nodes[node_idx]
    for eidx in node.edges:
        edge = self.edges[eidx]
        out.add(edge.b if edge.a == node_idx else edge.a)
    return out

# ── Display ───────────────────────────────────────────────────────────────

def print_board(self) -> None:
    print("\nTiles:")
    for t in self.tiles:
        robber = " R" if t.idx == self.robber_tile else ""
        num = "-" if t.number is None else str(t.number)
        print(f"  [{t.idx:02}] ({t.q:+d},{t.r:+d}) {t.resource:6} num:{num:>2}{robber}")

    print("\nNodes:")
    for n in self.nodes:
        owner = "-"
        if n.owner is not None:
            piece = "C" if n.is_city else "S"
            owner = f"{self.players[n.owner].name}:{piece}"
        print(f"  [{n.idx:02}] owner:{owner:10} hexes:{n.hexes}")

    print("\nEdges:")
    for e in self.edges:
        owner = "-" if e.owner is None else self.players[e.owner].name
        print(f"  [{e.idx:02}] {e.a:02}-{e.b:02} owner:{owner}")
    print()

def print_status(self) -> None:
    print("\nPlayers:")
    for p in self.players:
        print(
            f"  {p.name:10} VP:{p.victory_points:2} "
            f"Roads:{len(p.roads):2} Sett:{len(p.settlements):2} "
            f"Cities:{len(p.cities):2} Hand[{p.hand_str()}]"
        )
    print()

# ── Resource distribution ─────────────────────────────────────────────────

def distribute_resources(self, roll: int) -> None:
    gains: List[Dict[str, int]] = [{r: 0 for r in RESOURCES} for _ in self.players]
    for tile in self.tiles:
        if tile.idx == self.robber_tile or tile.number != roll or tile.resource == "desert":
            continue
        for nidx in tile.nodes:
            node = self.nodes[nidx]
            if node.owner is None:
                continue
            amount = 2 if node.is_city else 1
            gains[node.owner][tile.resource] += amount
    for idx, gain in enumerate(gains):
        add_resources(self.players[idx].hand, gain)
    print(f"Roll {roll}: resources distributed.")

# ── Placement validation ──────────────────────────────────────────────────

def distance_rule_ok(self, node_idx: int) -> bool:
    return all(self.nodes[nbr].owner is None for nbr in self.node_neighbors(node_idx))

def has_connected_road(self, player_idx: int, node_idx: int) -> bool:
    return any(self.edges[eidx].owner == player_idx for eidx in self.nodes[node_idx].edges)

def can_build_road(
    self, player_idx: int, edge_idx: int, setup_node: Optional[int] = None
) -> Tuple[bool, str]:
    if edge_idx < 0 or edge_idx >= len(self.edges):
        return False, "Invalid edge id."
    edge = self.edges[edge_idx]
    if edge.owner is not None:
        return False, "Edge already has a road."
    if setup_node is not None:
        if edge.a == setup_node or edge.b == setup_node:
            return True, ""
        return False, "Setup road must touch the just-placed settlement."
    for nidx in (edge.a, edge.b):
        node = self.nodes[nidx]
        if node.owner == player_idx:
            return True, ""
        if any(self.edges[eidx].owner == player_idx for eidx in node.edges):
            return True, ""
    return False, "Road must connect to your existing road or building."

def can_build_settlement(
    self, player_idx: int, node_idx: int, setup: bool = False
) -> Tuple[bool, str]:
    if node_idx < 0 or node_idx >= len(self.nodes):
        return False, "Invalid node id."
    node = self.nodes[node_idx]
    if node.owner is not None:
        return False, "Node is already occupied."
    if not self.distance_rule_ok(node_idx):
        return False, "Distance rule violated (adjacent settlement/city)."
    if not setup and not self.has_connected_road(player_idx, node_idx):
        return False, "Settlement must connect to one of your roads."
    return True, ""

def can_build_city(self, player_idx: int, node_idx: int) -> Tuple[bool, str]:
    if node_idx < 0 or node_idx >= len(self.nodes):
        return False, "Invalid node id."
    node = self.nodes[node_idx]
    if node.owner != player_idx:
        return False, "You do not own this node."
    if node.is_city:
        return False, "Node is already a city."
    return True, ""

# ── Build actions ─────────────────────────────────────────────────────────

def build_road(
    self, player_idx: int, edge_idx: int, free: bool = False, setup_node: Optional[int] = None
) -> bool:
    ok, reason = self.can_build_road(player_idx, edge_idx, setup_node=setup_node)
    if not ok:
        print(reason)
        return False
    player = self.players[player_idx]
    if not free:
        if not can_afford(player.hand, ROAD_COST):
            print("Not enough resources for road.")
            return False
        pay_cost(player.hand, ROAD_COST)
    self.edges[edge_idx].owner = player_idx
    player.roads.add(edge_idx)
    print(f"{player.name} built road on edge {edge_idx}.")
    return True

def build_settlement(
    self, player_idx: int, node_idx: int, free: bool = False, setup: bool = False
) -> bool:
    ok, reason = self.can_build_settlement(player_idx, node_idx, setup=setup)
    if not ok:
        print(reason)
        return False
    player = self.players[player_idx]
    if not free:
        if not can_afford(player.hand, SETTLEMENT_COST):
            print("Not enough resources for settlement.")
            return False
        pay_cost(player.hand, SETTLEMENT_COST)
    self.nodes[node_idx].owner = player_idx
    self.nodes[node_idx].is_city = False
    player.settlements.add(node_idx)
    print(f"{player.name} built settlement on node {node_idx}.")
    return True

def build_city(self, player_idx: int, node_idx: int) -> bool:
    ok, reason = self.can_build_city(player_idx, node_idx)
    if not ok:
        print(reason)
        return False
    player = self.players[player_idx]
    if not can_afford(player.hand, CITY_COST):
        print("Not enough resources for city.")
        return False
    pay_cost(player.hand, CITY_COST)
    self.nodes[node_idx].is_city = True
    player.settlements.discard(node_idx)
    player.cities.add(node_idx)
    print(f"{player.name} upgraded node {node_idx} to city.")
    return True

# ── Robber ────────────────────────────────────────────────────────────────

def move_robber(self, player_idx: int, tile_idx: int) -> None:
    if tile_idx < 0 or tile_idx >= len(self.tiles):
        print("Invalid tile.")
        return
    if tile_idx == self.robber_tile:
        print("Robber is already there.")
        return
    self.robber_tile = tile_idx
    victims: Set[int] = {
        self.nodes[nidx].owner
        for nidx in self.tiles[tile_idx].nodes
        if self.nodes[nidx].owner is not None
        and self.nodes[nidx].owner != player_idx
        and self.players[self.nodes[nidx].owner].resource_count > 0
    }
    if not victims:
        print("Robber moved. No one to steal from.")
        return
    print("Victims:", ", ".join(f"{v}:{self.players[v].name}" for v in sorted(victims)))
    while True:
        choice = input("Choose victim player index to steal from: ").strip()
        if not choice.isdigit() or int(choice) not in victims:
            print("Invalid victim.")
            continue
        vidx = int(choice)
        break
    victim = self.players[vidx]
    bag = [res for res in RESOURCES for _ in range(victim.hand[res])]
    stolen = self.rng.choice(bag)
    victim.hand[stolen] -= 1
    self.players[player_idx].hand[stolen] += 1
    print(f"{self.players[player_idx].name} stole 1 {stolen} from {victim.name}.")

def handle_roll_seven(self, player_idx: int) -> None:
    for p in self.players:
        if p.resource_count <= 7:
            continue
        to_discard = p.resource_count // 2
        print(f"{p.name} must discard {to_discard} cards.")
        while to_discard > 0:
            print(f"  Hand: {p.hand_str()}")
            res = input("  Resource to discard: ").strip().lower()
            if res not in RESOURCES:
                print("  Invalid resource.")
                continue
            if p.hand[res] <= 0:
                print("  You don't have that resource.")
                continue
            p.hand[res] -= 1
            to_discard -= 1
    self._prompt_robber_move(player_idx)

def _prompt_robber_move(self, player_idx: int) -> None:
    while True:
        tile = input("Move robber to tile id: ").strip()
        if not tile.isdigit():
            print("Enter a tile number.")
            continue
        tidx = int(tile)
        old = self.robber_tile
        self.move_robber(player_idx, tidx)
        if self.robber_tile != old:
            break

# ── Setup phase ───────────────────────────────────────────────────────────

def setup_phase(self) -> None:
    order = list(range(len(self.players)))
    snake = order + list(reversed(order))
    print("Setup phase: each player places 2 settlements and 2 roads.")
    for turn_idx, pidx in enumerate(snake):
        player = self.players[pidx]
        print(f"\n{player.name}'s setup turn.")
        while True:
            raw = input("Choose settlement node id: ").strip()
            if raw.isdigit() and self.build_settlement(pidx, int(raw), free=True, setup=True):
                nidx = int(raw)
                break
            if not raw.isdigit():
                print("Enter a node number.")
        while True:
            raw = input("Choose adjacent road edge id: ").strip()
            if raw.isdigit() and self.build_road(pidx, int(raw), free=True, setup_node=nidx):
                break
            if not raw.isdigit():
                print("Enter an edge number.")
        # Second settlement grants starting resources
        if turn_idx >= len(order):
            gains: Dict[str, int] = {r: 0 for r in RESOURCES}
            for tidx in self.nodes[nidx].hexes:
                tile = self.tiles[tidx]
                if tile.resource != "desert":
                    gains[tile.resource] += 1
            add_resources(player.hand, gains)
            print(f"{player.name} gains starting resources from second settlement.")
    self.current_player = 0

# ── Main turn loop ────────────────────────────────────────────────────────

def take_turn(self) -> bool:
    """Play one turn. Returns True if the current player has won."""
    player = self.players[self.current_player]
    print(f"\n=== Round {self.round_num} | {player.name}'s turn ===")
    self.print_status()

    input("Press Enter to roll dice...")
    roll = self.rng.randint(1, 6) + self.rng.randint(1, 6)
    print(f"{player.name} rolled {roll}.")
    if roll == 7:
        self.handle_roll_seven(self.current_player)
    else:
        self.distribute_resources(roll)

    while True:
        cmd = input(
            "Command [help, board, hand, build road <e>, build settlement <n>, "
            "build city <n>, trade <give> <get>, robber <tile>, end]: "
        ).strip()
        parts = cmd.split()
        if not parts:
            continue

        if parts[0] == "help":
            print(
                "Commands:\n"
                "  board\n"
                "  hand\n"
                "  build road <edge_id>\n"
                "  build settlement <node_id>\n"
                "  build city <node_id>\n"
                "  trade <give_res> <get_res>   (4:1 bank trade)\n"
                "  robber <tile_id>\n"
                "  end"
            )
        elif parts[0] == "board":
            self.print_board()
        elif parts[0] == "hand":
            print(player.hand_str())
        elif parts[:2] == ["build", "road"] and len(parts) == 3 and parts[2].isdigit():
            self.build_road(self.current_player, int(parts[2]))
            if player.victory_points >= VICTORY_POINTS_TO_WIN:
                return True
        elif parts[:2] == ["build", "settlement"] and len(parts) == 3 and parts[2].isdigit():
            self.build_settlement(self.current_player, int(parts[2]))
            if player.victory_points >= VICTORY_POINTS_TO_WIN:
                return True
        elif parts[:2] == ["build", "city"] and len(parts) == 3 and parts[2].isdigit():
            self.build_city(self.current_player, int(parts[2]))
            if player.victory_points >= VICTORY_POINTS_TO_WIN:
                return True
        elif parts[0] == "trade" and len(parts) == 3:
            give, get = parts[1].lower(), parts[2].lower()
            if give not in RESOURCES or get not in RESOURCES:
                print("Invalid resources.")
            elif player.hand[give] < 4:
                print("Need 4 cards of the given resource.")
            else:
                player.hand[give] -= 4
                player.hand[get] += 1
                print(f"Traded 4 {give} for 1 {get}.")
        elif parts[0] == "robber" and len(parts) == 2 and parts[1].isdigit():
            self.move_robber(self.current_player, int(parts[1]))
        elif parts[0] == "end":
            break
        else:
            print("Unknown command. Type 'help'.")

    if player.victory_points >= VICTORY_POINTS_TO_WIN:
        return True
    self.current_player = (self.current_player + 1) % len(self.players)
    if self.current_player == 0:
        self.round_num += 1
    return False

def run(self) -> None:
    print("\nWelcome to Terminal Catan (base-game inspired).")
    self.print_board()
    self.setup_phase()
    while not self.take_turn():
        pass
    winner = self.players[self.current_player]
    print(f"\n{winner.name} wins with {winner.victory_points} victory points!")
```