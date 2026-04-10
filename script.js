// declare
let driftLfo, driftNoise, driftNoiseFilter, driftNoiseGain;

// ---------------- AUDIO ----------------

// audio core
const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "sawtooth" },
  maxPolyphony: 16,
  envelope: {
    attack: 0.02,
    decay: 0.2,
    sustain: 0.9,
    release: 0.5
  }
});

// create mods
driftLfo = new Tone.LFO({frequency: 0.08, min: -6, max: 6});
driftNoise = new Tone.Noise("pink");
driftNoiseFilter = new Tone.Filter(2, "lowpass");
driftNoiseGain = new Tone.Gain(1.5);

// connect internally ONLY
driftNoise.connect(driftNoiseFilter);
driftNoiseFilter.connect(driftNoiseGain);

function getSmoothNoise(amount) {
  return (Math.random() - 0.5) * amount;
}

// start it (in toggle)
driftNoise.start();

const filter = new Tone.Filter({
  frequency: 4500,
  type: "lowpass",
  rolloff: -12,
  Q: .2
});

// 🔒 hard safety on the param
filter.frequency.value = Number.isFinite(filter.frequency.value)
  ? filter.frequency.value
  : 1000;

// create filter envelope and route it to filter cutoff
const filterEnv = new Tone.FrequencyEnvelope({
  attack: 0.05,
  decay: 0.2,
  sustain: 0.01,
  release: 0.5,
  baseFrequency: 350,
  octaves: 1
});
filterEnv.connect(filter.frequency);

// Resonant highpass filter with slow modulation
const highpass = new Tone.Filter({
  frequency: 500,
  type: "highpass",
  rolloff: -24
});

const noteStackGain = new Tone.Gain(1);

// 0.2 Hz LFO to sweep highpass cutoff
const highpassLfo = new Tone.LFO({
  frequency: 0.15,
  min: 250,
  max: 500
});
highpassLfo.connect(highpass.frequency);
highpassLfo.start();

// Phaser effect
const phaser = new Tone.Phaser({
  frequency: 0.5,
  stages: 4,
  depth: 1,
  wet: 0.5
});


// Overdrive/distortion effect
const overdrive = new Tone.Distortion({
  distortion: 0.05,
  wet: 0.2
});


// ---------------- CUSTOM DELAY (FILTERED + SATURATED FEEDBACK) ----------------

const delay = new Tone.Delay("8n.");
const feedbackGain = new Tone.Gain(0.45);
const delayFilter = new Tone.Filter({
  type: "bandpass",
  frequency: 1000,
  rolloff: -24,
  Q: 0
});
const delayWet = new Tone.Gain(0.35);

const delay2 = new Tone.PingPongDelay("8n", 0.6);
delay2.wet.value = 0.4;

// Slowly modulate both delay feedback values together.
const delayFeedbackLfo = new Tone.LFO({
  frequency: 0.05,
  min: 0.25,
  max: 0.90
});

// NEW: smoothed application
Tone.Transport.scheduleRepeat(() => {
  const v = delayFeedbackLfo.value;
  feedbackGain.gain.rampTo(v, 0.05);
  delay2.feedback.rampTo(1 - v, 0.05);
}, "16n");

// delayFeedbackLfo.connect(feedbackGain.gain);

// Invert the same LFO for delay2 so when delay1 feedback is high, delay2 is low.
const invertedDelayFeedback = new Tone.Multiply(-1);
const shiftedDelayFeedback = new Tone.Add(1);
delayFeedbackLfo.connect(invertedDelayFeedback);
invertedDelayFeedback.connect(shiftedDelayFeedback);
// shiftedDelayFeedback.connect(delay2.feedback);

delayFeedbackLfo.start();

const reverb = new Tone.Reverb({
  decay: 2.5,
  wet: 0.16
});

// Chorus effect
const chorus = new Tone.Chorus({
  frequency: 15,
  delayTime: 1.5,
  depth: 0.2,
  wet: 0.5
});

// Master volume control (default 40%)
const volumeControl = new Tone.Gain(0.3);

// 6.2 Hz vibrato applied to all synth output
const vibrato = new Tone.Vibrato({
  frequency: 6.2,
  depth: 0.12
});
vibrato.wet.value = 1;

let vibratoDepth = 0.12;
function setVibratoDepth(v) {
  if (vibrato.depth && typeof vibrato.depth.value === "number") {
    vibrato.depth.value = v;
  } else {
    vibrato.depth = v;
  }
}
setVibratoDepth(vibratoDepth);

