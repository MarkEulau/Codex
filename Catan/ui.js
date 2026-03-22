// ui.js — DOM refs, turn clock, modal, trade selectors, name inputs

"use strict";

import { RESOURCES, DEFAULT_TURN_SECONDS, DIE_FACE_ROTATIONS } from "./constants.js";
import { randomInt } from "./utils.js";
import { state, currentPlayerObj } from "./state.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────

export const refs = {
  board:               document.getElementById("board"),
  buildActionPopup:    document.getElementById("buildActionPopup"),
  tradePromptPopup:    document.getElementById("tradePromptPopup"),
  tradeActionPopup:    document.getElementById("tradeActionPopup"),
  openTradeMenuBtn:    document.getElementById("openTradeMenuBtn"),
  closeTradeMenuBtn:   document.getElementById("closeTradeMenuBtn"),
  bankTradeSection:    document.getElementById("bankTradeSection"),
  playerTradeSection:  document.getElementById("playerTradeSection"),
  setupFields:         document.getElementById("setupFields"),
  playerCount:         document.getElementById("playerCount"),
  turnSeconds:         document.getElementById("turnSeconds"),
  nameInputs:          document.getElementById("nameInputs"),
  startBtn:            document.getElementById("startBtn"),
  restartBtn:          document.getElementById("restartBtn"),
  rollBtn:             document.getElementById("rollBtn"),
  endTurnBtn:          document.getElementById("endTurnBtn"),
  tradeBtn:            document.getElementById("tradeBtn"),
  tradeGive:           document.getElementById("tradeGive"),
  tradeGet:            document.getElementById("tradeGet"),
  p2pTradeBtn:         document.getElementById("p2pTradeBtn"),
  p2pTarget:           document.getElementById("p2pTarget"),
  p2pGive:             document.getElementById("p2pGive"),
  p2pGiveAmount:       document.getElementById("p2pGiveAmount"),
  p2pGet:              document.getElementById("p2pGet"),
  p2pGetAmount:        document.getElementById("p2pGetAmount"),
  bankTradeHint:       document.getElementById("bankTradeHint"),
  p2pTradeHint:        document.getElementById("p2pTradeHint"),
  phaseLabel:          document.getElementById("phaseLabel"),
  currentPlayerLabel:  document.getElementById("currentPlayerLabel"),
  diceLabel:           document.getElementById("diceLabel"),
  turnCard:            document.getElementById("turnCard"),
  turnCallout:         document.getElementById("turnCallout"),
  turnBadge:           document.getElementById("turnBadge"),
  turnBadgeDot:        document.getElementById("turnBadgeDot"),
  turnBadgeText:       document.getElementById("turnBadgeText"),
  turnClock:           document.getElementById("turnClock"),
  turnClockText:       document.getElementById("turnClockText"),
  diceRollStage:       document.getElementById("diceRollStage"),
  boardDieA:           document.getElementById("boardDieA"),
  boardDieB:           document.getElementById("boardDieB"),
  rollResultPopup:     document.getElementById("rollResultPopup"),
  histogramToggleBtn:  document.getElementById("histogramToggleBtn"),
  rollHistogram:       document.getElementById("rollHistogram"),
  statusText:          document.getElementById("statusText"),
  tableStats:          document.getElementById("tableStats"),
  buildPanel:          document.getElementById("buildPanel"),
  logList:             document.getElementById("logList"),
  modeButtons:         Array.from(document.querySelectorAll(".mode-btn")),
  actionModal:         document.getElementById("actionModal"),
  actionModalTitle:    document.getElementById("actionModalTitle"),
  actionModalText:     document.getElementById("actionModalText"),
  actionModalOptions:  document.getElementById("actionModalOptions"),
  actionModalCancelBtn:document.getElementById("actionModalCancelBtn"),
};

// ── Turn clock ────────────────────────────────────────────────────────────────

function shouldDisplayTurnClock() {
  if (state.turnSeconds < 1 || state.players.length === 0) return false;
  return state.phase === "setup" || state.phase === "main";
}

export function renderTurnClock() {
  if (!refs.turnClock || !refs.turnClockText) return;
  const show = shouldDisplayTurnClock();
  refs.turnClock.classList.toggle("hidden", !show);
  refs.turnClock.setAttribute("aria-hidden", show ? "false" : "true");
  if (!show) return;

  const durationMs  = Math.max(1000, state.turnSeconds * 1000);
  const remainingMs = Math.max(0, Math.min(durationMs, state.turnTimerRemainingMs));
  const angle       = Math.round((1 - remainingMs / durationMs) * 360);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const activePlayer = state.players[state.currentPlayer];

  refs.turnClock.style.setProperty("--turn-angle", `${angle}deg`);
  refs.turnClock.style.setProperty("--turn-clock-color", activePlayer ? activePlayer.color : "#f0bf62");
  refs.turnClock.classList.toggle("urgent", state.turnTimerActive && secondsLeft <= 5);
  refs.turnClockText.textContent = String(secondsLeft);
}

// ── Action modal ──────────────────────────────────────────────────────────────

let actionModalResolver = null;

export function closeActionModal(result = null) {
  if (!actionModalResolver) return;
  const resolve = actionModalResolver;
  actionModalResolver = null;
  refs.actionModal.classList.add("hidden");
  refs.actionModal.setAttribute("aria-hidden", "true");
  refs.actionModalTitle.textContent = "";
  refs.actionModalText.textContent = "";
  refs.actionModalOptions.innerHTML = "";
  resolve(result);
}

