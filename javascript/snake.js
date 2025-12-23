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
const difficultyPills = document.querySelectorAll(".difficultyPill");
const volumeSlider = document.querySelector("#volume");
const toggleGridBtn = document.querySelector(".toggleGridBtn");
const volumeControl = document.querySelector(".volumeControl");
let openVolumeControl = () => {};
let closeVolumeControl = () => {};
const musicToggleBtnNodeList = document.querySelectorAll(".musicToggleBtn");
const musicToggleBtns = Array.from(musicToggleBtnNodeList || []);
const volumePercent = document.querySelector(".volumePercent");
const pauseBtn = document.querySelector(".pauseBtn");
const pausedOverlayEl = document.querySelector(".pausedOverlay");
const scoreCounterEl = document.querySelector(".scoreCounter");
let pendingScoreSave = null;
let lastProgressUpdate = 0;

const HUD_FONT_FAMILY = '"Press Start 2P", monospace';
// Centralized HUD font helper so all score/overlay text stays consistent.
function setHudFont(px, mono = false) {
  const fam = mono ? '"Press Start 2P", monospace' : HUD_FONT_FAMILY;
  const font = `${px}px ${fam}`;
  ctx.font = font;
  ctx.textBaseline = "top";
  return font;
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

const show = (el) => el && (el.style.visibility = "visible");
const hide = (el) => el && (el.style.visibility = "hidden");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function updateStartButtonState() {
  const hasName = !!usernameInput?.value?.trim();
  startBtn.disabled = !hasName;
}
usernameInput?.addEventListener("input", updateStartButtonState);
usernameInput?.addEventListener("blur", updateStartButtonState);
usernameInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !startBtn.disabled) {
    startBtn.click();
  }
});

let idleTimer = null;
const IDLE_MS = 2000;

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
      if (document.body.classList.contains("screen-start")) {
        document.body.classList.add("is-idle");
      }
    }, IDLE_MS);
  };
  const evs = ["mousemove", "mousedown", "keydown", "touchstart", "pointermove"];
  evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
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
  return dirQueue.length ? dirQueue[0] : dir;
}
function predictNextHead() {
  const nd = getEffectiveDirection();
  return { x: snake[0].x + nd.x, y: snake[0].y + nd.y, nd };
}
function findSelfCollisionIndex(next, willGrow) {
  const lenToCheck = willGrow ? snake.length : Math.max(0, snake.length - 1);
  for (let i = 0; i < lenToCheck; i++) {
    if (snake[i].x === next.x && snake[i].y === next.y) return i;
  }
  return -1;
}

// ---- Assets ----
const grassImage = new Image();
grassImage.src = "./images/grass1.jpeg";
let grassReady = false;
grassImage.onload = () => {
  grassReady = true;
};

const appleImage = new Image();
appleImage.src = "./images/apple1.png";
let appleReady = false;
appleImage.onload = () => (appleReady = true);

const atlas = new Image();
atlas.src = "./images/snake-graphics.png";

const ATLAS = { fw: 64, fh: 64 };
let atlasReady = false;
atlas.onload = () => {
  atlasReady = true;
  ATLAS.cols = Math.floor(atlas.width / ATLAS.fw);
  ATLAS.rows = Math.floor(atlas.height / ATLAS.fh);
  console.log(`Atlas ready: ${ATLAS.cols} x ${ATLAS.rows} tiles`);
};

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

const Sounds = {
  eat: new Audio("./sounds/chomp.mp3"),
  gameOver: new Audio("./sounds/gameOver.mp3"),
  gameWon: new Audio("./sounds/gameWon.mp3"),
};

const CROSSFADE_MS = 1600;
let masterMusicVolume = 0.1;
let audioContext = null;
let masterGainNode = null;
let usingWebAudio = false;
const MIN_GAIN = 0.001;

function mkTrack(src, label) {
  const a = new Audio(src);
  a.preload = "auto";
  a.dataset.trackLabel = label || src;
  a.__webAudioInit = false;
  a.__webGain = null;
  a.__webSource = null;
  return a;
}

const BG_PLAYLIST = [
  mkTrack("./sounds/ParagonX9_Metropolis_8.mp3", "ParagonX9 - Metropolis 8Bit"),
  mkTrack("./sounds/ParagonX9_No_5.mp3", "ParagonX9 - No. 5"),
  mkTrack("./sounds/ParagonX9_Defection.mp3", "ParagonX9 - Defection"),
  mkTrack("./sounds/ParagonX9_Chaoz_Lyth3ro.mp3", "ParagonX9 - Chaoz Lyth3ro"),
  mkTrack("./sounds/Avizura_Chaoz_Mirage.mp3", "Avizura - Chaoz Mirage"),
  mkTrack("./sounds/ParagonX9_Soulblade_NG_C.mp3", "ParagonX9 - Soulblade NG C"),
  mkTrack("./sounds/ParagonX9_Chaoz_Fantasy_8_Bit.mp3", "ParagonX9 - Chaoz Fantasy 8Bit"),
];
const START_TRACK = mkTrack("./sounds/ParagonX9_Chaoz_Fantasy_8_Bit.mp3", "ParagonX9 - Chaoz Fantasy 8Bit");
let bgIndex = 0;
let bgPlayer = null;
let musicEnabled = true;

function updateMusicToggleUI() {
  musicToggleBtns.forEach((btn) => {
    try {
      btn.textContent = musicEnabled ? "Music: On" : "Music: Off";
      btn.setAttribute("aria-pressed", musicEnabled ? "true" : "false");
    } catch (e) {}
  });
  if (!musicEnabled) {
    setTrackLabel("Muted");
  } else {
    try {
      if (document.body.classList.contains("screen-start") && START_TRACK && !START_TRACK.paused) {
        setTrackLabel(START_TRACK.dataset.trackLabel);
      } else if (bgPlayer && !bgPlayer.paused) {
        setTrackLabel(bgPlayer.dataset.trackLabel);
      } else {
        setTrackLabel("—");
      }
    } catch (e) {}
  }
}

function toggleMusicEnabled(shouldEnable) {
  if (typeof shouldEnable === "boolean") musicEnabled = shouldEnable;
  else musicEnabled = !musicEnabled;
  try {
    localStorage.setItem("snake:musicEnabled", musicEnabled ? "true" : "false");
  } catch (e) {}
  updateMusicToggleUI();
  try {
    if (musicEnabled) {
      resumeAudioContext("toggleMusicEnabled");
      if (document.body.classList.contains("screen-start")) {
        if (START_TRACK && START_TRACK.paused) playStartMusic({ restart: false });
      } else {
        if ((bgPlayer && bgPlayer.paused) || !bgPlayer) playBg({ restart: false });
      }
    } else {
      pauseBg();
      pauseStartMusic();
      try {
        if (usingWebAudio && audioContext && audioContext.state === "running") audioContext.suspend().catch(() => {});
      } catch (e) {}
    }
  } catch (e) {}
}

musicToggleBtns.forEach((b) => b.addEventListener("click", () => toggleMusicEnabled()));

function initBgPlaylist() {
  BG_PLAYLIST.forEach((a) => {
    a.loop = false;
    a.onended = null;
    a.onended = function () {
      bgIndex = (bgIndex + 1) % BG_PLAYLIST.length;
      const next = BG_PLAYLIST[bgIndex];
      try {
        if (a && !a.paused) {
          a.pause();
          a.currentTime = 0;
        }
      } catch (e) {}
      playTrackAtIndex(bgIndex, { restart: true });
    };
  });
  bgIndex = 0;
  bgPlayer = BG_PLAYLIST[bgIndex];
}

