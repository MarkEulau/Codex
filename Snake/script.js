const gridRoot = document.getElementById('games-grid');
const appRoot = document.querySelector('.app');
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
const tickMs = 85;
const maxHistoryPoints = 300;

const bestScoreKey = 'snake-best-score';
const qTableKey = 'snake-rl-qtable-v1';
const episodesKey = 'snake-rl-episodes-v1';
const epsilonKey = 'snake-rl-epsilon-v1';
const scoreHistoryKey = 'snake-rl-score-history-v1';
const avgScoreHistoryKey = 'snake-rl-avg-score-history-v1';
const bestScoreHistoryKey = 'snake-rl-best-score-history-v1';

const directions = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const actionTurns = {
  0: 0,
  1: -1,
  2: 1,
};

const learning = {
  alpha: 0.14,
  gamma: 0.9,
  epsilon: Number(localStorage.getItem(epsilonKey) || 1),
  epsilonMin: 0.05,
  epsilonDecay: 0.9992,
};

let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
let qTable = JSON.parse(localStorage.getItem(qTableKey) || '{}');
let totalEpisodes = Number(localStorage.getItem(episodesKey) || 0);
let recentScores = [];
let botEnabled = true;

const boards = [];
let loopId;
const scoreHistory = JSON.parse(localStorage.getItem(scoreHistoryKey) || '[]');
const avgScoreHistory = JSON.parse(localStorage.getItem(avgScoreHistoryKey) || '[]');
const bestScoreHistory = JSON.parse(localStorage.getItem(bestScoreHistoryKey) || '[]');

if (scoreHistory.length > maxHistoryPoints) {
  scoreHistory.splice(0, scoreHistory.length - maxHistoryPoints);
}
if (avgScoreHistory.length > maxHistoryPoints) {
  avgScoreHistory.splice(0, avgScoreHistory.length - maxHistoryPoints);
}
if (bestScoreHistory.length > maxHistoryPoints) {
  bestScoreHistory.splice(0, bestScoreHistory.length - maxHistoryPoints);
}

function pushHistoryPoint(series, point) {
  series.push(point);
  if (series.length > maxHistoryPoints) {
    series.shift();
  }
}

function drawLineChart(
  canvas,
  title,
  seriesConfig,
  yMinOverride,
  yMaxOverride,
  xMinOverride,
  xMaxOverride
) {
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
    if (!series.points.length) {
      return;
    }

    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    series.points.forEach((point, index) => {
      const px = pad.left + ((point.x - minX) / xRange) * chartWidth;
      const py = pad.top + chartHeight - ((point.y - minY) / yRange) * chartHeight;
      if (index === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });

    ctx.stroke();
  });

  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(title, pad.left, 12);

  let legendX = pad.left;
  const legendY = height - 8;
  seriesConfig.forEach((series) => {
    ctx.fillStyle = series.color;
    ctx.fillRect(legendX, legendY - 8, 10, 4);
    legendX += 14;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(series.label, legendX, legendY);
    legendX += ctx.measureText(series.label).width + 18;
  });
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

function rotateDirection(currentIndex, action) {
  const turn = actionTurns[action];
  return (currentIndex + turn + directions.length) % directions.length;
}

function nextHeadAtDirection(board, index) {
  return {
    x: board.snake[0].x + directions[index].x,
    y: board.snake[0].y + directions[index].y,
  };
}

function wouldCollide(board, position) {
  const hitWall =
    position.x < 0 ||
    position.x >= gridCellsPerSide ||
    position.y < 0 ||
    position.y >= gridCellsPerSide;

  if (hitWall) {
    return true;
  }

  return board.snake
    .slice(0, -1)
    .some((segment) => segment.x === position.x && segment.y === position.y);
}

function relativeFoodState(board) {
  const head = board.snake[0];
  const forward = directions[board.directionIndex];
  const left = directions[(board.directionIndex + 3) % directions.length];
  const dx = board.food.x - head.x;
  const dy = board.food.y - head.y;

  const dotForward = dx * forward.x + dy * forward.y;
  const dotLeft = dx * left.x + dy * left.y;

  const forwardCode = dotForward === 0 ? 0 : dotForward > 0 ? 1 : -1;
  const sideCode = dotLeft === 0 ? 0 : dotLeft > 0 ? 1 : -1;

  return { forwardCode, sideCode };
}

