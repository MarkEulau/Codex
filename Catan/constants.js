// constants.js — Static game data and configuration

"use strict";

export const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"];

export const RESOURCE_COUNTS = {
  wood: 4,
  brick: 3,
  sheep: 4,
  wheat: 4,
  ore: 3,
  desert: 1,
};

export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export const COST = {
  road:       { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city:       { wheat: 2, ore: 3 },
};

export const PLAYER_COLORS = ["#b93b2a", "#2b66be", "#d49419", "#2f8852"];

export const HIGH_PROBABILITY_NUMBERS = new Set([6, 8]);

export const DICE_SUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const DEFAULT_TURN_SECONDS = 60;

export const HEX_NEIGHBOR_DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export const DIE_FACE_ROTATIONS = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};

export const BOARD_RADIUS  = 2;
export const HEX_SIZE      = 74;
export const BOARD_PADDING = 36;
export const SVG_NS        = "http://www.w3.org/2000/svg";