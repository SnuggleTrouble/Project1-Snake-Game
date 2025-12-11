// DOM
const canvas = document.querySelector(".canvas");
const ctx = canvas.getContext("2d");
const startContainer = document.querySelector(".startContainer");
const startBtn = document.querySelector(".startBtn");
const playAgainBtn = document.querySelector(".playAgainBtn");
const restartBtn = document.querySelector(".restartBtn");
const resetScoreboardBtn = document.querySelector(".resetScoreboardBtn");
const scoreListContainer = document.querySelector(".scoreListContainer");
const highScoresList = document.querySelector(".highScoresList");
const finalScoreHeading = document.querySelector(".finalScore");
const usernameInput = document.querySelector("#username");
const gameOverOverlay = document.querySelector("#gameOverOverlay");
const startInstructionsOverlay = document.querySelector("#startInstructionsOverlay");

// UI
const difficultyPills = document.querySelectorAll(".difficultyPill");
const volumeSlider = document.querySelector("#volume"); // range 0..1
const toggleGridBtn = document.querySelector(".toggleGridBtn");
const volumeControl = document.querySelector(".volumeControl");
const musicToggleBtnNodeList = document.querySelectorAll(".musicToggleBtn");
const musicToggleBtns = Array.from(musicToggleBtnNodeList || []);

const HUD_FONT_FAMILY = '"Press Start 2P", monospace';
function setHudFont(px, mono = false) {
  const fam = mono ? '"Press Start 2P", monospace' : HUD_FONT_FAMILY;
  ctx.font = `${px}px ${fam}`;
  ctx.textBaseline = "top";
}

// --- Debug state ---
let DEBUG = {
  enabled: false,
  paused: false,
  stepOnce: false,
  emaFps: 0,
};

// Canvas & Scale
const CANVAS_SIZE = 720;
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

const TILE_COUNT = 24;
const CELL = Math.floor(CANVAS_SIZE / TILE_COUNT);

// Helpers
const show = (el) => el && (el.style.visibility = "visible");
const hide = (el) => el && (el.style.visibility = "hidden");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function updateStartButtonState() {
  const hasName = !!usernameInput?.value?.trim();
  startBtn.disabled = !hasName;
}
usernameInput?.addEventListener("input", updateStartButtonState);
usernameInput?.addEventListener("blur", updateStartButtonState);
// Allow Enter key to start game from username input
usernameInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !startBtn.disabled) {
    startBtn.click();
  }
});

// ---- Idle detection for start screen CRT roll ----
let idleTimer = null;
const IDLE_MS = 2000; // how long before the roll shows

function setBodyState(isStart) {
  document.body.classList.toggle("screen-start", !!isStart);
  document.body.classList.toggle("screen-game", !isStart);
}

function startIdleWatch() {
  stopIdleWatch();
  const reset = () => {
    document.body.classList.remove("is-idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      // only show idle on start screen
      if (document.body.classList.contains("screen-start")) {
        document.body.classList.add("is-idle");
      }
    }, IDLE_MS);
  };
  // events that count as activity
  const evs = ["mousemove", "mousedown", "keydown", "touchstart", "pointermove"];
  evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
  // store listeners so we can remove later
  window.__snakeIdleReset = reset;
  window.__snakeIdleEvents = evs;
  reset();
}

function stopIdleWatch() {
  if (window.__snakeIdleEvents && window.__snakeIdleReset) {
    window.__snakeIdleEvents.forEach((e) => window.removeEventListener(e, window.__snakeIdleReset, { passive: true }));
  }
  clearTimeout(idleTimer);
  idleTimer = null;
  document.body.classList.remove("is-idle");
}

// Debug Helper
function getEffectiveDirection() {
  // The next direction that will be applied on the next tick
  return dirQueue.length ? dirQueue[0] : dir;
}
function predictNextHead() {
  const nd = getEffectiveDirection();
  return { x: snake[0].x + nd.x, y: snake[0].y + nd.y, nd };
}
function findSelfCollisionIndex(next, willGrow) {
  // Ignore the tail when not growing (it will vacate)
  const lenToCheck = willGrow ? snake.length : Math.max(0, snake.length - 1);
  for (let i = 0; i < lenToCheck; i++) {
    if (snake[i].x === next.x && snake[i].y === next.y) return i;
  }
  return -1;
}

