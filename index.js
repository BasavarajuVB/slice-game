// Import Realtime Database functions
import { ref, runTransaction } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-database.js";

// ------------------------------
// Game Code (Realtime Database version)
// ------------------------------

// Global flag to disable slicing during effects
let effectActive = false;

// Dynamically add shake animation styles (used for bomb effect)
(function() {
  const styleElem = document.createElement('style');
  styleElem.innerHTML = `
    @keyframes shake {
      0% { transform: translate(1px, 1px) rotate(0deg); }
      10% { transform: translate(-1px, -2px) rotate(-1deg); }
      20% { transform: translate(-3px, 0px) rotate(1deg); }
      30% { transform: translate(3px, 2px) rotate(0deg); }
      40% { transform: translate(1px, -1px) rotate(1deg); }
      50% { transform: translate(-1px, 2px) rotate(-1deg); }
      60% { transform: translate(-3px, 1px) rotate(0deg); }
      70% { transform: translate(3px, 1px) rotate(-1deg); }
      80% { transform: translate(-1px, -1px) rotate(1deg); }
      90% { transform: translate(1px, 2px) rotate(0deg); }
      100% { transform: translate(1px, -2px) rotate(-1deg); }
    }
    .shake {
      animation: shake 0.5s;
      animation-iteration-count: 4;
    }
  `;
  document.head.appendChild(styleElem);
})();

// Get DOM elements from HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const highScoreDisplay = document.getElementById('high_score');
const instructionsPopup = document.getElementById('instructions');
const gameOverPopup = document.getElementById('game-over-popup');

// High score: load from localStorage (or start at 0)
let highScore = parseInt(localStorage.getItem('highScore')) || 0;
highScoreDisplay.innerHTML = `High: ${highScore}`;

// Global game state variables
let lastPos = { x: 0, y: 0 };
let isDragging = false;
let slashPoints = [];
let shineParticles = [];
let slicedFruitParticles = [];
let scorePopups = [];
let fruits = [];
let score = 0;
let gameOver = false;
let gameLoop, spawnInterval, timerInterval;
let timeRemaining = 60;
let isTimerPaused = false;

// Resize the canvas to always fill the window
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

/* ------------------------------
// Class Definitions
------------------------------ */
class ScorePopup {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.alpha = 1;
    this.color = color;
    this.dy = -1;
  }
  update() {
    this.y += this.dy;
    this.alpha -= 0.02;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = this.color;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = 10;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

class ShineParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.color = `hsl(${Math.random() * 360}, 100%, 75%)`;
    this.size = Math.random() * 8 + 4;
    this.speedX = (Math.random() - 0.5) * 10;
    this.speedY = (Math.random() - 0.5) * 10;
    this.life = 1;
    this.opacity = 1;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.life -= 0.02;
    this.opacity = this.life;
    this.size = Math.max(0, this.size - 0.1);
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class SlicedFruitParticle {
  constructor(x, y, emoji, direction) {
    this.x = x;
    this.y = y;
    this.emoji = emoji;
    this.direction = direction;
    this.velocityX = (direction === 'left' ? -3 : 3);
    this.velocityY = -6;
    this.gravity = 0.3;
    this.rotation = 0;
    this.rotationSpeed = (direction === 'left' ? -0.15 : 0.15);
    this.scale = 1;
  }
  update() {
    this.x += this.velocityX;
    this.velocityY += this.gravity;
    this.y += this.velocityY;
    this.rotation += this.rotationSpeed;
    this.scale *= 0.99;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale, this.scale);
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, 0, 0);
    ctx.restore();
  }
}

