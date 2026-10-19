/**
 * TRỐNG ĐỒNG EVENT MEDIA STUDIO
 * Professional Audio & Video Cue Control System for School Events
 * Trường Cao Đẳng Long An • Đoàn Thanh Niên - Hội LHTN
 */

// ============================================================================
// 1. STATE & CONSTANTS
// ============================================================================
const STATE = {
  tracks: [],             // All loaded audio/video tracks
  activeTracks: new Set(),// Tracks currently playing
  playbackMode: 'solo',   // 'solo' or 'multi'
  masterVolume: 1.0,
  isDucking: false,
  duckingVolume: 0.25,
  fadeDuration: 2.0,      // seconds
  currentCueIndex: -1,
  cues: [],               // Cue list items
  hotkeyMap: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F'],
  stopwatch: {
    running: false,
    elapsedMs: 0,
    startTime: 0,
    timerId: null
  }
};

// Database Name for IndexedDB
const DB_NAME = 'TrongDongStudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'media_files';

// Stage Broadcast Channel
const stageChannel = new BroadcastChannel('trong_dong_event_channel');

// Web Audio API Context
let audioCtx = null;
let masterGain = null;
let duckingGain = null;
let analyser = null;
let visualizerDataArray = null;

function initAudioContext() {
  if (audioCtx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();

  // Create master node graph: TrackGain -> DuckingGain -> MasterGain -> Analyser -> Destination
  duckingGain = audioCtx.createGain();
  duckingGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(STATE.masterVolume, audioCtx.currentTime);

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;
  visualizerDataArray = new Uint8Array(analyser.frequencyBinCount);

  duckingGain.connect(masterGain);
  masterGain.connect(analyser);
  analyser.connect(audioCtx.destination);

  startVisualizerLoop();
}

// Ensure AudioContext is resumed on user gesture
document.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}, { once: true });


// ============================================================================
// 2. DOM ELEMENTS
// ============================================================================
const DOM = {
  // Clocks & Timers
  realTimeClock: document.getElementById('realTimeClock'),
  eventStopwatch: document.getElementById('eventStopwatch'),
  btnTimerToggle: document.getElementById('btnTimerToggle'),
  btnTimerReset: document.getElementById('btnTimerReset'),

  // Visualizer & Meters
  visualizerCanvas: document.getElementById('audioVisualizer'),
  meterL: document.getElementById('meterL'),
  meterR: document.getElementById('meterR'),

  // Master Section
  masterVolume: document.getElementById('masterVolume'),
  masterVolText: document.getElementById('masterVolText'),
  btnPanic: document.getElementById('btnPanic'),

  // Toolbar
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  padCountBadge: document.getElementById('padCountBadge'),
  cueCountBadge: document.getElementById('cueCountBadge'),
  btnModeSolo: document.getElementById('btnModeSolo'),
  btnModeMulti: document.getElementById('btnModeMulti'),
  btnDucking: document.getElementById('btnDucking'),
  btnFadeOutGlobal: document.getElementById('btnFadeOutGlobal'),
  fadeDurationSelect: document.getElementById('fadeDurationSelect'),
  btnOpenProjector: document.getElementById('btnOpenProjector'),
  fileMediaInput: document.getElementById('fileMediaInput'),
  filterCategory: document.getElementById('filterCategory'),
  btnClearAll: document.getElementById('btnClearAll'),

  // Soundboard
  padsContainer: document.getElementById('padsContainer'),
  emptyPadsNotice: document.getElementById('emptyPadsNotice'),
  btnLoadSampleDemo: document.getElementById('btnLoadSampleDemo'),

  // Cuelist
  cueTableBody: document.getElementById('cueTableBody'),
  btnPlayNextCue: document.getElementById('btnPlayNextCue'),
  btnResetCueStatus: document.getElementById('btnResetCueStatus'),
  btnAddCustomCue: document.getElementById('btnAddCustomCue'),

  // Presets
  builtInFxGrid: document.getElementById('builtInFxGrid'),

  // Video Stage Sidebar
  mainVideoPlayer: document.getElementById('mainVideoPlayer'),
  videoPreviewContainer: document.getElementById('videoPreviewContainer'),
  videoOverlayPlaceholder: document.getElementById('videoOverlayPlaceholder'),
  stageVideoSelect: document.getElementById('stageVideoSelect'),
  fileVideoOnlyInput: document.getElementById('fileVideoOnlyInput'),
  btnStagePlaySelected: document.getElementById('btnStagePlaySelected'),
  btnStageStopSelected: document.getElementById('btnStageStopSelected'),
  btnStageLoopToggle: document.getElementById('btnStageLoopToggle'),
  stagePlayingStatusBar: document.getElementById('stagePlayingStatusBar'),
  stageCurrentVideoName: document.getElementById('stageCurrentVideoName'),
  stageCurrentVideoTime: document.getElementById('stageCurrentVideoTime'),
  btnVideoFullscreen: document.getElementById('btnVideoFullscreen'),
  btnVideoPiP: document.getElementById('btnVideoPiP'),
  btnVideoMute: document.getElementById('btnVideoMute'),
  stageBannerText: document.getElementById('stageBannerText'),
  btnSendBanner: document.getElementById('btnSendBanner'),
  monitorStatus: document.getElementById('monitorStatus'),

  // Active Deck & Notes
  nowPlayingContainer: document.getElementById('nowPlayingContainer'),
  activeTrackCount: document.getElementById('activeTrackCount'),
  eventNotes: document.getElementById('eventNotes'),
  storageStatusText: document.getElementById('storageStatusText'),

  // Modal Cue
  cueModal: document.getElementById('cueModal'),
  modalCueTime: document.getElementById('modalCueTime'),
  modalCueTitle: document.getElementById('modalCueTitle'),
  modalCueTrackSelect: document.getElementById('modalCueTrackSelect'),
  modalCueNote: document.getElementById('modalCueNote'),
  btnSaveCueModal: document.getElementById('btnSaveCueModal'),
  btnCancelCueModal: document.getElementById('btnCancelCueModal'),
  btnCloseCueModal: document.getElementById('btnCloseCueModal')
};


// ============================================================================
// 3. REAL-TIME CLOCK & EVENT STOPWATCH
// ============================================================================
function updateRealTimeClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  DOM.realTimeClock.textContent = `${h}:${m}:${s}`;
}
setInterval(updateRealTimeClock, 1000);
updateRealTimeClock();

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function updateStopwatchDisplay() {
  let elapsed = STATE.stopwatch.elapsedMs;
  if (STATE.stopwatch.running) {
    elapsed += (Date.now() - STATE.stopwatch.startTime);
  }
  DOM.eventStopwatch.textContent = formatTime(elapsed);
}

DOM.btnTimerToggle.addEventListener('click', () => {
  if (STATE.stopwatch.running) {
    // Pause
    STATE.stopwatch.elapsedMs += (Date.now() - STATE.stopwatch.startTime);
    STATE.stopwatch.running = false;
    clearInterval(STATE.stopwatch.timerId);
    DOM.btnTimerToggle.textContent = '▶';
  } else {
    // Start
    STATE.stopwatch.startTime = Date.now();
    STATE.stopwatch.running = true;
    STATE.stopwatch.timerId = setInterval(updateStopwatchDisplay, 250);
    DOM.btnTimerToggle.textContent = '⏸';
  }
});

DOM.btnTimerReset.addEventListener('click', () => {
  if (STATE.stopwatch.running) {
    clearInterval(STATE.stopwatch.timerId);
    STATE.stopwatch.running = false;
    DOM.btnTimerToggle.textContent = '▶';
  }
  STATE.stopwatch.elapsedMs = 0;
  updateStopwatchDisplay();
});