// --- WebAudio helpers ---
function ensureAudioContext() {
  if (audioContext) return audioContext;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = Math.max(MIN_GAIN, masterMusicVolume);
    masterGainNode.connect(audioContext.destination);
    usingWebAudio = true;
  } catch (e) {
    usingWebAudio = false;
    try {
      updatePlayPauseUI();
      if (timeLabelEl) timeLabelEl.textContent = "— / —";
    } catch (e) {}
  }
  return audioContext;
}

function resumeAudioContext(source) {
  try {
    ensureAudioContext();
    if (audioContext && audioContext.state === "suspended") {
      audioContext
        .resume()
        .then(() => console.debug(`audioContext resumed via ${source}`))
        .catch((e) => console.error(`audioContext resume failed (${source})`, e));
    }
  } catch (e) {
    console.error(`ensureAudioContext/resume failed (${source})`, e);
  }
}

function applyMasterVolume() {
  if (usingWebAudio && masterGainNode && audioContext) {
    try {
      masterGainNode.gain.setValueAtTime(Math.max(MIN_GAIN, masterMusicVolume), audioContext.currentTime);
    } catch (e) {}
  } else {
    BG_PLAYLIST.forEach((a) => {
      try {
        a.volume = masterMusicVolume;
      } catch (e) {}
    });
    try {
      START_TRACK.volume = masterMusicVolume;
    } catch (e) {}
  }
  try {
    if (volumePercent) volumePercent.textContent = `${Math.round(masterMusicVolume * 100)}%`;
  } catch (e) {}
}

function isWebAudioAvailable() {
  return Boolean(usingWebAudio && audioContext && audioContext.state && audioContext.state !== "closed");
}
function getCurrentMusicVolume() {
  return masterMusicVolume;
}

function initWebAudioForTrack(a) {
  if (!a || a.__webAudioInit || !ensureAudioContext()) return;
  try {
    const source = audioContext.createMediaElementSource(a);
    const gain = audioContext.createGain();
    gain.gain.value = 1.0;
    source.connect(gain);
    gain.connect(masterGainNode);
    a.__webAudioInit = true;
    a.__webSource = source;
    a.__webGain = gain;
  } catch (e) {
    a.__webAudioInit = false;
  }
}

function getGainNodeFor(a) {
  if (!a) return null;
  if (usingWebAudio && a.__webAudioInit && a.__webGain) return a.__webGain;
  return null;
}

// Track label DOM
const trackLabelEl = document.querySelector(".trackLabel");
const sfxVolumeSlider = document.querySelector("#sfxVolume");
const musicPrevBtn = document.querySelector(".musicPrevBtn");
const musicPlayPauseBtn = document.querySelector(".musicPlayPauseBtn");
const musicNextBtn = document.querySelector(".musicNextBtn");
const musicProgress = document.querySelector("#musicProgress");
const timeLabelEl = document.querySelector(".timeLabel");
const volumeToggleBtn = document.querySelector(".volumeToggleBtn");

// SFX WebAudio node
let sfxGainNode = null;
let sfxVolume = 1.0;
const DUCKING_FACTOR = 0.25;
const DUCK_MS = 300;
let progressLoopId = null;
let isMusicPlaying = false;
let audioUnlocked = false;
let enableSoundBtn = null;

try {
  if (volumeToggleBtn && volumeControl) {
    const __volumeControlDocClickHandler = (e) => {
      if (!volumeControl || !volumeControl.classList.contains("open")) return;
      const t = e.target;
      if (volumeControl.contains(t) || (volumeToggleBtn && volumeToggleBtn.contains(t))) return;
      closeVolumeControl();
    };

    const __volumeControlKeydownHandler = (e) => {
      if (e.key === "Escape" && volumeControl && volumeControl.classList.contains("open")) {
        closeVolumeControl();
      }
    };

    openVolumeControl = () => {
      if (!volumeControl) return;
      volumeControl.classList.add("open");
      if (volumeToggleBtn) volumeToggleBtn.setAttribute("aria-expanded", "true");
      volumeControl.style.display = "flex";
      document.addEventListener("click", __volumeControlDocClickHandler);
      document.addEventListener("keydown", __volumeControlKeydownHandler);
    };

    closeVolumeControl = () => {
      if (!volumeControl) return;
      volumeControl.classList.remove("open");
      volumeControl.style.display = "";
      if (volumeToggleBtn) volumeToggleBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", __volumeControlDocClickHandler);
      document.removeEventListener("keydown", __volumeControlKeydownHandler);
    };

    volumeToggleBtn.addEventListener("click", () => {
      try {
        if (volumeControl.classList.contains("open")) closeVolumeControl();
        else openVolumeControl();
      } catch (e) {}
    });
  }
} catch (e) {}

function attemptUnlockAudioOnce() {
  if (audioUnlocked) return;
  function unlock() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    resumeAudioContext("unlock gesture");
    try {
      if (musicEnabled) {
        if (document.body.classList.contains("screen-start")) {
          if (START_TRACK && START_TRACK.paused) playStartMusic({ restart: false });
        } else {
          if ((bgPlayer && bgPlayer.paused) || !bgPlayer) playBg({ restart: false });
        }
      }
    } catch (e) {
      console.error("unlock/start music failed", e);
    }
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
  }
  document.addEventListener("click", unlock, { once: true, passive: true });
  document.addEventListener("keydown", unlock, { once: true, passive: true });
}

function showEnableSoundBtn() {
  try {
    if (!volumeControl) return;
    if (enableSoundBtn) return;
    enableSoundBtn = document.createElement("button");
    enableSoundBtn.className = "enableSoundBtn";
    enableSoundBtn.textContent = "Enable Sound";
    enableSoundBtn.title = "Click to enable sound";
    enableSoundBtn.style.marginTop = "6px";
    enableSoundBtn.style.fontSize = "12px";
    enableSoundBtn.style.padding = "6px 10px";
    enableSoundBtn.addEventListener("click", () => {
      try {
        attemptUnlockAudioOnce();
        if (audioContext && audioContext.state === "suspended") audioContext.resume().catch(() => {});
        toggleMusicEnabled(true);
      } catch (e) {
        console.error("enableSoundBtn click failed", e);
      }
      try {
        enableSoundBtn.style.display = "none";
      } catch (e) {}
    });
    volumeControl.appendChild(enableSoundBtn);
  } catch (e) {
    console.error("showEnableSoundBtn failed", e);
  }
}

function setTrackLabel(label) {
  if (!trackLabelEl) return;
  trackLabelEl.textContent = label || "—";
}

function initMusic() {
  try {
    initBgPlaylist();
  } catch (e) {}
  try {
    initStartTrack();
  } catch (e) {}
  try {
    initSfxNodes();
  } catch (e) {}
}

function initSfxNodes() {
  try {
    ensureAudioContext();
    if (!audioContext) return;
    sfxGainNode = audioContext.createGain();
    sfxGainNode.gain.value = Math.max(MIN_GAIN, sfxVolume);
    sfxGainNode.connect(audioContext.destination);
    Object.keys(Sounds).forEach((k) => {
      const a = Sounds[k];
      if (!a) return;
      try {
        const src = audioContext.createMediaElementSource(a);
        src.connect(sfxGainNode);
        a.__sfxWebAudio = true;
      } catch (e) {
        a.__sfxWebAudio = false;
      }
    });
  } catch (e) {}
}