class Fruit {
  constructor() {
    this.size = 220;
    this.sliceRadius = 30;
    this.resetPosition();
    this.emoji = this.getRandomEmoji();
    this.points = this.getPoints();
    this.isSliced = false;
  }
  resetPosition() {
    const vh = window.innerHeight / 120;
    const allowedTop = 10 * vh;
    const allowedBottom = 90 * vh;
    this.y = allowedTop + Math.random() * (allowedBottom - allowedTop - this.size);
    this.zone = Math.random() < 0.5 ? 'left' : 'right';
    if (this.zone === 'left') {
      this.x = 0;
      this.velocityX = Math.random() * 3 + 3;
      this.velocityY = - (Math.random() * 2 + 6);
    } else {
      this.x = canvas.width - this.size;
      this.velocityX = - (Math.random() * 3 + 3);
      this.velocityY = - (Math.random() * 2 + 8);
    }
  }
  getRandomEmoji() {
    const emojis = [
      { emoji: '🍎', weight: 30 },
      { emoji: '🍊', weight: 25 },
      { emoji: '🍇', weight: 20 },
      { emoji: '🍓', weight: 15 },
      { emoji: '💣', weight: 5 },
      { emoji: '❄️', weight: 5 }
    ];
    const totalWeight = emojis.reduce((sum, item) => sum + item.weight, 0);
    let rand = Math.random() * totalWeight;
    for (let item of emojis) {
      if (rand < item.weight) return item.emoji;
      rand -= item.weight;
    }
    return '🍎';
  }
  getPoints() {
    const pointsMap = {
      '🍎': 1,
      '🍊': 3,
      '🍇': 5,
      '🍓': 5,
      '💣': -5,
      '❄️': 2
    };
    return pointsMap[this.emoji] || 1;
  }
  update() {
    if (!this.isSliced) {
      this.velocityY += 0.3;
      this.x += this.velocityX;
      this.y += this.velocityY;
    }
    if (this.x > canvas.width || (this.x + this.size) < 0 || this.y > canvas.height) {
      return true;
    }
    return false;
  }
  createShineEffect() {
    const particles = [];
    for (let i = 0; i < 40; i++) {
      particles.push(new ShineParticle(
        this.x + this.size / 2,
        this.y + this.size / 6
      ));
    }
    return particles;
  }
  createSlicedPieces() {
    return [
      new SlicedFruitParticle(this.x, this.y, this.emoji, 'left'),
      new SlicedFruitParticle(this.x, this.y, this.emoji, 'right')
    ];
  }
  draw() {
    if (this.isSliced) return;
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, this.x + this.size / 2, this.y + this.size / 2);
  }
  checkSlice(x1, y1, x2, y2) {
    if (this.isSliced) return false;
    const centerX = this.x + this.size / 2;
    const centerY = this.y + this.size / 2;
    const dist = this.pointToLineDistance(centerX, centerY, x1, y1, x2, y2);
    return dist < this.sliceRadius;
  }
  pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;
    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

/* ------------------------------
// Timer & Special Effects Functions
------------------------------ */
function iceEffect() {
  if (isTimerPaused) return;
  effectActive = true;  // Disable slicing while effect is active
  isTimerPaused = true;
  clearInterval(timerInterval);
  
  // Apply a smooth glow transition to score displays
  scoreDisplay.style.transition = "box-shadow 0.5s ease";
  highScoreDisplay.style.transition = "box-shadow 0.5s ease";
  scoreDisplay.style.boxShadow = "0 0 20px 10px rgba(0, 191, 255, 0.8)";
  highScoreDisplay.style.boxShadow = "0 0 20px 10px rgba(0, 191, 255, 0.8)";
  
  // Change the background color for an icy effect
  document.body.style.transition = "background-color 0.5s ease";
  document.body.style.backgroundColor = "#b3e5fc"; // Icy blue color
  setTimeout(() => {
    document.body.style.backgroundColor = "#E0F7FA"; // Revert to original background
  }, 1000);
  
  // Create a full-screen overlay with the ice message (similar to bomb effect)
  let iceOverlay = document.createElement('div');
  iceOverlay.id = 'ice-overlay';
  iceOverlay.style.position = 'fixed';
  iceOverlay.style.top = '0';
  iceOverlay.style.left = '0';
  iceOverlay.style.width = '100%';
  iceOverlay.style.height = '100%';
  iceOverlay.style.backgroundColor = 'rgba(173, 216, 230, 0.5)'; // Icy blue effect
  iceOverlay.style.zIndex = '9999';
  iceOverlay.style.display = 'flex';
  iceOverlay.style.justifyContent = 'center';
  iceOverlay.style.alignItems = 'center';
  iceOverlay.style.fontSize = '36px';
  iceOverlay.style.fontWeight = 'bold';
  iceOverlay.style.color = '#FF69B4';
  iceOverlay.innerHTML = '⏸️ Timer frozen! Enjoy the frozen time! 😊';
  document.body.appendChild(iceOverlay);
  
  // Dim the score and timer displays
  scoreDisplay.style.opacity = '0.7';
  timerDisplay.style.opacity = '0.7';
  
  // Fade out the ice overlay after 2 seconds
  setTimeout(() => {
    iceOverlay.style.opacity = '0';
    iceOverlay.style.backgroundColor = 'rgba(173,216,230,0)';
  }, 2000);
  
  // Remove the ice overlay from the DOM after 1.5 seconds
  setTimeout(() => {
    if (document.body.contains(iceOverlay)) {
      document.body.removeChild(iceOverlay);
    }
  }, 1500);
  
  // Restore displays, remove glow, resume timer, and re-enable slicing after 5 seconds
  setTimeout(() => {
    scoreDisplay.style.opacity = '1';
    timerDisplay.style.opacity = '1';
    scoreDisplay.style.boxShadow = "";
    highScoreDisplay.style.boxShadow = "";
    timerInterval = setInterval(updateTimer, 1000);
    isTimerPaused = false;
    effectActive = false;  // Re-enable slicing after effect
  }, 5000);
}

