const gridRoot = document.getElementById('games-grid');
const chartsRoot = document.querySelector('.charts');
const bestEl = document.getElementById('best');
const statusEl = document.getElementById('status');
const episodesEl = document.getElementById('episodes');
const avgScoreEl = document.getElementById('avg-score');
const epsilonEl = document.getElementById('epsilon');
const performanceChartCanvas = document.getElementById('performance-chart');
const resetLearningButton = document.getElementById('reset-learning');

const boardCount = 16;
const gridCellsPerSide = 20;
const tickMs = 70;
const maxHistoryPoints = Number.POSITIVE_INFINITY;

const snakeRadius = 0.38;
const segmentSpacing = 0.7;
const baseSpeed = 0.24;
const turnRate = 0.34;

const bestScoreKey = 'snake-best-score';
const modelKey = 'snake-rl-model-v2';
const episodesKey = 'snake-rl-episodes-v2';
const epsilonKey = 'snake-rl-epsilon-v2';
const scoreHistoryKey = 'snake-rl-score-history-v2';
const avgScoreHistoryKey = 'snake-rl-avg-score-history-v2';
const bestScoreHistoryKey = 'snake-rl-best-score-history-v2';

const actionTurns = [0, -1, 1]; // straight, left, right

const learning = {
  alpha: 0.0015,
  gamma: 0.92,
  epsilon: Number(localStorage.getItem(epsilonKey) || 1),
  epsilonMin: 0.04,
  epsilonDecay: 0.9992,
};

const inputSize = 8;
const hidden1Size = 20;
const hidden2Size = 20;
const outputSize = 3;

let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
let totalEpisodes = Number(localStorage.getItem(episodesKey) || 0);
let recentScores = [];
let botEnabled = true;

const boards = [];
let loopId;
const scoreHistory = JSON.parse(localStorage.getItem(scoreHistoryKey) || '[]');
const avgScoreHistory = JSON.parse(localStorage.getItem(avgScoreHistoryKey) || '[]');
const bestScoreHistory = JSON.parse(localStorage.getItem(bestScoreHistoryKey) || '[]');

function randomMatrix(rows, cols, scale = 0.4) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
  );
}

function randomVector(length, scale = 0.05) {
  return Array.from({ length }, () => (Math.random() * 2 - 1) * scale);
}

function createModel() {
  return {
    w1: randomMatrix(hidden1Size, inputSize),
    b1: randomVector(hidden1Size),
    w2: randomMatrix(hidden2Size, hidden1Size),
    b2: randomVector(hidden2Size),
    w3: randomMatrix(outputSize, hidden2Size),
    b3: randomVector(outputSize),
  };
}

let model = (() => {
  try {
    const stored = localStorage.getItem(modelKey);
    return stored ? JSON.parse(stored) : createModel();
  } catch {
    return createModel();
  }
})();

if (scoreHistory.length > maxHistoryPoints) scoreHistory.splice(0, scoreHistory.length - maxHistoryPoints);
if (avgScoreHistory.length > maxHistoryPoints) {
  avgScoreHistory.splice(0, avgScoreHistory.length - maxHistoryPoints);
}
if (bestScoreHistory.length > maxHistoryPoints) {
  bestScoreHistory.splice(0, bestScoreHistory.length - maxHistoryPoints);
}

function pushHistoryPoint(series, point) {
  series.push(point);
  if (series.length > maxHistoryPoints) series.shift();
}