function formatTime(sec) {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function updateProgressUI() {
  const el = document.body.classList.contains("screen-start") ? START_TRACK : bgPlayer;
  if (!el) {
    try {
      if (timeLabelEl) timeLabelEl.textContent = "— / —";
      if (musicProgress) {
        musicProgress.max = 100;
        musicProgress.value = 0;
      }
    } catch (e) {}
    return;
  }
  try {
    const dur = el.duration || 0;
    const cur = el.currentTime || 0;
    if (dur && !isNaN(dur) && dur > 0) {
      musicProgress.max = dur;
      musicProgress.value = cur;
      timeLabelEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    } else {
      musicProgress.max = 100;
      musicProgress.value = Math.min(100, cur % 100);
      timeLabelEl.textContent = `${formatTime(cur)} / —`;
    }
  } catch (e) {}
}

function progressLoop(t) {
  if (!t) t = performance.now();

  if (t - lastProgressUpdate > 250) {
    // update 4× per second
    lastProgressUpdate = t;
    updateProgressUI();
  }

  progressLoopId = requestAnimationFrame(progressLoop);
}
function startProgressLoop() {
  if (!progressLoopId) progressLoopId = requestAnimationFrame(progressLoop);
}
function stopProgressLoop() {
  if (progressLoopId) {
    cancelAnimationFrame(progressLoopId);
    progressLoopId = null;
  }
}

function updatePlayPauseUI() {
  try {
    if (!musicPlayPauseBtn) return;
    musicPlayPauseBtn.textContent = isMusicPlaying ? "⏸" : "⏵";
  } catch (e) {}
}

function previousTrack() {
  if (!BG_PLAYLIST.length) return;
  if (screen !== Screens.GAME && screen !== Screens.SCORE) return;
  playTrackAtIndex(bgIndex - 1, { restart: true });
}
function nextTrack() {
  if (!BG_PLAYLIST.length) return;
  if (screen !== Screens.GAME && screen !== Screens.SCORE) return;
  playTrackAtIndex(bgIndex + 1, { restart: true });
}
function togglePlayPause() {
  console.debug("togglePlayPause() called", { musicEnabled, isMusicPlaying, screen });
  if (!musicEnabled) {
    console.debug("togglePlayPause: music was disabled — auto-enabling");
    try {
      toggleMusicEnabled(true);
    } catch (e) {
      console.error("Failed to auto-enable music in togglePlayPause", e);
    }
  }
  resumeAudioContext("togglePlayPause");
  if (document.body.classList.contains("screen-start")) {
    if (START_TRACK && !START_TRACK.paused) pauseStartMusic();
    else playStartMusic({ restart: false });
  } else {
    if (bgPlayer && !bgPlayer.paused) pauseBg();
    else playBg({ restart: false });
  }
}

function toggleGamePause() {
  if (screen !== Screens.GAME) return;
  if (isPaused) {
    isPaused = false;
    try {
      if (pauseBtn) {
        pauseBtn.textContent = "Pause";
        pauseBtn.setAttribute("aria-pressed", "false");
      }
    } catch (e) {}
    lastTime = performance.now();
    startLoop();
    try {
      if (pausedOverlayEl) pausedOverlayEl.classList.remove("active");
      if (pausedOverlayEl) pausedOverlayEl.setAttribute("aria-hidden", "true");
    } catch (e) {}
  } else {
    isPaused = true;
    try {
      if (pauseBtn) {
        pauseBtn.textContent = "Resume";
        pauseBtn.setAttribute("aria-pressed", "true");
      }
    } catch (e) {}
    try {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    } catch (e) {}
    try {
      if (pausedOverlayEl) pausedOverlayEl.classList.add("active");
      if (pausedOverlayEl) pausedOverlayEl.setAttribute("aria-hidden", "false");
    } catch (e) {}
  }
}

function setSfxVolume(v) {
  const vol = Math.min(1, Math.max(0, Number(v)));
  sfxVolume = vol;
  try {
    localStorage.setItem("snake:sfxVolume", String(sfxVolume));
  } catch (e) {}
  if (usingWebAudio && sfxGainNode && audioContext) {
    try {
      sfxGainNode.gain.setValueAtTime(Math.max(MIN_GAIN, sfxVolume), audioContext.currentTime);
    } catch (e) {}
  } else {
    Object.keys(Sounds).forEach((k) => {
      try {
        if (Sounds[k]) Sounds[k].volume = sfxVolume;
      } catch (e) {}
    });
  }
}

function duckSfx(ducked = true) {
  if (usingWebAudio && audioContext && sfxGainNode && sfxGainNode.gain) {
    try {
      const now = audioContext.currentTime;
      const target = ducked ? Math.max(MIN_GAIN, sfxVolume * DUCKING_FACTOR) : Math.max(MIN_GAIN, sfxVolume);
      sfxGainNode.gain.cancelScheduledValues(now);
      sfxGainNode.gain.exponentialRampToValueAtTime(target, now + DUCK_MS / 1000);
    } catch (e) {}
  } else {
    Object.keys(Sounds).forEach((k) => {
      try {
        if (Sounds[k]) Sounds[k].volume = ducked ? sfxVolume * DUCKING_FACTOR : sfxVolume;
      } catch (e) {}
    });
  }
}
function playStartMusic(opts = { restart: true }) {
  try {
    console.debug("playStartMusic() called", { opts, musicEnabled, START_TRACKReadyState: START_TRACK && START_TRACK.readyState });
    if (!START_TRACK) return;
    initWebAudioForTrack(START_TRACK);
    try {
      if (usingWebAudio && audioContext && audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    } catch (e) {}
    if (opts.restart) START_TRACK.currentTime = 0;
    if (usingWebAudio && START_TRACK.__webGain) {
      START_TRACK.__webGain.gain.setValueAtTime(Math.max(MIN_GAIN, masterMusicVolume), audioContext.currentTime);
    } else {
      START_TRACK.volume = masterMusicVolume;
    }
    try {
      console.debug("Attempting START_TRACK.play()", {
        paused: START_TRACK.paused,
        currentTime: START_TRACK.currentTime,
        duration: START_TRACK.duration,
        readyState: START_TRACK.readyState,
        masterMusicVolume,
      });
      START_TRACK.play().catch((e) => {
        console.error("START_TRACK play() rejected:", e, {
          paused: START_TRACK.paused,
          currentTime: START_TRACK.currentTime,
          duration: START_TRACK.duration,
          readyState: START_TRACK.readyState,
        });
        try {
          attemptUnlockAudioOnce();
        } catch (e) {}
      });
    } catch (e) {
      console.error("START_TRACK.play() call threw:", e);
    }
    try {
      START_TRACK.onplay = () => {
        isMusicPlaying = true;
        updatePlayPauseUI();
        startProgressLoop();
      };
      START_TRACK.onpause = () => {
        isMusicPlaying = false;
        updatePlayPauseUI();
        stopProgressLoop();
      };
    } catch (e) {}
    isMusicPlaying = true;
    updatePlayPauseUI();
    startProgressLoop();
    setTrackLabel(START_TRACK.dataset.trackLabel);
    try {
      START_TRACK.loop = true;
      START_TRACK.onended = null;
    } catch (e) {}
  } catch (e) {}
}

function pauseStartMusic() {
  try {
    if (!START_TRACK) return;
    START_TRACK.pause();
    clearScheduledCrossfade();
    isMusicPlaying = false;
    updatePlayPauseUI();
    stopProgressLoop();
    try {
      duckSfx(false);
    } catch (e) {}
  } catch (e) {}
}

function stopStartMusic() {
  try {
    if (!START_TRACK) return;
    START_TRACK.pause();
    START_TRACK.currentTime = 0;
    clearScheduledCrossfade();
    START_TRACK.onended = null;
    setTrackLabel("—");
    try {
      duckSfx(false);
    } catch (e) {}
  } catch (e) {}
}

function initStartTrack() {
  try {
    START_TRACK.preload = "auto";
    START_TRACK.loop = true;
  } catch (e) {}
}

// Fade / Crossfade helpers
let crossfadeTimer = null;
let fadeIntervalId = null;
function clearScheduledCrossfade() {
  if (crossfadeTimer) {
    clearTimeout(crossfadeTimer);
    crossfadeTimer = null;
  }
  if (fadeIntervalId) {
    clearInterval(fadeIntervalId);
    fadeIntervalId = null;
  }
  if (usingWebAudio && audioContext) {
    try {
      const now = audioContext.currentTime;
      BG_PLAYLIST.forEach((a) => {
        if (a && a.__webGain && a.__webGain.gain && a.__webGain.gain.cancelScheduledValues) {
          a.__webGain.gain.cancelScheduledValues(now);
        }
      });
      if (START_TRACK && START_TRACK.__webGain && START_TRACK.__webGain.gain && START_TRACK.__webGain.gain.cancelScheduledValues) {
        START_TRACK.__webGain.gain.cancelScheduledValues(now);
      }
    } catch (e) {}
  }
  try {
    duckSfx(false);
  } catch (e) {}
}

function crossfade(out, ina, dur = CROSSFADE_MS) {
  clearScheduledCrossfade();
  try {
    duckSfx(true);
  } catch (e) {}
  if (!out || !ina || dur <= 0) return;
  if (usingWebAudio && audioContext) {
    try {
      initWebAudioForTrack(out);
      initWebAudioForTrack(ina);
      const outGain = out.__webGain;
      const inGain = ina.__webGain;
      if (!outGain || !inGain) throw new Error("web gain missing");
      const now = audioContext.currentTime;
      const durSec = dur / 1000;
      inGain.gain.cancelScheduledValues(now);
      outGain.gain.cancelScheduledValues(now);
      inGain.gain.setValueAtTime(Math.max(MIN_GAIN, 0.0001), now);
      outGain.gain.setValueAtTime(Math.max(MIN_GAIN, masterMusicVolume), now);
      ina.currentTime = 0;
      try {
        console.debug("Attempting crossfade ina.play()", {
          paused: ina.paused,
          currentTime: ina.currentTime,
          duration: ina.duration,
          readyState: ina.readyState,
          masterMusicVolume,
        });
        ina.play().catch((e) => {
          console.error("crossfade ina.play() rejected:", e, {
            paused: ina.paused,
            currentTime: ina.currentTime,
            duration: ina.duration,
            readyState: ina.readyState,
          });
          try {
            attemptUnlockAudioOnce();
          } catch (e) {}
        });
      } catch (e) {
        console.error("ina.play() call threw:", e);
      }

      inGain.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, masterMusicVolume), now + durSec);
      outGain.gain.exponentialRampToValueAtTime(MIN_GAIN, now + durSec);

      crossfadeTimer = setTimeout(() => {
        try {
          out.pause();
          out.currentTime = 0;
          inGain.gain.cancelScheduledValues(audioContext.currentTime);
          inGain.gain.setValueAtTime(Math.max(MIN_GAIN, masterMusicVolume), audioContext.currentTime);
          const idx = BG_PLAYLIST.indexOf(ina);
          if (idx >= 0) {
            bgIndex = idx;
            bgPlayer = ina;
            const next = BG_PLAYLIST[(idx + 1) % BG_PLAYLIST.length];
            scheduleCrossfade(ina, next);
          }
          setTrackLabel(ina.dataset.trackLabel);
          try {
            duckSfx(false);
          } catch (e) {}
        } catch (e) {}
        crossfadeTimer = null;
      }, dur);
      return;
    } catch (e) {}
  }
  try {
    ina.volume = 0;
    ina.currentTime = 0;
    ina.play().catch(() => {});
  } catch (e) {}

  const start = performance.now();
  fadeIntervalId = setInterval(() => {
    const t = performance.now() - start;
    const frac = Math.min(1, t / dur);
    try {
      const effective = masterMusicVolume;
      ina.volume = effective * frac;
      out.volume = effective * (1 - frac);
    } catch (e) {}
    if (frac === 1) {
      clearScheduledCrossfade();
      try {
        out.pause();
        out.currentTime = 0;
      } catch (e) {}
      try {
        ina.volume = masterMusicVolume;
      } catch (e) {}
      const idx = BG_PLAYLIST.indexOf(ina);
      if (idx >= 0) {
        bgIndex = idx;
        bgPlayer = ina;
        const next = BG_PLAYLIST[(idx + 1) % BG_PLAYLIST.length];
        scheduleCrossfade(ina, next);
      }
      setTrackLabel(ina.dataset.trackLabel);
      try {
        duckSfx(false);
      } catch (e) {}
    }
  }, 60);
}

