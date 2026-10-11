/**
 * TrailEcho (TouchGrass AI)
 * Client-Side Offline Bioacoustics Inference & Field Companion
 */

// --- SPECIES ACOUSTIC KNOWLEDGE BASE ---
const SPECIES_PROFILES = {
  song_sparrow: {
    id: "song_sparrow",
    commonName: "Song Sparrow",
    scientificName: "Melospiza melodia",
    freqRange: [2000, 6500],
    dominantPeak: 4200,
    trillRate: 12.0,
    habitat: "Brushy fields, wetlands, trailside thickets",
    fieldNote: "Look for heavy breast streaking converging into a center spot. Often sings from top twigs of trailside shrubs.",
    callDescription: "Sweet, sweet, sweet, followed by a bright musical trill."
  },
  wood_thrush: {
    id: "wood_thrush",
    commonName: "Wood Thrush",
    scientificName: "Hylocichla mustelina",
    freqRange: [1800, 5200],
    dominantPeak: 3100,
    trillRate: 4.5,
    habitat: "Deciduous forest interiors, mature canopy",
    fieldNote: "Flute-like ethereal song vibrating with rich harmonics. Concealed in mid-story foliage; just close your eyes and listen.",
    callDescription: "Flute-like 'ee-oh-lay' ending with a metallic chime."
  },
  black_capped_chickadee: {
    id: "black_capped_chickadee",
    commonName: "Black-capped Chickadee",
    scientificName: "Poecile atricapillus",
    freqRange: [3000, 7500],
    dominantPeak: 4800,
    trillRate: 8.0,
    habitat: "Mixed woodland edges, birch stands, pine trails",
    fieldNote: "Small, acrobatic bird hanging upside down on pine branches. Whistled two-note 'fee-bee'.",
    callDescription: "Clear whistled 'fee-bee' or rapid 'chick-a-dee-dee'."
  },
  barred_owl: {
    id: "barred_owl",
    commonName: "Barred Owl",
    scientificName: "Strix varia",
    freqRange: [400, 1600],
    dominantPeak: 850,
    trillRate: 2.0,
    habitat: "Dense mixed woods, riparian trails, dusk forest",
    fieldNote: "Deep resonant hooting echoing at twilight. Check old hemlocks or mature sycamores.",
    callDescription: "Rhythmic 8-beat cadence: 'Who cooks for you? Who cooks for you-all?'"
  },
  american_goldfinch: {
    id: "american_goldfinch",
    commonName: "American Goldfinch",
    scientificName: "Spinus tristis",
    freqRange: [2500, 8000],
    dominantPeak: 5400,
    trillRate: 10.0,
    habitat: "Weedy fields, thistle patches, sunny trail edges",
    fieldNote: "Roller-coaster bounding flight pattern over meadows. Brilliant yellow and black plumage.",
    callDescription: "Bouncy flight call: 'po-ta-to-chip' with rising trills."
  },
  red_tailed_hawk: {
    id: "red_tailed_hawk",
    commonName: "Red-tailed Hawk",
    scientificName: "Buteo jamaicensis",
    freqRange: [1500, 4000],
    dominantPeak: 2600,
    trillRate: 1.0,
    habitat: "Open woodlands, ridge thermals, high snags",
    fieldNote: "Piercing raspy descending scream drifting from ridge thermals. Scan high dead snags.",
    callDescription: "Harsh, rasping descending scream: 'kreeee-aaaarr'."
  }
};

// --- APPLICATION STATE ---
let audioCtx = null;
let analyserNode = null;
let mediaStream = null;
let isListening = false;
let animationFrameId = null;
let countdownTimerId = null;
let countdownSeconds = 5;