// ---- Assets ----
const appleImage = new Image();
appleImage.src = "./images/apple1.png";
let appleReady = false;
appleImage.onload = () => (appleReady = true);

const atlas = new Image();
atlas.src = "./images/snake-graphics.png";

// Each sprite frame inside the atlas
const ATLAS = { fw: 64, fh: 64 };
let atlasReady = false;
atlas.onload = () => {
  atlasReady = true;
  ATLAS.cols = Math.floor(atlas.width / ATLAS.fw);
  ATLAS.rows = Math.floor(atlas.height / ATLAS.fh);
  console.log(`Atlas ready: ${ATLAS.cols} x ${ATLAS.rows} tiles`);
};

// Mapping of [tx, ty] = [column, row] in the atlas.
const SPRITE = {
  head: { up: [3, 0], right: [4, 0], down: [4, 1], left: [3, 1] },
  tail: { up: [3, 2], right: [4, 2], down: [4, 3], left: [3, 3] },
  straight: { h: [1, 0], v: [2, 1] },
  corner: {
    down_right: [0, 0],
    right_up: [0, 1],
    left_down: [2, 0],
    top_left: [2, 2],
  },
  apple: [0, 3],
};

// Sounds (SFX)
const Sounds = {
  eat: new Audio("./sounds/chomp.mp3"),
  gameOver: new Audio("./sounds/gameOver.mp3"),
  gameWon: new Audio("./sounds/gameWon.mp3"),
};

// Background playlist: chain tracks during gameplay (exclude start-screen track)
const BG_PLAYLIST = [
  new Audio("./sounds/ParagonX9_Chaoz_Fantasy_8_Bit.mp3"),
  new Audio("./sounds/ParagonX9_Metropolis_8.mp3"),
  new Audio("./sounds/ParagonX9_No_5.mp3"),
];
// Dedicated start-screen track (plays only on the Start screen)
const START_TRACK = new Audio("./sounds/Avizura_Chaoz_Mirage.mp3");
let bgIndex = 0;
let bgPlayer = null;
// Music enabled state (user toggle)
let musicEnabled = true;

function updateMusicToggleUI() {
  musicToggleBtns.forEach((btn) => {
    try {
      btn.textContent = musicEnabled ? "Music: On" : "Music: Off";
      btn.setAttribute("aria-pressed", musicEnabled ? "true" : "false");
    } catch {}
  });
}

function toggleMusicEnabled(shouldEnable) {
  if (typeof shouldEnable === "boolean") musicEnabled = shouldEnable;
  else musicEnabled = !musicEnabled;
  try {
    localStorage.setItem("snake:musicEnabled", musicEnabled ? "true" : "false");
  } catch {}
  updateMusicToggleUI();
  try {
    // If enabling, play the appropriate track for the current screen
    if (musicEnabled) {
      if (screen === Screens.START) {
        playStartMusic();
      } else {
        playBg({ restart: false });
      }
    } else {
      // disable all music
      pauseBg();
      pauseStartMusic();
    }
  } catch {}
}

musicToggleBtns.forEach((b) => b.addEventListener("click", () => toggleMusicEnabled()));

function initBgPlaylist() {
  BG_PLAYLIST.forEach((a) => {
    a.preload = "auto";
    a.loop = false;
    a.addEventListener("ended", () => {
      bgIndex = (bgIndex + 1) % BG_PLAYLIST.length;
      bgPlayer = BG_PLAYLIST[bgIndex];
      // play next track automatically
      try {
        bgPlayer.currentTime = 0;
        bgPlayer.play().catch(() => {});
      } catch {}
    });
  });
  bgIndex = 0;
  bgPlayer = BG_PLAYLIST[bgIndex];
}

