import { database } from "./firebaseconfig.js"
import { ref, update, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js"

const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")
const scoreDisplay = document.getElementById("score")
const highScoreDisplay = document.getElementById("high_score")
const timerDisplay = document.getElementById("timer")
const instructionsPopup = document.getElementById("instructions")
const gameOverPopup = document.getElementById("game-over-popup")
const startBtn = document.getElementById("startBtn")
const tryAgainBtn = document.getElementById("tryAgainBtn")

let fruits = []
let score = 0
let gameOver = false
let gameLoop
let highScore = 0
let spawnInterval
let timeRemaining = 60
let isDragging = false
let lastPos = { x: 0, y: 0 }
let slashPoints = []
const shineParticles = []
const slicedFruitParticles = []
const floatingTexts = []

// Global variables for timer and input control during ice effect
let timerInterval
let inputDisabled = false

// Resize canvas for mobile devices
function resizeCanvas() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
window.addEventListener("resize", resizeCanvas)
resizeCanvas()

instructionsPopup.style.display = "flex"

startBtn.addEventListener("click", () => {
  instructionsPopup.style.display = "none"
  startGame()
})

tryAgainBtn.addEventListener("click", () => {
  gameOverPopup.style.display = "none"
  startGame()
})

function startGame() {
  fetchHighScore()
  fruits = []
  score = 0
  timeRemaining = 60
  gameOver = false
  scoreDisplay.textContent = `Score: ${score}`
  timerDisplay.textContent = `Time: ${timeRemaining}`
  clearInterval(gameLoop)
  clearInterval(spawnInterval)
  gameLoop = setInterval(updateGame, 1000 / 60)
  spawnInterval = setInterval(spawnFruit, 1500)
  startTimer()
}

function startTimer() {
  timerInterval = setInterval(() => {
    if (!gameOver) {
      timeRemaining--
      timerDisplay.textContent = `Time: ${timeRemaining}`
      if (timeRemaining <= 0) {
        clearInterval(timerInterval)
        endGame()
      }
    }
  }, 1000)
}

function updateGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  for (let i = shineParticles.length - 1; i >= 0; i--) {
    shineParticles[i].update()
    shineParticles[i].draw(ctx)
    if (shineParticles[i].life <= 0) {
      shineParticles.splice(i, 1)
    }
  }
  
  for (let i = slicedFruitParticles.length - 1; i >= 0; i--) {
    slicedFruitParticles[i].update()
    slicedFruitParticles[i].draw(ctx)
    if (slicedFruitParticles[i].y > canvas.height) {
      slicedFruitParticles.splice(i, 1)
    }
  }
  
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    floatingTexts[i].update()
    floatingTexts[i].draw(ctx)
    if (floatingTexts[i].life <= 0) {
      floatingTexts.splice(i, 1)
    }
  }
  
  for (let i = fruits.length - 1; i >= 0; i--) {
    const fruit = fruits[i]
    if (fruit.update()) {
      fruits.splice(i, 1)
    } else {
      fruit.draw()
    }
  }
  
  if (slashPoints.length > 1) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(slashPoints[0].x, slashPoints[0].y)
    for (let i = 1; i < slashPoints.length; i++) {
      ctx.lineTo(slashPoints[i].x, slashPoints[i].y)
    }
    ctx.stroke()
  }
}

async function fetchHighScore() {
  const userId = localStorage.getItem("firebaseid") || "default_user"
  const userRef = ref(database, `users/${userId}/Score`)
  try {
    const snapshot = await get(userRef)
    if (snapshot.exists()) {
      const userData = snapshot.val()
      highScore = userData.game_highest_score || 0
      highScoreDisplay.innerHTML = `High: ${highScore}`
    } else {
      highScore = 0
      highScoreDisplay.innerHTML = `High: 0`
    }
  } catch (error) {
    console.error("Error fetching high score from Firebase:", error)
    highScore = 0
    highScoreDisplay.innerHTML = `High: 0`
  }
}

function spawnFruit() {
  if (!gameOver) {
    const fruitCounts = [4, 4, 4, 3]
    const count = fruitCounts[Math.floor(Math.random() * fruitCounts.length)]
    for (let i = 0; i < count; i++) {
      fruits.push(new Fruit())
    }
  }
}

function endGame() {
  gameOver = true
  clearInterval(gameLoop)
  clearInterval(spawnInterval)
  updateGameScores(score)
  showGameOverPopup()
}

