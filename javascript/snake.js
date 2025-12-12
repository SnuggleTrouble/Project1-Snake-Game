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
// UI elements created in index.html
const volumePercent = document.querySelector(".volumePercent");
const pauseBtn = document.querySelector(".pauseBtn");
const pausedOverlayEl = document.querySelector(".pausedOverlay");

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

// Crossfade duration (ms)
const CROSSFADE_MS = 1600;
let masterMusicVolume = 0.1; // master music volume (0..1) — default to 10%
// Web Audio API handles — we'll attempt to migrate to use GainNode ramps
let audioContext = null;
let masterGainNode = null;
let usingWebAudio = false;
const MIN_GAIN = 0.001; // small epsilon for exponential ramps (must be > 0)

function mkTrack(src, label) {
  const a = new Audio(src);
  a.preload = "auto";
  a.dataset.trackLabel = label || src;
  // track web-audio metadata
  a.__webAudioInit = false;
  a.__webGain = null;
  a.__webSource = null;
  return a;
}

// Background playlist: chain tracks during gameplay (exclude START_TRACK)
const BG_PLAYLIST = [
  mkTrack("./sounds/ParagonX9_Metropolis_8.mp3", "ParagonX9 - Metropolis 8Bit"),
  mkTrack("./sounds/ParagonX9_No_5.mp3", "ParagonX9 - No. 5"),
  mkTrack("./sounds/ParagonX9_Defection.mp3", "ParagonX9 - Defection"),
  mkTrack("./sounds/ParagonX9_Chaoz_Lyth3ro.mp3", "ParagonX9 - Chaoz Lyth3ro"),
  mkTrack("./sounds/Avizura_Chaoz_Mirage.mp3", "Avizura - Chaoz Mirage"),
  mkTrack("./sounds/ParagonX9_Soulblade_NG_C.mp3", "ParagonX9 - Soulblade NG C"),
  mkTrack("./sounds/ParagonX9_Chaoz_Fantasy_8_Bit.mp3", "ParagonX9 - Chaoz Fantasy 8Bit"),
];
// Dedicated start-screen track (plays only on the Start screen, then chains into playlist)
const START_TRACK = mkTrack("./sounds/ParagonX9_Chaoz_Fantasy_8_Bit.mp3", "ParagonX9 - Chaoz Fantasy 8Bit");
let bgIndex = 0;
let bgPlayer = null;
// Music enabled state (user toggle)
let musicEnabled = true;

