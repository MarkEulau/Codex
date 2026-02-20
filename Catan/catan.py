#!/usr/bin/env python3

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from catan_models import GameConfig, PlayerConfig, TradeOffer


RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"]
RESOURCE_COUNTS = {
    "wood": 4,
    "brick": 3,
    "sheep": 4,
    "wheat": 4,
    "ore": 3,
    "desert": 1,
}
NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]

ROAD_COST = {"wood": 1, "brick": 1}
SETTLEMENT_COST = {"wood": 1, "brick": 1, "sheep": 1, "wheat": 1}
CITY_COST = {"wheat": 2, "ore": 3}


def axial_hexes(radius: int = 2) -> List[Tuple[int, int]]:
    coords: List[Tuple[int, int]] = []
    for q in range(-radius, radius + 1):
        r1 = max(-radius, -q - radius)
        r2 = min(radius, -q + radius)
        for r in range(r1, r2 + 1):
            coords.append((q, r))
    return coords


def hex_center(q: int, r: int) -> Tuple[float, float]:
    x = math.sqrt(3) * (q + r / 2)
    y = 1.5 * r
    return x, y


def key_point(x: float, y: float) -> Tuple[int, int]:
    return (round(x * 1000), round(y * 1000))


def can_afford(hand: Dict[str, int], cost: Dict[str, int]) -> bool:
    return all(hand.get(res, 0) >= amount for res, amount in cost.items())


def validate_trade_offer(payload: Dict[str, object]) -> TradeOffer:
    """Validate a trade payload and return a strict typed offer."""
    return TradeOffer.model_validate(payload)


def pay_cost(hand: Dict[str, int], cost: Dict[str, int]) -> None:
    for res, amount in cost.items():
        hand[res] -= amount


def add_resources(hand: Dict[str, int], gains: Dict[str, int]) -> None:
    for res, amount in gains.items():
        hand[res] += amount


@dataclass
class Player:
    name: str
    hand: Dict[str, int] = field(default_factory=lambda: {r: 0 for r in RESOURCES})
    roads: Set[int] = field(default_factory=set)
    settlements: Set[int] = field(default_factory=set)
    cities: Set[int] = field(default_factory=set)

    @property
    def victory_points(self) -> int:
        return len(self.settlements) + 2 * len(self.cities)

    @property
    def resource_count(self) -> int:
        return sum(self.hand.values())

    def hand_str(self) -> str:
        return ", ".join(f"{r}:{self.hand[r]}" for r in RESOURCES)


@dataclass
class Tile:
    idx: int
    q: int
    r: int
    resource: str
    number: Optional[int]
    nodes: List[int] = field(default_factory=list)


@dataclass
class Node:
    idx: int
    point: Tuple[int, int]
    hexes: List[int] = field(default_factory=list)
    edges: Set[int] = field(default_factory=set)
    owner: Optional[int] = None
    is_city: bool = False


@dataclass
class Edge:
    idx: int
    a: int
    b: int
    owner: Optional[int] = None