// boot-time init for start track + playlist
function initMusic() {
  try {
    initBgPlaylist();
  } catch {}
  try {
    initStartTrack();
  } catch {}
}
function playStartMusic() {
  try {
    if (!START_TRACK) return;
    START_TRACK.currentTime = 0;
    START_TRACK.play().catch(() => {});
  } catch {}
}

function pauseStartMusic() {
  try {
    if (!START_TRACK) return;
    START_TRACK.pause();
  } catch {}
}

function stopStartMusic() {
  try {
    if (!START_TRACK) return;
    START_TRACK.pause();
    START_TRACK.currentTime = 0;
  } catch {}
}

function initStartTrack() {
  try {
    START_TRACK.preload = "auto";
    START_TRACK.loop = true; // loop on start screen
  } catch {}
}

// Play/pause helpers for background music
function playBg(opts = { restart: true }) {
  if (!BG_PLAYLIST.length) return;
  if (!bgPlayer) initBgPlaylist();
  if (opts.restart) bgIndex = 0;
  bgPlayer = BG_PLAYLIST[bgIndex];
  try {
    if (opts.restart) bgPlayer.currentTime = 0;
    bgPlayer.play().catch(() => {});
  } catch {}
}

function pauseBg() {
  if (bgPlayer)
    try {
      bgPlayer.pause();
    } catch {}
}

function stopBg() {
  if (bgPlayer)
    try {
      bgPlayer.pause();
      bgPlayer.currentTime = 0;
    } catch {}
}

// Fixed SFX volume (tweak to taste)
const SFX_VOLUME = 1.0;
["eat", "gameOver", "gameWon"].forEach((k) => {
  if (Sounds[k]) Sounds[k].volume = SFX_VOLUME;
});

// Music-only volume
function setMusicVolume(v) {
  const vol = Math.min(1, Math.max(0, Number(v)));
  BG_PLAYLIST.forEach((a) => {
    try {
      a.volume = vol;
    } catch {}
  });
  try {
    START_TRACK.volume = vol;
  } catch {}
}

// Init + live updates (Start/Score screens)
setMusicVolume(volumeSlider?.value || 0.1);
volumeSlider?.addEventListener("input", (e) => setMusicVolume(e.target.value));

// Load persisted music preference (defaults to true)
try {
  const raw = localStorage.getItem("snake:musicEnabled");
  if (raw !== null) musicEnabled = raw === "true";
} catch {}
// Apply initial UI state for toggle controls
updateMusicToggleUI();

// ---- State machine ----
const Screens = Object.freeze({ START: "start", GAME: "game", SCORE: "score" });
let screen = Screens.START;

// Game state
let showGrid = false;
toggleGridBtn?.addEventListener("click", () => {
  showGrid = !showGrid;
  toggleGridBtn.textContent = showGrid ? "Hide Grid" : "Show Grid";
});

let snake = [];
let food = { x: 0, y: 0 };
let score = 0;

// Timing / speed (responsive)
const SPEED_MULT = 4; // Easy=200ms, Normal=100ms, Hard=60ms
let currentSpeedLabel = "normal";
let stepMs = 100;
let rafId = null;
let lastTime = 0;
let acc = 0;

// Input: small queue for crisp turns
let dir = { x: 1, y: 0 };
let dirQueue = []; // up to 2 pending directions
let hasStarted = false; // wait for first input
let isGameOver = false;
let gameOverReason = "";