function relu(v) {
  return v > 0 ? v : 0;
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function forwardPass(input) {
  const z1 = model.w1.map((row, i) => dot(row, input) + model.b1[i]);
  const a1 = z1.map(relu);
  const z2 = model.w2.map((row, i) => dot(row, a1) + model.b2[i]);
  const a2 = z2.map(relu);
  const out = model.w3.map((row, i) => dot(row, a2) + model.b3[i]);
  return { input, z1, a1, z2, a2, out };
}

function predictQ(stateVec) {
  return forwardPass(stateVec).out;
}

function chooseAction(stateVec) {
  if (Math.random() < learning.epsilon) {
    return Math.floor(Math.random() * outputSize);
  }

  const qValues = predictQ(stateVec);
  let bestAction = 0;
  for (let i = 1; i < qValues.length; i += 1) {
    if (qValues[i] > qValues[bestAction]) bestAction = i;
  }
  return bestAction;
}

function trainNetwork(stateVec, action, targetQ) {
  const cache = forwardPass(stateVec);
  const gradOut = [0, 0, 0];
  gradOut[action] = cache.out[action] - targetQ;

  const gradW3 = model.w3.map((row, i) => row.map((_, j) => gradOut[i] * cache.a2[j]));
  const gradB3 = [...gradOut];

  const gradA2 = Array.from({ length: hidden2Size }, (_, j) =>
    model.w3.reduce((sum, row, i) => sum + row[j] * gradOut[i], 0)
  );
  const gradZ2 = gradA2.map((g, i) => (cache.z2[i] > 0 ? g : 0));

  const gradW2 = model.w2.map((row, i) => row.map((_, j) => gradZ2[i] * cache.a1[j]));
  const gradB2 = [...gradZ2];

  const gradA1 = Array.from({ length: hidden1Size }, (_, j) =>
    model.w2.reduce((sum, row, i) => sum + row[j] * gradZ2[i], 0)
  );
  const gradZ1 = gradA1.map((g, i) => (cache.z1[i] > 0 ? g : 0));

  const gradW1 = model.w1.map((row, i) => row.map((_, j) => gradZ1[i] * cache.input[j]));
  const gradB1 = [...gradZ1];

  for (let i = 0; i < outputSize; i += 1) {
    for (let j = 0; j < hidden2Size; j += 1) {
      model.w3[i][j] -= learning.alpha * gradW3[i][j];
    }
    model.b3[i] -= learning.alpha * gradB3[i];
  }

  for (let i = 0; i < hidden2Size; i += 1) {
    for (let j = 0; j < hidden1Size; j += 1) {
      model.w2[i][j] -= learning.alpha * gradW2[i][j];
    }
    model.b2[i] -= learning.alpha * gradB2[i];
  }

  for (let i = 0; i < hidden1Size; i += 1) {
    for (let j = 0; j < inputSize; j += 1) {
      model.w1[i][j] -= learning.alpha * gradW1[i][j];
    }
    model.b1[i] -= learning.alpha * gradB1[i];
  }
}

function angleToVector(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function normalizeAngle(angle) {
  const twoPi = Math.PI * 2;
  let next = angle % twoPi;
  if (next < 0) next += twoPi;
  return next;
}

function distanceToFood(head, food) {
  const dx = food.x - head.x;
  const dy = food.y - head.y;
  return Math.hypot(dx, dy);
}

function spawnFood(board) {
  const margin = 1;
  do {
    board.food = {
      x: margin + Math.random() * (gridCellsPerSide - margin * 2),
      y: margin + Math.random() * (gridCellsPerSide - margin * 2),
    };
  } while (
    board.snake.some((segment) => Math.hypot(segment.x - board.food.x, segment.y - board.food.y) < 1.3)
  );
}

function resetBoard(board) {
  board.heading = 0;
  board.pendingTurn = 0;
  board.snake = [
    { x: 10, y: 10 },
    { x: 10 - segmentSpacing, y: 10 },
    { x: 10 - segmentSpacing * 2, y: 10 },
  ];
  board.score = 0;
  board.gameOver = false;
  board.gameStarted = botEnabled || board.id === 0;
  spawnFood(board);
}

function completeEpisode(board) {
  totalEpisodes += 1;
  recentScores.push(board.score);
  if (recentScores.length > 25) recentScores.shift();

  learning.epsilon = Math.max(learning.epsilonMin, learning.epsilon * learning.epsilonDecay);
  localStorage.setItem(episodesKey, String(totalEpisodes));
  localStorage.setItem(epsilonKey, String(learning.epsilon));

  const average =
    recentScores.length === 0
      ? 0
      : recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length;

  pushHistoryPoint(scoreHistory, { x: totalEpisodes, y: board.score });
  pushHistoryPoint(avgScoreHistory, { x: totalEpisodes, y: average });
  pushHistoryPoint(bestScoreHistory, { x: totalEpisodes, y: bestScore });
  updateCharts();

  resetBoard(board);
}

function wouldHitWall(position) {
  return (
    position.x < snakeRadius ||
    position.x > gridCellsPerSide - snakeRadius ||
    position.y < snakeRadius ||
    position.y > gridCellsPerSide - snakeRadius
  );
}

function wouldHitBody(board, position) {
  for (let i = 4; i < board.snake.length; i += 1) {
    const segment = board.snake[i];
    if (Math.hypot(segment.x - position.x, segment.y - position.y) < snakeRadius * 1.45) {
      return true;
    }
  }
  return false;
}

function sampleObstacleDistance(board, angleOffset) {
  const head = board.snake[0];
  const angle = board.heading + angleOffset;
  const dir = angleToVector(angle);
  const maxDistance = gridCellsPerSide;

  for (let d = 0.35; d <= maxDistance; d += 0.35) {
    const probe = { x: head.x + dir.x * d, y: head.y + dir.y * d };
    if (wouldHitWall(probe) || wouldHitBody(board, probe)) {
      return d / maxDistance;
    }
  }
  return 1;
}

function getStateVector(board) {
  const head = board.snake[0];
  const toFoodX = board.food.x - head.x;
  const toFoodY = board.food.y - head.y;
  const forward = angleToVector(board.heading);
  const left = angleToVector(board.heading - Math.PI / 2);

  const foodForward = (toFoodX * forward.x + toFoodY * forward.y) / gridCellsPerSide;
  const foodSide = (toFoodX * left.x + toFoodY * left.y) / gridCellsPerSide;

  return [
    sampleObstacleDistance(board, 0),
    sampleObstacleDistance(board, -Math.PI / 4),
    sampleObstacleDistance(board, Math.PI / 4),
    Math.max(-1, Math.min(1, foodForward)),
    Math.max(-1, Math.min(1, foodSide)),
    Math.cos(board.heading),
    Math.sin(board.heading),
    Math.min(1, board.snake.length / 26),
  ];
}

function applyAction(board, action) {
  board.pendingTurn = actionTurns[action] || 0;
}

function moveSnake(board) {
  board.heading = normalizeAngle(board.heading + board.pendingTurn * turnRate);
  const headingVec = angleToVector(board.heading);
  const nextHead = {
    x: board.snake[0].x + headingVec.x * baseSpeed,
    y: board.snake[0].y + headingVec.y * baseSpeed,
  };

  if (wouldHitWall(nextHead) || wouldHitBody(board, nextHead)) {
    board.gameOver = true;
    return { dead: true, ateFood: false };
  }

  board.snake[0] = nextHead;

  for (let i = 1; i < board.snake.length; i += 1) {
    const prev = board.snake[i - 1];
    const seg = board.snake[i];
    const dx = prev.x - seg.x;
    const dy = prev.y - seg.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const pull = Math.max(0, dist - segmentSpacing);
    seg.x += (dx / dist) * pull;
    seg.y += (dy / dist) * pull;
  }

  const ateFood = distanceToFood(nextHead, board.food) < 0.75;
  if (ateFood) {
    board.score += 10;
    if (board.score > bestScore) {
      bestScore = board.score;
      localStorage.setItem(bestScoreKey, String(bestScore));
    }

    const tail = board.snake[board.snake.length - 1];
    board.snake.push({ x: tail.x, y: tail.y });
    spawnFood(board);
  }

  return { dead: false, ateFood };
}

function botStep(board) {
  if (board.gameOver || !board.gameStarted) return;

  const state = getStateVector(board);
  const action = chooseAction(state);
  const distanceBefore = distanceToFood(board.snake[0], board.food);

  applyAction(board, action);
  const { dead, ateFood } = moveSnake(board);

  const distanceAfter = dead ? distanceBefore : distanceToFood(board.snake[0], board.food);

  let reward = -0.03;
  if (ateFood) reward += 30;
  if (dead) reward -= 26;
  if (!dead) {
    if (distanceAfter < distanceBefore) reward += 0.45;
    if (distanceAfter > distanceBefore) reward -= 0.25;
  }

  const nextQ = dead ? 0 : Math.max(...predictQ(getStateVector(board)));
  const target = reward + learning.gamma * nextQ;
  trainNetwork(state, action, target);

  if (dead) completeEpisode(board);
}

function updateHud() {
  bestEl.textContent = bestScore;
  episodesEl.textContent = totalEpisodes;
  epsilonEl.textContent = learning.epsilon.toFixed(3);

  const average =
    recentScores.length === 0
      ? 0
      : recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length;

  avgScoreEl.textContent = average.toFixed(1);
}

function drawBoard(board) {
  const { ctx } = board;
  const boardPx = board.canvas.width;
  const cellPx = boardPx / gridCellsPerSide;

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
  ctx.beginPath();
  ctx.arc(board.food.x * cellPx, board.food.y * cellPx, 0.36 * cellPx, 0, Math.PI * 2);
  ctx.fill();

  board.snake.forEach((segment, index) => {
    ctx.fillStyle = index === 0 ? '#22d3ee' : '#10b981';
    ctx.beginPath();
    ctx.arc(segment.x * cellPx, segment.y * cellPx, snakeRadius * cellPx, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawLineChart(canvas, title, seriesConfig, yMinOverride, yMaxOverride, xMinOverride, xMaxOverride) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const pad = { top: 18, right: 14, bottom: 26, left: 42 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;

  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, width, height);

  const allPoints = seriesConfig.flatMap((series) => series.points);
  if (!allPoints.length) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.fillText('No learning data yet...', 12, 24);
    return;
  }

  const xs = allPoints.map((point) => point.x);
  const ys = allPoints.map((point) => point.y);

  const minX = xMinOverride ?? Math.min(...xs);
  const maxX = xMaxOverride ?? Math.max(...xs);
  const minY = yMinOverride ?? Math.min(...ys);
  const maxY = yMaxOverride ?? Math.max(...ys);

  const xRange = Math.max(1, maxX - minX);
  const yRange = Math.max(1e-6, maxY - minY);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + chartHeight);
  ctx.lineTo(pad.left + chartWidth, pad.top + chartHeight);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText(`${Math.round(minY * 100) / 100}`, 6, pad.top + chartHeight);
  ctx.fillText(`${Math.round(maxY * 100) / 100}`, 6, pad.top + 9);
  ctx.fillText(`${Math.round(minX)}`, pad.left - 2, height - 6);
  ctx.fillText(`${Math.round(maxX)}`, pad.left + chartWidth - 22, height - 6);

  seriesConfig.forEach((series) => {
    if (!series.points.length) return;

    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    series.points.forEach((point, index) => {
      const px = pad.left + ((point.x - minX) / xRange) * chartWidth;
      const py = pad.top + chartHeight - ((point.y - minY) / yRange) * chartHeight;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });

    ctx.stroke();
  });

  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(title, pad.left, 12);
}

function updateCharts() {
  const maxEpisode = Math.max(1, totalEpisodes);
  drawLineChart(
    performanceChartCanvas,
    'X: runs (episodes), Y: score metrics',
    [
      { label: 'Episode score', color: '#22d3ee', points: scoreHistory },
      { label: 'Avg(25)', color: '#f59e0b', points: avgScoreHistory },
    ],
    undefined,
    undefined,
    0,
    maxEpisode
  );
}

function resizeBoardCanvas(board) {
  const nextSize = Math.floor(board.canvas.getBoundingClientRect().width);
  if (nextSize <= 0 || board.canvas.width === nextSize) return;
  board.canvas.width = nextSize;
  board.canvas.height = nextSize;
  drawBoard(board);
}

function resizeAllBoards() {
  boards.forEach((board) => resizeBoardCanvas(board));
}

function resizeChartCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);

  if (width <= 0 || height <= 0) return;
  if (canvas.width === width && canvas.height === height) return;

  canvas.width = width;
  canvas.height = height;
}

function resizeCharts() {
  resizeChartCanvas(performanceChartCanvas);
  updateCharts();
}

function tick() {
  boards.forEach((board) => {
    if (botEnabled || board.id !== 0) {
      botStep(board);
    } else if (board.gameStarted && !board.gameOver) {
      moveSnake(board);
      if (board.gameOver) resetBoard(board);
    }
    drawBoard(board);
  });

  updateHud();
  statusEl.textContent = botEnabled
    ? 'Training with neural Q-network across 16 games in parallel...'
    : 'Manual mode on board #1. Other boards continue neural training.';
}

function persistLearningState() {
  localStorage.setItem(modelKey, JSON.stringify(model));
  localStorage.setItem(scoreHistoryKey, JSON.stringify(scoreHistory));
  localStorage.setItem(avgScoreHistoryKey, JSON.stringify(avgScoreHistory));
  localStorage.setItem(bestScoreHistoryKey, JSON.stringify(bestScoreHistory));
}

function resetLearningState() {
  model = createModel();
  totalEpisodes = 0;
  bestScore = 0;
  recentScores = [];
  learning.epsilon = 1;

  scoreHistory.length = 0;
  avgScoreHistory.length = 0;
  bestScoreHistory.length = 0;

  localStorage.removeItem(modelKey);
  localStorage.removeItem(episodesKey);
  localStorage.removeItem(bestScoreKey);
  localStorage.removeItem(epsilonKey);
  localStorage.removeItem(scoreHistoryKey);
  localStorage.removeItem(avgScoreHistoryKey);
  localStorage.removeItem(bestScoreHistoryKey);

  boards.forEach((board) => resetBoard(board));
  updateHud();
  updateCharts();
}

function initBoards() {
  for (let i = 0; i < boardCount; i += 1) {
    const wrap = document.createElement('article');
    wrap.className = 'board-wrap';

    const label = document.createElement('p');
    label.className = 'board-label';
    label.textContent = `Game ${i + 1}`;

    const canvas = document.createElement('canvas');
    canvas.className = 'game-board';

    wrap.appendChild(label);
    wrap.appendChild(canvas);
    gridRoot.appendChild(wrap);

    const board = {
      id: i,
      canvas,
      ctx: canvas.getContext('2d'),
      snake: [],
      food: { x: 0, y: 0 },
      heading: 0,
      pendingTurn: 0,
      score: 0,
      gameStarted: true,
      gameOver: false,
    };

    resetBoard(board);
    boards.push(board);
    drawBoard(board);
  }
}

const boardResizeObserver = new ResizeObserver(() => resizeAllBoards());
const chartResizeObserver = new ResizeObserver(() => resizeCharts());

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'b') {
    botEnabled = !botEnabled;
    if (!botEnabled) boards[0].gameStarted = true;
    event.preventDefault();
    return;
  }

  if (botEnabled) return;

  switch (event.key.toLowerCase()) {
    case 'arrowleft':
    case 'a':
      boards[0].pendingTurn = -1;
      boards[0].gameStarted = true;
      break;
    case 'arrowright':
    case 'd':
      boards[0].pendingTurn = 1;
      boards[0].gameStarted = true;
      break;
    case 'arrowup':
    case 'w':
      boards[0].pendingTurn = 0;
      boards[0].gameStarted = true;
      break;
    case ' ':
      if (boards[0].gameOver) resetBoard(boards[0]);
      break;
    default:
      return;
  }

  event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  if (botEnabled) return;
  if (['arrowleft', 'arrowright', 'a', 'd'].includes(event.key.toLowerCase())) {
    boards[0].pendingTurn = 0;
  }
});

if (resetLearningButton) {
  resetLearningButton.addEventListener('click', () => resetLearningState());
}

initBoards();
boardResizeObserver.observe(gridRoot);
if (chartsRoot) chartResizeObserver.observe(chartsRoot);
resizeAllBoards();
resizeCharts();
updateHud();
statusEl.textContent = 'Boot complete. Starting neural training...';
loopId = setInterval(tick, tickMs);

setInterval(persistLearningState, 2500);

window.addEventListener('beforeunload', () => {
  clearInterval(loopId);
  boardResizeObserver.disconnect();
  persistLearningState();
});
