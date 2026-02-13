const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const statusEl = document.getElementById('status');
const episodesEl = document.getElementById('episodes');
const avgScoreEl = document.getElementById('avg-score');
const epsilonEl = document.getElementById('epsilon');

const gridSize = 20;
const tileCount = canvas.width / gridSize;
const tickMs = 95;
const autoRestartDelayMs = 260;

const bestScoreKey = 'snake-best-score';
const qTableKey = 'snake-rl-qtable-v1';
const episodesKey = 'snake-rl-episodes-v1';
const epsilonKey = 'snake-rl-epsilon-v1';

const directions = [
  { x: 0, y: -1 }, // up
  { x: 1, y: 0 }, // right
  { x: 0, y: 1 }, // down
  { x: -1, y: 0 }, // left
];

const actionTurns = {
  0: 0, // straight
  1: -1, // turn left
  2: 1, // turn right
};

const learning = {
  alpha: 0.14,
  gamma: 0.9,
  epsilon: Number(localStorage.getItem(epsilonKey) || 1),
  epsilonMin: 0.05,
  epsilonDecay: 0.996,
};

let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
let qTable = JSON.parse(localStorage.getItem(qTableKey) || '{}');
let totalEpisodes = Number(localStorage.getItem(episodesKey) || 0);
let recentScores = [];

let snake;
let food;
let directionIndex;
let pendingDirectionIndex;
let score;
let gameStarted;
let gameOver;
let loopId;
let restartTimeoutId;
let botEnabled = true;

bestEl.textContent = bestScore;

function resetGame() {
  clearTimeout(restartTimeoutId);
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  directionIndex = 1;
  pendingDirectionIndex = 1;
  score = 0;
  gameStarted = botEnabled;
  gameOver = false;
  scoreEl.textContent = score;
  spawnFood();
  updateHud();
  statusEl.textContent = botEnabled
    ? 'Training with Q-learning: self-play in progress...'
    : 'Manual mode: use arrows or WASD.';
  draw();
}

function spawnFood() {
  do {
    food = {
      x: Math.floor(Math.random() * tileCount),
      y: Math.floor(Math.random() * tileCount),
    };
  } while (snake.some((segment) => segment.x === food.x && segment.y === food.y));
}

function updateHud() {
  episodesEl.textContent = totalEpisodes;
  epsilonEl.textContent = learning.epsilon.toFixed(3);
  const average =
    recentScores.length === 0
      ? 0
      : recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length;
  avgScoreEl.textContent = average.toFixed(1);
}

function rotateDirection(currentIndex, action) {
  const turn = actionTurns[action];
  return (currentIndex + turn + directions.length) % directions.length;
}

function nextHeadAtDirection(index) {
  return {
    x: snake[0].x + directions[index].x,
    y: snake[0].y + directions[index].y,
  };
}

function wouldCollide(position) {
  const hitWall =
    position.x < 0 ||
    position.x >= tileCount ||
    position.y < 0 ||
    position.y >= tileCount;
  if (hitWall) {
    return true;
  }

  return snake
    .slice(0, -1)
    .some((segment) => segment.x === position.x && segment.y === position.y);
}

function relativeFoodState() {
  const head = snake[0];
  const forward = directions[directionIndex];
  const left = directions[(directionIndex + 3) % directions.length];
  const dx = food.x - head.x;
  const dy = food.y - head.y;

  const dotForward = dx * forward.x + dy * forward.y;
  const dotLeft = dx * left.x + dy * left.y;

  const forwardCode = dotForward === 0 ? 0 : dotForward > 0 ? 1 : -1;
  const sideCode = dotLeft === 0 ? 0 : dotLeft > 0 ? 1 : -1;

  return { forwardCode, sideCode };
}