// DOM Elements
const canvas = document.getElementById("spectrogramCanvas");
const canvasCtx = canvas.getContext("2d");
const canvasOverlay = document.getElementById("canvasOverlay");
const btnToggleListen = document.getElementById("btnToggleListen");
const liveIndicator = document.getElementById("liveIndicator");
const selectSpecies = document.getElementById("selectSpecies");
const btnSimulate = document.getElementById("btnSimulate");
const themeToggle = document.getElementById("themeToggle");
const mstCard = document.getElementById("mstCard");
const speciesCommon = document.getElementById("speciesCommon");
const speciesScientific = document.getElementById("speciesScientific");
const confidenceVal = document.getElementById("confidenceVal");
const peakHzVal = document.getElementById("peakHzVal");
const habitatVal = document.getElementById("habitatVal");
const callDescVal = document.getElementById("callDescVal");
const fieldNoteVal = document.getElementById("fieldNoteVal");
const timerCircle = document.getElementById("timerCircle");
const btnSleepNow = document.getElementById("btnSleepNow");
const pocketSleepOverlay = document.getElementById("pocketSleepOverlay");
const journalList = document.getElementById("journalList");
const btnExportJournal = document.getElementById("btnExportJournal");
const btnClearJournal = document.getElementById("btnClearJournal");

// --- INITIALIZATION ---
window.addEventListener("DOMContentLoaded", () => {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  loadJournal();

  // Populate Simulation Select
  Object.values(SPECIES_PROFILES).forEach((sp) => {
    const opt = document.createElement("option");
    opt.value = sp.id;
    opt.textContent = `${sp.commonName} (${sp.dominantPeak} Hz)`;
    selectSpecies.appendChild(opt);
  });

  // Event Listeners
  btnToggleListen.addEventListener("click", toggleListening);
  btnSimulate.addEventListener("click", () => simulateSpeciesAudio(selectSpecies.value));
  themeToggle.addEventListener("click", toggleSunlightMode);
  btnSleepNow.addEventListener("click", enterPocketMode);
  pocketSleepOverlay.addEventListener("click", exitPocketMode);
  btnExportJournal.addEventListener("click", exportJournalMarkdown);
  btnClearJournal.addEventListener("click", clearJournal);

  // Register Service Worker for Offline PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.log("SW registration notice:", err);
    });
  }
});

function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.parentElement.clientHeight * window.devicePixelRatio;
}

// --- SUNLIGHT CONTRAST MODE ---
function toggleSunlightMode() {
  const current = document.documentElement.getAttribute("data-theme");
  if (current === "sunlight") {
    document.documentElement.removeAttribute("data-theme");
    themeToggle.textContent = "☀️ Sunlight";
  } else {
    document.documentElement.setAttribute("data-theme", "sunlight");
    themeToggle.textContent = "🌲 Forest";
  }
}

// --- AUDIO CONTEXT SETUP ---
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// --- MICROPHONE LIVE STREAMING ---
async function toggleListening() {
  if (isListening) {
    stopListening();
  } else {
    try {
      const ctx = getAudioContext();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const source = ctx.createMediaStreamSource(mediaStream);

      analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.6;
      source.connect(analyserNode);

      isListening = true;
      btnToggleListen.textContent = "🛑 Stop Field Mic";
      btnToggleListen.classList.add("recording");
      liveIndicator.classList.add("active");
      canvasOverlay.style.display = "none";

      startVisualizationLoop();
      startPeriodicClassification();
    } catch (err) {
      alert("Microphone permission required for trail listening: " + err.message);
    }
  }
}