function getState(board) {
  const straightIndex = rotateDirection(board.directionIndex, 0);
  const leftIndex = rotateDirection(board.directionIndex, 1);
  const rightIndex = rotateDirection(board.directionIndex, 2);

  const dangerStraight = wouldCollide(board, nextHeadAtDirection(board, straightIndex)) ? 1 : 0;
  const dangerLeft = wouldCollide(board, nextHeadAtDirection(board, leftIndex)) ? 1 : 0;
  const dangerRight = wouldCollide(board, nextHeadAtDirection(board, rightIndex)) ? 1 : 0;

  const { forwardCode, sideCode } = relativeFoodState(board);
  const lengthBucket = board.snake.length < 8 ? 0 : board.snake.length < 14 ? 1 : 2;

  return [
    dangerStraight,
    dangerLeft,
    dangerRight,
    board.directionIndex,
    forwardCode,
    sideCode,
    lengthBucket,
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

function resetBoard(board) {
  board.snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  board.directionIndex = 1;
  board.pendingDirectionIndex = 1;
  board.score = 0;
  board.gameOver = false;
  board.gameStarted = botEnabled || board.id === 0;
  spawnFood(board);
}

function completeEpisode(board) {
  totalEpisodes += 1;
  recentScores.push(board.score);
  if (recentScores.length > 25) {
    recentScores.shift();
  }

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
  ctx.fillRect(board.food.x * cellPx + 1.6, board.food.y * cellPx + 1.6, cellPx - 3.2, cellPx - 3.2);

  board.snake.forEach((segment, index) => {
    ctx.fillStyle = index === 0 ? '#22d3ee' : '#10b981';
    ctx.fillRect(segment.x * cellPx + 1.6, segment.y * cellPx + 1.6, cellPx - 3.2, cellPx - 3.2);
  });
}

function resizeBoardCanvas(board) {
  const nextSize = Math.floor(board.canvas.getBoundingClientRect().width);

  if (nextSize <= 0 || board.canvas.width === nextSize) {
    return;
  }

  board.canvas.width = nextSize;
  board.canvas.height = nextSize;
  drawBoard(board);
}

function resizeAllBoards() {
  boards.forEach((board) => {
    resizeBoardCanvas(board);
  });
}

function resizeChartCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);

  if (width <= 0 || height <= 0) {
    return;
  }

  if (canvas.width === width && canvas.height === height) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
}

function resizeCharts() {
  resizeChartCanvas(performanceChartCanvas);
  updateCharts();
}

function applyAction(board, action) {
  board.pendingDirectionIndex = rotateDirection(board.directionIndex, action);
}

function moveSnake(board) {
  board.directionIndex = board.pendingDirectionIndex;
  const nextHead = nextHeadAtDirection(board, board.directionIndex);

  if (wouldCollide(board, nextHead)) {
    board.gameOver = true;
    return { dead: true, ateFood: false };
  }

  board.snake.unshift(nextHead);
  const ateFood = nextHead.x === board.food.x && nextHead.y === board.food.y;

  if (ateFood) {
    board.score += 10;
    if (board.score > bestScore) {
      bestScore = board.score;
      localStorage.setItem(bestScoreKey, String(bestScore));
    }
    spawnFood(board);
  } else {
    board.snake.pop();
  }

  return { dead: false, ateFood };
}

function botStep(board) {
  if (board.gameOver || !board.gameStarted) {
    return;
  }

  const state = getState(board);
  const action = chooseAction(state);

  const distanceBefore =
    Math.abs(board.snake[0].x - board.food.x) + Math.abs(board.snake[0].y - board.food.y);

  applyAction(board, action);
  const { dead, ateFood } = moveSnake(board);

  const distanceAfter = dead
    ? distanceBefore
    : Math.abs(board.snake[0].x - board.food.x) + Math.abs(board.snake[0].y - board.food.y);

  let reward = -0.07;
  if (ateFood) {
    reward += 24;
  }
  if (dead) {
    reward -= 30;
  } else if (distanceAfter < distanceBefore) {
    reward += 0.35;
  } else if (distanceAfter > distanceBefore) {
    reward -= 0.2;
  }

  const nextState = dead ? state : getState(board);
  updateQValue(state, action, reward, nextState, dead);

  if (dead) {
    completeEpisode(board);
  }
}

