const gridRoot = document.getElementById('games-grid');
const bestEl = document.getElementById('best');
const statusEl = document.getElementById('status');
const episodesEl = document.getElementById('episodes');
const avgScoreEl = document.getElementById('avg-score');
const epsilonEl = document.getElementById('epsilon');
const liveMaxEl = document.getElementById('live-max');

const boardCount = 9;
const boardPx = 180;
const gridCellsPerSide = 20;
const cellPx = boardPx / gridCellsPerSide;
const tickMs = 85;

const bestScoreKey = 'snake-best-score';
const qTableKey = 'snake-rl-qtable-v2';
const episodesKey = 'snake-rl-episodes-v2';
const epsilonKey = 'snake-rl-epsilon-v2';

const directions = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const actionTurns = { 0: 0, 1: -1, 2: 1 };

const learning = {
  alpha: 0.14,
  gamma: 0.9,
  epsilon: Number(localStorage.getItem(epsilonKey) || 1),
  epsilonMin: 0.04,
  epsilonDecay: 0.998,
};

let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
let qTable = JSON.parse(localStorage.getItem(qTableKey) || '{}');
let totalEpisodes = Number(localStorage.getItem(episodesKey) || 0);
let recentScores = [];
let loopId;

bestEl.textContent = bestScore;

const boards = Array.from({ length: boardCount }, (_, index) => createBoard(index));
resetAllBoards();
updateHud();
statusEl.textContent = 'Training 9 snake games in parallel...';
loopId = setInterval(tick, tickMs);

function createBoard(index) {
  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  canvas.width = boardPx;
  canvas.height = boardPx;
  canvas.setAttribute('aria-label', `Snake game ${index + 1}`);
  gridRoot.appendChild(canvas);

  return {
    id: index,
    canvas,
    ctx: canvas.getContext('2d'),
    snake: [],
    food: { x: 0, y: 0 },
    directionIndex: 1,
    pendingDirectionIndex: 1,
    score: 0,
  };
}

function resetBoard(board) {
  board.snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  board.directionIndex = 1;
  board.pendingDirectionIndex = 1;
  board.score = 0;
  spawnFood(board);
}

function resetAllBoards() {
  boards.forEach((board) => {
    resetBoard(board);
    drawBoard(board);
  });
}

function spawnFood(board) {
  do {
    board.food = {
      x: Math.floor(Math.random() * gridCellsPerSide),
      y: Math.floor(Math.random() * gridCellsPerSide),
    };
  } while (
    board.snake.some((segment) => segment.x === board.food.x && segment.y === board.food.y)
  );
}

function rotateDirection(currentIndex, action) {
  return (currentIndex + actionTurns[action] + directions.length) % directions.length;
}

function nextHead(board, directionIndex) {
  return {
    x: board.snake[0].x + directions[directionIndex].x,
    y: board.snake[0].y + directions[directionIndex].y,
  };
}

function wouldCollide(board, position) {
  if (
    position.x < 0 ||
    position.x >= gridCellsPerSide ||
    position.y < 0 ||
    position.y >= gridCellsPerSide
  ) {
    return true;
  }

  return board.snake
    .slice(0, -1)
    .some((segment) => segment.x === position.x && segment.y === position.y);
}

function getState(board) {
  const straightIndex = rotateDirection(board.directionIndex, 0);
  const leftIndex = rotateDirection(board.directionIndex, 1);
  const rightIndex = rotateDirection(board.directionIndex, 2);

  const dangerStraight = wouldCollide(board, nextHead(board, straightIndex)) ? 1 : 0;
  const dangerLeft = wouldCollide(board, nextHead(board, leftIndex)) ? 1 : 0;
  const dangerRight = wouldCollide(board, nextHead(board, rightIndex)) ? 1 : 0;

  const forward = directions[board.directionIndex];
  const left = directions[(board.directionIndex + 3) % directions.length];
  const dx = board.food.x - board.snake[0].x;
  const dy = board.food.y - board.snake[0].y;

  const forwardCode = dx * forward.x + dy * forward.y;
  const sideCode = dx * left.x + dy * left.y;

  return [
    dangerStraight,
    dangerLeft,
    dangerRight,
    board.directionIndex,
    Math.sign(forwardCode),
    Math.sign(sideCode),
    board.snake.length < 8 ? 0 : board.snake.length < 14 ? 1 : 2,
  ].join('|');
}