function stopListening() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  isListening = false;
  btnToggleListen.textContent = "🎙️ Start Field Mic";
  btnToggleListen.classList.remove("recording");
  liveIndicator.classList.remove("active");
  canvasOverlay.style.display = "block";
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// --- SPECTROGRAM / WAVEFORM VISUALIZER ---
function startVisualizationLoop() {
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    if (!isListening) return;
    animationFrameId = requestAnimationFrame(draw);

    analyserNode.getByteFrequencyData(dataArray);

    const w = canvas.width;
    const h = canvas.height;

    // Fade effect for waterfall trailing
    canvasCtx.fillStyle = "rgba(10, 17, 14, 0.25)";
    canvasCtx.fillRect(0, 0, w, h);

    const barWidth = (w / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i];
      const barHeight = (val / 255) * h * 0.9;

      // Color mapping: Emerald to Amber to Coral based on acoustic intensity
      const hue = 150 - (val / 255) * 110;
      canvasCtx.fillStyle = `hsl(${hue}, 85%, ${40 + (val / 255) * 25}%)`;

      canvasCtx.fillRect(x, h - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  draw();
}

// --- PERIODIC CLASSIFICATION OF LIVE AUDIO ---
let classificationInterval = null;
function startPeriodicClassification() {
  if (classificationInterval) clearInterval(classificationInterval);
  classificationInterval = setInterval(() => {
    if (!isListening || !analyserNode) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);

    // Analyze frequency bins
    const nyquist = audioCtx.sampleRate / 2;
    const binHz = nyquist / bufferLength;

    let maxVal = 0;
    let peakIndex = 0;
    let totalEnergy = 0;

    for (let i = 5; i < bufferLength; i++) {
      const v = dataArray[i];
      totalEnergy += v;
      if (v > maxVal) {
        maxVal = v;
        peakIndex = i;
      }
    }

    const peakHz = Math.round(peakIndex * binHz);

    // If audio is above ambient silence threshold, run species matcher
    if (maxVal > 70 && totalEnergy > 1500) {
      matchAcousticPeak(peakHz);
    }
  }, 1200);
}

// --- SIMULATION AUDIO GENERATOR ---
function simulateSpeciesAudio(speciesId) {
  const profile = SPECIES_PROFILES[speciesId];
  if (!profile) return;

  const ctx = getAudioContext();

  // Create Web Audio synthetic chirp with FM modulation matching species signature
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Frequency Modulation
  const fmOsc = ctx.createOscillator();
  const fmGain = ctx.createGain();

  fmOsc.frequency.setValueAtTime(profile.trillRate, ctx.currentTime);
  fmGain.gain.setValueAtTime(350, ctx.currentTime);

  fmOsc.connect(fmGain);
  fmGain.connect(osc.frequency);

  osc.type = "sine";
  osc.frequency.setValueAtTime(profile.dominantPeak, ctx.currentTime);

  // Amplitude Envelope
  gain.gain.setValueAtTime(0.01, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.4);

  // Connect to temporary analyser for visualization
  analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = 2048;

  osc.connect(gain);
  gain.connect(analyserNode);
  analyserNode.connect(ctx.destination);

  fmOsc.start(ctx.currentTime);
  osc.start(ctx.currentTime);

  fmOsc.stop(ctx.currentTime + 1.5);
  osc.stop(ctx.currentTime + 1.5);

  isListening = true;
  canvasOverlay.style.display = "none";
  startVisualizationLoop();

  setTimeout(() => {
    isListening = false;
    displayIdentification(profile, 0.96, profile.dominantPeak);
  }, 1200);
}

// --- ACOUSTIC MATCHING ENGINE ---
function matchAcousticPeak(peakHz) {
  let bestMatch = null;
  let bestScore = -1;

  for (const sp of Object.values(SPECIES_PROFILES)) {
    const diff = Math.abs(peakHz - sp.dominantPeak);
    const score = Math.exp(-0.5 * Math.pow(diff / 1000, 2));

    if (score > bestScore) {
      bestScore = score;
      bestMatch = sp;
    }
  }

  if (bestScore > 0.45 && bestMatch) {
    displayIdentification(bestMatch, bestScore, peakHz);
  }
}

// --- MINIMUM SCREEN TIME (MST) IDENTIFICATION WORKFLOW ---
function displayIdentification(species, confidence, peakHz) {
  speciesCommon.textContent = species.commonName;
  speciesScientific.textContent = species.scientificName;
  confidenceVal.textContent = `${Math.round(confidence * 100)}% Match`;
  peakHzVal.textContent = `${peakHz} Hz`;
  habitatVal.textContent = species.habitat;
  callDescVal.textContent = species.callDescription;
  fieldNoteVal.textContent = `🔭 ${species.fieldNote}`;

  mstCard.classList.add("visible");
  mstCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

  // 1. Spoken Audio Feedback (Screen-Off Friendly)
  speakFieldNote(species.commonName);

  // 2. Save observation to offline local storage
  saveObservation(species, confidence, peakHz);

  // 3. Start Auto-Pocket Countdown (5 seconds)
  startAutoPocketCountdown();
}

