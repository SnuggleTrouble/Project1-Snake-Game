// Constants and DOM Elements
const canvas = document.querySelector(".canvas");
const context = canvas.getContext("2d");
const startBtnContainer = document.querySelector(".startBtnContainer");
const startBtn = document.querySelector(".startBtn");
const playAgainBtn = document.querySelector(".playAgainBtn");
const scoreListContainer = document.querySelector(".scoreListContainer");
const highScoresList = document.querySelector(".highScoresList");
const username = document.querySelector(".username");

// Game Settings
const tileCount = 24;
const tileSize = tileCount - 1;
const maxHighScores = 5;
const winningScore = 100;

// Assets
const appleImage = new Image();
appleImage.src = "./images/apple1.png";

const bgMusic = new Audio("./sounds/Chaoz-Fantasy-8-Bit.mp3");
bgMusic.volume = 0.1;
const chompSound = new Audio("./sounds/chomp.mp3");
const gameOverSound = new Audio("./sounds/gameOver.mp3");
const gameWonSound = new Audio("./sounds/gameWon.mp3");

// Initial Game State
let gameScreen = "start";
let score = { value: 0, name: "" };
let frames = 0;
let snakeSegments = [];
let segmentLength = 1;
let highScores = JSON.parse(localStorage.getItem("highScores")) || [];

// Snake and Fruit Objects
const snake = {
  x: 15,
  y: 15,
  direction: { x: 0, y: 0 },
  move() {
    this.x += this.direction.x;
    this.y += this.direction.y;
  },
  draw() {
    this.move();
    context.fillStyle = "green";
    snakeSegments.forEach((segment) => {
      context.fillRect(segment.x * tileCount, segment.y * tileCount, tileSize, tileSize);
    });
    snakeSegments.push({ x: this.x, y: this.y });
    while (snakeSegments.length > segmentLength) {
      snakeSegments.shift();
    }
    context.fillStyle = "darkgreen";
    context.fillRect(this.x * tileCount, this.y * tileCount, tileSize, tileSize);
  },
};

const fruit = {
  x: 7,
  y: 7,
  draw() {
    this.checkIfEaten();
    context.drawImage(appleImage, this.x * tileCount, this.y * tileCount, tileSize, tileSize);
  },
  checkIfEaten() {
    if (this.x === snake.x && this.y === snake.y) {
      this.x = Math.floor(Math.random() * tileCount);
      this.y = Math.floor(Math.random() * tileCount);
      segmentLength++;
      score.value++;
      chompSound.play();
      console.log("Fruit eaten! Score: ", score.value);
    }
  },
  drawScore() {
    context.fillStyle = "antiquewhite";
    context.font = "15px Arial";
    context.fillText(`Score: ${score.value}`, canvas.width - 75, 20);
  },
};

// Utility Functions
function updateHighScores() {
  highScores.push(score);
  highScores.sort((a, b) => b.value - a.value);
  highScores.splice(maxHighScores);
  localStorage.setItem("highScores", JSON.stringify(highScores));
}

function displayHighScores() {
  highScoresList.innerHTML = highScores.map((score) => `<li>${score.name} - ${score.value}</li>`).join("");
}

function resetGame() {
  score.value = 0;
  segmentLength = 1;
  snake.x = 15;
  snake.y = 15;
  snake.direction = { x: 0, y: 0 };
  fruit.x = 7;
  fruit.y = 7;
  gameScreen = "game";
  snakeSegments = [{ x: snake.x, y: snake.y }]; // Initialize snake segments with the starting position
}

// Helper Function for Drawing Text
function drawText(message, fontSize, x, y, color, gradient = null) {
  context.font = fontSize;
  if (gradient) {
    const grad = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.forEach((stop) => grad.addColorStop(stop.position, stop.color));
    context.fillStyle = grad;
  } else {
    context.fillStyle = color;
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, x, y);
}

// Game Status Functions
function checkGameWon() {
  if (score.value >= winningScore) {
    drawText("You Won!", "50px Arial", canvas.width / 2, canvas.height / 2, "white", [
      { position: "0", color: "blue" },
      { position: "0.5", color: "red" },
      { position: "1.0", color: "magenta" },
    ]);
    console.log("Game won!");
    return true;
  }
  return false;
}

function checkGameOver() {
  let gameOver = false;
  if (snake.x < 0 || snake.x >= tileCount || snake.y < 0 || snake.y >= tileCount) {
    drawText("Game over! You hit the wall.", "40px Arial", canvas.width / 2, canvas.height / 2, "white", [
      { position: "0", color: "blue" },
      { position: "0.5", color: "red" },
      { position: "1.0", color: "magenta" },
    ]);
    console.log("Game over: you hit the wall");
    gameOver = true;
  } else {
    for (let i = 0; i < snakeSegments.length - 1; i++) {
      if (snake.x === snakeSegments[i].x && snake.y === snakeSegments[i].y) {
        drawText("Game over! You bit yourself.", "40px Arial", canvas.width / 2, canvas.height / 2, "white", [
          { position: "0", color: "blue" },
          { position: "0.5", color: "red" },
          { position: "1.0", color: "magenta" },
        ]);
        console.log("Game over: you bit yourself");
        gameOver = true;
        break;
      }
    }
  }
  return gameOver;
}

// Event Handlers
function handleKeyDown(event) {
  const { keyCode } = event;
  switch (keyCode) {
    case 38:
    case 87:
      if (snake.direction.y !== 1) snake.direction = { x: 0, y: -1 };
      break;
    case 40:
    case 83:
      if (snake.direction.y !== -1) snake.direction = { x: 0, y: 1 };
      break;
    case 37:
    case 65:
      if (snake.direction.x !== 1) snake.direction = { x: -1, y: 0 };
      break;
    case 39:
    case 68:
      if (snake.direction.x !== -1) snake.direction = { x: 1, y: 0 };
      break;
  }
}

// Game Loop
function gameLoop() {
  switch (gameScreen) {
    case "start":
      startBtnContainer.style.visibility = "visible";
      scoreListContainer.style.visibility = "hidden";
      break;
    case "game":
      document.removeEventListener("keydown", handleKeyDown); // Avoid multiple listeners
      document.addEventListener("keydown", handleKeyDown);
      const gameWon = checkGameWon();
      const gameOver = checkGameOver();
      if (gameWon || gameOver) {
        gameScreen = "score";
        bgMusic.pause();
        if (gameWon) gameWonSound.play();
        if (gameOver) gameOverSound.play();
        playAgainBtn.style.visibility = "visible";
        updateHighScores();
        displayHighScores();
        break;
      }
      frames++;
      if (frames % 3 === 0) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        snake.draw();
        fruit.draw();
        fruit.drawScore();
        bgMusic.play();
      }
      break;
    case "score":
      scoreListContainer.style.visibility = "visible";
      break;
  }
}

setInterval(gameLoop, 25);

// Start and Restart Handlers
startBtn.onclick = () => {
  if (username.value) {
    score.name = username.value;
    username.value = "";
    gameScreen = "game";
    startBtnContainer.style.visibility = "hidden";
    canvas.style.visibility = "visible";
  }
};

playAgainBtn.onclick = () => {
  resetGame();
  playAgainBtn.style.visibility = "hidden";
  scoreListContainer.style.visibility = "hidden";
};