// ============================================================================
// 4. AUDIO VISUALIZER & DUAL PEAK METERS
// ============================================================================
function startVisualizerLoop() {
  const canvas = DOM.visualizerCanvas;
  const ctx = canvas.getContext('2d');

  function renderFrame() {
    requestAnimationFrame(renderFrame);
    if (!analyser || !visualizerDataArray) return;

    analyser.getByteFrequencyData(visualizerDataArray);

    ctx.fillStyle = '#060910';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / analyser.frequencyBinCount) * 1.5;
    let x = 0;
    let sum = 0;

    for (let i = 0; i < analyser.frequencyBinCount; i++) {
      const val = visualizerDataArray[i];
      sum += val;
      const barHeight = (val / 255) * canvas.height;

      // Gradient color from green to cyan to gold
      const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
      grad.addColorStop(0, '#10B981');
      grad.addColorStop(0.6, '#06B6D4');
      grad.addColorStop(1, '#F59E0B');

      ctx.fillStyle = grad;
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
      x += barWidth;
    }

    // Update Peak level meters (L & R)
    const avgLevel = (sum / (analyser.frequencyBinCount * 255)) * 100;
    const lLevel = Math.min(100, avgLevel * (STATE.activeTracks.size > 0 ? 1.4 : 0));
    const rLevel = Math.min(100, avgLevel * (STATE.activeTracks.size > 0 ? 1.3 : 0));
    DOM.meterL.style.height = `${lLevel}%`;
    DOM.meterR.style.height = `${rLevel}%`;
  }

  renderFrame();
}


// ============================================================================
// 5. MASTER CONTROLS & DUCKING & FADE
// ============================================================================
DOM.masterVolume.addEventListener('input', (e) => {
  STATE.masterVolume = parseFloat(e.target.value);
  DOM.masterVolText.textContent = `${Math.round(STATE.masterVolume * 100)}%`;
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(STATE.masterVolume, audioCtx.currentTime);
  }
});

// Mode buttons: Solo vs Multi
DOM.btnModeSolo.addEventListener('click', () => {
  STATE.playbackMode = 'solo';
  DOM.btnModeSolo.classList.add('active');
  DOM.btnModeMulti.classList.remove('active');
});

DOM.btnModeMulti.addEventListener('click', () => {
  STATE.playbackMode = 'multi';
  DOM.btnModeMulti.classList.add('active');
  DOM.btnModeSolo.classList.remove('active');
});

// MC Ducking Button
function setDucking(enabled) {
  STATE.isDucking = enabled;
  DOM.btnDucking.classList.toggle('active', enabled);
  const ind = DOM.btnDucking.querySelector('.duck-indicator');
  if (ind) ind.textContent = enabled ? '-75%' : 'OFF';

  if (!duckingGain || !audioCtx) return;
  const targetGain = enabled ? STATE.duckingVolume : 1.0;
  duckingGain.gain.cancelScheduledValues(audioCtx.currentTime);
  duckingGain.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 0.15);
}

DOM.btnDucking.addEventListener('click', () => {
  setDucking(!STATE.isDucking);
});

// Fade duration select
DOM.fadeDurationSelect.addEventListener('change', (e) => {
  STATE.fadeDuration = parseFloat(e.target.value);
});

// Fade Out Global
DOM.btnFadeOutGlobal.addEventListener('click', () => {
  fadeOutAllActiveTracks(STATE.fadeDuration);
});

function fadeOutAllActiveTracks(duration = 2.0) {
  if (STATE.activeTracks.size === 0) return;
  const fadeEnd = audioCtx ? audioCtx.currentTime + duration : 0;

  STATE.activeTracks.forEach(track => {
    if (track.gainNode && audioCtx) {
      track.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      track.gainNode.gain.linearRampToValueAtTime(0.001, fadeEnd);
    }
  });

  setTimeout(() => {
    stopAllMedia();
  }, duration * 1000);
}

// Panic Button (Stop All)
DOM.btnPanic.addEventListener('click', () => {
  stopAllMedia();
});

function stopAllMedia() {
  STATE.tracks.forEach(track => {
    pauseOrStopTrack(track, true);
  });
  STATE.activeTracks.clear();

  // Stop video preview & stage projector
  DOM.mainVideoPlayer.pause();
  DOM.mainVideoPlayer.removeAttribute('src');
  DOM.mainVideoPlayer.load();
  DOM.mainVideoPlayer.style.display = 'none';
  DOM.videoOverlayPlaceholder.style.display = 'flex';
  DOM.monitorStatus.textContent = 'SẴN SÀNG';

  stageChannel.postMessage({ type: 'STOP_VIDEO' });

  updateActiveDeckUI();
}


// ============================================================================
// 6. TRACK PLAYBACK ENGINE (AUDIO & VIDEO)
// ============================================================================
function ensureMediaElement(track) {
  if (track.mediaEl) return track.mediaEl;
  initAudioContext();

  const el = document.createElement(track.type === 'video' ? 'video' : 'audio');
  el.src = track.url;
  el.loop = !!track.loop;
  el.preload = 'auto';

  // Hook Web Audio Node
  if (audioCtx) {
    try {
      const sourceNode = audioCtx.createMediaElementSource(el);
      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(track.volume || 1.0, audioCtx.currentTime);

      sourceNode.connect(gainNode);
      gainNode.connect(duckingGain);

      track.sourceNode = sourceNode;
      track.gainNode = gainNode;
    } catch (err) {
      console.warn('Media element source warning:', err);
    }
  }

  track.mediaEl = el;

  // Progress updates
  el.addEventListener('timeupdate', () => {
    if (!track.isDraggingProgress) {
      updatePadProgress(track);
    }
  });

  el.addEventListener('ended', () => {
    pauseOrStopTrack(track, true);
  });

  return el;
}

function playTrack(track) {
  initAudioContext();

  // If in SOLO mode, stop other tracks
  if (STATE.playbackMode === 'solo') {
    STATE.tracks.forEach(other => {
      if (other.id !== track.id && STATE.activeTracks.has(other)) {
        pauseOrStopTrack(other, true);
      }
    });
  }

  ensureMediaElement(track);

  // Handle Video
  if (track.type === 'video') {
    DOM.mainVideoPlayer.src = track.url;
    DOM.mainVideoPlayer.muted = true; // Mute preview to prevent echo with Web Audio API
    DOM.mainVideoPlayer.currentTime = track.mediaEl.currentTime || 0;
    DOM.mainVideoPlayer.loop = !!track.loop;
    DOM.mainVideoPlayer.style.display = 'block';
    DOM.videoOverlayPlaceholder.style.display = 'none';
    DOM.monitorStatus.textContent = 'TRÌNH CHIẾU';

    DOM.mainVideoPlayer.play().catch(e => console.log('Video error:', e));

    if (DOM.stageVideoSelect) DOM.stageVideoSelect.value = track.id;
    if (DOM.stagePlayingStatusBar) DOM.stagePlayingStatusBar.classList.add('is-live');
    if (DOM.stageCurrentVideoName) DOM.stageCurrentVideoName.textContent = 'Đang chiếu: ' + track.name;
    if (DOM.btnStagePlaySelected) DOM.btnStagePlaySelected.innerHTML = '⏸ Tạm Dừng';
    if (DOM.btnStageLoopToggle) DOM.btnStageLoopToggle.classList.toggle('active', !!track.loop);

    stageChannel.postMessage({
      type: 'PLAY_VIDEO',
      url: track.url,
      currentTime: track.mediaEl.currentTime || 0,
      loop: !!track.loop
    });
  }

  // Restore gain if faded out previously
  track.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
  track.gainNode.gain.setValueAtTime(track.volume || 1.0, audioCtx.currentTime);

  track.mediaEl.play().then(() => {
    track.isPlaying = true;
    STATE.activeTracks.add(track);
    updatePadUI(track);
    updateActiveDeckUI();
  }).catch(err => {
    console.error('Play error:', err);
  });
}

