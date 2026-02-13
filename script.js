const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const statusEl = document.getElementById('status');

const gridSize = 20;
const tileCount = canvas.width / gridSize;
const tickMs = 110;

const bestScoreKey = 'snake-best-score';
let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
bestEl.textContent = bestScore;

let snake;
let food;
let direction;
let pendingDirection;
let score;
let gameStarted;
let gameOver;
let loopId;

function resetGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  pendingDirection = { ...direction };
  score = 0;
  gameStarted = false;
  gameOver = false;
  scoreEl.textContent = score;
  statusEl.textContent = 'Press any movement key to start.';
  spawnFood();
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

function setDirection(x, y) {
  if (gameOver) {
    return;
  }

  const isReverse = direction.x + x === 0 && direction.y + y === 0;
  if (isReverse && gameStarted) {
    return;
  }

  pendingDirection = { x, y };
  if (!gameStarted) {
    gameStarted = true;
    statusEl.textContent = '';
  }
}

function moveSnake() {
  direction = pendingDirection;
  const head = snake[0];
  const nextHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
  };

  const hitWall =
    nextHead.x < 0 ||
    nextHead.x >= tileCount ||
    nextHead.y < 0 ||
    nextHead.y >= tileCount;
  const hitSelf = snake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);

  if (hitWall || hitSelf) {
    gameOver = true;
    statusEl.textContent = 'Game over! Press Space to restart.';
    return;
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

  if (!gameStarted && !gameOver) {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Move to begin', canvas.width / 2, canvas.height / 2);
  }

  if (gameOver) {
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
    moveSnake();
  }
  draw();
}

window.addEventListener('keydown', (event) => {
  switch (event.key.toLowerCase()) {
    case 'arrowup':
    case 'w':
      setDirection(0, -1);
      break;
    case 'arrowdown':
    case 's':
      setDirection(0, 1);
      break;
    case 'arrowleft':
    case 'a':
      setDirection(-1, 0);
      break;
    case 'arrowright':
    case 'd':
      setDirection(1, 0);
      break;
    case ' ':
      if (gameOver) {
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
window.addEventListener('beforeunload', () => clearInterval(loopId));