function getQValues(state) {
  if (!qTable[state]) {
    qTable[state] = [0, 0, 0];
  }
  return qTable[state];
}

function chooseAction(state) {
  if (Math.random() < learning.epsilon) {
    return Math.floor(Math.random() * 3);
  }

  const qValues = getQValues(state);
  let bestAction = 0;
  for (let i = 1; i < qValues.length; i += 1) {
    if (qValues[i] > qValues[bestAction]) {
      bestAction = i;
    }
  }
  return bestAction;
}

function updateQValue(state, action, reward, nextState, dead) {
  const qValues = getQValues(state);
  const currentQ = qValues[action];
  const nextBest = dead ? 0 : Math.max(...getQValues(nextState));
  const learnedQ = reward + learning.gamma * nextBest;
  qValues[action] = currentQ + learning.alpha * (learnedQ - currentQ);
}

function stepBoard(board) {
  const state = getState(board);
  const action = chooseAction(state);
  board.pendingDirectionIndex = rotateDirection(board.directionIndex, action);
  board.directionIndex = board.pendingDirectionIndex;

  const distanceBefore =
    Math.abs(board.snake[0].x - board.food.x) + Math.abs(board.snake[0].y - board.food.y);

  const head = nextHead(board, board.directionIndex);
  if (wouldCollide(board, head)) {
    const reward = -30;
    updateQValue(state, action, reward, state, true);
    completeEpisode(board);
    return;
  }

  board.snake.unshift(head);
  let ateFood = false;
  if (head.x === board.food.x && head.y === board.food.y) {
    ateFood = true;
    board.score += 10;
    if (board.score > bestScore) {
      bestScore = board.score;
      localStorage.setItem(bestScoreKey, String(bestScore));
    }
    spawnFood(board);
  } else {
    board.snake.pop();
  }

  const distanceAfter =
    Math.abs(board.snake[0].x - board.food.x) + Math.abs(board.snake[0].y - board.food.y);

  let reward = -0.07;
  if (ateFood) {
    reward += 24;
  }
  if (distanceAfter < distanceBefore) {
    reward += 0.35;
  } else if (distanceAfter > distanceBefore) {
    reward -= 0.2;
  }

  updateQValue(state, action, reward, getState(board), false);
}

function completeEpisode(board) {
  totalEpisodes += 1;
  recentScores.push(board.score);
  if (recentScores.length > 50) {
    recentScores.shift();
  }

  learning.epsilon = Math.max(learning.epsilonMin, learning.epsilon * learning.epsilonDecay);
  if (totalEpisodes % 12 === 0) {
    persistTraining();
  }

  resetBoard(board);
}

function persistTraining() {
  localStorage.setItem(episodesKey, String(totalEpisodes));
  localStorage.setItem(epsilonKey, String(learning.epsilon));
  localStorage.setItem(qTableKey, JSON.stringify(qTable));
}

function drawBoard(board) {
  const { ctx } = board;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, boardPx, boardPx);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridCellsPerSide; i += 1) {
    const pos = i * cellPx;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, boardPx);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(boardPx, pos);
    ctx.stroke();
  }

  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(board.food.x * cellPx + 1.6, board.food.y * cellPx + 1.6, cellPx - 3.2, cellPx - 3.2);

  board.snake.forEach((segment, index) => {
    ctx.fillStyle = index === 0 ? '#22d3ee' : '#10b981';
    ctx.fillRect(segment.x * cellPx + 1.6, segment.y * cellPx + 1.6, cellPx - 3.2, cellPx - 3.2);
  });
}

function updateHud() {
  bestEl.textContent = bestScore;
  episodesEl.textContent = totalEpisodes;
  epsilonEl.textContent = learning.epsilon.toFixed(3);
  liveMaxEl.textContent = Math.max(...boards.map((board) => board.score));

  const average =
    recentScores.length === 0
      ? 0
      : recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length;
  avgScoreEl.textContent = average.toFixed(1);
}

function tick() {
  boards.forEach((board) => {
    stepBoard(board);
    drawBoard(board);
  });

  updateHud();
  statusEl.textContent = `Parallel training active: ${boardCount} games sharing one policy.`;
}

window.addEventListener('beforeunload', () => {
  clearInterval(loopId);
  persistTraining();
});