function pauseOrStopTrack(track, resetToStart = false) {
  if (track.mediaEl) {
    track.mediaEl.pause();
    if (resetToStart) {
      track.mediaEl.currentTime = 0;
      updatePadProgress(track);
    }
  }

  if (track.type === 'video') {
    DOM.mainVideoPlayer.pause();
    if (resetToStart) {
      DOM.mainVideoPlayer.removeAttribute('src');
      DOM.mainVideoPlayer.load();
      DOM.mainVideoPlayer.style.display = 'none';
      DOM.videoOverlayPlaceholder.style.display = 'flex';
      DOM.monitorStatus.textContent = 'SẴN SÀNG';
      if (DOM.stagePlayingStatusBar) DOM.stagePlayingStatusBar.classList.remove('is-live');
      if (DOM.stageCurrentVideoName) DOM.stageCurrentVideoName.textContent = 'Màn hình chờ (Logo Trống Đồng)';
      if (DOM.stageCurrentVideoTime) DOM.stageCurrentVideoTime.textContent = '--:--';
      if (DOM.btnStagePlaySelected) DOM.btnStagePlaySelected.innerHTML = '▶ Chiếu Video';
      stageChannel.postMessage({ type: 'STOP_VIDEO' });
    } else {
      DOM.monitorStatus.textContent = 'TẠM DỪNG';
      if (DOM.btnStagePlaySelected) DOM.btnStagePlaySelected.innerHTML = '▶ Tiếp Tục Chiếu';
      stageChannel.postMessage({ type: 'PAUSE_VIDEO' });
    }
  }

  track.isPlaying = false;
  STATE.activeTracks.delete(track);
  updatePadUI(track);
  updateActiveDeckUI();
}

function toggleTrack(track) {
  if (track.isPlaying) {
    pauseOrStopTrack(track, false);
  } else {
    playTrack(track);
  }
}

function fadeOutTrack(track, duration = 2.0) {
  if (!track.isPlaying || !track.gainNode || !audioCtx) return;
  const fadeEnd = audioCtx.currentTime + duration;
  track.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
  track.gainNode.gain.linearRampToValueAtTime(0.001, fadeEnd);

  setTimeout(() => {
    pauseOrStopTrack(track, true);
  }, duration * 1000);
}


// ============================================================================
// 7. SOUNDBOARD PADS RENDERING & UI UPDATES
// ============================================================================
function renderPads() {
  DOM.padsContainer.innerHTML = '';
  const filter = DOM.filterCategory.value;

  const filteredTracks = STATE.tracks.filter(t => {
    if (filter === 'all') return true;
    return t.category === filter;
  });

  DOM.padCountBadge.textContent = STATE.tracks.length;
  DOM.emptyPadsNotice.style.display = STATE.tracks.length === 0 ? 'flex' : 'none';

  filteredTracks.forEach((track, index) => {
    const pad = document.createElement('div');
    pad.className = `pad-card ${track.isPlaying ? 'is-playing' : ''}`;
    pad.id = `pad-${track.id}`;
    pad.dataset.id = track.id;
    pad.dataset.cat = track.category || 'ceremony';

    const hotkey = STATE.hotkeyMap[index] || '';

    pad.innerHTML = `
      <div class="pad-top">
        <span class="pad-hotkey-badge">[${hotkey || index + 1}]</span>
        <span class="pad-type-badge">${track.type === 'video' ? '🎬 VIDEO' : '🎵 AUDIO'} • ${getCategoryName(track.category)}</span>
      </div>

      <div class="pad-title-box">
        <h4 class="pad-title" title="${track.name}">${track.name}</h4>
        <div class="pad-meta">
          <span class="pad-time-current" id="pad-time-${track.id}">00:00</span>
          <span>/</span>
          <span class="pad-time-total">${track.durationStr || '--:--'}</span>
        </div>
      </div>

      <div class="pad-progress-wrapper" id="pad-progress-${track.id}" title="Nhấn hoặc kéo chuột để tua bài">
        <div class="pad-progress-track">
          <div class="pad-progress-bar" id="pad-bar-${track.id}"></div>
          <div class="pad-progress-handle" id="pad-handle-${track.id}"></div>
        </div>
        <div class="pad-progress-tooltip" id="pad-tip-${track.id}">00:00</div>
      </div>

      <div class="pad-actions">
        <button class="btn-pad-play" id="btn-play-${track.id}">
          <span class="play-icon">${track.isPlaying ? '⏸' : '▶'}</span>
          <span class="play-label">${track.isPlaying ? 'Tạm Dừng' : 'Phát'}</span>
        </button>

        <button class="btn-pad-tool ${track.loop ? 'active' : ''}" id="btn-loop-${track.id}" title="Bật/Tắt Lặp lại">
          🔁
        </button>

        <button class="btn-pad-tool" id="btn-fade-${track.id}" title="Fade Out bài này (2s)">
          📉
        </button>

        <div class="pad-vol-box" title="Âm lượng bài này">
          <input type="range" class="pad-vol-slider" min="0" max="1" step="0.05" value="${track.volume || 1}" id="vol-${track.id}">
        </div>

        <button class="btn-pad-tool" id="btn-del-${track.id}" title="Xóa bài này">
          ✕
        </button>
      </div>
    `;

    // Event Listeners for Pad
    const btnPlay = pad.querySelector(`#btn-play-${track.id}`);
    btnPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTrack(track);
    });

    const btnLoop = pad.querySelector(`#btn-loop-${track.id}`);
    btnLoop.addEventListener('click', (e) => {
      e.stopPropagation();
      track.loop = !track.loop;
      if (track.mediaEl) track.mediaEl.loop = track.loop;
      btnLoop.classList.toggle('active', track.loop);
    });

    const btnFade = pad.querySelector(`#btn-fade-${track.id}`);
    btnFade.addEventListener('click', (e) => {
      e.stopPropagation();
      fadeOutTrack(track, STATE.fadeDuration);
    });

    const volSlider = pad.querySelector(`#vol-${track.id}`);
    volSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseFloat(e.target.value);
      track.volume = val;
      if (track.gainNode && audioCtx) {
        track.gainNode.gain.setValueAtTime(val, audioCtx.currentTime);
      }
    });

    const btnDel = pad.querySelector(`#btn-del-${track.id}`);
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTrack(track.id);
    });

    // Setup interactive scrubber (kéo tua tới lui)
    const progressWrapper = pad.querySelector(`#pad-progress-${track.id}`);
    if (progressWrapper) {
      setupPadProgressScrubber(progressWrapper, track);
    }

    // Clicking pad body toggles play
    pad.addEventListener('click', () => {
      toggleTrack(track);
    });

    DOM.padsContainer.appendChild(pad);

    // Sync initial progress if track is already loaded or playing
    if (track.mediaEl && track.mediaEl.currentTime > 0) {
      updatePadProgress(track);
    }
  });
}

function updatePadUI(track) {
  const pad = document.getElementById(`pad-${track.id}`);
  if (!pad) return;

  pad.classList.toggle('is-playing', track.isPlaying);
  const btnPlay = pad.querySelector(`#btn-play-${track.id}`);
  if (btnPlay) {
    btnPlay.querySelector('.play-icon').textContent = track.isPlaying ? '⏸' : '▶';
    btnPlay.querySelector('.play-label').textContent = track.isPlaying ? 'Tạm Dừng' : 'Phát';
  }
}

function getTrackDuration(track) {
  if (track.mediaEl && isFinite(track.mediaEl.duration) && track.mediaEl.duration > 0) {
    return track.mediaEl.duration;
  }
  if (track.durationSec && track.durationSec > 0) {
    return track.durationSec;
  }
  if (track.durationStr && track.durationStr.includes(':')) {
    const parts = track.durationStr.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
  }
  return 0;
}