function scheduleCrossfade(current, next) {
  clearScheduledCrossfade();
  if (!current || !next) return;
  try {
    const dur = current.duration;
    if (!dur || isNaN(dur) || dur <= CROSSFADE_MS) return;
    const remaining = (dur - current.currentTime) * 1000;
    const startDelay = Math.max(0, remaining - CROSSFADE_MS);
    crossfadeTimer = setTimeout(() => {
      crossfade(current, next, Math.min(CROSSFADE_MS, dur * 1000));
    }, startDelay);
  } catch (e) {}
}

function playTrackAtIndex(i, opts = { restart: true }) {
  if (!BG_PLAYLIST.length) return;
  const idx = ((i % BG_PLAYLIST.length) + BG_PLAYLIST.length) % BG_PLAYLIST.length;
  console.debug("playTrackAtIndex() -> idx", { idx, bgIndex, bgPlayerReadyState: bgPlayer && bgPlayer.readyState });
  const cur = BG_PLAYLIST[idx];
  if (!cur) return;
  try {
    clearScheduledCrossfade();
    try {
      if (bgPlayer && bgPlayer !== cur) {
        bgPlayer.pause();
        try {
          bgPlayer.currentTime = 0;
        } catch (e) {}
      }
    } catch (e) {}
    bgIndex = idx;
    bgPlayer = cur;
    if (opts.restart) cur.currentTime = 0;
    initWebAudioForTrack(cur);
    try {
      if (usingWebAudio && audioContext && audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    } catch (e) {}
    if (usingWebAudio && cur.__webGain) {
      cur.__webGain.gain.setValueAtTime(Math.max(MIN_GAIN, masterMusicVolume), audioContext.currentTime);
    } else {
      cur.volume = masterMusicVolume;
    }
    try {
      console.debug("Attempting bg cur.play()", {
        idx: idx,
        paused: cur.paused,
        currentTime: cur.currentTime,
        duration: cur.duration,
        readyState: cur.readyState,
        masterMusicVolume,
      });
      cur.play().catch((e) => {
        console.error("BG_PLAYLIST cur.play() rejected:", e, {
          idx: idx,
          paused: cur.paused,
          currentTime: cur.currentTime,
          duration: cur.duration,
          readyState: cur.readyState,
        });
        try {
          attemptUnlockAudioOnce();
        } catch (e) {}
      });
    } catch (e) {
      console.error("cur.play() call threw:", e, { idx });
    }
    try {
      cur.onplay = () => {
        isMusicPlaying = true;
        updatePlayPauseUI();
        startProgressLoop();
      };
      cur.onpause = () => {
        isMusicPlaying = false;
        updatePlayPauseUI();
        stopProgressLoop();
      };
    } catch (e) {}
    setTrackLabel(cur.dataset.trackLabel);
    isMusicPlaying = true;
    updatePlayPauseUI();
    startProgressLoop();
    const next = BG_PLAYLIST[(idx + 1) % BG_PLAYLIST.length];
    scheduleCrossfade(cur, next);
  } catch (e) {}
}

function playBg(opts = { restart: true }) {
  if (!BG_PLAYLIST.length) return;
  if (!bgPlayer) initBgPlaylist();
  if (opts.restart) bgIndex = 0;
  playTrackAtIndex(bgIndex, opts);
}

function pauseBg() {
  if (bgPlayer)
    try {
      bgPlayer.pause();
      clearScheduledCrossfade();
      isMusicPlaying = false;
      updatePlayPauseUI();
      stopProgressLoop();
      try {
        duckSfx(false);
      } catch (e) {}
    } catch (e) {}
}

function stopBg() {
  if (bgPlayer)
    try {
      bgPlayer.pause();
      bgPlayer.currentTime = 0;
      clearScheduledCrossfade();
      setTrackLabel("—");
      isMusicPlaying = false;
      updatePlayPauseUI();
      stopProgressLoop();
      try {
        duckSfx(false);
      } catch (e) {}
    } catch (e) {}
}

const SFX_VOLUME = 1.0;
["eat", "gameOver", "gameWon"].forEach((k) => {
  if (Sounds[k]) Sounds[k].volume = SFX_VOLUME;
});

function setMusicVolume(v) {
  const vol = Math.min(1, Math.max(0, Number(v)));
  masterMusicVolume = vol;
  try {
    localStorage.setItem("snake:musicVolume", String(masterMusicVolume));
  } catch (e) {}
  applyMasterVolume();
}

try {
  const storedVol = localStorage.getItem("snake:musicVolume");
  if (storedVol !== null) masterMusicVolume = Number(storedVol);
} catch (e) {}
setMusicVolume(volumeSlider?.value ?? masterMusicVolume);
volumeSlider?.addEventListener("input", (e) => setMusicVolume(e.target.value));

try {
  const storedSfx = localStorage.getItem("snake:sfxVolume");
  if (storedSfx !== null) sfxVolume = Number(storedSfx);
} catch (e) {}
if (sfxVolumeSlider) sfxVolumeSlider.value = String(sfxVolume);
setSfxVolume(sfxVolume);
sfxVolumeSlider?.addEventListener("input", (e) => setSfxVolume(e.target.value));

try {
  const raw = localStorage.getItem("snake:musicEnabled");
  if (raw !== null) musicEnabled = raw === "true";
} catch (e) {}
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
// Dynamic difficulty configuration (actual step ms values)
const DYNAMIC_START_STEP_MS = 200;
const DYNAMIC_MIN_STEP_MS = 60;
let dynamicStepMs = DYNAMIC_START_STEP_MS;
let rafId = null;
let lastTime = 0;
let acc = 0;

// Input: small queue for crisp turns
let dir = { x: 1, y: 0 };
let dirQueue = []; // up to 2 pending directions
let hasStarted = false;
let isGameOver = false;
// Screenshots captured during the current run (for evidence)
let currentRunShots = [];

let isPaused = false;
let gameOverReason = "";

// ---- High scores ----
const Scoreboard = (() => {
  const KEY = (bucket) => `highScores:${bucket || "all"}`;
  const MAX = 10;

  function normalizeScores(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((s) => ({
      name: (s && s.name) || "Anonymous",
      value: Number((s && s.value) || 0) || 0,
      shots: Array.isArray(s && s.shots) ? s.shots.filter(Boolean) : [],
    }));
  }

  function load(b) {
    try {
      return normalizeScores(JSON.parse(localStorage.getItem(KEY(b))) || []);
    } catch (e) {
      return [];
    }
  }

  function save(scores, b) {
    localStorage.setItem(KEY(b), JSON.stringify(scores));
  }

  // Keep screenshots only for the top 3 scores (everything else gets wiped to save space)
  function enforceTop3Screenshots(scores) {
    scores.forEach((s, i) => {
      if (i >= 3 && s && Array.isArray(s.shots) && s.shots.length) s.shots = [];
      if (i < 3 && s && !Array.isArray(s.shots)) s.shots = [];
    });
  }

  function push({ name, value, shots = [] }, bucket) {
    const scores = load(bucket);
    scores.push({
      name: name || "Anonymous",
      value: Number(value) || 0,
      shots: Array.isArray(shots) ? shots.filter(Boolean) : [],
    });
    scores.sort((a, b) => b.value - a.value);
    scores.splice(MAX);
    enforceTop3Screenshots(scores);
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

        const shotsHtml =
          s.shots && s.shots.length
            ? `<span class="shots" aria-label="Screenshots">
                ${s.shots
                  .map((url, idx) => {
                    const safeUrl = escapeAttr(url);
                    const safeAlt = escapeAttr(`Screenshot ${idx + 1} for ${s.name}`);
                    return `
                      <span class="shotIconWrap">
                        <button class="shotIcon" type="button" data-shot-url="${safeUrl}" aria-label="Download screenshot ${
                      idx + 1
                    }">📷</button>
                        <span class="shotTooltip" role="tooltip" aria-hidden="true">
                          <img src="${safeUrl}" alt="${safeAlt}" loading="lazy" />
                        </span>
                      </span>`;
                  })
                  .join("")}
              </span>`
            : "";

        return `
        <li class="score-row">
          <span class="left">
            ${rankBadge}
            <span class="name">${escapeHtml(s.name)}</span>
          </span>
          <span class="right">
            <span class="value">${s.value}</span>
            ${shotsHtml}
          </span>
        </li>`;
      })
      .join("");
  }

  return { push, display, reset: (b) => localStorage.removeItem(KEY(b)) };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function escapeAttr(s) {
    // attribute-safe (keeps it simple; data URLs are safe but avoid quotes/brackets)
    return String(s).replace(/["'<>\n\r]/g, "");
  }
})();