// Drift (amount) modulates vibrato depth at 0.1 Hz
const DRIFT_HZ = 0.1;
let driftAmount = 0;
let driftPhase = 0;
let lastDriftTime = performance.now();

const driftEl = document.getElementById("drift");
if (driftEl) {
  driftAmount = 0.12;
  driftEl.setAttribute("aria-pressed", "true");
  driftEl.textContent = "On";
  driftEl.onclick = () => {
    const isOn = driftEl.getAttribute("aria-pressed") === "true";
    const newState = !isOn;
    driftEl.setAttribute("aria-pressed", newState ? "true" : "false");
    driftEl.textContent = `${newState ? "On" : "Off"}`;
    driftAmount = newState ? 0.12 : 0;
    if (window.posthog) posthog.capture('drift_toggled', { state: newState ? "on" : "off", value: driftAmount });
  };
}

const volumeEl = document.getElementById("volume");
if (volumeEl) {
  volumeEl.value = "0.4";
  volumeEl.oninput = (e) => {
    volumeControl.gain.value = parseFloat(e.target.value) || 0;
    if (window.posthog) posthog.capture('volume_changed', { value: volumeControl.gain.value });
  };
}

const DRIFT_TRIGGER_THRESHOLD = 0.3;
const driftMax = 0.12; // fixed max for threshold calculation

function isDriftPastThreshold() {
  return driftMax > 0 && (driftAmount / driftMax) > DRIFT_TRIGGER_THRESHOLD;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function ensureAudioContext() {
  if (!Tone.context) return;

  try {
    if (Tone.context.state !== "running") {
      await Tone.start();
    }

    if (Tone.context.state === "suspended" && Tone.context.resume) {
      await Tone.context.resume();
    }
  } catch (error) {
    console.debug("Audio context resume failed:", error);
  }
}

function unlockAudioContext() {
  ensureAudioContext().catch(() => {
    // ignore failures until a valid user gesture occurs
  });
}

function driftTick(now) {
  const dt = (now - lastDriftTime) / 1000;
  lastDriftTime = now;

  driftPhase += dt * DRIFT_HZ * Math.PI * 2;

  const normalized = (Math.sin(driftPhase) + 1) / 2;
  const depth = driftAmount > 0
    ? normalized * 0.12
    : 0;

  setVibratoDepth(depth);

  requestAnimationFrame(driftTick);
}

requestAnimationFrame(driftTick);


if (typeof window !== "undefined") {
  const unlockOptions = { once: true, passive: true };
  document.documentElement.addEventListener("pointerdown", unlockAudioContext, unlockOptions);
  document.documentElement.addEventListener("touchstart", unlockAudioContext, unlockOptions);
  document.documentElement.addEventListener("touchend", unlockAudioContext, unlockOptions);
  document.documentElement.addEventListener("mousedown", unlockAudioContext, unlockOptions);
  document.documentElement.addEventListener("click", unlockAudioContext, unlockOptions);
  document.documentElement.addEventListener("keydown", unlockAudioContext, { once: true });
}

// // Create multiple LFOs with random depth for per-voice modulation
// const lfoPool = Array.from({ length: 8 }, () => {
//   const lfo = new Tone.LFO({
//     frequency: 6.2,
//     min: -50,
//     max: 50
//   });
//   lfo.start();
//   return lfo;
// });

// let lfoIndex = 0;


// Fast square LFO for clearly audible octave jumps (-12 or +12 semitones).
const octaveLfo = new Tone.LFO({
  type: "square",
  frequency: 8,
  min: 0,
  max: 24,
  phase: -90
});
octaveLfo.start();

const limiter = new Tone.Limiter(-20); // ceiling at -1 dB

synth.volume.value = 0;

synth.chain(vibrato, highpass, noteStackGain, overdrive, filter, phaser, chorus, delay);

delay.connect(delayWet);
delay.connect(delayFilter);
delayFilter.connect(feedbackGain);
feedbackGain.connect(delay);
delayWet.connect(delay2);
delay2.chain(reverb, limiter, volumeControl, Tone.Destination);
// 

// Noise layer routed through the same FX chain.
const noise = new Tone.Noise("pink");
const noiseGain = new Tone.Gain(0);
noise.connect(noiseGain);
noiseGain.connect(vibrato);

// ~30 second cycle from silence to just under the main synth level.
const noiseLevelLfo = new Tone.LFO({
  frequency: 1 / 30,
  min: 0,
  max: 0.18,
  phase: -90
});
noiseLevelLfo.connect(noiseGain.gain);
noiseLevelLfo.start();

// ---------------- FIXED NOTES ----------------

const rows = [
  { note: "C4", el: document.getElementById("seq-top"), steps: [] },
  { note: "G3", el: document.getElementById("seq-mid"), steps: [] },
  { note: "C3", el: document.getElementById("seq-bot"), steps: [] }
];

// ---------------- STATE ----------------

let stepIndex = 0;
let octaveChance = 0.5;
let fifthChance = 0.2;
let noteEventCount = 0; // counts triggered note events
let lastStartTime = 0;
const STOP_LOCK_MS = 1000; // 1 second

// ---------------- INIT ----------------

rows.forEach(row => {
  row.steps = new Array(8).fill(false);
});

// Set bottom row, first step to ON by default
rows[2].steps[0] = true;
rows[1].steps[0] = true;
rows[1].steps[3] = true;
rows[0].steps[6] = true;

renderAll();

// ---------------- UI ----------------

function renderAll() {
  rows.forEach(row => {
    if (!row.el) return; // prevent crash if any row element is missing
    row.el.innerHTML = "";

    row.steps.forEach((active, i) => {
      const div = document.createElement("div");
      div.className = "step";
      if (active) div.classList.add("active");
      div.setAttribute("role", "button");
      div.setAttribute("tabindex", "0");
      div.setAttribute("aria-pressed", active ? "true" : "false");
      div.setAttribute("aria-label", `Step ${i + 1} ${active ? "on" : "off"}`);

      const toggleStep = () => {
        row.steps[i] = !row.steps[i];
        div.classList.toggle("active");
        div.setAttribute("aria-pressed", row.steps[i] ? "true" : "false");
        div.setAttribute("aria-label", `Step ${i + 1} ${row.steps[i] ? "on" : "off"}`);
        if (window.posthog) posthog.capture('sequencer_step_toggled', { row_note: row.note, step_index: i, active: row.steps[i] });
      };

      div.addEventListener("click", toggleStep);
      div.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleStep();
        }
      });

      row.el.appendChild(div);
    });
  });
}