function setupPadProgressScrubber(wrapper, track) {
  const bar = wrapper.querySelector('.pad-progress-bar');
  const handle = wrapper.querySelector('.pad-progress-handle');
  const tip = wrapper.querySelector('.pad-progress-tooltip');

  function formatSec(sec) {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function seekFromEvent(clientX) {
    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dur = getTrackDuration(track);
    const targetTime = dur > 0 ? ratio * dur : 0;

    ensureMediaElement(track);

    if (track.mediaEl) {
      track.mediaEl.currentTime = targetTime;
    }

    if (track.type === 'video') {
      DOM.mainVideoPlayer.currentTime = targetTime;
      stageChannel.postMessage({
        type: 'SEEK_VIDEO',
        currentTime: targetTime
      });
    }

    const percent = ratio * 100;
    if (bar) bar.style.width = `${percent}%`;
    if (handle) handle.style.left = `${percent}%`;
    if (tip) {
      tip.style.left = `${percent}%`;
      tip.textContent = formatSec(targetTime);
    }

    const timeText = document.getElementById(`pad-time-${track.id}`);
    if (timeText) {
      timeText.textContent = formatSec(targetTime);
    }

    if (track.type === 'video' && DOM.stageCurrentVideoTime) {
      DOM.stageCurrentVideoTime.textContent = `${formatSec(targetTime)} / ${track.durationStr || '--:--'}`;
    }
  }

  // Prevent clicking on the progress bar from triggering pad card play/pause
  wrapper.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Hover effect to preview timestamp in tooltip
  wrapper.addEventListener('mousemove', (e) => {
    if (track.isDraggingProgress) return;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = getTrackDuration(track);
    const targetTime = dur > 0 ? ratio * dur : 0;
    if (tip) {
      tip.style.left = `${ratio * 100}%`;
      tip.textContent = formatSec(targetTime);
    }
  });

  // Drag scrubber with Mouse
  wrapper.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();

    track.isDraggingProgress = true;
    wrapper.classList.add('is-scrubbing');
    seekFromEvent(e.clientX);

    function onMouseMove(moveEvt) {
      if (!track.isDraggingProgress) return;
      seekFromEvent(moveEvt.clientX);
    }

    function onMouseUp() {
      track.isDraggingProgress = false;
      wrapper.classList.remove('is-scrubbing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  // Drag scrubber with Touch (Mobile / Touchscreen laptops)
  wrapper.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    if (!e.touches || e.touches.length === 0) return;

    track.isDraggingProgress = true;
    wrapper.classList.add('is-scrubbing');
    seekFromEvent(e.touches[0].clientX);

    function onTouchMove(moveEvt) {
      if (!track.isDraggingProgress || !moveEvt.touches || moveEvt.touches.length === 0) return;
      seekFromEvent(moveEvt.touches[0].clientX);
    }

    function onTouchEnd() {
      track.isDraggingProgress = false;
      wrapper.classList.remove('is-scrubbing');
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    }

    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
  }, { passive: false });
}

function updatePadProgress(track) {
  if (!track.mediaEl || track.isDraggingProgress) return;
  const current = track.mediaEl.currentTime || 0;
  const dur = getTrackDuration(track) || (track.mediaEl.duration || 1);
  const percent = Math.min(100, Math.max(0, (current / dur) * 100));

  const bar = document.getElementById(`pad-bar-${track.id}`);
  if (bar) bar.style.width = `${percent}%`;

  const handle = document.getElementById(`pad-handle-${track.id}`);
  if (handle) handle.style.left = `${percent}%`;

  const timeText = document.getElementById(`pad-time-${track.id}`);
  if (timeText) {
    const curMin = Math.floor(current / 60);
    const curSec = Math.floor(current % 60);
    timeText.textContent = `${String(curMin).padStart(2, '0')}:${String(curSec).padStart(2, '0')}`;
  }

  // If this is the active video, update the stage monitor time display
  if (track.type === 'video' && track.isPlaying) {
    if (DOM.stageCurrentVideoTime && timeText) {
      DOM.stageCurrentVideoTime.textContent = `${timeText.textContent} / ${track.durationStr || '--:--'}`;
    }
  }
}

function getCategoryName(cat) {
  const map = {
    ceremony: 'Nghi Lễ',
    welcome: 'Chào Mừng',
    award: 'Trao Giải',
    bgm: 'Nhạc Nền',
    performance: 'Văn Nghệ',
    fx: 'Hiệu Ứng'
  };
  return map[cat] || 'Khác';
}

function autoDetectCategory(filename) {
  const f = filename.toLowerCase();
  if (f.includes('quoc ca') || f.includes('doan ca') || f.includes('chao co') || f.includes('nghi le') || f.includes('doi ca')) {
    return 'ceremony';
  }
  if (f.includes('chao mung') || f.includes('don khach') || f.includes('khai mac') || f.includes('hoi nghi')) {
    return 'welcome';
  }
  if (f.includes('trao thuong') || f.includes('khen thuong') || f.includes('trao giai') || f.includes('vinh danh')) {
    return 'award';
  }
  if (f.includes('nen') || f.includes('bgm') || f.includes('mc') || f.includes('phat bieu') || f.includes('nhe nhang')) {
    return 'bgm';
  }
  if (f.includes('vo tay') || f.includes('applause') || f.includes('fx') || f.includes('chuong') || f.includes('kèn') || f.includes('trong')) {
    return 'fx';
  }
  return 'performance';
}


// ============================================================================
// 8. ACTIVE DECK (NOW PLAYING) SIDEBAR
// ============================================================================
function updateActiveDeckUI() {
  DOM.activeTrackCount.textContent = `${STATE.activeTracks.size} bài đang chạy`;

  if (STATE.activeTracks.size === 0) {
    DOM.nowPlayingContainer.innerHTML = `
      <div class="no-playing-message">
        <span>Chưa có âm thanh nào đang phát</span>
      </div>
    `;
    return;
  }

  DOM.nowPlayingContainer.innerHTML = '';
  STATE.activeTracks.forEach(track => {
    const item = document.createElement('div');
    item.className = 'active-deck-item is-playing';
    item.innerHTML = `
      <div class="active-deck-top">
        <span class="active-deck-title">${track.name}</span>
        <button class="btn-pad-tool" id="deck-stop-${track.id}" title="Dừng bài này">⏹</button>
      </div>
      <div class="active-deck-top">
        <span class="active-deck-time" id="deck-time-${track.id}">${track.durationStr}</span>
        <button class="btn-pad-tool" id="deck-fade-${track.id}" title="Fade out bài này">📉 Fade</button>
      </div>
    `;

    item.querySelector(`#deck-stop-${track.id}`).addEventListener('click', () => {
      pauseOrStopTrack(track, true);
    });

    item.querySelector(`#deck-fade-${track.id}`).addEventListener('click', () => {
      fadeOutTrack(track, STATE.fadeDuration);
    });

    DOM.nowPlayingContainer.appendChild(item);
  });
}


// ============================================================================
// 9. BATCH FILE UPLOAD & INDEXEDDB PERSISTENCE
// ============================================================================
DOM.fileMediaInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  for (const file of files) {
    await processAndAddFile(file);
  }

  DOM.fileMediaInput.value = '';
  renderPads();
  updateCueTrackSelectOptions();
  updateStageVideoDropdown();
});

// Drag & drop support on whole body
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        await processAndAddFile(file);
      }
    }
    renderPads();
    updateCueTrackSelectOptions();
    updateStageVideoDropdown();
  }
});