function setDirectionFromInput(board, x, y) {
  if (board.gameOver) {
    return;
  }

  const current = directions[board.directionIndex];
  const isReverse = current.x + x === 0 && current.y + y === 0;

  if (isReverse && board.gameStarted) {
    return;
  }

  board.pendingDirectionIndex = directions.findIndex((dir) => dir.x === x && dir.y === y);
  if (!board.gameStarted) {
    board.gameStarted = true;
  }
}

function tick() {
  boards.forEach((board) => {
    if (botEnabled || board.id !== 0) {
      botStep(board);
    } else if (board.gameStarted && !board.gameOver) {
      moveSnake(board);
      if (board.gameOver) {
        resetBoard(board);
      }
    }
    drawBoard(board);
  });

  updateHud();

  if (botEnabled) {
    statusEl.textContent = 'Training with Q-learning across 9 games in parallel...';
  } else {
    statusEl.textContent = 'Manual mode on board #1. Other boards continue bot training.';
  }
}

function persistQTable() {
  localStorage.setItem(qTableKey, JSON.stringify(qTable));
  localStorage.setItem(scoreHistoryKey, JSON.stringify(scoreHistory));
  localStorage.setItem(avgScoreHistoryKey, JSON.stringify(avgScoreHistory));
  localStorage.setItem(bestScoreHistoryKey, JSON.stringify(bestScoreHistory));
}

function resetLearningState() {
  qTable = {};
  totalEpisodes = 0;
  bestScore = 0;
  recentScores = [];
  learning.epsilon = 1;

  scoreHistory.length = 0;
  avgScoreHistory.length = 0;
  bestScoreHistory.length = 0;

  localStorage.removeItem(qTableKey);
  localStorage.removeItem(episodesKey);
  localStorage.removeItem(bestScoreKey);
  localStorage.removeItem(epsilonKey);
  localStorage.removeItem(scoreHistoryKey);
  localStorage.removeItem(avgScoreHistoryKey);
  localStorage.removeItem(bestScoreHistoryKey);

  boards.forEach((board) => {
    resetBoard(board);
  });

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
      directionIndex: 1,
      pendingDirectionIndex: 1,
      score: 0,
      gameStarted: true,
      gameOver: false,
    };

    resetBoard(board);
    boards.push(board);
    drawBoard(board);
  }
}

const boardResizeObserver = new ResizeObserver(() => {
  resizeAllBoards();
});

const chartResizeObserver = new ResizeObserver(() => {
  resizeCharts();
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'b') {
    botEnabled = !botEnabled;
    if (!botEnabled) {
      boards[0].gameStarted = false;
    }
    event.preventDefault();
    return;
  }

  if (botEnabled) {
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'arrowup':
    case 'w':
      setDirectionFromInput(boards[0], 0, -1);
      break;
    case 'arrowdown':
    case 's':
      setDirectionFromInput(boards[0], 0, 1);
      break;
    case 'arrowleft':
    case 'a':
      setDirectionFromInput(boards[0], -1, 0);
      break;
    case 'arrowright':
    case 'd':
      setDirectionFromInput(boards[0], 1, 0);
      break;
    case ' ':
      if (boards[0].gameOver) {
        resetBoard(boards[0]);
      }
      break;
    default:
      return;
  }

  event.preventDefault();
});

if (resetLearningButton) {
  resetLearningButton.addEventListener('click', () => {
    resetLearningState();
  });
}

initBoards();
boardResizeObserver.observe(gridRoot);
if (chartsRoot) {
  chartResizeObserver.observe(chartsRoot);
}
resizeAllBoards();
resizeCharts();
updateHud();
statusEl.textContent = 'Boot complete. Starting 9-game parallel training...';
loopId = setInterval(tick, tickMs);

setInterval(persistQTable, 2500);

window.addEventListener('beforeunload', () => {
  clearInterval(loopId);
  boardResizeObserver.disconnect();
  persistQTable();
});
