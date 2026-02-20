# board.py — Board construction: tile/node/edge layout

from __future__ import annotations

import math
import random
from typing import Dict, List, Optional, Set, Tuple

from constants import RESOURCE_COUNTS, NUMBER_TOKENS, BOARD_RADIUS
from models import Tile, Node, Edge
from utils import axial_hexes, hex_center, key_point


def build_board(
    rng: random.Random,
) -> Tuple[List[Tile], List[Node], List[Edge], int]:
    """
    Generate a randomised Catan board.

    Returns
    -------
    tiles, nodes, edges, robber_tile_idx
    """
    coords = axial_hexes(BOARD_RADIUS)
    rng.shuffle(coords)

    resources: List[str] = []
    for res, count in RESOURCE_COUNTS.items():
        resources.extend([res] * count)
    rng.shuffle(resources)

    numbers = NUMBER_TOKENS[:]
    rng.shuffle(numbers)

    tiles: List[Tile] = []
    nodes: List[Node] = []
    edges: List[Edge] = []
    robber_tile = -1

    node_index_by_point: Dict[Tuple[int, int], int] = {}
    edge_index_by_pair: Dict[Tuple[int, int], int] = {}

    for idx, (q, r) in enumerate(coords):
        res = resources[idx]
        number: Optional[int] = None if res == "desert" else numbers.pop()
        tile = Tile(idx=idx, q=q, r=r, resource=res, number=number)
        tiles.append(tile)
        if res == "desert":
            robber_tile = idx

        cx, cy = hex_center(q, r)
        corner_ids: List[int] = []
        for i in range(6):
            angle = math.radians(60 * i + 30)
            px = cx + math.cos(angle)
            py = cy + math.sin(angle)
            k = key_point(px, py)
            if k not in node_index_by_point:
                nidx = len(nodes)
                node_index_by_point[k] = nidx
                nodes.append(Node(idx=nidx, point=k))
            nidx = node_index_by_point[k]
            corner_ids.append(nidx)
            nodes[nidx].hexes.append(idx)
        tile.nodes = corner_ids

        for i in range(6):
            a = corner_ids[i]
            b = corner_ids[(i + 1) % 6]
            pair: Tuple[int, int] = tuple(sorted((a, b)))  # type: ignore[assignment]
            if pair not in edge_index_by_pair:
                eidx = len(edges)
                edge_index_by_pair[pair] = eidx
                edges.append(Edge(idx=eidx, a=pair[0], b=pair[1]))
                nodes[pair[0]].edges.add(eidx)
                nodes[pair[1]].edges.add(eidx)

    return tiles, nodes, edges, robber_tile