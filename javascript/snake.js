const canvas = document.querySelector(".canvas");
const startBtnContainer = document.querySelector(".startBtnContainer");
const startBtn = document.querySelector(".startBtn");
const playAgainBtn = document.querySelector(".playAgainBtn");
const scoreListContainer = document.querySelector(".scoreListContainer");
const scoreList = document.querySelector(".scoreList");
const input = document.querySelector(".input");

const context = canvas.getContext("2d");

/* const snakeColor = document.querySelector(".snake");
const fruitColor = document.querySelector(".fruit"); */

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
let speed = 5;
/* let timer = 0; */
let score = 0;
let frames = 0;
let numberOfTiles = 20;
let tileSize = canvas.width / numberOfTiles -2;
const snakeSegments = [];
let segmentLength = 2;

// initial value of our score is grabbed from local storage
const scoreArray = JSON.parse(localStorage.getItem("scores"));

const snake = {
    x: 10,
    y: 10,
    direction: {x: 0, y: 0},
/*     previousDirection: {x: 0, y: 0}, */
    draw: function () {
        this.move();

        context.fillStyle = "green";
        for (let i = 0; i < snakeSegments.length; i++) {
            let segment = snakeSegments[i];
            context.fillRect(segment.x * numberOfTiles, segment.y * numberOfTiles, tileSize, tileSize);
        }
        snakeSegments.push(new SnakeSegment(this.x, this.y)) // places a segment at the end of the array next to the snake head
        while (snakeSegments.length > segmentLength) {
            snakeSegments.shift(); // removes the farthest segment from the snake if it has more than the tail length.
        }
        context.fillStyle = "limegreen";
        context.fillRect(this.x * numberOfTiles, this.y * numberOfTiles, tileSize, tileSize);
    },
    move: function () {
        this.x = this.x + this.direction.x;
        this.y = this.y + this.direction.y;
    },
};

//create a function for the snake that will have collision with walls and itself.

const fruit = {
    x: 5,
    y: 5,
    draw: function () {
        this.checkIfEaten();
        context.fillStyle = "red";
        context.fillRect(this.x * numberOfTiles, this.y * numberOfTiles, tileSize, tileSize)
    },
    checkIfEaten: function () {
        if (this.x === snake.x && this.y === snake.y) {
            this.x = Math.floor(Math.random() * numberOfTiles);
            this.y = Math.floor(Math.random() * numberOfTiles);
            segmentLength++;
            score++;
        }
    },
    drawScore: function () {
        context.fillStyle = "antiquewhite";
        context.font = "10px Arial";
        context.fillText("Score " + score, canvas.width - 50, 10);
    }
};

function isGameOver(){
    let gameOver = false;

    if (snake.direction.x === 0 && snake.direction.y === 0) {
        return false;
    }

    //Wall collision
    if (snake.x <= 0) {
        gameOver = true;
    } else if (snake.x === numberOfTiles) {
        gameOver = true;
    } else if (snake.y < 0) {
        gameOver = true;
    } else if (snake.y === numberOfTiles) {
        gameOver = true;
    }

    //Body collision
    for (let i = 0; i < snakeSegments.length; i++) {
        let segment = snakeSegments[i];
        if (segment.x === snake.x && segment.y === snake.y) {
            gameOver = true;
            break;
        }
    }

    if (gameOver) {
        context.fillStyle = "white";
        context.font = "50px Arial";
        let gradient = context.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop("0", "orange");
        gradient.addColorStop("0.5", "yellow");
        gradient.addColorStop("1.0", "red");
        context.fillStyle = gradient;
        context.fillText("Game Over!", canvas.width / 6.5, canvas.height / 2);
    }
}

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
            // Bug where the game over message is flashing on the screen due to the interval.
            /* let result = isGameOver();
            if (result){
                document.removeEventListener("keydown", keyDown);
                break;
            } */
            frames++;
            if (frames % 3 === 0) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            
            snake.draw();
            fruit.draw();
            fruit.drawScore();
            }
            
            // condition for stopping the game and returning to the score screen
            if (score >= 10) {
                // score = randomScore(100, 200);
                /* scoreArray.push({name: name, score: score})
                localStorage.setItem("scores", JSON.stringify(scoreArray));
                createItemScore(score, name);
                createListScore(scoreArray); */
                gameScreen = "score"
            }
            break;
        // score screen
        case "score":
            scoreListContainer.style.visibility = "visible";
            break;
        default:
        break;
    }
}, 30);

// resetting the initial value of the game
function gameReset() {
    /* timer = 0; */
    score = 0;
    speed = 5;
    segmentLength = 2;
    gameScreen = "start";
};

// grab a random score
function randomScore(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

// create a list element with the name and score
function createItemScore(score, name) {
    const scoreItem = document.createElement("li");
    scoreItem.textHTML = `${name} ${score}`
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
    canvas.style.visibility = "hidden";
};

// Snake Controls
document.addEventListener("keydown", event => {
    switch (event.keyCode) {
        case 38: // Arrow up
        if (snake.direction.y === 1) break;
        snake.direction = {x: 0, y: -1}
        break;
    
        case 40: // Arrow down
        if (snake.direction.y === -1) break;
        snake.direction = {x: 0, y: 1}
        break;
    
        case 37: // Arrow left
        if (snake.direction.x === 1) break;
        snake.direction = {x: -1, y: 0}
        break;
    
        case 39: // Arrow right
        if (snake.direction.x === -1) break;
        snake.direction = {x: 1, y: 0}
        break;
    }
    console.log(event.keyCode)
});