async function processAndAddFile(file) {
  const id = 'trk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const type = file.type.startsWith('video/') ? 'video' : 'audio';
  const url = URL.createObjectURL(file);
  const category = autoDetectCategory(file.name);

  // Get duration
  const durInfo = await getMediaDuration(url, type);
  const durationStr = durInfo.str || '--:--';
  const durationSec = durInfo.sec || 0;

  const trackObj = {
    id,
    name: file.name.replace(/\.[^/.]+$/, ""),
    fileName: file.name,
    type,
    url,
    category,
    durationStr,
    durationSec,
    volume: 1.0,
    loop: false,
    isPlaying: false
  };

  STATE.tracks.push(trackObj);

  // Save to IndexedDB
  saveFileToDB(id, file, trackObj);
}

function getMediaDuration(url, type) {
  return new Promise((resolve) => {
    const el = document.createElement(type === 'video' ? 'video' : 'audio');
    el.src = url;
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const dur = el.duration;
      if (!isFinite(dur)) {
        resolve({ str: '--:--', sec: 0 });
      } else {
        const min = Math.floor(dur / 60);
        const sec = Math.floor(dur % 60);
        resolve({
          str: `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
          sec: dur
        });
      }
    };
    el.onerror = () => resolve({ str: '--:--', sec: 0 });
  });
}

function deleteTrack(id) {
  const index = STATE.tracks.findIndex(t => t.id === id);
  if (index !== -1) {
    const track = STATE.tracks[index];
    pauseOrStopTrack(track, true);
    STATE.tracks.splice(index, 1);
    deleteFileFromDB(id);
    renderPads();
    updateCueTrackSelectOptions();
    updateStageVideoDropdown();
  }
}

DOM.btnClearAll.addEventListener('click', () => {
  if (confirm('Bạn có chắc chắn muốn xóa toàn bộ danh sách âm thanh/video đã tải lên?')) {
    stopAllMedia();
    STATE.tracks = [];
    clearDB();
    renderPads();
    updateCueTrackSelectOptions();
    updateStageVideoDropdown();
  }
});

// Category Filter Change
DOM.filterCategory.addEventListener('change', () => {
  renderPads();
});


// ============================================================================
// 10. INDEXEDDB IMPLEMENTATION
// ============================================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

async function saveFileToDB(id, fileBlob, metadata) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      id,
      blob: fileBlob,
      metadata: {
        name: metadata.name,
        fileName: metadata.fileName,
        type: metadata.type,
        category: metadata.category,
        durationStr: metadata.durationStr,
        volume: metadata.volume,
        loop: metadata.loop
      }
    });
    DOM.storageStatusText.textContent = `Đã lưu ${STATE.tracks.length} file vào bộ nhớ`;
  } catch (e) {
    console.warn('IndexedDB save failed:', e);
  }
}

async function loadFilesFromDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result || [];
      if (items.length > 0) {
        items.forEach(item => {
          const url = URL.createObjectURL(item.blob);
          STATE.tracks.push({
            id: item.id,
            name: item.metadata.name,
            fileName: item.metadata.fileName,
            type: item.metadata.type,
            url,
            category: item.metadata.category,
            durationStr: item.metadata.durationStr,
            volume: item.metadata.volume || 1.0,
            loop: !!item.metadata.loop,
            isPlaying: false
          });
        });
        renderPads();
        updateCueTrackSelectOptions();
        updateStageVideoDropdown();
        DOM.storageStatusText.textContent = `Đã khôi phục ${items.length} file từ phiên trước`;
      }
    };
  } catch (e) {
    console.log('No prior database or load error:', e);
  }
}

async function deleteFileFromDB(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  } catch (e) {}
}

async function clearDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    DOM.storageStatusText.textContent = 'Bộ nhớ đã làm trống';
  } catch (e) {}
}


// ============================================================================
// 11. CUE LIST / EVENT SEQUENCE
// ============================================================================
const DEFAULT_CUES = [
  { id: 'c1', time: '07:30', title: 'Đón tiếp đại biểu & Ổn định chỗ ngồi', trackId: '', note: 'Bật nhạc nền không lời rộn ràng', status: 'waiting' },
  { id: 'c2', time: '07:45', title: 'Văn nghệ chào mừng (Các tiết mục Đoàn trường)', trackId: '', note: 'Theo kịch bản đội văn nghệ', status: 'waiting' },
  { id: 'c3', time: '08:00', title: 'Nghi thức Chào Cờ (Quốc ca & Đoàn ca)', trackId: '', note: 'Âm lượng 100%, dứt khoát', status: 'waiting' },
  { id: 'c4', time: '08:15', title: 'Tuyên bố lý do & Giới thiệu đại biểu tham dự', trackId: '', note: 'Bấm nhạc vỗ tay / Fanfare ngắn', status: 'waiting' },
  { id: 'c5', time: '08:30', title: 'Báo cáo tổng kết & Phát biểu của Ban Giám Hiệu', trackId: '', note: 'Hạ nhạc nền khi bắt đầu nói', status: 'waiting' },
  { id: 'c6', time: '09:00', title: 'Lễ Khen thưởng & Trao học bổng sinh viên', trackId: '', note: 'Nhạc trao giải trang trọng, hào hùng', status: 'waiting' },
  { id: 'c7', time: '09:30', title: 'Bế mạc sự kiện & Nhạc tiễn khách', trackId: '', note: 'Nhạc tươi vui, chào tạm biệt', status: 'waiting' }
];

STATE.cues = JSON.parse(localStorage.getItem('trong_dong_cues')) || DEFAULT_CUES;

function renderCueList() {
  DOM.cueTableBody.innerHTML = '';
  DOM.cueCountBadge.textContent = STATE.cues.length;

  STATE.cues.forEach((cue, index) => {
    const row = document.createElement('tr');
    row.className = `cue-row ${cue.status === 'playing' ? 'is-current' : ''} ${cue.status === 'done' ? 'is-done' : ''}`;
    row.id = `cue-row-${cue.id}`;

    const attachedTrack = STATE.tracks.find(t => t.id === cue.trackId);
    const trackLabel = attachedTrack ? `🎵 ${attachedTrack.name}` : '<em style="color:#64748b">(Chưa gán)</em>';

    row.innerHTML = `
      <td><strong>${index + 1}</strong></td>
      <td><span style="font-family:var(--font-mono);font-weight:700;color:var(--cyan-primary)">${cue.time}</span></td>
      <td>
        <strong>${cue.title}</strong>
        ${cue.note ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${cue.note}</div>` : ''}
      </td>
      <td>${trackLabel}</td>
      <td><span style="font-family:var(--font-mono)">${attachedTrack ? attachedTrack.durationStr : '--:--'}</span></td>
      <td>
        <span class="cue-status-tag ${cue.status}">
          ${cue.status === 'playing' ? 'ĐANG CHẠY' : cue.status === 'done' ? 'ĐÃ XONG' : 'ĐANG CHỜ'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn-primary" style="padding:4px 8px;font-size:11px;" id="btn-cue-go-${cue.id}" title="Phát mục này">
            ▶ Chạy
          </button>
          <button class="btn-secondary" style="padding:4px 8px;font-size:11px;" id="btn-cue-done-${cue.id}" title="Đánh dấu đã xong">
            ✓
          </button>
          <button class="btn-secondary" style="padding:4px 6px;font-size:11px;color:var(--red-panic)" id="btn-cue-del-${cue.id}" title="Xóa mục này">
            ✕
          </button>
        </div>
      </td>
    `;

    row.querySelector(`#btn-cue-go-${cue.id}`).addEventListener('click', () => {
      runCue(index);
    });

    row.querySelector(`#btn-cue-done-${cue.id}`).addEventListener('click', () => {
      cue.status = 'done';
      saveCuesToStorage();
      renderCueList();
    });

    row.querySelector(`#btn-cue-del-${cue.id}`).addEventListener('click', () => {
      STATE.cues.splice(index, 1);
      saveCuesToStorage();
      renderCueList();
    });

    DOM.cueTableBody.appendChild(row);
  });
}

function runCue(index) {
  if (index < 0 || index >= STATE.cues.length) return;
  STATE.currentCueIndex = index;

  STATE.cues.forEach((c, idx) => {
    if (idx < index) c.status = 'done';
    else if (idx === index) c.status = 'playing';
    else c.status = 'waiting';
  });

  const cue = STATE.cues[index];
  if (cue.trackId) {
    const track = STATE.tracks.find(t => t.id === cue.trackId);
    if (track) {
      playTrack(track);
    }
  }

  saveCuesToStorage();
  renderCueList();
}

DOM.btnPlayNextCue.addEventListener('click', () => {
  const nextIdx = STATE.currentCueIndex + 1;
  if (nextIdx < STATE.cues.length) {
    runCue(nextIdx);
  } else {
    alert('Đã hoàn thành toàn bộ kịch bản chương trình sự kiện!');
  }
});

DOM.btnResetCueStatus.addEventListener('click', () => {
  STATE.currentCueIndex = -1;
  STATE.cues.forEach(c => c.status = 'waiting');
  saveCuesToStorage();
  renderCueList();
});

function saveCuesToStorage() {
  localStorage.setItem('trong_dong_cues', JSON.stringify(STATE.cues));
}

function updateCueTrackSelectOptions() {
  DOM.modalCueTrackSelect.innerHTML = '<option value="">(Không phát nhạc)</option>';
  STATE.tracks.forEach(track => {
    const opt = document.createElement('option');
    opt.value = track.id;
    const maxLen = 35;
    const shortName = track.name.length > maxLen ? track.name.substring(0, maxLen) + '...' : track.name;
    opt.textContent = `${shortName} (${track.type === 'video' ? 'Video' : 'Audio'})`;
    opt.title = track.name;
    DOM.modalCueTrackSelect.appendChild(opt);
  });
}

// Modal Cue Handlers
DOM.btnAddCustomCue.addEventListener('click', () => {
  DOM.modalCueTime.value = '';
  DOM.modalCueTitle.value = '';
  DOM.modalCueNote.value = '';
  DOM.modalCueTrackSelect.value = '';
  DOM.cueModal.classList.add('open');
});

DOM.btnCancelCueModal.addEventListener('click', () => DOM.cueModal.classList.remove('open'));
DOM.btnCloseCueModal.addEventListener('click', () => DOM.cueModal.classList.remove('open'));

DOM.btnSaveCueModal.addEventListener('click', () => {
  const title = DOM.modalCueTitle.value.trim();
  if (!title) {
    alert('Vui lòng nhập tên nội dung hoặc tiết mục sự kiện!');
    return;
  }

  STATE.cues.push({
    id: 'cue_' + Date.now(),
    time: DOM.modalCueTime.value.trim() || '--:--',
    title,
    trackId: DOM.modalCueTrackSelect.value,
    note: DOM.modalCueNote.value.trim(),
    status: 'waiting'
  });

  saveCuesToStorage();
  renderCueList();
  DOM.cueModal.classList.remove('open');
});


// ============================================================================
// 12. BUILT-IN SYNTHESIZED WEB AUDIO FX PRESETS
// ============================================================================
const BUILT_IN_FX = [
  {
    id: 'fx_applause',
    name: 'Tiếng Vỗ Tay (Applause)',
    icon: '👏',
    desc: 'Hiệu ứng tiếng vỗ tay rộn ràng chúc mừng đại biểu & tiết mục',
    trigger: playSynthesizedApplause
  },
  {
    id: 'fx_drumroll',
    name: 'Hồi Trống Hội (Drum Roll)',
    icon: '🥁',
    desc: 'Hồi trống giục giã dồn dập chuẩn bị công bố kết quả',
    trigger: playSynthesizedDrumRoll
  },
  {
    id: 'fx_fanfare',
    name: 'Kèn Fanfare Trao Giải',
    icon: '🎺',
    desc: 'Âm kèn đồng hào hùng khi đại biểu bước lên sân khấu nhận giải',
    trigger: playSynthesizedFanfare
  },
  {
    id: 'fx_chime',
    name: 'Tiếng Chuông Bắt Đầu',
    icon: '🔔',
    desc: 'Tiếng chuông ngân vang báo hiệu chương trình bắt đầu',
    trigger: playSynthesizedChime
  },
  {
    id: 'fx_suspense',
    name: 'Hồi Hộp / Đếm Ngược',
    icon: '⏳',
    desc: 'Nhịp đập trầm căng thẳng đếm ngược khoảnh khắc quan trọng',
    trigger: playSynthesizedSuspense
  },
  {
    id: 'fx_success',
    name: 'Bingo / Đúng Rồi',
    icon: '✨',
    desc: 'Âm thanh tươi sáng khi đội thi trả lời chính xác',
    trigger: playSynthesizedSuccess
  },
  {
    id: 'fx_buzzer',
    name: 'Buzzer / Sai Rồi',
    icon: '❌',
    desc: 'Âm báo động trầm khi trả lời sai hoặc hết thời gian',
    trigger: playSynthesizedBuzzer
  }
];

function renderBuiltInFx() {
  DOM.builtInFxGrid.innerHTML = '';
  BUILT_IN_FX.forEach(fx => {
    const card = document.createElement('div');
    card.className = 'fx-card';
    card.innerHTML = `
      <span class="fx-icon">${fx.icon}</span>
      <h4 class="fx-name">${fx.name}</h4>
      <p class="fx-desc">${fx.desc}</p>
    `;
    card.addEventListener('click', () => {
      initAudioContext();
      fx.trigger();
    });
    DOM.builtInFxGrid.appendChild(card);
  });
}

// 1. Synthesized Applause
function playSynthesizedApplause() {
  const duration = 3.5;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);

  // Generate shaped noise bursts
  for (let i = 0; i < bufferSize; i++) {
    const t = i / audioCtx.sampleRate;
    const envelope = Math.sin((t / duration) * Math.PI);
    // Random claps density modulation
    const clapMod = Math.random() > 0.85 ? 1.5 : 0.5;
    data[i] = (Math.random() * 2 - 1) * envelope * clapMod * 0.35;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  filter.Q.value = 1.2;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.8, audioCtx.currentTime);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(duckingGain);

  noise.start();
}

// 2. Synthesized Drum Roll
function playSynthesizedDrumRoll() {
  const now = audioCtx.currentTime;
  const numHits = 24;
  for (let i = 0; i < numHits; i++) {
    const time = now + (i * 0.08);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140 - (i * 2), time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.07);

    gain.gain.setValueAtTime((i / numHits) * 0.4 + 0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);

    osc.connect(gain);
    gain.connect(duckingGain);

    osc.start(time);
    osc.stop(time + 0.08);
  }

  // Final big cymbal/thump hit
  const finalTime = now + (numHits * 0.08);
  const bigOsc = audioCtx.createOscillator();
  const bigGain = audioCtx.createGain();
  bigOsc.type = 'sine';
  bigOsc.frequency.setValueAtTime(120, finalTime);
  bigOsc.frequency.exponentialRampToValueAtTime(30, finalTime + 0.8);
  bigGain.gain.setValueAtTime(0.8, finalTime);
  bigGain.gain.exponentialRampToValueAtTime(0.001, finalTime + 0.8);

  bigOsc.connect(bigGain);
  bigGain.connect(duckingGain);
  bigOsc.start(finalTime);
  bigOsc.stop(finalTime + 0.8);
}

// 3. Synthesized Brass Fanfare
function playSynthesizedFanfare() {
  const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
  const chords = [
    { freq: 261.63, time: 0, dur: 0.2 },
    { freq: 329.63, time: 0.2, dur: 0.2 },
    { freq: 392.00, time: 0.4, dur: 0.2 },
    { freq: 523.25, time: 0.6, dur: 1.2 }
  ];

  chords.forEach(c => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(c.freq, audioCtx.currentTime + c.time);

    gain.gain.setValueAtTime(0, audioCtx.currentTime + c.time);
    gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + c.time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + c.time + c.dur);

    osc.connect(gain);
    gain.connect(duckingGain);
    osc.start(audioCtx.currentTime + c.time);
    osc.stop(audioCtx.currentTime + c.time + c.dur);
  });
}