// ---- Screens ----
function enterStartScreen() {
  screen = Screens.START;
  try {
    isGameOver = false;
    if (gameOverOverlay) {
      try {
        gameOverOverlay.style.display = "none";
      } catch (e) {}
    }
  } catch (e) {}
  show(startContainer);
  hide(canvas);
  hide(playAgainBtn);
  hide(restartBtn);
  show(scoreListContainer);
  hide(toggleGridBtn);
  show(volumeControl);
  try {
    hide(pauseBtn);
    hide(toggleGridBtn);
    hide(restartBtn);
    hide(playAgainBtn);
  } catch (e) {}
  document.body.classList.add("screen-start");
  document.body.classList.remove("screen-game");
  document.body.classList.remove("screen-score");
  setBodyState(true);
  startIdleWatch();

  try {
    stopBg();
    if (musicEnabled) {
      console.debug("enterStartScreen: starting START_TRACK (musicEnabled)");
      playStartMusic({ restart: true });
      attemptUnlockAudioOnce();
      setTimeout(() => {
        try {
          if (!isMusicPlaying && (!audioContext || (audioContext && audioContext.state === "suspended"))) {
            showEnableSoundBtn();
          }
        } catch (e) {}
      }, 500);
    } else {
      console.debug("enterStartScreen: musicDisabled, not starting START_TRACK");
    }
  } catch (e) {}
  try {
    try {
      closeVolumeControl();
    } catch (e) {}
  } catch (e) {}
  try {
    if (pauseBtn) {
      pauseBtn.setAttribute("aria-hidden", "true");
      try {
        hide(pauseBtn);
      } catch (e) {}
    }
  } catch (e) {}
  try {
    hide(scoreCounterEl);
  } catch (e) {}
  try {
    // ensure dynamic difficulty bar is hidden for screen readers on start
    if (dynamicBarEl) dynamicBarEl.setAttribute("aria-hidden", "true");
    if (mainDifficultyLabelEl) mainDifficultyLabelEl.setAttribute("aria-hidden", "true");
  } catch (e) {}

  const lbl = getSelectedSpeedLabel();
  if (finalScoreHeading) finalScoreHeading.textContent = `Top Scores — ${cap(lbl)}`;
  Scoreboard.display(lbl);
  updateActiveScoreboardDifficulty();
  updateResetScoreboardState();
  updateResetScoreboardLabel();
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
  try {
    show(pauseBtn);
  } catch (e) {}
  document.body.classList.add("screen-game");
  document.body.classList.remove("screen-start");
  document.body.classList.remove("screen-score");

  // Reset end-of-run screenshots
  currentRunShots = [];
  try {
    if (gameOverOverlay) {
      gameOverOverlay.style.display = "none";
      gameOverOverlay.setAttribute("aria-hidden", "true");
      gameOverOverlay.innerHTML = "";
    }
  } catch (e) {}

  setBodyState(false);
  stopIdleWatch();

  updateSpeedFromUI();
  updateDifficultyUIVisibility();

  score = 0;
  // reset dynamic difficulty to starting value on new game
  try {
    dynamicStepMs = DYNAMIC_START_STEP_MS;
    updateSpeedFromUI();
  } catch (e) {}
  try {
    if (scoreCounterEl) scoreCounterEl.textContent = `Score: ${score}`;
  } catch (e) {}
  try {
    // ensure the progress bar width matches the visible canvas
    syncDynamicBarWidth();
  } catch (e) {}
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
    stopStartMusic();
    if (musicEnabled && opts.restartMusic) {
      console.debug("enterGameScreen: starting BG playlist (musicEnabled)");
      playBg({ restart: true });
      attemptUnlockAudioOnce();
      setTimeout(() => {
        try {
          if (!isMusicPlaying && (!audioContext || (audioContext && audioContext.state === "suspended"))) {
            showEnableSoundBtn();
          }
        } catch (e) {}
      }, 500);
    } else {
      console.debug("enterGameScreen: musicDisabled or opts.restartMusic false; not starting BG playlist", { musicEnabled, opts });
    }
  } catch (e) {}

  lastTime = performance.now();
  acc = 0;
  isPaused = false;
  try {
    if (pauseBtn) {
      pauseBtn.textContent = "Pause";
      pauseBtn.setAttribute("aria-pressed", "false");
      try {
        show(pauseBtn);
      } catch (e) {}
    }
  } catch (e) {}
  try {
    show(scoreCounterEl);
  } catch (e) {}
  try {
    if (pauseBtn) pauseBtn.setAttribute("aria-hidden", "false");
  } catch (e) {}
  try {
    // expose dynamic difficulty bar and main label to screen readers while in game
    if (dynamicBarEl) dynamicBarEl.setAttribute("aria-hidden", "false");
    if (mainDifficultyLabelEl) mainDifficultyLabelEl.setAttribute("aria-hidden", "false");
  } catch (e) {}
  startLoop();
  try {
    try {
      closeVolumeControl();
    } catch (e) {}
  } catch (e) {}
}