class CatanGame:
    def __init__(self, players: List[str], seed: Optional[int] = None):
        config = GameConfig(players=[PlayerConfig(name=name) for name in players])
        self.rng = random.Random(seed)
        self.players: List[Player] = [Player(name=p.name) for p in config.players]
        self.tiles: List[Tile] = []
        self.nodes: List[Node] = []
        self.edges: List[Edge] = []
        self.robber_tile: int = -1
        self.current_player: int = 0
        self.round_num: int = 1
        self._build_board()

    def _build_board(self) -> None:
        coords = axial_hexes(2)
        self.rng.shuffle(coords)
        resources: List[str] = []
        for res, count in RESOURCE_COUNTS.items():
            resources.extend([res] * count)
        self.rng.shuffle(resources)
        numbers = NUMBER_TOKENS[:]
        self.rng.shuffle(numbers)

        node_index_by_point: Dict[Tuple[int, int], int] = {}
        edge_index_by_pair: Dict[Tuple[int, int], int] = {}

        for idx, (q, r) in enumerate(coords):
            res = resources[idx]
            number = None if res == "desert" else numbers.pop()
            tile = Tile(idx=idx, q=q, r=r, resource=res, number=number)
            self.tiles.append(tile)
            if res == "desert":
                self.robber_tile = idx

            cx, cy = hex_center(q, r)
            corner_ids: List[int] = []
            for i in range(6):
                angle = math.radians(60 * i + 30)
                px = cx + math.cos(angle)
                py = cy + math.sin(angle)
                k = key_point(px, py)
                if k not in node_index_by_point:
                    nidx = len(self.nodes)
                    node_index_by_point[k] = nidx
                    self.nodes.append(Node(idx=nidx, point=k))
                nidx = node_index_by_point[k]
                corner_ids.append(nidx)
                self.nodes[nidx].hexes.append(idx)
            tile.nodes = corner_ids

            for i in range(6):
                a = corner_ids[i]
                b = corner_ids[(i + 1) % 6]
                pair = tuple(sorted((a, b)))
                if pair not in edge_index_by_pair:
                    eidx = len(self.edges)
                    edge_index_by_pair[pair] = eidx
                    self.edges.append(Edge(idx=eidx, a=pair[0], b=pair[1]))
                    self.nodes[pair[0]].edges.add(eidx)
                    self.nodes[pair[1]].edges.add(eidx)

    def node_neighbors(self, node_idx: int) -> Set[int]:
        out: Set[int] = set()
        node = self.nodes[node_idx]
        for eidx in node.edges:
            edge = self.edges[eidx]
            out.add(edge.b if edge.a == node_idx else edge.a)
        return out

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
                f"Roads:{len(p.roads):2} Sett:{len(p.settlements):2} Cities:{len(p.cities):2} "
                f"Hand[{p.hand_str()}]"
            )
        print()

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

    def distance_rule_ok(self, node_idx: int) -> bool:
        for nbr in self.node_neighbors(node_idx):
            if self.nodes[nbr].owner is not None:
                return False
        return True

    def has_connected_road(self, player_idx: int, node_idx: int) -> bool:
        for eidx in self.nodes[node_idx].edges:
            if self.edges[eidx].owner == player_idx:
                return True
        return False

    def can_build_road(self, player_idx: int, edge_idx: int, setup_node: Optional[int] = None) -> Tuple[bool, str]:
        if edge_idx < 0 or edge_idx >= len(self.edges):
            return False, "Invalid edge id."
        edge = self.edges[edge_idx]
        if edge.owner is not None:
            return False, "Edge already has a road."
        if setup_node is not None:
            if edge.a == setup_node or edge.b == setup_node:
                return True, ""
            return False, "Setup road must touch the just-placed settlement."

        p = self.players[player_idx]
        endpoints = [edge.a, edge.b]
        for nidx in endpoints:
            node = self.nodes[nidx]
            if node.owner == player_idx:
                return True, ""
            for eidx in node.edges:
                if self.edges[eidx].owner == player_idx:
                    return True, ""
        return False, "Road must connect to your existing road or building."

    def can_build_settlement(self, player_idx: int, node_idx: int, setup: bool = False) -> Tuple[bool, str]:
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

    def build_road(self, player_idx: int, edge_idx: int, free: bool = False, setup_node: Optional[int] = None) -> bool:
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

    def build_settlement(self, player_idx: int, node_idx: int, free: bool = False, setup: bool = False) -> bool:
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

    def move_robber(self, player_idx: int, tile_idx: int) -> None:
        if tile_idx < 0 or tile_idx >= len(self.tiles):
            print("Invalid tile.")
            return
        if tile_idx == self.robber_tile:
            print("Robber is already there.")
            return
        self.robber_tile = tile_idx
        victims: Set[int] = set()
        for nidx in self.tiles[tile_idx].nodes:
            owner = self.nodes[nidx].owner
            if owner is not None and owner != player_idx and self.players[owner].resource_count > 0:
                victims.add(owner)
        if not victims:
            print("Robber moved. No one to steal from.")
            return
        print("Victims:", ", ".join(f"{v}:{self.players[v].name}" for v in sorted(victims)))
        while True:
            choice = input("Choose victim player index to steal from: ").strip()
            if not choice.isdigit():
                print("Enter a number.")
                continue
            vidx = int(choice)
            if vidx not in victims:
                print("Invalid victim.")
                continue
            break
        victim = self.players[vidx]
        bag: List[str] = []
        for res in RESOURCES:
            bag.extend([res] * victim.hand[res])
        stolen = self.rng.choice(bag)
        victim.hand[stolen] -= 1
        self.players[player_idx].hand[stolen] += 1
        print(f"{self.players[player_idx].name} stole 1 {stolen} from {victim.name}.")

    def handle_roll_seven(self, player_idx: int) -> None:
        for idx, p in enumerate(self.players):
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
        self.prompt_robber_move(player_idx)

    def prompt_robber_move(self, player_idx: int) -> None:
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

    def setup_phase(self) -> None:
        order = list(range(len(self.players)))
        snake = order + list(reversed(order))
        print("Setup phase: each player places 2 settlements and 2 roads.")
        for turn_idx, pidx in enumerate(snake):
            player = self.players[pidx]
            print(f"\n{player.name}'s setup turn.")
            while True:
                node = input("Choose settlement node id: ").strip()
                if not node.isdigit():
                    print("Enter a node number.")
                    continue
                nidx = int(node)
                if self.build_settlement(pidx, nidx, free=True, setup=True):
                    break
            while True:
                edge = input("Choose adjacent road edge id: ").strip()
                if not edge.isdigit():
                    print("Enter an edge number.")
                    continue
                eidx = int(edge)
                if self.build_road(pidx, eidx, free=True, setup_node=nidx):
                    break
            if turn_idx >= len(order):
                gains: Dict[str, int] = {r: 0 for r in RESOURCES}
                for tidx in self.nodes[nidx].hexes:
                    tile = self.tiles[tidx]
                    if tile.resource != "desert":
                        gains[tile.resource] += 1
                add_resources(player.hand, gains)
                print(f"{player.name} gains starting resources from second settlement.")

        self.current_player = 0

    def take_turn(self) -> bool:
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
                "Command [help, board, hand, build road <e>, build settlement <n>, build city <n>, "
                "trade <give> <get>, robber <tile>, end]: "
            ).strip()
            parts = cmd.split()
            if not parts:
                continue
            if parts[0] == "help":
                print("Commands:")
                print("  board")
                print("  hand")
                print("  build road <edge_id>")
                print("  build settlement <node_id>")
                print("  build city <node_id>")
                print("  trade <give_res> <get_res>   (4:1 bank trade)")
                print("  robber <tile_id>             (only after rolling 7 in official rules)")
                print("  end")
                continue
            if parts[0] == "board":
                self.print_board()
                continue
            if parts[0] == "hand":
                print(player.hand_str())
                continue
            if len(parts) >= 3 and parts[0] == "build" and parts[1] == "road" and parts[2].isdigit():
                self.build_road(self.current_player, int(parts[2]))
                if player.victory_points >= 10:
                    return True
                continue
            if len(parts) >= 3 and parts[0] == "build" and parts[1] == "settlement" and parts[2].isdigit():
                self.build_settlement(self.current_player, int(parts[2]))
                if player.victory_points >= 10:
                    return True
                continue
            if len(parts) >= 3 and parts[0] == "build" and parts[1] == "city" and parts[2].isdigit():
                self.build_city(self.current_player, int(parts[2]))
                if player.victory_points >= 10:
                    return True
                continue
            if len(parts) == 3 and parts[0] == "trade":
                give = parts[1].lower()
                get = parts[2].lower()
                if give not in RESOURCES or get not in RESOURCES:
                    print("Invalid resources.")
                    continue
                if player.hand[give] < 4:
                    print("Need 4 cards of the given resource.")
                    continue
                player.hand[give] -= 4
                player.hand[get] += 1
                print(f"Traded 4 {give} for 1 {get}.")
                continue
            if len(parts) == 2 and parts[0] == "robber" and parts[1].isdigit():
                self.move_robber(self.current_player, int(parts[1]))
                continue
            if parts[0] == "end":
                break
            print("Unknown command. Type 'help'.")

        if player.victory_points >= 10:
            return True
        self.current_player = (self.current_player + 1) % len(self.players)
        if self.current_player == 0:
            self.round_num += 1
        return False

    def run(self) -> None:
        print("\nWelcome to Terminal Catan (base-game inspired).")
        self.print_board()
        self.setup_phase()
        while True:
            if self.take_turn():
                winner = self.players[self.current_player]
                print(f"\n{winner.name} wins with {winner.victory_points} victory points!")
                break


def prompt_players() -> List[str]:
    while True:
        raw = input("Number of players (3-4): ").strip()
        if raw.isdigit() and 3 <= int(raw) <= 4:
            n = int(raw)
            break
        print("Please enter 3 or 4.")
    players: List[str] = []
    for i in range(n):
        while True:
            name = input(f"Player {i + 1} name: ").strip()
            if not name:
                print("Name cannot be empty.")
                continue
            players.append(name)
            break
    return players


def main() -> None:
    players = prompt_players()
    game = CatanGame(players=players)
    game.run()


if __name__ == "__main__":
    main()