// 4. Synthesized Chime Bell
function playSynthesizedChime() {
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1760, audioCtx.currentTime); // A6

  gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 2.5);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(duckingGain);

  osc1.start();
  osc2.start();
  osc1.stop(audioCtx.currentTime + 2.5);
  osc2.stop(audioCtx.currentTime + 2.5);
}

// 5. Synthesized Suspense Ticking
function playSynthesizedSuspense() {
  const now = audioCtx.currentTime;
  for (let i = 0; i < 4; i++) {
    const time = now + (i * 0.5);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(60, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);

    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(duckingGain);
    osc.start(time);
    osc.stop(time + 0.15);
  }
}

// 6. Synthesized Success Ping
function playSynthesizedSuccess() {
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const start = audioCtx.currentTime + (i * 0.08);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);

    osc.connect(gain);
    gain.connect(duckingGain);
    osc.start(start);
    osc.stop(start + 0.6);
  });
}

// 7. Synthesized Buzzer
function playSynthesizedBuzzer() {
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(130.81, audioCtx.currentTime); // C3

  osc2.type = 'square';
  osc2.frequency.setValueAtTime(138.59, audioCtx.currentTime); // C#3 (Dissonant clash)

  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(duckingGain);

  osc1.start();
  osc2.start();
  osc1.stop(audioCtx.currentTime + 0.8);
  osc2.stop(audioCtx.currentTime + 0.8);
}