function enterScoreScreen() {
  screen = Screens.SCORE;
  show(playAgainBtn);
  show(restartBtn);
  show(toggleGridBtn);
  show(volumeControl);
  show(canvas);
  document.body.classList.add("screen-score");
  try {
    if (pauseBtn) pauseBtn.setAttribute("aria-hidden", "true");
  } catch (e) {}
  try {
    show(scoreCounterEl);
  } catch (e) {}
  try {
    // hide dynamic difficulty bar and main label from screen readers on score screen
    if (dynamicBarEl) dynamicBarEl.setAttribute("aria-hidden", "true");
    if (mainDifficultyLabelEl) mainDifficultyLabelEl.setAttribute("aria-hidden", "true");
  } catch (e) {}
  document.body.classList.remove("screen-start");
  document.body.classList.remove("screen-game");
  try {
    try {
      closeVolumeControl();
    } catch (e) {}
  } catch (e) {}
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

  if (dirQueue.length) dir = dirQueue.shift();

  const next = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  // walls
  if (next.x < 0 || next.y < 0 || next.x >= TILE_COUNT || next.y >= TILE_COUNT) {
    return gameOver("You hit the wall");
  }

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

  snake.unshift(next);

  if (willGrow) {
    score += 1;
    try {
      // If dynamic difficulty selected, make the game slightly faster per food
      const sel = document.querySelector('.difficultyPill.selected, .difficultyPill[aria-checked="true"]');
      if (sel && String(sel.dataset.ms || "").trim() === "dynamic") {
        dynamicStepMs = Math.max(DYNAMIC_MIN_STEP_MS, dynamicStepMs - 1); // increase difficulty (lower ms)
        updateSpeedFromUI();
        try {
          updateDynamicBar();
        } catch (e) {}
      }
    } catch (e) {}
    // update DOM score counter
    try {
      if (scoreCounterEl) scoreCounterEl.textContent = `Score: ${score}`;
    } catch (e) {}
    try {
      Sounds.eat.currentTime = 0;
      Sounds.eat.play().catch(() => {});
    } catch (e) {}
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

  try {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.06;
    for (let y = 0; y < CANVAS_SIZE; y += 3) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, y, CANVAS_SIZE, 1);
    }
    const band = ctx.createLinearGradient(0, CANVAS_SIZE * 0.38, 0, CANVAS_SIZE * 0.62);
    band.addColorStop(0, "rgba(255,180,100,0) ");
    band.addColorStop(0.5, "rgba(255,180,100,0.02)");
    band.addColorStop(1, "rgba(255,180,100,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, CANVAS_SIZE * 0.38, CANVAS_SIZE, CANVAS_SIZE * 0.24);
    ctx.restore();
  } catch (e) {}

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
  ctx.font = setHudFont(18);

  if (DEBUG.enabled) {
    ctx.save();
    ctx.font = setHudFont(12, true);
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
    gameOverOverlay.style.display = "flex";
  } else if (gameOverOverlay) {
    gameOverOverlay.style.display = "none";
  }

  if (DEBUG.enabled && screen === Screens.GAME) {
    drawDebugOverlayHUD();
  }
}

function drawOverlay(text) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = "#fff";
  ctx.font = setHudFont(28);
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
  handleGameEnd({
    reason: reason || "Game Over",
    sound: Sounds.gameOver,
  });
}

function gameWon() {
  handleGameEnd({
    reason: "You won!",
    sound: Sounds.gameWon,
  });
}