// ---- High scores (module with medals) ----
const Scoreboard = (() => {
  const KEY = (bucket) => `highScores:${bucket || "all"}`;
  const MAX = 10;

  function load(b) {
    try {
      return JSON.parse(localStorage.getItem(KEY(b))) || [];
    } catch {
      return [];
    }
  }
  function save(scores, b) {
    localStorage.setItem(KEY(b), JSON.stringify(scores));
  }
  function push({ name, value }, bucket) {
    const scores = load(bucket);
    scores.push({ name: name || "Anonymous", value: Number(value) || 0 });
    scores.sort((a, b) => b.value - a.value);
    scores.splice(MAX);
    save(scores, bucket);
  }
  function display(bucket) {
    const scores = load(bucket);
    if (!scores.length) {
      highScoresList.innerHTML = "<li>No high scores yet</li>";
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    highScoresList.innerHTML = scores
      .map((s, i) => {
        const rankBadge = i < 3 ? `<span class="medal">${medals[i]}</span>` : `<span class="badge">${i + 1}</span>`;
        return `
        <li class="score-row">
          <span class="left">
            ${rankBadge}
            <span class="name">${escapeHtml(s.name)}</span>
          </span>
          <span class="value">${s.value}</span>
        </li>`;
      })
      .join("");
  }
  return { push, display, reset: (b) => localStorage.removeItem(KEY(b)) };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();

// ---- Screens ----
function enterStartScreen() {
  screen = Screens.START;
  show(startContainer);
  hide(canvas);
  hide(playAgainBtn);
  hide(restartBtn);
  show(scoreListContainer);
  hide(toggleGridBtn);
  show(volumeControl);
  document.body.classList.add("screen-start");
  document.body.classList.remove("screen-game");
  document.body.classList.remove("screen-score");
  setBodyState(true);
  startIdleWatch();

  try {
    // stop in-game playlist and start the dedicated start-screen music
    stopBg();
    if (musicEnabled) playStartMusic();
  } catch {}

  const lbl = getSelectedSpeedLabel();
  if (finalScoreHeading) finalScoreHeading.textContent = `Top Scores — ${cap(lbl)}`;
  Scoreboard.display(lbl);
}

function enterGameScreen(opts = { restartMusic: true }) {
  screen = Screens.GAME;
  hide(startContainer);
  show(canvas);
  show(toggleGridBtn);
  show(volumeControl);
  hide(playAgainBtn);
  hide(restartBtn);
  hide(scoreListContainer);
  document.body.classList.add("screen-game");
  document.body.classList.remove("screen-start");
  document.body.classList.remove("screen-score");
  setBodyState(false);
  stopIdleWatch();

  updateSpeedFromUI();

  score = 0;
  isGameOver = false;
  gameOverReason = "";
  hasStarted = false;
  dir = { x: 1, y: 0 };
  dirQueue = [];

  const mid = Math.floor(TILE_COUNT / 2);
  snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
  ];
  spawnFood();

  try {
    // Stop any start-screen music, then start in-game playlist if enabled
    stopStartMusic();
    if (musicEnabled && opts.restartMusic) playBg({ restart: true });
  } catch {}

  lastTime = performance.now();
  acc = 0;
  startLoop();
}

function enterScoreScreen() {
  screen = Screens.SCORE;
  show(playAgainBtn);
  show(restartBtn);
  show(toggleGridBtn);
  show(volumeControl);
  show(canvas);
  document.body.classList.add("screen-score");
  document.body.classList.remove("screen-start");
  document.body.classList.remove("screen-game");
}

// ---- Loop ----
function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function loop(t) {
  rafId = requestAnimationFrame(loop);
  const dt = t - lastTime;
  lastTime = t;

  // FPS smoothing (EMA)
  if (dt > 0 && dt < 1000) {
    const fps = 1000 / dt;
    DEBUG.emaFps = DEBUG.emaFps ? DEBUG.emaFps * 0.9 + fps * 0.1 : fps;
  }

  acc += dt;

  while (acc >= stepMs) {
    // If debug-pause is active, only run a single step when stepOnce is set
    if (screen === Screens.GAME) {
      if (DEBUG.enabled && DEBUG.paused && !DEBUG.stepOnce) break;
      update();
      if (DEBUG.stepOnce) {
        DEBUG.stepOnce = false;
        break;
      }
    }
    acc -= stepMs;
  }

  if (screen === Screens.GAME || screen === Screens.SCORE) render();
}

// ---- Logic ----
function update() {
  if (isGameOver || !hasStarted) return;

  // apply at most one queued direction before moving
  if (dirQueue.length) dir = dirQueue.shift();

  const next = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  // walls
  if (next.x < 0 || next.y < 0 || next.x >= TILE_COUNT || next.y >= TILE_COUNT) {
    return gameOver("You hit the wall");
  }

  // will we eat on this step?
  const willGrow = next.x === food.x && next.y === food.y;

  // self-collision:
  // - if not growing, the tail will vacate, so ignore the last segment
  // - if growing, include the whole snake
  const lenToCheck = willGrow ? snake.length : snake.length - 1;
  for (let i = 0; i < lenToCheck; i++) {
    if (snake[i].x === next.x && snake[i].y === next.y) {
      return gameOver("You bit yourself");
    }
  }

  // move
  snake.unshift(next);

  if (willGrow) {
    score += 1;
    try {
      Sounds.eat.currentTime = 0;
      Sounds.eat.play().catch(() => {});
    } catch {}
    spawnFood();
  } else {
    snake.pop();
  }
}

function drawSnakeAtlas() {
  for (let i = 0; i < snake.length; i++) {
    const seg = snake[i];
    const segx = seg.x,
      segy = seg.y;
    const dx = segx * CELL,
      dy = segy * CELL;
    let tx = 0,
      ty = 0;

    if (i === 0) {
      // HEAD: compare with next segment to determine facing
      const n = snake[i + 1];
      if (n) {
        if (segy < n.y) {
          [tx, ty] = SPRITE.head.up;
        } else if (segx > n.x) {
          [tx, ty] = SPRITE.head.right;
        } else if (segy > n.y) {
          [tx, ty] = SPRITE.head.down;
        } else if (segx < n.x) {
          [tx, ty] = SPRITE.head.left;
        }
      }
    } else if (i === snake.length - 1) {
      // TAIL: compare with previous segment to determine pointing
      const p = snake[i - 1];
      if (p) {
        if (p.y < segy) {
          [tx, ty] = SPRITE.tail.up;
        } else if (p.x > segx) {
          [tx, ty] = SPRITE.tail.right;
        } else if (p.y > segy) {
          [tx, ty] = SPRITE.tail.down;
        } else if (p.x < segx) {
          [tx, ty] = SPRITE.tail.left;
        }
      }
    } else {
      // BODY: compare with previous and next to choose straight vs. corner
      const p = snake[i - 1],
        n = snake[i + 1];

      if ((p.x < segx && n.x > segx) || (n.x < segx && p.x > segx)) {
        // horizontal
        [tx, ty] = SPRITE.straight.h;
      } else if ((p.y < segy && n.y > segy) || (n.y < segy && p.y > segy)) {
        // vertical
        [tx, ty] = SPRITE.straight.v;
      } else if ((p.x < segx && n.y > segy) || (n.x < segx && p.y > segy)) {
        // left -> down (or down -> left)
        [tx, ty] = SPRITE.corner.left_down;
      } else if ((p.y < segy && n.x < segx) || (n.y < segy && p.x < segx)) {
        // up -> left (or left -> up)
        [tx, ty] = SPRITE.corner.top_left;
      } else if ((p.x > segx && n.y < segy) || (n.x > segx && p.y < segy)) {
        // right -> up (or up -> right)
        [tx, ty] = SPRITE.corner.right_up;
      } else if ((p.y > segy && n.x > segx) || (n.y > segy && p.x > segx)) {
        // down -> right (or right -> down)
        [tx, ty] = SPRITE.corner.down_right;
      }
    }

    ctx.drawImage(
      atlas,
      tx * ATLAS.fw,
      ty * ATLAS.fh,
      ATLAS.fw,
      ATLAS.fh, // source rect
      dx,
      dy,
      CELL,
      CELL // destination cell (scaled)
    );
  }
}

// Debugger
function drawDebugOverlayHUD() {
  // Predict next step without consuming the queue:
  const pred = predictNextHead();
  const next = { x: pred.x, y: pred.y };
  const willGrow = next.x === food.x && next.y === food.y;

  // Bounds & collision prediction
  const outOfBounds = next.x < 0 || next.y < 0 || next.x >= TILE_COUNT || next.y >= TILE_COUNT;
  const collideIndex = outOfBounds ? -2 : findSelfCollisionIndex(next, willGrow);

  // Outline next cell
  ctx.save();
  ctx.lineWidth = 2;
  if (outOfBounds) {
    ctx.strokeStyle = "rgba(255,0,0,0.9)";
  } else if (collideIndex >= 0) {
    ctx.strokeStyle = "rgba(255,0,0,0.9)";
  } else {
    ctx.strokeStyle = "rgba(255,255,0,0.9)";
  }
  ctx.strokeRect(next.x * CELL + 1, next.y * CELL + 1, CELL - 2, CELL - 2);

  // Label collision target (if any)
  if (collideIndex >= 0) {
    ctx.fillStyle = "rgba(255,0,0,0.9)";
    ctx.font = setHudFont(14);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`#${collideIndex}`, next.x * CELL + CELL / 2, next.y * CELL + CELL / 2);
  }
  ctx.restore();

  // HUD box
  const lines = [
    `DEBUG: ${DEBUG.enabled ? "ON" : "OFF"}  ${DEBUG.paused ? "(PAUSED)" : ""}`,
    `FPS: ${DEBUG.emaFps.toFixed(1)}  stepMs: ${stepMs}`,
    `Len: ${snake.length}  Score: ${score}`,
    `Dir: (${dir.x},${dir.y})  Next: (${pred.nd.x},${pred.nd.y})`,
    `Queue: ${dirQueue.map((d) => `(${d.x},${d.y})`).join(" → ") || "∅"}`,
    `Will grow next: ${willGrow ? "YES" : "no"}`,
    `Next hits: ${outOfBounds ? "WALL" : collideIndex >= 0 ? `SEG #${collideIndex}` : "nothing"}`,
  ];
  const pad = 8,
    lineH = 18,
    boxW = 320,
    boxH = pad * 2 + lines.length * lineH;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#000";
  ctx.fillRect(10, 10, boxW, boxH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0f0";
  ctx.font = setHudFont(12, true); // small debug rows
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 10 + pad, 10 + pad + (i + 0.8) * lineH);
  }
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  if (showGrid) {
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= CANVAS_SIZE; x += CELL) {
      ctx.beginPath();
      ctx.moveTo(x, 0.5);
      ctx.lineTo(x, CANVAS_SIZE + 0.5);
      ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_SIZE; y += CELL) {
      ctx.beginPath();
      ctx.moveTo(0.5, y);
      ctx.lineTo(CANVAS_SIZE + 0.5, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // food
  const useAtlasApple =
    atlasReady &&
    Array.isArray(SPRITE.apple) &&
    SPRITE.apple.length === 2 &&
    Number.isInteger(SPRITE.apple[0]) &&
    Number.isInteger(SPRITE.apple[1]) &&
    (ATLAS.cols ? SPRITE.apple[0] < ATLAS.cols : true) &&
    (ATLAS.rows ? SPRITE.apple[1] < ATLAS.rows : true);

  if (useAtlasApple) {
    const [ax, ay] = SPRITE.apple;
    ctx.drawImage(atlas, ax * ATLAS.fw, ay * ATLAS.fh, ATLAS.fw, ATLAS.fh, food.x * CELL, food.y * CELL, CELL, CELL);
  } else if (appleReady) {
    const pad = 2;
    ctx.drawImage(appleImage, food.x * CELL + pad, food.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
  } else {
    rect(food.x, food.y, "#60a5fa");
  }

  // --- snake ---
  if (atlasReady) {
    drawSnakeAtlas();
  } else {
    snake.forEach((s, i) => {
      if (i === 0) {
        rect(s.x, s.y, "#fa762e"); // head
      } else if (i === snake.length - 1 && snake.length >= 2) {
        const prev = snake[i - 1];
        const dx = Math.sign(s.x - prev.x);
        const dy = Math.sign(s.y - prev.y);
        drawTailTriangle(s.x, s.y, dx, dy, "#e7c439");
      } else {
        rect(s.x, s.y, "#e7c439"); // body
      }
    });
  }

  function drawTailTriangle(gx, gy, dx, dy, color = "#e7c439") {
    const x = gx * CELL;
    const y = gy * CELL;
    const pad = 1;

    ctx.fillStyle = color;
    ctx.beginPath();

    if (dx === 1 && dy === 0) {
      // pointing RIGHT
      ctx.moveTo(x + CELL - pad, y + CELL / 2); // tip
      ctx.lineTo(x + pad, y + pad);
      ctx.lineTo(x + pad, y + CELL - pad);
    } else if (dx === -1 && dy === 0) {
      // pointing LEFT
      ctx.moveTo(x + pad, y + CELL / 2);
      ctx.lineTo(x + CELL - pad, y + pad);
      ctx.lineTo(x + CELL - pad, y + CELL - pad);
    } else if (dx === 0 && dy === 1) {
      // pointing DOWN
      ctx.moveTo(x + CELL / 2, y + CELL - pad);
      ctx.lineTo(x + pad, y + pad);
      ctx.lineTo(x + CELL - pad, y + pad);
    } else {
      // pointing UP (dx === 0 && dy === -1)
      ctx.moveTo(x + CELL / 2, y + pad);
      ctx.lineTo(x + pad, y + CELL - pad);
      ctx.lineTo(x + CELL - pad, y + CELL - pad);
    }

    ctx.closePath();
    ctx.fill();
  }

  // HUD
  ctx.fillStyle = "#eee";
  ctx.font = setHudFont(18); // main score
  ctx.fillText(`Score: ${score}`, 12, 26);

  if (DEBUG.enabled) {
    ctx.save();
    ctx.font = setHudFont(12, true); // tiny labels
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < snake.length; i++) {
      const s = snake[i];
      ctx.fillText(String(i), s.x * CELL + CELL / 2, s.y * CELL + CELL / 2);
    }
    ctx.restore();
  }

  // overlays
  if (!hasStarted && startInstructionsOverlay) {
    startInstructionsOverlay.textContent = "Press arrow keys / WASD to start";
    startInstructionsOverlay.style.display = "flex";
  } else if (startInstructionsOverlay) {
    startInstructionsOverlay.style.display = "none";
  }

  if (isGameOver && gameOverOverlay) {
    gameOverOverlay.textContent = `Game Over — ${gameOverReason}`;
    gameOverOverlay.style.display = "flex";
  } else if (gameOverOverlay) {
    gameOverOverlay.style.display = "none";
  }

  // Debug HUD & predicted next step
  if (DEBUG.enabled && screen === Screens.GAME) {
    drawDebugOverlayHUD();
  }
}

function drawOverlay(text) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = "#fff";
  ctx.font = setHudFont(28); // game over / messages
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
  ctx.restore();
}

function rect(gx, gy, color) {
  ctx.fillStyle = color;
  ctx.fillRect(gx * CELL + 1, gy * CELL + 1, CELL - 2, CELL - 2);
}

function spawnFood() {
  let x, y;
  do {
    x = Math.floor(Math.random() * TILE_COUNT);
    y = Math.floor(Math.random() * TILE_COUNT);
  } while (snake.some((s) => s.x === x && s.y === y));
  food = { x, y };
}

function gameOver(reason) {
  try {
    Sounds.gameOver.currentTime = 0;
    Sounds.gameOver.play().catch(() => {});
  } catch {}
  isGameOver = true;
  gameOverReason = reason || "Game Over";

  show(playAgainBtn);
  show(restartBtn);
  show(toggleGridBtn);
  show(volumeControl);
  hide(scoreListContainer);
  try {
    pauseBg();
  } catch {}

  Scoreboard.push({ name: usernameInput?.value?.trim() || "Anonymous", value: score }, currentSpeedLabel);
}

function gameWon() {
  try {
    Sounds.gameWon.currentTime = 0;
    Sounds.gameWon.play().catch(() => {});
  } catch {}
  isGameOver = true;
  gameOverReason = "You won!";

  show(playAgainBtn);
  show(restartBtn);
  show(toggleGridBtn);
  show(volumeControl);
  hide(scoreListContainer);
  try {
    pauseBg();
  } catch {}

  Scoreboard.push({ name: usernameInput?.value?.trim() || "Anonymous", value: score }, currentSpeedLabel);
}

// ---- Input ----
window.addEventListener("keydown", (e) => {
  let nd;
  switch (e.key) {
    case "ArrowUp":
    case "w":
    case "W":
      nd = { x: 0, y: -1 };
      break;
    case "ArrowDown":
    case "s":
    case "S":
      nd = { x: 0, y: 1 };
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      nd = { x: -1, y: 0 };
      break;
    case "ArrowRight":
    case "d":
    case "D":
      nd = { x: 1, y: 0 };
      break;
    // Debug toggles
    // case "l":
    // case "L":
    //   DEBUG.enabled = !DEBUG.enabled;
    //   if (!DEBUG.enabled) {
    //     DEBUG.paused = false;
    //     DEBUG.stepOnce = false;
    //   }
    //   return;
    // case "p":
    // case "P":
    //   if (screen === Screens.GAME && DEBUG.enabled) {
    //     DEBUG.paused = !DEBUG.paused;
    //   }
    //   return;
    // case "n":
    // case "N":
    //   if (screen === Screens.GAME && DEBUG.enabled && DEBUG.paused) {
    //     DEBUG.stepOnce = true; // advance one update on next loop
    //   }
    //   return;

    case "g":
    case "G":
      if (screen === Screens.GAME) {
        showGrid = !showGrid;
        if (toggleGridBtn) toggleGridBtn.textContent = showGrid ? "Hide Grid" : "Show Grid";
      }
      return;

    case "Escape":
      if (screen === Screens.GAME) enterScoreScreen();
      return;
    default:
      return;
  }

  // Compare against the last effective direction (queued or current)
  const lastEffective = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
  if (lastEffective.x === -nd.x && lastEffective.y === -nd.y) return; // block 180°

  // queue up to two quick turns
  if (dirQueue.length < 2) dirQueue.push(nd);
  if (!hasStarted) hasStarted = true;
});

// ---- UI actions ----
startBtn.onclick = () => {
  if (!usernameInput?.value?.trim()) {
    updateStartButtonState();
    return; // don’t start without a name
  }
  enterGameScreen();
};
playAgainBtn.onclick = () => {
  // Resume background music and continue where it left off when replaying
  if (musicEnabled) playBg({ restart: false });
  enterGameScreen({ restartMusic: false });
};
restartBtn.onclick = () => enterStartScreen();
resetScoreboardBtn.onclick = () => {
  Scoreboard.reset(currentSpeedLabel);
  Scoreboard.display(currentSpeedLabel);
};

// Difficulty pills (single source of truth)
if (difficultyPills?.length) {
  difficultyPills.forEach((btn) => {
    btn.addEventListener("click", () => {
      // toggle selected state
      difficultyPills.forEach((b) => {
        b.classList.remove("selected");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("selected");
      btn.setAttribute("aria-checked", "true");

      const lbl = getSelectedSpeedLabel();
      if (screen === Screens.START) {
        if (finalScoreHeading) finalScoreHeading.textContent = `Top Scores — ${cap(lbl)}`;
        Scoreboard.display(lbl);
      } else if (screen === Screens.GAME) {
        updateSpeedFromUI();
      }
    });
  });
}

function readDifficultyFromPills() {
  const sel = document.querySelector(".difficultyPill.selected, .difficultyPill[aria-checked='true']");
  if (!sel) return { ms: 25, label: "normal" };
  const ms = Number(sel.dataset.ms);
  const label = (sel.dataset.label || sel.textContent || "normal").trim().toLowerCase();
  return { ms: Number.isFinite(ms) ? ms : 25, label };
}

function updateSpeedFromUI() {
  const { ms, label } = readDifficultyFromPills();
  stepMs = ms * SPEED_MULT;
  currentSpeedLabel = label;
}

function getSelectedSpeedLabel() {
  return readDifficultyFromPills().label;
}

// ---- Boot ----
(function boot() {
  try {
    initMusic();
  } catch {}
  // re-apply configured music volume so START_TRACK gets the value
  try {
    setMusicVolume(volumeSlider?.value || 0.1);
  } catch {}
  updateStartButtonState();
  enterStartScreen();
})();