// ============================================================================
// 13. STAGE MONITOR & PROJECTOR CONTROLS
// ============================================================================
function updateStageVideoDropdown() {
  if (!DOM.stageVideoSelect) return;
  const currentVal = DOM.stageVideoSelect.value;
  DOM.stageVideoSelect.innerHTML = '<option value="">-- Chọn video muốn chiếu --</option>';
  const videoTracks = STATE.tracks.filter(t => t.type === 'video');
  videoTracks.forEach(vt => {
    const opt = document.createElement('option');
    opt.value = vt.id;
    const maxLen = 32;
    const shortName = vt.name.length > maxLen ? vt.name.substring(0, maxLen) + '...' : vt.name;
    opt.textContent = `🎬 ${shortName}`;
    opt.title = vt.name;
    DOM.stageVideoSelect.appendChild(opt);
  });
  if (currentVal && videoTracks.some(t => t.id === currentVal)) {
    DOM.stageVideoSelect.value = currentVal;
  }
}

// Play / Pause selected video button
if (DOM.btnStagePlaySelected) {
  DOM.btnStagePlaySelected.addEventListener('click', () => {
    // Check if a video is currently playing
    const activeVideo = Array.from(STATE.activeTracks).find(t => t.type === 'video');
    if (activeVideo) {
      if (activeVideo.isPlaying) {
        pauseOrStopTrack(activeVideo, false);
      } else {
        playTrack(activeVideo);
      }
      return;
    }

    // Otherwise play video from dropdown
    let trackId = DOM.stageVideoSelect ? DOM.stageVideoSelect.value : '';
    const videoTracks = STATE.tracks.filter(t => t.type === 'video');

    if (!trackId && videoTracks.length > 0) {
      trackId = videoTracks[0].id;
      if (DOM.stageVideoSelect) DOM.stageVideoSelect.value = trackId;
    }

    if (!trackId) {
      alert('Chưa có video nào được chọn! Bạn vui lòng bấm nút "➕ Thêm" để tải video lên.');
      return;
    }

    const track = STATE.tracks.find(t => t.id === trackId);
    if (track) {
      playTrack(track);
    }
  });
}

// Stop video and return to standby logo
if (DOM.btnStageStopSelected) {
  DOM.btnStageStopSelected.addEventListener('click', () => {
    const activeVideo = Array.from(STATE.activeTracks).find(t => t.type === 'video');
    if (activeVideo) {
      pauseOrStopTrack(activeVideo, true);
    } else {
      // Force reset stage monitor and projector screen
      DOM.mainVideoPlayer.pause();
      DOM.mainVideoPlayer.removeAttribute('src');
      DOM.mainVideoPlayer.load();
      DOM.mainVideoPlayer.style.display = 'none';
      DOM.videoOverlayPlaceholder.style.display = 'flex';
      DOM.monitorStatus.textContent = 'SẴN SÀNG';
      if (DOM.stagePlayingStatusBar) DOM.stagePlayingStatusBar.classList.remove('is-live');
      if (DOM.stageCurrentVideoName) DOM.stageCurrentVideoName.textContent = 'Màn hình chờ (Logo Trống Đồng)';
      if (DOM.stageCurrentVideoTime) DOM.stageCurrentVideoTime.textContent = '--:--';
      if (DOM.btnStagePlaySelected) DOM.btnStagePlaySelected.innerHTML = '▶ Chiếu Video';
      stageChannel.postMessage({ type: 'STOP_VIDEO' });
    }
  });
}

// Toggle Loop on stage video
if (DOM.btnStageLoopToggle) {
  DOM.btnStageLoopToggle.addEventListener('click', () => {
    let trackId = DOM.stageVideoSelect ? DOM.stageVideoSelect.value : '';
    const activeVideo = Array.from(STATE.activeTracks).find(t => t.type === 'video');
    const track = activeVideo || STATE.tracks.find(t => t.id === trackId);
    if (track) {
      track.loop = !track.loop;
      if (track.mediaEl) track.mediaEl.loop = track.loop;
      DOM.mainVideoPlayer.loop = track.loop;
      DOM.btnStageLoopToggle.classList.toggle('active', track.loop);
      // Notify stage
      stageChannel.postMessage({
        type: 'PLAY_VIDEO',
        url: track.url,
        currentTime: track.mediaEl ? track.mediaEl.currentTime : 0,
        loop: track.loop
      });
    }
  });
}

// Select video from dropdown change
if (DOM.stageVideoSelect) {
  DOM.stageVideoSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    const track = STATE.tracks.find(t => t.id === val);
    if (track) {
      playTrack(track);
    }
  });
}

// Quick video uploader button on stage card
if (DOM.fileVideoOnlyInput) {
  DOM.fileVideoOnlyInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await processAndAddFile(file);
    renderPads();
    updateCueTrackSelectOptions();
    updateStageVideoDropdown();

    // Immediately play the freshly added video on stage
    const newlyAdded = STATE.tracks[STATE.tracks.length - 1];
    if (newlyAdded && newlyAdded.type === 'video') {
      playTrack(newlyAdded);
    }
    DOM.fileVideoOnlyInput.value = '';
  });
}

// Drag & drop directly onto the video preview container
if (DOM.videoPreviewContainer) {
  DOM.videoPreviewContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.videoPreviewContainer.style.borderColor = 'var(--cyan-primary)';
  });
  DOM.videoPreviewContainer.addEventListener('dragleave', () => {
    DOM.videoPreviewContainer.style.borderColor = '#1E293B';
  });
  DOM.videoPreviewContainer.addEventListener('drop', async (e) => {
    e.preventDefault();
    DOM.videoPreviewContainer.style.borderColor = '#1E293B';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        await processAndAddFile(file);
        renderPads();
        updateCueTrackSelectOptions();
        updateStageVideoDropdown();
        const newlyAdded = STATE.tracks[STATE.tracks.length - 1];
        if (newlyAdded) playTrack(newlyAdded);
      }
    }
  });
}