function handleGameEnd({ reason, sound }) {
  try {
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  } catch (e) {}
  isGameOver = true;
  gameOverReason = reason || "Game Over";

  show(playAgainBtn);
  show(restartBtn);
  show(toggleGridBtn);
  show(volumeControl);
  hide(scoreListContainer);
  try {
    pauseBg();
  } catch (e) {}
// Shared end-of-run flow (game over / win) to keep UI + score logic consistent.
function endRun({ reason, sound }) {
  try {
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  } catch (e) {}

  isGameOver = true;
  gameOverReason = reason || "Game Over";

  show(playAgainBtn);
  show(restartBtn);
  show(toggleGridBtn);
  show(volumeControl);
  hide(scoreListContainer);

  try {
    pauseBg();
  } catch (e) {}

  pendingScoreSave = {
    name: usernameInput?.value?.trim() || "Anonymous",
    value: score,
    bucket: currentSpeedLabel,
  };

  showEndOverlay(gameOverReason);
}

function gameOver(reason) {
  endRun({ reason: reason || "Game Over", sound: Sounds.gameOver });
}

function gameWon() {
  endRun({ reason: "You won!", sound: Sounds.gameWon });
}

function finalizeScoreIfNeeded() {
  if (!pendingScoreSave) return;

  Scoreboard.push(
    {
      name: pendingScoreSave.name,
      value: pendingScoreSave.value,
      shots: currentRunShots,
    },
    pendingScoreSave.bucket
  );

  pendingScoreSave = null;
}

function captureScreenshot() {
  try {
    const w = canvas.width;
    const h = canvas.height;

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d");

    octx.fillStyle = "#3a5f2b";
    octx.fillRect(0, 0, w, h);

    // 1) Draw grass background (always from preloaded image)
    if (grassReady) {
      octx.drawImage(grassImage, 0, 0, w, h);
    } else {
      octx.fillStyle = "#3a5f2b";
      octx.fillRect(0, 0, w, h);
    }

    // 2) Draw game canvas pixels
    octx.drawImage(canvas, 0, 0);

    // 3) HUD text (score + difficulty)
    octx.save();
    octx.font = '16px "Press Start 2P", monospace';
    octx.fillStyle = "#ffffff";
    octx.shadowColor = "rgba(0,0,0,0.6)";
    octx.shadowBlur = 4;

    octx.textBaseline = "top";
    octx.font = '16px "Press Start 2P", monospace';

    // Left: score
    octx.fillText(`Score: ${score}`, 14, 14);

    // Right: difficulty
    const diffText = `Difficulty: ${cap(currentSpeedLabel)}`;
    const metrics = octx.measureText(diffText);
    octx.fillText(diffText, w - metrics.width - 14, 14);

    octx.restore();

    return out.toDataURL("image/png");
  } catch (e) {
    console.error("Screenshot capture failed", e);
    return null;
  }
}

function showEndOverlay(message) {
  try {
    if (!gameOverOverlay) return;

    // Build overlay UI (kept self-contained so we don't depend on extra HTML)
    const safeMsg = String(message || "Game Over").replace(/[<>]/g, "");
    gameOverOverlay.innerHTML = `
      <div class="overlayInner">
        <h2 class="overlayHeading">${safeMsg}</h2>
        <div class="overlayActions">
          <button type="button" class="saveScreenshotBtn">Save Screenshot</button>
          <span class="saveShotStatus" aria-live="polite"></span>
        </div>
      </div>
    `;

    gameOverOverlay.style.display = "flex";
    gameOverOverlay.setAttribute("aria-hidden", "false");

    const btn = gameOverOverlay.querySelector(".saveScreenshotBtn");
    const status = gameOverOverlay.querySelector(".saveShotStatus");

    if (btn) {
      btn.onclick = () => {
        const shot = captureScreenshot();
        if (!shot) {
          if (status) status.textContent = "Could not capture screenshot.";
          return;
        }
        currentRunShots.push(shot);
        finalizeScoreIfNeeded();
        if (status) {
          btn.disabled = true;
          btn.textContent = "Screenshot Saved";
        }
      };
    }
  } catch (e) {
    console.error("Failed to show end overlay", e);
  }
}

// ---- Input ----
window.addEventListener("keydown", (e) => {
  // Prevent hotkeys if the focus is on an input/textarea
  try {
    const f = document.activeElement;
    if (f && (f.tagName === "INPUT" || f.tagName === "TEXTAREA" || f.isContentEditable)) return;
  } catch (e) {}
  // music toggle (play/pause)
  if (e.key === "m" || e.key === "M") {
    togglePlayPause();
    return;
  }
  // game pause toggle
  if (e.key === "p" || e.key === "P") {
    toggleGamePause();
    return;
  }
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
    /* case "l":
    case "L":
      DEBUG.enabled = !DEBUG.enabled;
      if (!DEBUG.enabled) {
        DEBUG.paused = false;
        DEBUG.stepOnce = false;
      }
      return;
    case "p":
    case "P":
      if (screen === Screens.GAME && DEBUG.enabled) {
        DEBUG.paused = !DEBUG.paused;
      }
      return;
    case "n":
    case "N":
      if (screen === Screens.GAME && DEBUG.enabled && DEBUG.paused) {
        DEBUG.stepOnce = true; // advance one update on next loop
      }
      return; */

    case "g":
    case "G":
      if (screen === Screens.GAME) {
        showGrid = !showGrid;
        if (toggleGridBtn) toggleGridBtn.textContent = showGrid ? "Hide Grid" : "Show Grid";
      }
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
  resumeAudioContext("start button");
  enterGameScreen();
};

playAgainBtn.onclick = () => {
  finalizeScoreIfNeeded();
  if (musicEnabled) playBg({ restart: false });
  enterGameScreen({ restartMusic: false });
};

restartBtn.onclick = () => {
  finalizeScoreIfNeeded();
  hideDifficultyUI();
  enterStartScreen();
};

function updateActiveScoreboardDifficulty() {
  const lbl = getSelectedSpeedLabel();
  scoreListContainer?.setAttribute("data-difficulty", lbl);
}

function updateResetScoreboardLabel() {
  if (!resetScoreboardBtn) return;
  const lbl = getSelectedSpeedLabel();
  resetScoreboardBtn.textContent = `Reset ${cap(lbl)} Scores`;
}

resetScoreboardBtn.onclick = () => {
  const lbl = getSelectedSpeedLabel();
  const pretty = cap(lbl);

  const ok = window.confirm(`Reset ${pretty} scores?\n\nThis cannot be undone.`);
  if (!ok) return;

  Scoreboard.reset(lbl);
  Scoreboard.display(lbl);
  updateResetScoreboardState();
};

function updateResetScoreboardState() {
  if (!resetScoreboardBtn) return;

  const lbl = getSelectedSpeedLabel();
  const scores = Scoreboard.load
    ? Scoreboard.load(lbl)
    : (() => {
        try {
          return JSON.parse(localStorage.getItem(`highScores:${lbl}`)) || [];
        } catch {
          return [];
        }
      })();

  resetScoreboardBtn.disabled = !scores.length;
}

// Download screenshots from the scoreboard (click the 📷 icon)
if (highScoresList) {
  const downloadShot = (url) => {
    if (!url || typeof url !== "string") return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `snake-screenshot-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  highScoresList.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".shotIcon");
    if (!btn) return;
    const url = btn.getAttribute("data-shot-url");
    downloadShot(url);
  });

  highScoresList.addEventListener("keydown", (e) => {
    const btn = e.target.closest && e.target.closest(".shotIcon");
    if (!btn) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const url = btn.getAttribute("data-shot-url");
      downloadShot(url);
    }
  });
}

if (difficultyPills?.length) {
  difficultyPills.forEach((btn) => {
    btn.addEventListener("click", () => {
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
        updateResetScoreboardState();
      } else if (screen === Screens.GAME) {
        updateSpeedFromUI();
      }
      updateDynamicBar();
      updateActiveScoreboardDifficulty();
      updateResetScoreboardLabel();
    });
  });
}

function readDifficultyFromPills() {
  const sel = document.querySelector(".difficultyPill.selected, .difficultyPill[aria-checked='true']");
  if (!sel) return { ms: 25, label: "normal" };
  const raw = String(sel.dataset.ms || "").trim();
  const label = (sel.dataset.label || sel.textContent || "normal").trim().toLowerCase();
  if (raw === "dynamic") {
    return { ms: dynamicStepMs / SPEED_MULT, label };
  }
  const ms = Number(raw);
  return { ms: Number.isFinite(ms) ? ms : 25, label };
}

// Dynamic difficulty progress bar helpers
const BAR_MAX_MS = 180;
const BAR_MIN_MS = 60;
const BAR_THRESHOLDS = [
  { label: "Easy", ms: 180 },
  { label: "Normal", ms: 120 },
  { label: "Hard", ms: 60 },
];
let dynamicBarEl = null;
let dynamicBarFill = null;
let dynamicBarTicks = null;
let dynamicBarLabel = null;
let mainDifficultyLabelEl = null;

function initDynamicBar() {
  dynamicBarEl = document.querySelector(".dynamicBar");
  if (!dynamicBarEl) return;
  dynamicBarFill = dynamicBarEl.querySelector(".dynamicBar__fill");
  dynamicBarTicks = dynamicBarEl.querySelector(".dynamicBar__ticks");
  // dynamicBarLabel is now a stand-alone element below the canvas
  mainDifficultyLabelEl = document.querySelector(".mainDifficultyLabel");
  // create ticks
  dynamicBarTicks.innerHTML = "";
  BAR_THRESHOLDS.forEach((t) => {
    const el = document.createElement("div");
    el.className = "tick";
    const pct = ((BAR_MAX_MS - t.ms) / (BAR_MAX_MS - BAR_MIN_MS)) * 100;
    el.style.left = `${pct}%`;
    el.dataset.ms = String(t.ms);
    el.innerHTML = `<div class="dot"></div><div class="txt">${t.label}</div>`;
    dynamicBarTicks.appendChild(el);
  });
  updateDynamicBar();

  // ensure bar width still matches canvas after ticks constructed
  try {
    syncDynamicBarWidth();
  } catch (e) {}
}

function updateDifficultyUIVisibility() {
  if (!dynamicBarEl || !mainDifficultyLabelEl) return;

  // Only show difficulty UI during active gameplay
  if (screen !== Screens.GAME) {
    dynamicBarEl.style.display = "none";
    mainDifficultyLabelEl.style.display = "none";
    return;
  }

  const sel = document.querySelector('.difficultyPill.selected, .difficultyPill[aria-checked="true"]');
  const isDynamic = sel && String(sel.dataset.ms) === "dynamic";

  if (isDynamic) {
    dynamicBarEl.style.display = "flex";
    mainDifficultyLabelEl.style.display = "none";
  } else {
    dynamicBarEl.style.display = "none";
    mainDifficultyLabelEl.style.display = "block";
  }
}

function hideDifficultyUI() {
  if (mainDifficultyLabelEl) mainDifficultyLabelEl.style.display = "none";
  if (dynamicBarEl) dynamicBarEl.style.display = "none";
}

function updateDynamicBar() {
  if (!dynamicBarEl) return;
  // Determine currently selected difficulty
  const sel = document.querySelector('.difficultyPill.selected, .difficultyPill[aria-checked="true"]');
  const isDynamic = sel && String(sel.dataset.ms || "").trim() === "dynamic";
  const currentMs = isDynamic ? dynamicStepMs : sel ? Number(sel.dataset.ms) : stepMs;
  const label = (sel && (sel.dataset.label || sel.textContent)) || "—";
  const prettyLabel = String(label).trim();
  const displayLabel = prettyLabel && prettyLabel !== "—" ? prettyLabel.charAt(0).toUpperCase() + prettyLabel.slice(1).toLowerCase() : "—";
  // compute fill percent across BAR_MIN..BAR_MAX
  const pct = Math.max(0, Math.min(100, ((BAR_MAX_MS - currentMs) / (BAR_MAX_MS - BAR_MIN_MS)) * 100));
  dynamicBarFill.style.width = `${pct}%`;
  if (dynamicBarLabel) dynamicBarLabel.textContent = displayLabel;
  if (mainDifficultyLabelEl) mainDifficultyLabelEl.textContent = displayLabel;
  // highlight nearest threshold tick
  try {
    const ticks = Array.from(dynamicBarTicks.querySelectorAll(".tick"));
    let nearest = null;
    let bestDiff = Infinity;
    ticks.forEach((t) => {
      const tv = Number(t.dataset.ms);
      const diff = Math.abs(currentMs - tv);
      if (diff < bestDiff) {
        bestDiff = diff;
        nearest = t;
      }
      t.classList.remove("active");
    });
    if (nearest) nearest.classList.add("active");
  } catch (e) {}
  updateDifficultyUIVisibility();
}

function updateSpeedFromUI() {
  const { ms, label } = readDifficultyFromPills();
  stepMs = ms * SPEED_MULT;
  currentSpeedLabel = label;
  try {
    updateDynamicBar();
    updateDifficultyUIVisibility();
  } catch (e) {}
}

function getSelectedSpeedLabel() {
  return readDifficultyFromPills().label;
}

// ---- Helpers ----
let __dynBarResizeTimeout = null;
function syncDynamicBarWidth() {
  if (!dynamicBarEl || !canvas) return;
  try {
    const rect = canvas.getBoundingClientRect();
    // Set exact width to match canvas display width
    dynamicBarEl.style.width = `${Math.round(rect.width)}px`;
  } catch (e) {}
}
window.addEventListener("resize", () => {
  clearTimeout(__dynBarResizeTimeout);
  __dynBarResizeTimeout = setTimeout(syncDynamicBarWidth, 120);
});

// ---- Boot ----
(function boot() {
  try {
    initMusic();
  } catch (e) {}
  try {
    localStorage.removeItem("snake:musicCeil");
  } catch (e) {}
  try {
    if (volumeSlider) volumeSlider.value = String(masterMusicVolume);
    setMusicVolume(volumeSlider?.value ?? masterMusicVolume);
    try {
      if (volumePercent) volumePercent.textContent = `${Math.round(masterMusicVolume * 100)}%`;
    } catch (e) {}
  } catch (e) {}
  updateStartButtonState();
  try {
    console.debug("boot: initial audio state", {
      musicEnabled,
      masterMusicVolume,
      sfxVolume,
      audioContextState: audioContext && audioContext.state,
    });
  } catch (e) {}
  enterStartScreen();
  updateResetScoreboardState();
  try {
    hide(pauseBtn);
    hide(toggleGridBtn);
    hide(playAgainBtn);
    hide(restartBtn);
  } catch (e) {}
  try {
    if (musicPrevBtn) {
      console.debug("Wiring musicPrevBtn click handler");
      musicPrevBtn.addEventListener("click", () => {
        try {
          if (bgPlayer && !bgPlayer.paused) {
            bgPlayer.pause();
            bgPlayer.currentTime = 0;
          }
        } catch (e) {}
        previousTrack();
      });
    }
    if (musicNextBtn) {
      console.debug("Wiring musicNextBtn click handler");
      musicNextBtn.addEventListener("click", () => {
        try {
          if (bgPlayer && !bgPlayer.paused) {
            bgPlayer.pause();
            bgPlayer.currentTime = 0;
          }
        } catch (e) {}
        nextTrack();
      });
    }
    if (musicPlayPauseBtn) {
      console.debug("Wiring musicPlayPauseBtn click handler");
      musicPlayPauseBtn.addEventListener("click", togglePlayPause);
    }
    if (musicProgress) {
      console.debug("Wiring musicProgress input handler");
      musicProgress.addEventListener("input", (e) => {
        try {
          const el = document.body.classList.contains("screen-start") ? START_TRACK : bgPlayer;
          if (!el) return;
          const v = Number(e.target.value);
          if (!isNaN(v)) el.currentTime = Math.min(el.duration || Infinity, v);
        } catch (e) {}
      });
    }
  } catch (e) {}
  try {
    pauseBtn && pauseBtn.addEventListener("click", toggleGamePause);
  } catch (e) {}
  try {
    initDynamicBar();
  } catch (e) {}
})();
