# constants.py — Static game data for Catan

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

ROAD_COST       = {"wood": 1, "brick": 1}
SETTLEMENT_COST = {"wood": 1, "brick": 1, "sheep": 1, "wheat": 1}
CITY_COST       = {"wheat": 2, "ore": 3}

VICTORY_POINTS_TO_WIN = 10
MIN_PLAYERS = 3
MAX_PLAYERS = 4
BOARD_RADIUS = 2