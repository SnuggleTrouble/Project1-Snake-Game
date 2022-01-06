const canvas = document.querySelector(".canvas");
const startBtnContainer = document.querySelector(".startBtnContainer");
const startBtn = document.querySelector(".startBtn");
const playAgainBtn = document.querySelector(".playAgainBtn");
const scoreListContainer = document.querySelector(".scoreListContainer");
const scoreList = document.querySelector(".scoreList");
const input = document.querySelector(".input");

const context = canvas.getContext("2d");


let bgMusic = new Audio();
bgMusic.src = "./sounds/Chaoz-Fantasy-8-Bit.mp3";
let chompSound = new Audio();
chompSound.src = "./sounds/chomp.mp3";
let gameOverSound = new Audio();
gameOverSound.src = "./sounds/gameOver.mp3";
let gameWon = new Audio();
gameWon.src = "./sounds/gameWon.mp3";

class SnakeSegment {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

// gameScreen is either going to be start || game || score   HINT Visibility: visible || hidden
let gameScreen = "start";

// initial values of the game
let name = "";
let score = 0;
let frames = 0;
let numberOfTiles = 24;
let tileSize = numberOfTiles -1;
const snakeSegments = [];
let segmentLength = 0;

const snake = {
  x: 15,
  y: 15,
  direction: { x: 0, y: 0 },
  draw: function () {
    this.move();

    context.fillStyle = "green";
    for (let i = 0; i < snakeSegments.length; i++) {
      let segment = snakeSegments[i];
      context.fillRect(
        segment.x * numberOfTiles,
        segment.y * numberOfTiles,
        tileSize,
        tileSize
      );
    }
    snakeSegments.push(new SnakeSegment(this.x, this.y)); // places a segment at the end of the array next to the snake head
    while (snakeSegments.length > segmentLength) {
      snakeSegments.shift(); // removes the farthest segment from the snake if it has more than the tail length.
    }
    context.fillStyle = "darkgreen";
    context.fillRect(
      this.x * numberOfTiles,
      this.y * numberOfTiles,
      tileSize,
      tileSize
    );
  },
  move: function () {
    this.x = this.x + this.direction.x;
    this.y = this.y + this.direction.y;
  },
};

const fruit = {
  x: 7,
  y: 7,
  draw: function () {
    this.checkIfEaten();
    context.fillStyle = "red";
    context.fillRect(
      this.x * numberOfTiles,
      this.y * numberOfTiles,
      tileSize,
      tileSize
    );
  },
  checkIfEaten: function () {
    if (this.x === snake.x && this.y === snake.y) {
      this.x = Math.floor(Math.random() * numberOfTiles);
      this.y = Math.floor(Math.random() * numberOfTiles);
      segmentLength++;
      score++;
      chompSound.play();
    }
  },
  drawScore: function () {
    context.fillStyle = "antiquewhite";
    context.font = "10px Arial";
    context.fillText("Score " + score, canvas.width - 50, 10);
  },
};

// Game Won Check
function isGameWon() {
  let gameWon = false;
  if (snake.direction.x === 0 && snake.direction.y === 0) {
    return false;
  }

  if (score >= 3) {
    gameWon = true;
  }

  // Game Won Text
  if (gameWon) {
    context.font = "50px Arial";
    let gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop("0", "blue");
    gradient.addColorStop("0.5", "red");
    gradient.addColorStop("1.0", "magenta");
    context.fillStyle = gradient;
    context.fillText("You Won!", canvas.width / 3, canvas.height / 2);
  }
  return gameWon;
}
// Game Over check
function isGameOver() {
  let gameOver = false;
  if (snake.direction.x === 0 && snake.direction.y === 0) {
    return false;
  }

  //Wall collision
  if (
    snake.x < 0 ||
    snake.x > numberOfTiles ||
    snake.y < 0 ||
    snake.y > numberOfTiles
  ) {
    gameOver = true;
  }

  //Body collision
  for (let i = 1; i < snakeSegments.length; i++) {
    const head = snakeSegments[0];
    if (head.x === snakeSegments[i].x && head.y === snakeSegments[i].y) {
      gameOver = true;
    }
  }

  // Game Over Text
  if (gameOver) {
    context.font = "50px Arial";
    let gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop("0", "blue");
    gradient.addColorStop("0.5", "red");
    gradient.addColorStop("1.0", "magenta");
    context.fillStyle = gradient;
    context.fillText("Game Over!", canvas.width / 3.6, canvas.height / 2);
  }
  return gameOver;
}
// game loop
const gameLoop = setInterval(() => {
  switch (gameScreen) {
    // start screen
    case "start":
      startBtnContainer.style.visibility = "visible";
      scoreListContainer.style.visibility = "hidden";
      break;
    // game screen
    case "game":
      let result = (isGameWon() || isGameOver());
      if (result) {
        document.removeEventListener("keydown", keyDown);
        clearInterval(gameLoop);
        createItemScore("aaa", 100);
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

      // condition for stopping the game and returning to the score screen
      if (isGameWon()) {
        gameScreen = "score";
        bgMusic.pause();
        gameWon.play();
      }
      if (isGameOver()) {
        gameScreen = "score";
        bgMusic.pause();
        gameOverSound.play();
      }
      break;
    // score screen
    case "score":
      scoreListContainer.style.visibility = "visible";
      break;
    default:
      break;
  }
}, 25);

// resetting the initial value of the game
function gameReset() {
  score = 0;
  segmentLength = 0;
  snake.x = 15;
  snake.y = 15;
  snake.direction.x = 0;
  snake.direction.y = 0;
  fruit.x = 7;
  fruit.y = 7;
  gameScreen = "start";
}

// Start button
startBtn.onclick = () => {
  console.log(input.value);
  if (input.value) {
    name = input.value;
    input.value = "";
    gameScreen = "game";
    startBtnContainer.style.visibility = "hidden";
    canvas.style.visibility = "visible";
  }
};

// Restart button
playAgainBtn.onclick = () => {
  gameReset();
  canvas.style.visibility = "hidden";
};

// Score list
function createItemScore(score, name) {
  const scoreItem = document.createElement("li");
  scoreItem.innerHTML = `${name} ${score}`;
  scoreList.appendChild(scoreItem);
}

// Snake Controls
document.addEventListener("keydown", (event) => {
  switch (event.keyCode) {
    case 38: // Arrow up
      if (snake.direction.y === 1) break;
      snake.direction = { x: 0, y: -1 };
      break;

    case 40: // Arrow down
      if (snake.direction.y === -1) break;
      snake.direction = { x: 0, y: 1 };
      break;

    case 37: // Arrow left
      if (snake.direction.x === 1) break;
      snake.direction = { x: -1, y: 0 };
      break;

    case 39: // Arrow right
      if (snake.direction.x === -1) break;
      snake.direction = { x: 1, y: 0 };
      break;
  }
});