function updateMusicToggleUI() {
  musicToggleBtns.forEach((btn) => {
    try {
      btn.textContent = musicEnabled ? "Music: On" : "Music: Off";
      btn.setAttribute("aria-pressed", musicEnabled ? "true" : "false");
    } catch (e) {}
  });
  // Update track label when toggling
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
    // If enabling, play the appropriate track for the current screen
    if (musicEnabled) {
      // Ensure AudioContext exists if user turned music on
      try {
        ensureAudioContext();
      } catch (e) {
        console.error("ensureAudioContext failed in toggleMusicEnabled", e);
      }
      // Attempt to resume the audio context — this should be allowed since it's triggered from a user gesture
      try {
        if (audioContext && audioContext.state === "suspended") {
          audioContext
            .resume()
            .then(() => console.debug("audioContext resumed via toggleMusicEnabled"))
            .catch((e) => console.error("audioContext resume failed (toggleMusic)", e));
        }
      } catch (e) {
        console.error("audioContext resume attempt failed (toggleMusic)", e);
      }
      // Do not auto-start music when toggled on; just unmute/resume existing playback state
      // If nothing is playing, start the appropriate source
      if (document.body.classList.contains("screen-start")) {
        if (START_TRACK && START_TRACK.paused) playStartMusic({ restart: false });
      } else {
        if ((bgPlayer && bgPlayer.paused) || !bgPlayer) playBg({ restart: false });
      }
    } else {
      // disable all music
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
    // clear existing listeners to avoid duplicates
    a.onended = null;
    a.onended = function () {
      // default ended handler is to start the next track (but we will normally crossfade earlier)
      bgIndex = (bgIndex + 1) % BG_PLAYLIST.length;
      const next = BG_PLAYLIST[bgIndex];
      // ensure outgoing track is paused before starting next
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
    // set master gain to current masterMusicVolume
    masterGainNode.gain.value = Math.max(MIN_GAIN, masterMusicVolume);
    masterGainNode.connect(audioContext.destination);
    usingWebAudio = true;
  } catch (e) {
    usingWebAudio = false;
    // initial player UI state
    try {
      updatePlayPauseUI();
      if (timeLabelEl) timeLabelEl.textContent = "— / —";
    } catch (e) {}
  }
  return audioContext;
}

// Centralized helper to apply masterMusicVolume to current audio plumbing
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

// Small helpers for audio state
function isWebAudioAvailable() {
  return Boolean(usingWebAudio && audioContext && audioContext.state && audioContext.state !== "closed");
}
function getCurrentMusicVolume() {
  return masterMusicVolume;
}

// removed getEffectiveMusicVolume(): use masterMusicVolume directly

function initWebAudioForTrack(a) {
  if (!a || a.__webAudioInit || !ensureAudioContext()) return;
  try {
    // Create MediaElementSource and per-track gain
    const source = audioContext.createMediaElementSource(a);
    const gain = audioContext.createGain();
    gain.gain.value = 1.0; // per-track multiplier handled by masterGain
    source.connect(gain);
    gain.connect(masterGainNode);
    a.__webAudioInit = true;
    a.__webSource = source;
    a.__webGain = gain;
  } catch (e) {
    // some browsers disallow createMediaElementSource in certain contexts
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
// musicIndicator removed — we previously used it as a visual crossfade indicator
// Player UI elements
const sfxVolumeSlider = document.querySelector("#sfxVolume");
const musicPrevBtn = document.querySelector(".musicPrevBtn");
const musicPlayPauseBtn = document.querySelector(".musicPlayPauseBtn");
const musicNextBtn = document.querySelector(".musicNextBtn");
const musicProgress = document.querySelector("#musicProgress");
const timeLabelEl = document.querySelector(".timeLabel");

// SFX WebAudio node
let sfxGainNode = null;
let sfxVolume = 1.0;
const DUCKING_FACTOR = 0.25; // reduce SFX to 25% during crossfade
const DUCK_MS = 300; // ducking ramp duration
let progressLoopId = null;
let isMusicPlaying = false;
let audioUnlocked = false;
let enableSoundBtn = null;

// Unlock/resume audio on first user gesture if autoplay was blocked
function attemptUnlockAudioOnce() {
  if (audioUnlocked) return;
  function unlock() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      ensureAudioContext();
    } catch (e) {
      console.error("ensureAudioContext failed during unlock", e);
    }
    try {
      if (audioContext && audioContext.state === "suspended") {
        audioContext
          .resume()
          .then(() => console.debug("audioContext resumed via unlock gesture"))
          .catch((e) => console.error("audioContext.resume failed during unlock", e));
      }
    } catch (e) {
      console.error("audioContext resume exception during unlock:", e);
    }
    // If musicEnabled was true and nothing is playing, try to start the appropriate source
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
    // remove listeners
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

// boot-time init for start track + playlist
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
    // initialize existing SFX audio elements
    Object.keys(Sounds).forEach((k) => {
      const a = Sounds[k];
      if (!a) return;
      try {
        const src = audioContext.createMediaElementSource(a);
        src.connect(sfxGainNode);
        a.__sfxWebAudio = true;
      } catch (e) {
        // fallback: nothing to do
        a.__sfxWebAudio = false;
      }
    });
  } catch (e) {
    // fallback: ignore
  }
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
      // unknown duration
      musicProgress.max = 100;
      musicProgress.value = Math.min(100, cur % 100);
      timeLabelEl.textContent = `${formatTime(cur)} / —`;
    }
  } catch (e) {}
}