function getState() {
  const straightIndex = rotateDirection(directionIndex, 0);
  const leftIndex = rotateDirection(directionIndex, 1);
  const rightIndex = rotateDirection(directionIndex, 2);

  const dangerStraight = wouldCollide(nextHeadAtDirection(straightIndex)) ? 1 : 0;
  const dangerLeft = wouldCollide(nextHeadAtDirection(leftIndex)) ? 1 : 0;
  const dangerRight = wouldCollide(nextHeadAtDirection(rightIndex)) ? 1 : 0;

  const { forwardCode, sideCode } = relativeFoodState();
  const lengthBucket = snake.length < 8 ? 0 : snake.length < 14 ? 1 : 2;

  return [
    dangerStraight,
    dangerLeft,
    dangerRight,
    directionIndex,
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

function setDirectionFromInput(x, y) {
  if (gameOver) {
    return;
  }

  const current = directions[directionIndex];
  const isReverse = current.x + x === 0 && current.y + y === 0;
  if (isReverse && gameStarted) {
    return;
  }

  pendingDirectionIndex = directions.findIndex((dir) => dir.x === x && dir.y === y);
  if (!gameStarted) {
    gameStarted = true;
    statusEl.textContent = 'Manual mode running.';
  }
}

function applyAction(action) {
  pendingDirectionIndex = rotateDirection(directionIndex, action);
}

function commitDirection() {
  directionIndex = pendingDirectionIndex;
}

function moveSnake() {
  commitDirection();
  const nextHead = nextHeadAtDirection(directionIndex);

  if (wouldCollide(nextHead)) {
    gameOver = true;
    return { dead: true, ateFood: false };
  }

  snake.unshift(nextHead);
  const ateFood = nextHead.x === food.x && nextHead.y === food.y;

  if (ateFood) {
    score += 10;
    scoreEl.textContent = score;
    if (score > bestScore) {
      bestScore = score;
      bestEl.textContent = bestScore;
      localStorage.setItem(bestScoreKey, String(bestScore));
    }
    spawnFood();
  } else {
    snake.pop();
  }

  return { dead: false, ateFood };
}

function completeEpisode() {
  totalEpisodes += 1;
  recentScores.push(score);
  if (recentScores.length > 25) {
    recentScores.shift();
  }

  learning.epsilon = Math.max(learning.epsilonMin, learning.epsilon * learning.epsilonDecay);

  localStorage.setItem(episodesKey, String(totalEpisodes));
  localStorage.setItem(epsilonKey, String(learning.epsilon));
  localStorage.setItem(qTableKey, JSON.stringify(qTable));

  updateHud();
  statusEl.textContent = `Episode ${totalEpisodes} finished at score ${score}. Restarting...`;

  restartTimeoutId = setTimeout(() => {
    resetGame();
  }, autoRestartDelayMs);
}

function botStep() {
  if (gameOver) {
    return;
  }

  const state = getState();
  const action = chooseAction(state);

  const distanceBefore =
    Math.abs(snake[0].x - food.x) + Math.abs(snake[0].y - food.y);

  applyAction(action);
  const { dead, ateFood } = moveSnake();

  const distanceAfter = dead
    ? distanceBefore
    : Math.abs(snake[0].x - food.x) + Math.abs(snake[0].y - food.y);

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

  const nextState = dead ? state : getState();
  updateQValue(state, action, reward, nextState, dead);

  if (dead) {
    completeEpisode();
  }
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= tileCount; i += 1) {
    const pos = i * gridSize;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(canvas.width, pos);
    ctx.stroke();
  }
}

function draw() {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();

  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(food.x * gridSize + 2, food.y * gridSize + 2, gridSize - 4, gridSize - 4);

  snake.forEach((segment, index) => {
    ctx.fillStyle = index === 0 ? '#22d3ee' : '#10b981';
    ctx.fillRect(segment.x * gridSize + 2, segment.y * gridSize + 2, gridSize - 4, gridSize - 4);
  });

  if (gameOver && !botEnabled) {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '18px sans-serif';
    ctx.fillText('Press Space to restart', canvas.width / 2, canvas.height / 2 + 22);
  }
}

function tick() {
  if (gameStarted && !gameOver) {
    if (botEnabled) {
      botStep();
    } else {
      moveSnake();
    }
  }

  if (gameOver && botEnabled && !restartTimeoutId) {
    completeEpisode();
  }

  draw();
}

window.addEventListener('keydown', (event) => {
  switch (event.key.toLowerCase()) {
    case 'arrowup':
    case 'w':
      if (!botEnabled) setDirectionFromInput(0, -1);
      break;
    case 'arrowdown':
    case 's':
      if (!botEnabled) setDirectionFromInput(0, 1);
      break;
    case 'arrowleft':
    case 'a':
      if (!botEnabled) setDirectionFromInput(-1, 0);
      break;
    case 'arrowright':
    case 'd':
      if (!botEnabled) setDirectionFromInput(1, 0);
      break;
    case 'b':
      botEnabled = !botEnabled;
      statusEl.textContent = botEnabled
        ? 'Bot mode enabled. Continuing RL self-play training.'
        : 'Manual mode enabled. Use arrows/WASD to move.';
      resetGame();
      break;
    case ' ':
      if (!botEnabled && gameOver) {
        resetGame();
      }
      break;
    default:
      return;
  }
  event.preventDefault();
});

resetGame();
loopId = setInterval(tick, tickMs);
window.addEventListener('beforeunload', () => {
  clearInterval(loopId);
  clearTimeout(restartTimeoutId);
});