function swapRandomSequencerBlock() {
  const activeBlocks = [];
  const inactiveBlocks = [];

  rows.forEach((row, rowIndex) => {
    row.steps.forEach((isActive, stepIndexInRow) => {
      const pos = { rowIndex, stepIndexInRow };
      if (isActive) {
        activeBlocks.push(pos);
      } else {
        inactiveBlocks.push(pos);
      }
    });
  });

  const swapCount = Math.min(2, activeBlocks.length, inactiveBlocks.length);
  if (swapCount === 0) return;

  const firstColumn = 0;
  const firstColumnHasActive = rows.some(row => row.steps[firstColumn]);
  const shouldForceFirstColumnActivation = !firstColumnHasActive;

  for (let i = 0; i < swapCount; i += 1) {
    const activeIndex = Math.floor(Math.random() * activeBlocks.length);

    let inactiveIndex = Math.floor(Math.random() * inactiveBlocks.length);
    if (shouldForceFirstColumnActivation && i === 0) {
      const firstColumnCandidates = inactiveBlocks
        .map((pos, idx) => ({ pos, idx }))
        .filter(({ pos }) => pos.stepIndexInRow === firstColumn);

      if (firstColumnCandidates.length > 0) {
        const forced = firstColumnCandidates[Math.floor(Math.random() * firstColumnCandidates.length)];
        inactiveIndex = forced.idx;
      }
    }

    const randomActive = activeBlocks.splice(activeIndex, 1)[0];
    const randomInactive = inactiveBlocks.splice(inactiveIndex, 1)[0];

    rows[randomActive.rowIndex].steps[randomActive.stepIndexInRow] = false;
    rows[randomInactive.rowIndex].steps[randomInactive.stepIndexInRow] = true;
  }
}

// ---------------- OCTAVE ----------------

function maybeShift(note, step) {
  // 8-step pattern => valid indexes are 0..7
  if (step === 0 && Math.random() < octaveChance) {
    return Tone.Frequency(note).transpose(12).toNote();
  }
  return note;
}

function maybeFifth(note, step) {
  // 8-step pattern => valid indexes are 0..7
  if (step === 0 && Math.random() < fifthChance) {
    return Tone.Frequency(note).transpose(7).toNote();
  }
  return note;
}