function bombEffect() {
  if (document.getElementById('bomb-overlay')) return;
  effectActive = true;  // Disable slicing during bomb effect
  const bombOverlay = document.createElement('div');
  bombOverlay.id = 'bomb-overlay';
  bombOverlay.style.position = 'fixed';
  bombOverlay.style.top = '0';
  bombOverlay.style.left = '0';
  bombOverlay.style.width = '100%';
  bombOverlay.style.height = '100%';
  bombOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
  bombOverlay.style.zIndex = '9999';
  bombOverlay.style.display = 'flex';
  bombOverlay.style.justifyContent = 'center';
  bombOverlay.style.alignItems = 'center';
  bombOverlay.style.fontSize = '36px';
  bombOverlay.style.fontWeight = 'bold';
  bombOverlay.style.color = '#fff';
  bombOverlay.innerHTML = '💣 Ohh, you lost 5 points! 😢';
  document.body.appendChild(bombOverlay);
  canvas.classList.add('shake');
  setTimeout(() => {
    if (document.body.contains(bombOverlay)) {
      document.body.removeChild(bombOverlay);
    }
    canvas.classList.remove('shake');
    effectActive = false;  // Re-enable slicing after effect
  }, 2000);
}

/* ------------------------------
// Main Game Functions
------------------------------ */
function spawnFruit() {
  if (!gameOver) {
    const fruitCounts = [6, 6, 6, 4];
    const count = fruitCounts[Math.floor(Math.random() * fruitCounts.length)];
    for (let i = 0; i < count; i++) {
      fruits.push(new Fruit());
    }
  }
}

function startGame() {
  clearInterval(gameLoop);
  clearInterval(spawnInterval);
  clearInterval(timerInterval);
  fruits = [];
  scorePopups = [];
  score = 0;
  timeRemaining = 60;
  gameOver = false;
  slashPoints = [];
  shineParticles = [];
  slicedFruitParticles = [];
  scoreDisplay.innerHTML = `Score: ${score}`;
  timerDisplay.innerHTML = `Time: ${timeRemaining}`;
  gameLoop = setInterval(updateGame, 1000 / 60);
  spawnInterval = setInterval(spawnFruit, 1500);
  timerInterval = setInterval(updateTimer, 1000);
}

function updateGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = shineParticles.length - 1; i >= 0; i--) {
    shineParticles[i].update();
    shineParticles[i].draw(ctx);
    if (shineParticles[i].life <= 0) {
      shineParticles.splice(i, 1);
    }
  }
  for (let i = slicedFruitParticles.length - 1; i >= 0; i--) {
    slicedFruitParticles[i].update();
    slicedFruitParticles[i].draw(ctx);
    if (slicedFruitParticles[i].y > canvas.height) {
      slicedFruitParticles.splice(i, 1);
    }
  }
  for (let i = fruits.length - 1; i >= 0; i--) {
    const fruit = fruits[i];
    if (fruit.update()) {
      fruits.splice(i, 1);
    } else {
      fruit.draw();
    }
  }
  if (slashPoints.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(slashPoints[0].x, slashPoints[0].y);
    for (let i = 1; i < slashPoints.length; i++) {
      ctx.lineTo(slashPoints[i].x, slashPoints[i].y);
    }
    ctx.stroke();
  }
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    scorePopups[i].update();
    scorePopups[i].draw(ctx);
    if (scorePopups[i].alpha <= 0) {
      scorePopups.splice(i, 1);
    }
  }
}

function updateTimer() {
  if (timeRemaining > 0) {
    timeRemaining--;
    timerDisplay.innerHTML = `Time: ${timeRemaining}`;
    if (timeRemaining === 0) {
      endGame();
    }
  }
}

function endGame() {
  gameOver = true;
  clearInterval(gameLoop);
  clearInterval(spawnInterval);
  clearInterval(timerInterval);
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('highScore', highScore);
    highScoreDisplay.innerHTML = `High: ${highScore}`;
  }
  // Use a transaction to update the cumulative score in Realtime Database.
  const scoreRef = ref(window.db, "gameScores/allGamesScore");
  runTransaction(scoreRef, (currentValue) => {
    if (currentValue === null) {
      return score;
    } else {
      return currentValue + score;
    }
  }).then((result) => {
    if (result.committed) {
      console.log("Score updated successfully in Realtime Database:", result.snapshot.val());
    } else {
      console.log("Score transaction not committed.");
    }
  }).catch((error) => {
    console.error("Error updating Realtime Database score:", error);
  });
  showGameOverPopup();
}

