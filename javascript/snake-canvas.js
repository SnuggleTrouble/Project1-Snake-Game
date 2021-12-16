const snakeCanvas = document.getElementById("snake-canvas");
const context = snakeCanvas.getContext("2d");

const gameBackground = "gray";
const gameBorder = "black";
const snakeColor = "orange";
const snakeBorder = "red";

// the snake will be an array of objects that we can later add and remove segments from as the snake moves across the board to simulate movement.
let snake = [
    {x: 200, y: 200},
    {x: 190, y: 200},
    {x: 180, y: 200},
    {x: 170, y: 200},
    {x: 160, y: 200}
];

function drawSnakeSegments(snakeSegment) {
    context.fillStyle = "orange";
    context.strokeStyle = "red";
    context.fillRect(snakeSegment.x, snakeSegment.y, 10, 10);
    context.strokeRect(snakeSegment.x, snakeSegment.y, 10, 10);
    };

function drawSnake() {
    snake.forEach(drawSnakeSegments);
}
// a function to move the snake. Should utilize the unshift() and pop() methods
function moveSnake() {};

// a function that clears the game board and starts a new game.
function startGame() {};

// a function that will create a border for the game board.
function canvasBorder() {};