export function showActionModal({ title, text, options, allowCancel = false }) {
  if (actionModalResolver) closeActionModal(null);
  refs.actionModalTitle.textContent = title;
  refs.actionModalText.textContent = text;
  refs.actionModalOptions.innerHTML = "";
  refs.actionModalCancelBtn.classList.toggle("hidden", !allowCancel);

  for (const option of options) {
    const btn = document.createElement("button");
    btn.className = "action-option";
    btn.textContent = option.label;
    btn.addEventListener("click", () => closeActionModal(option.value));
    refs.actionModalOptions.appendChild(btn);
  }

  refs.actionModal.classList.remove("hidden");
  refs.actionModal.setAttribute("aria-hidden", "false");
  return new Promise((resolve) => { actionModalResolver = resolve; });
}

export function isActionModalOpen() {
  return actionModalResolver !== null;
}

// ── Dice visuals ──────────────────────────────────────────────────────────────

function orientDieCube(dieEl, faceValue) {
  const [rx, ry] = DIE_FACE_ROTATIONS[faceValue] ?? DIE_FACE_ROTATIONS[1];
  dieEl.style.setProperty("--face-rx", `${rx}deg`);
  dieEl.style.setProperty("--face-ry", `${ry}deg`);
}

export function setBoardDiceFaces(dieA, dieB) {
  const a = Math.min(6, Math.max(1, dieA));
  const b = Math.min(6, Math.max(1, dieB));
  refs.boardDieA.dataset.face = String(a);
  refs.boardDieB.dataset.face = String(b);
  orientDieCube(refs.boardDieA, a);
  orientDieCube(refs.boardDieB, b);
}

export function configureBoardDiceThrow() {
  const stage  = refs.diceRollStage;
  const rect   = stage.getBoundingClientRect();
  const width  = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);

  const aX = Math.round(width  * (0.24 + Math.random() * 0.16));
  const bX = Math.round(width  * (0.54 + Math.random() * 0.20));
  const baseY = Math.round(height * (0.28 + Math.random() * 0.12));
  const aY = baseY + Math.round(Math.random() * height * 0.08);
  const bY = baseY + Math.round(Math.random() * height * 0.08);

  const props = {
    "--dice-a-x": `${aX}px`,
    "--dice-a-y": `${aY}px`,
    "--dice-b-x": `${bX}px`,
    "--dice-b-y": `${bY}px`,
    "--dice-launch-y":   `${-Math.round(height * (0.56 + Math.random() * 0.2))}px`,
    "--dice-a-launch-x": `${-randomInt(120, 210)}px`,
    "--dice-b-launch-x": `${Math.round(width + randomInt(120, 210))}px`,
    "--dice-a-r":  `${randomInt(-24, 24)}deg`,
    "--dice-b-r":  `${randomInt(-24, 24)}deg`,
    "--dice-a-pitch": `${randomInt(-12, 12)}deg`,   "--dice-a-yaw": `${randomInt(-20, 20)}deg`,
    "--dice-b-pitch": `${randomInt(-12, 12)}deg`,   "--dice-b-yaw": `${randomInt(-20, 20)}deg`,
    "--dice-a-spin-x": `${randomInt(1080, 1540)}deg`, "--dice-a-spin-y": `${randomInt(860, 1320)}deg`,
    "--dice-a-spin-z": `${randomInt(-80, 80)}deg`,
    "--dice-b-spin-x": `${randomInt(1160, 1600)}deg`, "--dice-b-spin-y": `${randomInt(-1360, -920)}deg`,
    "--dice-b-spin-z": `${randomInt(-90, 90)}deg`,
  };

  for (const [name, val] of Object.entries(props)) stage.style.setProperty(name, val);

  for (const die of ["a", "b"]) {
    for (let n = 1; n <= 4; n++) {
      stage.style.setProperty(`--dice-${die}-b${n}x`, `${randomInt(n < 3 ? -44 : -28, n < 3 ? 44 : 28)}px`);
      stage.style.setProperty(`--dice-${die}-b${n}y`, `${randomInt([56,26,10,4][n-1], [92,44,20,10][n-1])}px`);
    }
  }

  stage.classList.remove("rolling");
  void stage.offsetWidth;
  stage.classList.add("rolling");
}

// ── Trade selectors ───────────────────────────────────────────────────────────

export function initTradeSelectors() {
  [refs.tradeGive, refs.tradeGet, refs.p2pGive, refs.p2pGet].forEach((sel) => {
    sel.innerHTML = "";
    for (const res of RESOURCES) {
      const opt = document.createElement("option");
      opt.value = res;
      opt.textContent = res;
      sel.appendChild(opt);
    }
  });
  refs.tradeGet.value = "ore";
  refs.p2pGet.value   = "ore";
}

export function refreshPlayerTradeTargets() {
  const selected = refs.p2pTarget.value;
  refs.p2pTarget.innerHTML = "";
  if (state.players.length < 2) return;

  for (let idx = 0; idx < state.players.length; idx += 1) {
    if (idx === state.currentPlayer) continue;
    const p = state.players[idx];
    const total = RESOURCES.reduce((s, r) => s + p.hand[r], 0);
    if (total === 0) continue;
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = p.name;
    refs.p2pTarget.appendChild(opt);
  }

  if (selected && refs.p2pTarget.querySelector(`option[value="${selected}"]`)) {
    refs.p2pTarget.value = selected;
  } else {
    refs.p2pTarget.selectedIndex = 0;
  }
}

// ── Name inputs ───────────────────────────────────────────────────────────────

export function createNameInputs() {
  refs.nameInputs.innerHTML = "";
  const count = Number(refs.playerCount.value);
  for (let i = 0; i < count; i += 1) {
    const input = document.createElement("input");
    input.type      = "text";
    input.className = "name-input";
    input.maxLength = 18;
    input.value     = `Player ${i + 1}`;
    refs.nameInputs.appendChild(input);
  }
}