async function updateGameScores(currentGameScore) {
  const userId = localStorage.getItem("firebaseid") || "default_user"
  const userRef = ref(database, `users/${userId}/Score`)
  try {
    const snapshot = await get(userRef)
    let updates = {}
    if (snapshot.exists()) {
      const userData = snapshot.val()
      const totalScore = (userData.game_score || 0) + currentGameScore
      updates.game_score = totalScore
      updates.total_score = (userData.total_score || 0) + currentGameScore
      const currentHighScore = userData.game_highest_score || 0
      if (currentGameScore > currentHighScore) {
        updates.game_highest_score = currentGameScore
      }
    } else {
      updates = {
        game_score: currentGameScore,
        game_highest_score: currentGameScore,
        total_score: currentGameScore,
      }
    }
    await update(userRef, updates)
    console.log("Scores updated successfully in Firebase.")
  } catch (error) {
    console.error("Error updating scores in Firebase:", error)
  }
}

function showGameOverPopup() {
  let headerMsg = ""
  let bodyMsg = ""
  if (score < highScore * 0.5) {
    headerMsg = "Keep trying!"
    bodyMsg = `<p>You scored <strong>${score}</strong> points. Your high score is <strong>${highScore}</strong>. Practice makes perfect!</p>`
  } else if (score < highScore) {
    headerMsg = "Almost there!"
    bodyMsg = `<p>You scored <strong>${score}</strong> points, but your high score is <strong>${highScore}</strong>. You're close—keep pushing!</p>`
  } else if (score === highScore) {
    headerMsg = "Well done!"
    bodyMsg = `<p>You scored <strong>${score}</strong> points and matched your high score!</p>`
  } else {
    headerMsg = "New High Score!"
    bodyMsg = `<p>You scored <strong>${score}</strong> points, beating your previous high score of <strong>${highScore}</strong>! Outstanding performance!</p>`
  }
  document.getElementById("game-over-header").innerHTML = headerMsg
  document.getElementById("game-over-body").innerHTML = bodyMsg
  gameOverPopup.style.display = "flex"
}

class Fruit {
  constructor() {
    this.size = 140
    this.sliceRadius = 30
    this.resetPosition()
    this.emoji = this.getRandomEmoji()
    this.points = this.getPoints()
    this.isSliced = false
  }
  resetPosition() {
    const headerHeight = 120
    const vh = (window.innerHeight - headerHeight) / 120
    const allowedTop = headerHeight + 10 * vh
    const allowedBottom = window.innerHeight - 10 * vh
    this.y = allowedTop + Math.random() * (allowedBottom - allowedTop - this.size)
    this.zone = Math.random() < 0.5 ? "left" : "right"
    if (this.zone === "left") {
      this.x = -this.size / 2
      this.velocityX = Math.random() * 4 + 4
      this.velocityY = -(Math.random() * 3 + 7)
    } else {
      this.x = canvas.width - this.size / 2
      this.velocityX = -(Math.random() * 4 + 4)
      this.velocityY = -(Math.random() * 3 + 7)
    }
  }
  getRandomEmoji() {
    const emojis = [
      { emoji: "🍎", weight: 30 },
      { emoji: "🍊", weight: 25 },
      { emoji: "🍇", weight: 20 },
      { emoji: "🍓", weight: 15 },
      { emoji: "💣", weight: 5 },
      { emoji: "❄️", weight: 5 },
    ]
    const totalWeight = emojis.reduce((sum, item) => sum + item.weight, 0)
    let rand = Math.random() * totalWeight
    for (const item of emojis) {
      if (rand < item.weight) return item.emoji
      rand -= item.weight
    }
    return "🍎"
  }
  getPoints() {
    const pointsMap = {
      "🍎": 1,
      "🍊": 3,
      "🍇": 5,
      "🍓": 5,
      "💣": -5,
      "❄️": 2,
    }
    return pointsMap[this.emoji] || 1
  }
  update() {
    if (!this.isSliced) {
      this.velocityY += 0.3
      this.x += this.velocityX
      this.y += this.velocityY
    }
    if (this.x > canvas.width || this.x + this.size < 0 || this.y > canvas.height) {
      return true
    }
    return false
  }
  draw() {
    if (this.isSliced) return
    ctx.font = "40px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(this.emoji, this.x + this.size / 2, this.y + this.size / 2)
  }
  checkSlice(x1, y1, x2, y2) {
    if (this.isSliced) return false
    const centerX = this.x + this.size / 2
    const centerY = this.y + this.size / 2
    const dist = this.pointToLineDistance(centerX, centerY, x1, y1, x2, y2)
    return dist < this.sliceRadius
  }
  pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1
    const B = py - y1
    const C = x2 - x1
    const D = y2 - y1
    const dot = A * C + B * D
    const len_sq = C * C + D * D
    let param = -1
    if (len_sq !== 0) param = dot / len_sq
    let xx, yy
    if (param < 0) {
      xx = x1
      yy = y1
    } else if (param > 1) {
      xx = x2
      yy = y2
    } else {
      xx = x1 + param * C
      yy = y1 + param * D
    }
    const dx = px - xx
    const dy = py - yy
    return Math.sqrt(dx * dx + dy * dy)
  }
}