// Stage broadcast sync listener
stageChannel.onmessage = (event) => {
  if (event.data && event.data.type === 'STAGE_READY') {
    // Send current banner
    const text = DOM.stageBannerText.value.trim();
    if (text) {
      stageChannel.postMessage({ type: 'UPDATE_BANNER', text });
    }
    // If video is active, send current video state
    const activeVideo = Array.from(STATE.activeTracks).find(t => t.type === 'video');
    if (activeVideo && activeVideo.mediaEl) {
      stageChannel.postMessage({
        type: 'PLAY_VIDEO',
        url: activeVideo.url,
        currentTime: activeVideo.mediaEl.currentTime || 0
      });
    }
  }
};

DOM.btnOpenProjector.addEventListener('click', () => {
  const projectorWin = window.open('projector.html', 'TrongDongProjectorWindow', 'width=1280,height=720,menubar=no,toolbar=no,location=no');
  if (projectorWin) {
    projectorWin.focus();
  } else {
    alert('Trình duyệt đang chặn cửa sổ bật lên (Pop-up). Vui lòng cho phép pop-up để mở màn hình chiếu sân khấu!');
  }
});

DOM.btnSendBanner.addEventListener('click', () => {
  const text = DOM.stageBannerText.value.trim();
  if (text) {
    stageChannel.postMessage({ type: 'UPDATE_BANNER', text });
  }
});

DOM.stageBannerText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    DOM.btnSendBanner.click();
  }
});

DOM.btnVideoFullscreen.addEventListener('click', () => {
  if (DOM.mainVideoPlayer.requestFullscreen) {
    DOM.mainVideoPlayer.requestFullscreen();
  }
});

DOM.btnVideoPiP.addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (DOM.mainVideoPlayer.readyState >= 1) {
      await DOM.mainVideoPlayer.requestPictureInPicture();
    }
  } catch (err) {
    console.log('PiP not supported or video empty:', err);
  }
});

DOM.btnVideoMute.addEventListener('click', () => {
  DOM.mainVideoPlayer.muted = !DOM.mainVideoPlayer.muted;
  DOM.btnVideoMute.textContent = DOM.mainVideoPlayer.muted ? '🔇' : '🔊';
});


// ============================================================================
// 14. HOTKEYS / SHORTCUTS MANAGER
// ============================================================================
window.addEventListener('keydown', (e) => {
  // Ignore hotkeys when typing in text inputs or textarea
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    return;
  }

  // Panic Button: SPACE
  if (e.code === 'Space') {
    e.preventDefault();
    stopAllMedia();
    return;
  }

  // Toggle Ducking: 'M'
  if (e.key.toLowerCase() === 'm') {
    e.preventDefault();
    setDucking(!STATE.isDucking);
    return;
  }

  // Next Cue: 'N'
  if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    DOM.btnPlayNextCue.click();
    return;
  }

  // Fade out: 'F'
  if (e.key.toLowerCase() === 'f') {
    e.preventDefault();
    fadeOutAllActiveTracks(STATE.fadeDuration);
    return;
  }

  // Soundboard Pads Hotkeys: 1 - 9, Q, W, E...
  const key = e.key.toUpperCase();
  const padIndex = STATE.hotkeyMap.indexOf(key);

  if (padIndex !== -1 && padIndex < STATE.tracks.length) {
    e.preventDefault();
    toggleTrack(STATE.tracks[padIndex]);
  }
});


// ============================================================================
// 15. TABS NAVIGATION & SAMPLE DEMO
// ============================================================================
DOM.tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    DOM.tabBtns.forEach(b => b.classList.remove('active'));
    DOM.tabPanels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const tabTarget = btn.dataset.tab;
    if (tabTarget === 'soundboard') document.getElementById('tabSoundboard').classList.add('active');
    if (tabTarget === 'cuelist') document.getElementById('tabCueList').classList.add('active');
    if (tabTarget === 'presets') document.getElementById('tabPresets').classList.add('active');
  });
});

// Load Sample Demo Audio Pads (Synthesized Event Tracks)
DOM.btnLoadSampleDemo.addEventListener('click', () => {
  createSampleTracks();
});

function createSampleTracks() {
  initAudioContext();

  const samples = [
    { name: '01. Quốc Ca Việt Nam (Nghi thức)', cat: 'ceremony', dur: '01:45', tone: 440 },
    { name: '02. Đoàn Ca - Thanh Niên Làm Theo Lời Bác', cat: 'ceremony', dur: '02:10', tone: 523 },
    { name: '03. Nhạc Đón Khách - Hoan Ca Trường Học', cat: 'welcome', dur: '03:15', tone: 392 },
    { name: '04. Nhạc Nền MC Phát Biểu (Dịu Êm)', cat: 'bgm', dur: '04:00', tone: 330 },
    { name: '05. Nhạc Lễ Trao Thưởng & Khen Thưởng', cat: 'award', dur: '02:30', tone: 587 },
    { name: '06. Hồi Trống Hội Khai Mạc Năm Học', cat: 'ceremony', dur: '01:15', tone: 220 },
    { name: '07. Nhạc Tiết Mục Văn Nghệ Đoàn Trường', cat: 'performance', dur: '03:40', tone: 659 },
    { name: '08. Tiếng Vỗ Tay & Pháo Sân Khấu', cat: 'fx', dur: '00:15', tone: 880 }
  ];

  samples.forEach((sample, i) => {
    // Generate a pleasant synthetic audio track buffer
    const duration = 60; // 1 min playable demo
    const buffer = audioCtx.createBuffer(2, audioCtx.sampleRate * duration, audioCtx.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let j = 0; j < buffer.length; j++) {
      const t = j / audioCtx.sampleRate;
      // Gentle chord harmonics
      const s = Math.sin(2 * Math.PI * sample.tone * t) * 0.1
              + Math.sin(2 * Math.PI * (sample.tone * 1.25) * t) * 0.05
              + Math.sin(2 * Math.PI * (sample.tone * 1.5) * t) * 0.03;
      left[j] = s;
      right[j] = s;
    }

    const wavBlob = bufferToWaveBlob(buffer, buffer.length);
    const url = URL.createObjectURL(wavBlob);

    const p = sample.dur.split(':').map(Number);
    const durationSec = p[0] * 60 + p[1];

    const trackObj = {
      id: 'demo_' + (i + 1),
      name: sample.name,
      fileName: sample.name + '.wav',
      type: 'audio',
      url,
      category: sample.cat,
      durationStr: sample.dur,
      durationSec,
      volume: 1.0,
      loop: false,
      isPlaying: false
    };

    STATE.tracks.push(trackObj);
  });

  renderPads();
  updateCueTrackSelectOptions();
  alert('Đã nạp 8 bài nhạc mẫu sự kiện thành công! Bạn có thể nhấn phát ngay.');
}

// Convert AudioBuffer to WAV Blob for demo tracks
function bufferToWaveBlob(abuffer, len) {
  let numOfChan = abuffer.numberOfChannels,
      length = len * numOfChan * 2 + 44,
      out = new DataView(new ArrayBuffer(length)),
      channels = [], i, sample,
      offset = 0,
      pos = 0;

  function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  while (offset < len) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out], { type: 'audio/wav' });
}

// Event Notes auto-save
if (DOM.eventNotes) {
  DOM.eventNotes.value = localStorage.getItem('trong_dong_event_notes') || '';
  DOM.eventNotes.addEventListener('input', () => {
    localStorage.setItem('trong_dong_event_notes', DOM.eventNotes.value);
  });
}


// ============================================================================
// 16. INITIALIZATION
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  renderPads();
  renderCueList();
  renderBuiltInFx();
  loadFilesFromDB();
});