function buildMinor7(rootNote) {
  return [
    rootNote,
    // Tone.Frequency(rootNote).transpose(3).toNote(),   // minor 3rd
    Tone.Frequency(rootNote).transpose(7).toNote(),   // 5th
    // Tone.Frequency(rootNote).transpose(10).toNote()   // minor 7th
  ]; 
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function getStackedNoteGain(activeCount) {
  if (activeCount === 2) return dbToGain(-3);
  if (activeCount >= 3) return dbToGain(-6);
  return 1;
}

// function applyOctaveLfoEvery10th(notes) {
//   const semis = octaveLfo.value >= 0 ? 12 : -12; // square state: -12 or +12
//   return notes.map(n => Tone.Frequency(n).transpose(semis).toNote());
// }

// ---------------- SEQUENCER ----------------

Tone.Transport.bpm.rampTo(125); // targetBpm, seconds

const loop = new Tone.Loop(time => {
  let playedThisStep = false;
  const activeRowCount = rows.reduce((count, row) => (
    row.steps[stepIndex] ? count + 1 : count
  ), 0);

  noteStackGain.gain.setValueAtTime(
    getStackedNoteGain(activeRowCount),
    time
  );

  rows.forEach(row => {
    if (!row.el) return;
    const divs = row.el.querySelectorAll(".step");

    divs.forEach(d => d.classList.remove("playing"));
    if (divs[stepIndex]) divs[stepIndex].classList.add("playing");

    if (row.steps[stepIndex]) {
      const root = maybeShift(row.note, stepIndex);
      const chord = buildMinor7(root);
      const drift = Number.isFinite(driftLfo?.value) ? driftLfo.value : 0;
      const finalChord = chord.map(note => maybeFifth(note, stepIndex));
      const modulatedChord = finalChord;
      const noiseAmount = driftAmount * 5;
      const spreadAmount = 5;

      const driftedChord = finalChord.map((note, i) => {
      // centered voice spread
      const centerOffset = i - (finalChord.length - 1) / 2;
      const spread = centerOffset * spreadAmount;

      // noise jitter
      const noise = getSmoothNoise(noiseAmount);

      let totalCents = drift + noise + spread;

    // 🔴 CRITICAL GUARD
      if (!Number.isFinite(totalCents)) totalCents = 0;

      const freq = Tone.Frequency(note).transpose(totalCents / 100);

      // 🔴 SECOND GUARD
      if (!Number.isFinite(freq.toFrequency())) return note;

      return Tone.Frequency(note)
        .transpose(totalCents / 100)
        .toNote();
      });
      
      synth.triggerAttackRelease(driftedChord, "4n", time);
      playedThisStep = true;
    }
  });

  if (playedThisStep) {
    if (Number.isFinite(time)) {
  filterEnv.triggerAttackRelease("8n", time);
}
  }

  stepIndex = (stepIndex + 1) % 8;
}, "8n");

const blockSwapLoop = new Tone.Loop(time => {
  if (!isDriftPastThreshold()) return;

  swapRandomSequencerBlock();
  Tone.Draw.schedule(() => {
    renderAll();
  }, time);
}, "8m");

// ---------------- CONTROLS ----------------

// document.getElementById("octave").oninput = e => {
  // octaveChance = parseFloat(e.target.value);
// };

// document.getElementById("filter").oninput = e => {
//   filter.frequency.value = parseFloat(e.target.value);
// };

// ---------------- TRANSPORT ----------------

let isOn = false;
let noiseOn = false;
const toggleBtn = document.getElementById("toggle");

toggleBtn.onclick = async () => {
  await ensureAudioContext();

  const now = performance.now();

  if (!isOn) {
    // START
    lastStartTime = now;

toggleBtn.disabled = true;
setTimeout(() => {
  toggleBtn.disabled = false;
}, STOP_LOCK_MS);

    if (!noiseOn) {
      noise.start();
      noiseOn = true;
    }
    Tone.Transport.cancel();
    stepIndex = 0;

    loop.start();
    blockSwapLoop.start();

    Tone.Transport.start();
    isOn = true;
    toggleBtn.innerText = "Stop";
    toggleBtn.setAttribute("aria-pressed", "true");
    toggleBtn.setAttribute("aria-label", "Stop");
    
    if (window.posthog) posthog.capture('synth_started');
  } else {
    // STOP (guarded)
    if (now - lastStartTime < STOP_LOCK_MS) {
      return; // ignore accidental stop
    }

    Tone.Transport.stop();
    Tone.Transport.cancel();
    loop.stop();
    blockSwapLoop.stop();
    if (noiseOn) {
      noise.stop();
      noiseOn = false;
    }
    isOn = false;
    toggleBtn.innerText = "Start";
    toggleBtn.setAttribute("aria-pressed", "false");
    toggleBtn.setAttribute("aria-label", "Start");
    if (window.posthog) posthog.capture('synth_stopped');
  }
};