class ShineParticle {
  constructor(x, y) {
    this.x = x
    this.y = y
    this.size = Math.random() * 10 + 5
    this.speedX = Math.random() * 3 - 1.5
    this.speedY = Math.random() * 3 - 1.5
    this.life = 30
  }
  update() {
    this.x += this.speedX
    this.y += this.speedY
    this.life--
  }
  draw(ctx) {
    ctx.fillStyle = `rgba(255, 255, 255, ${this.life / 30})`
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

class SlicedFruitParticle {
  constructor(x, y, color) {
    this.x = x
    this.y = y
    this.size = Math.random() * 5 + 2
    this.speedX = Math.random() * 6 - 3
    this.speedY = -Math.random() * 15
    this.gravity = 0.5
    this.color = color
  }
  update() {
    this.x += this.speedX
    this.y += this.speedY
    this.speedY += this.gravity
  }
  draw(ctx) {
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

class FloatingText {
  constructor(x, y, text, color) {
    this.x = x
    this.y = y
    this.text = text
    this.color = color
    this.life = 60
    this.opacity = 1
  }
  update() {
    this.y -= 0.5
    this.life--
    this.opacity = this.life / 60
  }
  draw(ctx) {
    ctx.save()
    ctx.globalAlpha = this.opacity
    ctx.fillStyle = this.color
    ctx.font = "30px Arial"
    ctx.textAlign = "center"
    ctx.fillText(this.text, this.x, this.y)
    ctx.restore()
  }
}

function handleSlice(points) {
  if (gameOver || points.length < 2 || inputDisabled) return
  const x1 = points[points.length - 2].x
  const y1 = points[points.length - 2].y
  const x2 = points[points.length - 1].x
  const y2 = points[points.length - 1].y
  let sliceHappened = false
  fruits.forEach((fruit) => {
    if (!fruit.isSliced && fruit.checkSlice(x1, y1, x2, y2)) {
      fruit.isSliced = true
      score += fruit.points
      scoreDisplay.innerHTML = `Score: ${score}`
      sliceHappened = true
      
      // Add shine particles
      for (let i = 0; i < 5; i++) {
        shineParticles.push(new ShineParticle(fruit.x + fruit.size / 2, fruit.y + fruit.size / 2))
      }
      // Add sliced fruit particles
      const fruitColors = {
        "🍎": "#ff0000",
        "🍊": "#ffa500",
        "🍇": "#800080",
        "🍓": "#ff0000",
        "💣": "#000000",
        "❄️": "#ffffff",
      }
      const color = fruitColors[fruit.emoji] || "#ffffff"
      for (let i = 0; i < 10; i++) {
        slicedFruitParticles.push(new SlicedFruitParticle(fruit.x + fruit.size / 2, fruit.y + fruit.size / 2, color))
      }
      // Add floating text for points
      floatingTexts.push(new FloatingText(fruit.x + fruit.size / 2, fruit.y + fruit.size / 2, (fruit.points > 0 ? "+" : "") + fruit.points, color))
      
      if (fruit.emoji === "💣") {
        bombEffect()
      } else if (fruit.emoji === "❄️") {
        iceEffect()
      }
    }
  })
  if (!sliceHappened) {
    slashPoints = [points[points.length - 1]]
  }
}

canvas.addEventListener("mousedown", (e) => {
  isDragging = true
  const rect = canvas.getBoundingClientRect()
  lastPos = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  slashPoints = [lastPos]
})

canvas.addEventListener("mousemove", (e) => {
  if (!isDragging) return
  const rect = canvas.getBoundingClientRect()
  const currentPos = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  slashPoints.push(currentPos)
  handleSlice(slashPoints)
  lastPos = currentPos
})

canvas.addEventListener("mouseup", () => {
  isDragging = false
  slashPoints = []
})

canvas.addEventListener("mouseleave", () => {
  isDragging = false
  slashPoints = []
})

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault()
  isDragging = true
  const rect = canvas.getBoundingClientRect()
  const touch = e.touches[0]
  lastPos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  slashPoints = [lastPos]
})

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault()
  if (!isDragging) return
  const rect = canvas.getBoundingClientRect()
  const touch = e.touches[0]
  const currentPos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  slashPoints.push(currentPos)
  handleSlice(slashPoints)
  lastPos = currentPos
})