function progressLoop() {
  try {
    updateProgressUI();
  } catch (e) {}
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
  if (screen !== Screens.GAME && screen !== Screens.SCORE) return; // only control playlist in-game/score
  playTrackAtIndex(bgIndex - 1, { restart: true });
}
function nextTrack() {
  if (!BG_PLAYLIST.length) return;
  if (screen !== Screens.GAME && screen !== Screens.SCORE) return;
  playTrackAtIndex(bgIndex + 1, { restart: true });
}
function togglePlayPause() {
  console.debug("togglePlayPause() called", { musicEnabled, isMusicPlaying, screen });
  // If music is currently disabled via the global toggle, enable it on explicit Play request
  if (!musicEnabled) {
    console.debug("togglePlayPause: music was disabled — auto-enabling");
    try {
      toggleMusicEnabled(true);
    } catch (e) {
      console.error("Failed to auto-enable music in togglePlayPause", e);
    }
  }
  // Ensure AudioContext exists and is resumed — this is a user gesture so resume should be allowed
  try {
    ensureAudioContext();
    if (audioContext && audioContext.state === "suspended") {
      audioContext
        .resume()
        .then(() => console.debug("audioContext resumed via togglePlayPause"))
        .catch((e) => console.error("audioContext resume failed (togglePlayPause)", e));
    }
  } catch (e) {
    console.error("ensureAudioContext/resume failed in togglePlayPause", e);
  }
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
    // resume
    isPaused = false;
    try {
      if (pauseBtn) {
        pauseBtn.textContent = "Pause";
        pauseBtn.setAttribute("aria-pressed", "false");
      }
    } catch (e) {}
    lastTime = performance.now();
    startLoop();
    // Do not change music playback when toggling game pause anymore
    try {
      if (pausedOverlayEl) pausedOverlayEl.classList.remove("active");
      if (pausedOverlayEl) pausedOverlayEl.setAttribute("aria-hidden", "true");
    } catch (e) {}
  } else {
    // pause
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
    // Do not pause music when pausing the game
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
    // fallback: adjust HTMLAudio volumes directly
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
    // initialize web audio for the start track if available
    initWebAudioForTrack(START_TRACK);
    try {
      if (usingWebAudio && audioContext && audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    } catch (e) {}
    if (opts.restart) START_TRACK.currentTime = 0;
    if (usingWebAudio && START_TRACK.__webGain) {
      // ramp immediate to master volume
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
          // If autoplay was blocked, attempt to unlock on first gesture
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
    // On the Start screen, the START_TRACK should loop and not chain into the in-game playlist.
    // We intentionally do not schedule a crossfade into the BG playlist here.
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
    START_TRACK.loop = true; // loop on the Start screen; do not chain into playlist
  } catch (e) {}
}

// Fade / Crossfade helpers
let crossfadeTimer = null; // scheduled crossfade timeout
let fadeIntervalId = null; // interval id for active fade
function clearScheduledCrossfade() {
  if (crossfadeTimer) {
    clearTimeout(crossfadeTimer);
    crossfadeTimer = null;
  }
  if (fadeIntervalId) {
    clearInterval(fadeIntervalId);
    fadeIntervalId = null;
  }
  // Cancel any scheduled ramps on web audio gain nodes
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
  // If using WebAudio, use exponentialRampToValueAtTime on GainNodes
  if (usingWebAudio && audioContext) {
    try {
      initWebAudioForTrack(out);
      initWebAudioForTrack(ina);
      const outGain = out.__webGain;
      const inGain = ina.__webGain;
      if (!outGain || !inGain) throw new Error("web gain missing");
      // schedule ramps in seconds
      const now = audioContext.currentTime;
      const durSec = dur / 1000;
      // start ina from a small epsilon
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
      // musicIndicator removed - no-op
      // schedule exponential ramp to master volume and to near-zero
      inGain.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, masterMusicVolume), now + durSec);
      outGain.gain.exponentialRampToValueAtTime(MIN_GAIN, now + durSec);

      // schedule cleanup after the fade
      crossfadeTimer = setTimeout(() => {
        try {
          out.pause();
          out.currentTime = 0;
          // ensure ina is set to master volume
          inGain.gain.cancelScheduledValues(audioContext.currentTime);
          inGain.gain.setValueAtTime(Math.max(MIN_GAIN, masterMusicVolume), audioContext.currentTime);
          // schedule next crossfade if ina is part of playlist
          const idx = BG_PLAYLIST.indexOf(ina);
          if (idx >= 0) {
            bgIndex = idx;
            bgPlayer = ina;
            const next = BG_PLAYLIST[(idx + 1) % BG_PLAYLIST.length];
            scheduleCrossfade(ina, next);
          }
          setTrackLabel(ina.dataset.trackLabel);
          // musicIndicator removed - no-op
          try {
            duckSfx(false);
          } catch (e) {}
        } catch (e) {}
        crossfadeTimer = null;
      }, dur);
      return;
    } catch (e) {
      // fallback to HTMLAudio linear fade if WebAudio fails
    }
  }
  // ensure target volumes are zeroed before starting
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
      // schedule next crossfade for ina->next (if ina is part of BG_PLAYLIST)
      const idx = BG_PLAYLIST.indexOf(ina);
      if (idx >= 0) {
        bgIndex = idx;
        bgPlayer = ina;
        const next = BG_PLAYLIST[(idx + 1) % BG_PLAYLIST.length];
        scheduleCrossfade(ina, next);
      }
      // update label for the new track
      setTrackLabel(ina.dataset.trackLabel);
      try {
        duckSfx(false);
      } catch (e) {}
    }
  }, 60);
}

function scheduleCrossfade(current, next) {
  clearScheduledCrossfade();
  // if next is missing, nothing to fade to
  if (!current || !next) return;
  // If duration is not available, fall back to ended handler
  try {
    const dur = current.duration;
    if (!dur || isNaN(dur) || dur <= CROSSFADE_MS) return; // no space for crossfade
    const remaining = (dur - current.currentTime) * 1000;
    const startDelay = Math.max(0, remaining - CROSSFADE_MS);
    crossfadeTimer = setTimeout(() => {
      crossfade(current, next, Math.min(CROSSFADE_MS, dur * 1000));
    }, startDelay);
  } catch (e) {
    // ignore scheduling if duration not available
  }
}

