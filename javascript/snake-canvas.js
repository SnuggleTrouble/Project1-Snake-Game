const canvas = document.querySelector(".canvas");
const startBtnContainer = document.querySelector(".startBtnContainer");
const startBtn = document.querySelector(".startBtn");
const playAgainBtn = document.querySelector(".playAgainBtn");
const scoreListContainer = document.querySelector(".scoreListContainer");
const scoreList = document.querySelector(".scoreList");
const input = document.querySelector(".input");

const context = canvas.getContext("2d");
context.font = "20px monospace";

const gameBackground = "gray";
const gameBorder = "black";
const snakeColor = "orange";
const snakeBorder = "red";

// gameScreen is either going to be start || game || score   HINT Visibility: visible || hidden
let gameScreen = "start";

// initial values of the game
let name = "";
let timer = 0;
let score = 0;
let frames = 0;

// initial value of our score is grabbed from local storage
const scoreArray = JSON.parse(localStorage.getItem("scores"));

const snake = {
    x: 50,
    y: 50,
    w: 12,
    h: 12,
    direction: {x: 0, y: 0},
    draw: function () {
        this.move();
        context.fillRect(this.x, this.y, this.w, this.h);
    },
    move: function () {
        this.x = this.x + this.direction.x;
        this.y = this.y + this.direction.y;
        /* this.y %= canvas.height */
        if (this.x < 0) {
            this.x = canvas.width;
        } else if (this.x > canvas.width) {
            this.x = 0;
        }
        if (this.y < 0) {
            this.y = canvas.height;
        } else if (this.y > canvas.height) {
            this.y = 0;
        }
    }
}

// snake elements should be an array of objects that follow the snake's direction.
// the snake should add and remove segments as the snake moves across the board to simulate movement.
/* let snake = [
    {x: 200, y: 200},
    {x: 190, y: 200},
    {x: 180, y: 200},
    {x: 170, y: 200},
    {x: 160, y: 200}
]; */

//create a class for the snake that will have collision with walls and itself.
/* 
function drawSnakeSegments(snakeSegment) {
    context.fillStyle = "orange";
    context.strokeStyle = "red";
    context.fillRect(snakeSegment.x, snakeSegment.y, 10, 10);
    context.strokeRect(snakeSegment.x, snakeSegment.y, 10, 10);
    };
    */

/* function drawSnake() {
    snake.forEach(drawSnakeSegments);
} */

// a function to make the snake elements follow. Should utilize the push() and pop() methods
/* function moveSnake() {}; */


// game loop
setInterval(() => {
    switch (gameScreen) {
        // start screen
        case "start":
            startBtnContainer.style.visibility = "visible";
            scoreListContainer.style.visibility = "hidden";
            break;
        // game screen
        case "game":
            frames++;
            if (frames % 3 === 0) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            score++;
            context.fillText(score, 15, 20);
            snake.draw();
            }
            
            // condition for stopping the game and returning to the score screen
          /*   if (timer > 100) {
                score = randomScore(100, 200);
                scoreArray.push({name: name, score: score})
                localStorage.setItem("scores", JSON.stringify(scoreArray));
                //createItemScore(score, name);
                createListScore(scoreArray);
                gameScreen = "score"
            } */
            break;
        // score screen
        case "score":
            scoreListContainer.style.visibility = "visible";
            break;
        default:
        break;
    }
}, 20);

// resetting the initial value of the game
function gameReset() {
    timer = 0;
    score = 0;
    gameScreen = "start";
};

// grab a random score
function randomScore(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

// create a list element with the name and score
function createItemScore(score, name) {
    const scoreItem = document.createElement("li");
    // change innerHTML to something else. SECURITY RISK
    scoreItem.textContent = `${name} ${score}`
    scoreList.appendChild(scoreItem);
};

// create multiple list elements from an array
function createListScore(scoreArray) {
    scoreList.textContent = "";
    scoreArray.sort((score1, score2) => score2.score - score1.score);
    const top5Scores = [];
    for (let i = 0; i < 5; i++) {
        if (scoreArray[i]) {
            top5Scores.push(scoreArray[i]);
        }
    }
   
    // This can be scrapped --------------------------------------------------------
    const top5ScoresTransformed = top5Scores.map(scoreItem => {
        const first3Letters = 
        `${scoreItem.name.charAt(0)}
        ${scoreItem.name.charAt(1)}
        ${scoreItem.name.charAt(2)}`;
        return {
            score: scoreItem.score,
            name: first3Letters
        };
    });
    top5Scores.forEach(scoreItem => {
        createItemScore(scoreItem.score, scoreItem.name);
    });
};
// ----------------------------------------------------------------------------------

// Start button
startBtn.onclick = () => {
    console.log(input.value)
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
};

document.addEventListener("keydown", event => {
    switch (event.keyCode) {
// Arrow Controls
    case 38: // Arrow up
        snake.direction = {x: 0, y: - snake.w}
        break;
    
    case 40: // Arrow down
        snake.direction = {x: 0, y: snake.w}
        break;
    
    case 37: // Arrow left
        snake.direction = {x: - snake.w, y: 0}
        break;
    
    case 39: // Arrow right
        snake.direction = {x: snake.w, y: 0}
        break;
// WASD Controls
    case 87: // W
        snake.direction = {x: 0, y: - snake.w}
        break;
    case 83: // S
        snake.direction = {x: 0, y: snake.w}
        break;
    case 65: // A
        snake.direction = {x: - snake.w, y: 0}
        break;
    case 68:
        snake.direction = {x: snake.w, y: 0}
        break;
    }
    console.log(event.keyCode)
})