canvas.addEventListener("touchend", (e) => {
  e.preventDefault()
  isDragging = false
  slashPoints = []
})

document.body.addEventListener("touchstart", (e) => {
  if (e.target === canvas) e.preventDefault()
}, { passive: false })

document.body.addEventListener("touchmove", (e) => {
  if (e.target === canvas) e.preventDefault()
}, { passive: false })

document.body.addEventListener("touchend", (e) => {
  if (e.target === canvas) e.preventDefault()
}, { passive: false })

function iceEffect() {
  // Only pause timer, don't disable input
  clearInterval(timerInterval)
  
  // Apply highlight effects to score displays
  scoreDisplay.style.transition = "box-shadow 0.5s ease"
  highScoreDisplay.style.transition = "box-shadow 0.5s ease"
  scoreDisplay.style.boxShadow = "0 0 20px 10px rgba(0, 191, 255, 0.8)"
  highScoreDisplay.style.boxShadow = "0 0 20px 10px rgba(0, 191, 255, 0.8)"

  // Background color transition effect
  document.body.style.transition = "background-color 0.5s ease"
  document.body.style.backgroundColor = "#b3e5fc"
  setTimeout(() => {
    document.body.style.backgroundColor = "#E0F7FA"
  }, 1000)

  // Show ice effect overlay
  const iceOverlay = document.createElement("div")
  iceOverlay.id = "ice-overlay"
  iceOverlay.style.position = "fixed"
  iceOverlay.style.top = "0"
  iceOverlay.style.left = "0"
  iceOverlay.style.width = "100%"
  iceOverlay.style.height = "100%"
  iceOverlay.style.backgroundColor = "rgba(135, 206, 235, 0.5)"
  iceOverlay.style.zIndex = "9999"
  iceOverlay.style.display = "flex"
  iceOverlay.style.justifyContent = "center"
  iceOverlay.style.alignItems = "center"
  iceOverlay.style.fontSize = "36px"
  iceOverlay.style.fontWeight = "bold"
  iceOverlay.style.color = "#fff"
  iceOverlay.innerHTML = "❄️ Time Frozen! 🥶"
  document.body.appendChild(iceOverlay)

  // Fade out overlay after 2 seconds
  setTimeout(() => {
    iceOverlay.style.opacity = "0"
  }, 2000)

  // Remove overlay after fade out
  setTimeout(() => {
    if (document.body.contains(iceOverlay)) {
      document.body.removeChild(iceOverlay)
    }
  }, 4000)

  // Remove score display highlights and resume timer after 5 seconds
  setTimeout(() => {
    scoreDisplay.style.boxShadow = "none"
    highScoreDisplay.style.boxShadow = "none"
    startTimer()
  }, 5000)
}


function bombEffect() {
  if (document.getElementById("bomb-overlay")) return
  const bombOverlay = document.createElement("div")
  bombOverlay.id = "bomb-overlay"
  bombOverlay.style.position = "fixed"
  bombOverlay.style.top = "0"
  bombOverlay.style.left = "0"
  bombOverlay.style.width = "100%"
  bombOverlay.style.height = "100%"
  bombOverlay.style.backgroundColor = "rgba(255, 0, 0, 0.5)"
  bombOverlay.style.zIndex = "9999"
  bombOverlay.style.display = "flex"
  bombOverlay.style.justifyContent = "center"
  bombOverlay.style.alignItems = "center"
  bombOverlay.style.fontSize = "36px"
  bombOverlay.style.fontWeight = "bold"
  bombOverlay.style.color = "#fff"
  bombOverlay.innerHTML = "💣 Ohh, you lost 5 points! 😢"
  document.body.appendChild(bombOverlay)
  canvas.classList.add("shake")
  setTimeout(() => {
    if (document.body.contains(bombOverlay)) {
      document.body.removeChild(bombOverlay)
    }
    canvas.classList.remove("shake")
  }, 2000)
}

document.addEventListener("DOMContentLoaded", () => {
  instructionsPopup.style.display = "flex"
})