function showGameOverPopup() {
  let headerMsg = "";
  let bodyMsg = "";
  if (score < highScore * 0.5) {
    headerMsg = "Keep trying!";
    bodyMsg = `<p>You scored <strong>${score}</strong> points. Your high score is <strong>${highScore}</strong>. Practice makes perfect!</p>`;
  } else if (score < highScore) {
    headerMsg = "Almost there!";
    bodyMsg = `<p>You scored <strong>${score}</strong> points, but your high score is <strong>${highScore}</strong>. You're close—keep pushing!</p>`;
  } else if (score === highScore) {
    headerMsg = "Well done!";
    bodyMsg = `<p>You scored <strong>${score}</strong> points and matched your high score!</p>`;
  } else {
    headerMsg = "New High Score!";
    bodyMsg = `<p>You scored <strong>${score}</strong> points, beating your previous high score of <strong>${highScore}</strong>! Outstanding performance!</p>`;
  }
  document.getElementById('game-over-header').innerHTML = headerMsg;
  document.getElementById('game-over-body').innerHTML = bodyMsg;
  gameOverPopup.style.display = 'block';
}

function handleSlice(points) {
  if (gameOver || points.length < 2 || effectActive) return;
  const x1 = points[points.length - 2].x;
  const y1 = points[points.length - 2].y;
  const x2 = points[points.length - 1].x;
  const y2 = points[points.length - 1].y;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const swipeDistance = Math.sqrt(dx * dx + dy * dy);
  if (swipeDistance < 10) return;
  let sliceHappened = false;
  fruits.forEach(fruit => {
    if (!fruit.isSliced && fruit.checkSlice(x1, y1, x2, y2)) {
      fruit.isSliced = true;
      score += fruit.points;
      scoreDisplay.innerHTML = `Score: ${score}`;
      scorePopups.push(new ScorePopup(
        fruit.x + fruit.size / 2,
        fruit.y + fruit.size / 2,
        (fruit.points > 0 ? '+' : '') + fruit.points,
        fruit.points >= 0 ? 'lime' : 'red'
      ));
      if (fruit.emoji === '❄️') {
        shineParticles.push(...fruit.createShineEffect());
        slicedFruitParticles.push(...fruit.createSlicedPieces());
        iceEffect();
        scorePopups.push(new ScorePopup(
          fruit.x + fruit.size / 2,
          fruit.y + fruit.size / 2 - 40,
          'Time freezes! for 5 Seconds!',
          '#00BFFF'
        ));
      } else if (fruit.emoji === '💣') {
        let bombParticles = [];
        for (let i = 0; i < 10; i++) {
          bombParticles.push(new ShineParticle(
            fruit.x + fruit.size / 2,
            fruit.y + fruit.size / 6
          ));
        }
        shineParticles.push(...bombParticles);
        slicedFruitParticles.push(...fruit.createSlicedPieces());
        bombEffect();
      } else {
        shineParticles.push(...fruit.createShineEffect());
        slicedFruitParticles.push(...fruit.createSlicedPieces());
      }
      sliceHappened = true;
    }
  });
  if (!sliceHappened) {
    slashPoints = [points[points.length - 1]];
  }
}

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  const rect = canvas.getBoundingClientRect();
  lastPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  slashPoints = [lastPos];
});
canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  const currentPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  slashPoints.push(currentPos);
  handleSlice(slashPoints);
  lastPos = currentPos;
});
canvas.addEventListener('mouseup', () => {
  isDragging = false;
  slashPoints = [];
});
canvas.addEventListener('mouseleave', () => {
  isDragging = false;
  slashPoints = [];
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isDragging = true;
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  lastPos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  slashPoints = [lastPos];
});
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  const currentPos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  slashPoints.push(currentPos);
  handleSlice(slashPoints);
  lastPos = currentPos;
});
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  isDragging = false;
  slashPoints = [];
});

document.body.addEventListener('touchstart', (e) => {
  if (e.target === canvas) e.preventDefault();
}, { passive: false });
document.body.addEventListener('touchmove', (e) => {
  if (e.target === canvas) e.preventDefault();
}, { passive: false });
document.body.addEventListener('touchend', (e) => {
  if (e.target === canvas) e.preventDefault();
}, { passive: false });

document.addEventListener('DOMContentLoaded', () => {
  instructionsPopup.style.display = 'flex';
  instructionsPopup.style.justifyContent = 'center';
  instructionsPopup.style.alignItems = 'center';
});

document.getElementById('startBtn').addEventListener('click', () => {
  instructionsPopup.style.display = 'none';
  startGame();
});

document.getElementById('tryAgainBtn').addEventListener('click', () => {
  gameOverPopup.style.display = 'none';
  startGame();
});