function playTrackAtIndex(i, opts = { restart: true }) {
  if (!BG_PLAYLIST.length) return;
  const idx = ((i % BG_PLAYLIST.length) + BG_PLAYLIST.length) % BG_PLAYLIST.length;
  console.debug("playTrackAtIndex() -> idx", { idx, bgIndex, bgPlayerReadyState: bgPlayer && bgPlayer.readyState });
  const cur = BG_PLAYLIST[idx];
  if (!cur) return;
  try {
    clearScheduledCrossfade();
    // pause and cleanup prior background player if different
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
    // attach update hooks
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
    // schedule crossfade to next
    const next = BG_PLAYLIST[(idx + 1) % BG_PLAYLIST.length];
    scheduleCrossfade(cur, next);
  } catch (e) {}
}

// Play/pause helpers for background music
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

// Fixed SFX volume (tweak to taste)
const SFX_VOLUME = 1.0;
["eat", "gameOver", "gameWon"].forEach((k) => {
  if (Sounds[k]) Sounds[k].volume = SFX_VOLUME;
});

// Music-only volume
function setMusicVolume(v) {
  const vol = Math.min(1, Math.max(0, Number(v)));
  masterMusicVolume = vol;
  try {
    localStorage.setItem("snake:musicVolume", String(masterMusicVolume));
  } catch (e) {}
  // Centralized application
  applyMasterVolume();
}

// NOTE: music ceiling (musicVolumeCeil) removed — use masterMusicVolume directly.

// Init + live updates (Start/Score screens)
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

// Load persisted music preference (defaults to true)
try {
  const raw = localStorage.getItem("snake:musicEnabled");
  if (raw !== null) musicEnabled = raw === "true";
} catch (e) {}
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
let isPaused = false; // gameplay paused state
let gameOverReason = "";

// ---- High scores (module with medals) ----
const Scoreboard = (() => {
  const KEY = (bucket) => `highScores:${bucket || "all"}`;
  const MAX = 10;

  function load(b) {
    try {
      return JSON.parse(localStorage.getItem(KEY(b))) || [];
    } catch (e) {
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
  // ensure game-only controls are hidden on start screen
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
    // stop in-game playlist and start the dedicated start-screen music
    stopBg();
    if (musicEnabled) {
      console.debug("enterStartScreen: starting START_TRACK (musicEnabled)");
      playStartMusic({ restart: true });
      // In case autoplay was blocked by the browser, attempt to unlock audio on first user gesture
      attemptUnlockAudioOnce();
      // show an explicit enable-sound button if audio still suspended after a short delay
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
    if (pauseBtn) {
      pauseBtn.setAttribute("aria-hidden", "true");
      try {
        hide(pauseBtn);
      } catch (e) {}
    }
  } catch (e) {}

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
  try {
    show(pauseBtn);
  } catch (e) {}
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
    if (musicEnabled && opts.restartMusic) {
      console.debug("enterGameScreen: starting BG playlist (musicEnabled)");
      playBg({ restart: true });
      // In case autoplay was blocked, attach unlock handler to start on first user gesture
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
  // clear paused state
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
    if (pauseBtn) pauseBtn.setAttribute("aria-hidden", "false");
  } catch (e) {}
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
  try {
    if (pauseBtn) pauseBtn.setAttribute("aria-hidden", "true");
  } catch (e) {}
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
  ctx.fillText(`Score: ${score}`, 12, 26);

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

  Scoreboard.push({ name: usernameInput?.value?.trim() || "Anonymous", value: score }, currentSpeedLabel);
}

function gameWon() {
  try {
    Sounds.gameWon.currentTime = 0;
    Sounds.gameWon.play().catch(() => {});
  } catch (e) {}
  isGameOver = true;
  gameOverReason = "You won!";

  show(playAgainBtn);
  show(restartBtn);
  show(toggleGridBtn);
  show(volumeControl);
  hide(scoreListContainer);
  try {
    pauseBg();
  } catch (e) {}

  Scoreboard.push({ name: usernameInput?.value?.trim() || "Anonymous", value: score }, currentSpeedLabel);
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
  try {
    ensureAudioContext();
    if (audioContext && audioContext.state === "suspended") {
      audioContext
        .resume()
        .then(() => console.debug("audioContext resumed via start button"))
        .catch((e) => console.error("audioContext resume failed (start button)", e));
    }
  } catch (e) {
    console.error("ensureAudioContext/resume via start btn failed", e);
  }
  enterGameScreen();
};
playAgainBtn.onclick = () => {
  if (musicEnabled) playBg({ restart: false });
  enterGameScreen({ restartMusic: false });
};
restartBtn.onclick = () => enterStartScreen();
resetScoreboardBtn.onclick = () => {
  Scoreboard.reset(currentSpeedLabel);
  Scoreboard.display(currentSpeedLabel);
};

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
})();