function speakFieldNote(birdName) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${birdName} detected. Put your phone away.`);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

function startAutoPocketCountdown() {
  if (countdownTimerId) clearInterval(countdownTimerId);
  countdownSeconds = 5;
  timerCircle.textContent = countdownSeconds;

  countdownTimerId = setInterval(() => {
    countdownSeconds--;
    timerCircle.textContent = countdownSeconds;

    if (countdownSeconds <= 0) {
      clearInterval(countdownTimerId);
      enterPocketMode();
    }
  }, 1000);
}

// --- POCKET MODE / BATTERY SLEEP SCREEN ---
function enterPocketMode() {
  if (countdownTimerId) clearInterval(countdownTimerId);
  pocketSleepOverlay.classList.add("active");
}

function exitPocketMode() {
  pocketSleepOverlay.classList.remove("active");
}

// --- OFFLINE TRAIL JOURNAL STORAGE ---
function saveObservation(species, confidence, peakHz) {
  const entries = JSON.parse(localStorage.getItem("trailecho_journal") || "[]");
  const newEntry = {
    id: Date.now(),
    species: species.commonName,
    scientific: species.scientificName,
    confidence: Math.round(confidence * 100),
    peakHz: peakHz,
    habitat: species.habitat,
    fieldNote: species.fieldNote,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    date: new Date().toISOString().split("T")[0]
  };

  entries.unshift(newEntry);
  localStorage.setItem("trailecho_journal", JSON.stringify(entries));
  loadJournal();
}

function loadJournal() {
  const entries = JSON.parse(localStorage.getItem("trailecho_journal") || "[]");
  journalList.innerHTML = "";

  if (entries.length === 0) {
    journalList.innerHTML = `<div class="empty-state">No observations recorded yet. Listen to a bird on the trail or run a test simulation.</div>`;
    return;
  }

  entries.slice(0, 10).forEach((entry) => {
    const el = document.createElement("div");
    el.className = "journal-entry";
    el.innerHTML = `
      <div class="entry-main">
        <h4>${entry.species} <span style="font-weight: normal; font-size: 0.8rem; color: var(--text-dim); font-style: italic;">(${entry.scientific})</span></h4>
        <p>${entry.habitat}</p>
      </div>
      <div class="entry-meta">
        <strong>${entry.confidence}%</strong>
        <div>${entry.timestamp}</div>
      </div>
    `;
    journalList.appendChild(el);
  });
}

function clearJournal() {
  if (confirm("Clear local offline trail journal?")) {
    localStorage.removeItem("trailecho_journal");
    loadJournal();
  }
}

function exportJournalMarkdown() {
  const entries = JSON.parse(localStorage.getItem("trailecho_journal") || "[]");
  if (entries.length === 0) {
    alert("Trail journal is empty.");
    return;
  }

  let md = `# 🌲 TrailEcho Field Journal\n\nGenerated: ${new Date().toLocaleString()}\nZero-Cloud Offline Bioacoustic Log\n\n`;
  md += `| Time | Species | Scientific Name | Confidence | Peak Frequency | Habitat |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  entries.forEach((e) => {
    md += `| ${e.timestamp} | **${e.species}** | *${e.scientific}* | ${e.confidence}% | ${e.peakHz} Hz | ${e.habitat} |\n`;
  });

  md += `\n\n## Field Notes\n\n`;
  entries.forEach((e) => {
    md += `- **${e.species}** (${e.timestamp}): ${e.fieldNote}\n`;
  });

  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trailecho-journal-${new Date().toISOString().split("T")[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
