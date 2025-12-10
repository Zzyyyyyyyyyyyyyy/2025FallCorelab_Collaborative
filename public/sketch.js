let socket;
let mic, amp, fft;
let micEnabled = false;
let inputGain = 1.0;
let prevA = 0;
let roomCode = '';
let username = '';

const GATE_THRESHOLD = 0.02;

let trailStrength = 0;
let soundAffectsSize = true;
let lastAudioData = { amplitude: 0, mid: 0, treble: 0, hue: 220, sat: 60, light: 50 };
let prevMouseX = 0;
let prevMouseY = 0;
let lastEmitX = 0;
let lastEmitY = 0;
let currentBrushMode = 'marker';
let brushSize = 30;

const BG_COLOR = [15, 15, 20];

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.parent('canvas-container');
  colorMode(RGB, 255, 255, 255, 1);
  background(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);

  if (typeof brush !== 'undefined') {
    brush.load();
    brush.scaleBrushes(1.5);
  }

  prevMouseX = width / 2;
  prevMouseY = height / 2;

  initRoom();
  initSocket();
  mic = new p5.AudioIn();
  initUI();
}

function draw() {
  if (trailStrength > 0) {
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);
    noStroke();
    fill(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2], trailStrength);
    rect(0, 0, width, height);
    pop();
  }

  const params = analyzeSound();

  if (mouseIsPressed) {
    const mx = mouseX - width / 2;
    const my = mouseY - height / 2;
    const pmx = prevMouseX - width / 2;
    const pmy = prevMouseY - height / 2;

    if (currentBrushMode === 'jitter') {
      const distance = dist(pmx, pmy, mx, my);
      const steps = Math.max(1, Math.floor(distance / 5));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = lerp(pmx, mx, t);
        const y = lerp(pmy, my, t);
        drawWithBrushMode(x, y, pmx, pmy, params);
      }
    } else {
      drawWithBrushMode(mx, my, pmx, pmy, params);
    }

    if (frameCount % 2 === 0) {
      emitStroke(mouseX, mouseY, lastEmitX, lastEmitY, params);
      lastEmitX = mouseX;
      lastEmitY = mouseY;
    }
  }

  prevMouseX = mouseX;
  prevMouseY = mouseY;
}

function analyzeSound() {
  const defaultParams = {
    size: brushSize,
    r: 100,
    g: 180,
    b: 220
  };

  if (!amp || !fft) return defaultParams;

  let A = amp.getLevel() * inputGain;
  A = min(lerp(prevA, A, 0.3), 0.5);
  prevA = A;

  const spectrum = fft.analyze();
  const mid = spectrum[16] || 0;
  const treble = spectrum[48] || 0;

  const hue = map(A, 0, 0.35, 220, 20, true);
  const sat = map(mid, 0, 255, 60, 100, true);
  const light = map(treble, 0, 255, 50, 85, true);

  lastAudioData = {
    amplitude: A,
    mid: mid,
    treble: treble,
    hue: hue,
    sat: sat,
    light: light
  };

  updateAudioPreview(A, mid, treble, hue, sat, light);

  if (A < GATE_THRESHOLD) return defaultParams;

  let dynamicSize = brushSize;
  if (soundAffectsSize) {
    dynamicSize = map(A, GATE_THRESHOLD, 0.4, brushSize * 0.5, brushSize * 2.5, true);
  }

  const rgb = hslToRgb(hue / 360, sat / 100, light / 100);
  return { size: dynamicSize, r: rgb.r, g: rgb.g, b: rgb.b };
}

function updateAudioPreview(amplitude, mid, treble, hue, sat, light) {
  const volumeBar = document.getElementById('volume-bar');
  const volumeValue = document.getElementById('volume-value');
  if (volumeBar && volumeValue) {
    const volumePercent = Math.min(amplitude / 0.4 * 100, 100);
    volumeBar.style.width = volumePercent + '%';
    volumeBar.style.backgroundColor = amplitude > GATE_THRESHOLD ? '#22c55e' : '#6b7280';
    volumeValue.textContent = Math.round(volumePercent) + '%';
  }

  const midBar = document.getElementById('mid-bar');
  const midValue = document.getElementById('mid-value');
  if (midBar && midValue) {
    midBar.style.width = (mid / 255 * 100) + '%';
    midValue.textContent = Math.round(mid);
  }

  const trebleBar = document.getElementById('treble-bar');
  const trebleValue = document.getElementById('treble-value');
  if (trebleBar && trebleValue) {
    trebleBar.style.width = (treble / 255 * 100) + '%';
    trebleValue.textContent = Math.round(treble);
  }

  const brushPreview = document.getElementById('brush-preview');
  if (brushPreview) {
    const rgb = hslToRgb(hue / 360, sat / 100, light / 100);
    brushPreview.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    let previewSize = 32;
    if (soundAffectsSize && amplitude > GATE_THRESHOLD) {
      previewSize = map(amplitude, GATE_THRESHOLD, 0.4, 24, 48, true);
    }
    brushPreview.style.width = previewSize + 'px';
    brushPreview.style.height = previewSize + 'px';
  }
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function drawJitteryBrush(x, y, { size, r, g, b }) {
  const jitterAmount = map(size, 5, 80, 1, 10, true);
  const jitterCount = Math.floor(map(size, 5, 80, 3, 8, true));

  blendMode(ADD);
  noStroke();

  for (let i = 0; i < jitterCount; i++) {
    const jx = x + random(-jitterAmount, jitterAmount);
    const jy = y + random(-jitterAmount, jitterAmount);
    const jSize = size * random(0.8, 1.2);

    fill(r, g, b, 0.05);
    circle(jx, jy, jSize * 1.5);
    fill(r, g, b, 0.15);
    circle(jx, jy, jSize);
    fill(r, g, b, 0.3);
    circle(jx, jy, jSize * 0.5);
  }

  blendMode(BLEND);
}

function drawWithBrushMode(x, y, px, py, params) {
  if (currentBrushMode === 'jitter') {
    drawJitteryBrush(x, y, params);
  } else if (currentBrushMode === 'watercolor') {
    drawWatercolorBlob(x, y, params);
  } else {
    drawP5BrushStroke(x, y, px, py, params, currentBrushMode);
  }
}

function drawP5BrushStroke(x, y, px, py, { size, r, g, b }, brushType) {
  if (typeof brush === 'undefined') {
    drawJitteryBrush(x, y, { size, r, g, b });
    return;
  }

  const brushColor = color(r, g, b);
  brush.set(brushType, brushColor, size / 10);

  const distance = dist(px, py, x, y);
  if (distance > 1) {
    brush.line(px, py, x, y);
  } else {
    brush.line(x, y, x + 0.5, y + 0.5);
  }
}

function drawWatercolorBlob(x, y, { size, r, g, b }) {
  if (typeof brush === 'undefined') {
    drawJitteryBrush(x, y, { size, r, g, b });
    return;
  }

  const brushColor = color(r, g, b);
  brush.fill(brushColor, 80);
  brush.bleed(0.15, "out");
  brush.fillTexture(0.5, 0.3);
  brush.noStroke();
  brush.circle(x, y, size * 1.5);
  brush.noFill();
}

function drawBrush(x, y, params) {
  const wx = x - width / 2;
  const wy = y - height / 2;
  const wpx = (params.px !== undefined ? params.px : x) - width / 2;
  const wpy = (params.py !== undefined ? params.py : y) - height / 2;

  let drawParams = params;
  if (params.hue !== undefined) {
    const rgb = hslToRgb(params.hue / 360, params.sat / 100, params.light / 100);
    drawParams = { size: params.size, r: rgb.r, g: rgb.g, b: rgb.b };
  }

  const remoteBrushMode = params.brushMode || 'jitter';

  if (remoteBrushMode === 'jitter') {
    const distance = dist(wpx, wpy, wx, wy);
    const steps = Math.max(1, Math.floor(distance / 5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ix = lerp(wpx, wx, t);
      const iy = lerp(wpy, wy, t);
      drawJitteryBrush(ix, iy, drawParams);
    }
  } else if (remoteBrushMode === 'watercolor') {
    drawWatercolorBlob(wx, wy, drawParams);
  } else {
    drawP5BrushStroke(wx, wy, wpx, wpy, drawParams, remoteBrushMode);
  }
}

function initRoom() {
  const params = new URLSearchParams(window.location.search);
  roomCode = params.get('room') || generateRoomCode();

  if (!params.get('room')) {
    history.replaceState(null, '', `?room=${roomCode}`);
  }

  username = localStorage.getItem('username') || 'Guest';

  const roomCodeEl = document.getElementById('room-code');
  if (roomCodeEl) roomCodeEl.textContent = roomCode;
  const usernameEl = document.getElementById('username-display');
  if (usernameEl) usernameEl.textContent = username;
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function initSocket() {
  socket = io();

  socket.on('connect', () => {
    socket.emit('join', { room: roomCode, username });
  });

  socket.on('user:joined', (data) => {
    console.log(`${data.username} joined`);
  });

  socket.on('room:info', (data) => {
    updateOnlineCount(data.userCount);
  });

  socket.on('room:count', (data) => {
    updateOnlineCount(data.count);
  });

  socket.on('sound:stroke', (data) => {
    drawBrush(data.x, data.y, data);
  });

  socket.on('sound:state', (data) => {});

  socket.on('canvas:clear', () => {
    background(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected');
  });
}

function emitStroke(x, y, px, py, params) {
  const data = { x, y, px, py, ...params, brushMode: currentBrushMode };
  socket.emit('sound:stroke', data);
}

function updateOnlineCount(count) {
  const counter = document.getElementById('online-count');
  if (counter) counter.textContent = count;
}

function initUI() {
  const micBtn = document.getElementById('mic-toggle');
  const micStatus = document.getElementById('mic-status');

  if (!micBtn || !micStatus) return;

  micBtn.addEventListener('click', async () => {
    if (!micEnabled) {
      try {
        micStatus.textContent = 'LOADING...';
        micBtn.disabled = true;

        await getAudioContext().resume();
        mic.start();
        await new Promise(resolve => setTimeout(resolve, 500));

        if (!amp) amp = new p5.Amplitude(0.7);
        if (!fft) fft = new p5.FFT(0.7, 64);

        amp.setInput(mic);
        fft.setInput(mic);

        micEnabled = true;
        micStatus.textContent = 'ON';
        micBtn.classList.add('bg-green-600');
        micBtn.classList.remove('bg-gray-700');
        micBtn.disabled = false;
      } catch (err) {
        console.error('Mic error:', err);
        micStatus.textContent = 'ERROR';
        micBtn.disabled = false;
        alert(`Microphone access failed: ${err.message}`);
      }
    } else {
      mic.stop();
      micEnabled = false;
      micStatus.textContent = 'OFF';
      micBtn.classList.remove('bg-green-600');
      micBtn.classList.add('bg-gray-700');
    }
  });

  const sizeSlider = document.getElementById('brush-size');
  const sizeValue = document.getElementById('brush-size-value');
  sizeSlider.addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
    sizeValue.textContent = brushSize;
  });

  const slider = document.getElementById('sensitivity');
  const sliderValue = document.getElementById('sensitivity-value');
  slider.addEventListener('input', (e) => {
    inputGain = parseFloat(e.target.value);
    sliderValue.textContent = inputGain.toFixed(1);
    socket.emit('sound:state', { gate: GATE_THRESHOLD, gain: inputGain });
  });

  const trailSlider = document.getElementById('trail-strength');
  const trailValue = document.getElementById('trail-value');
  if (trailSlider && trailValue) {
    trailSlider.addEventListener('input', (e) => {
      trailStrength = parseFloat(e.target.value);
      trailValue.textContent = trailStrength.toFixed(2);
    });
  }

  const brushModeSelect = document.getElementById('brush-mode');
  brushModeSelect.addEventListener('change', (e) => {
    currentBrushMode = e.target.value;
  });

  const clearBtn = document.getElementById('clear-btn');
  let clearCooldown = false;

  clearBtn.addEventListener('click', () => {
    if (clearCooldown) return;

    if (confirm('Clear canvas for all users?')) {
      background(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);
      socket.emit('canvas:clear');

      clearCooldown = true;
      clearBtn.disabled = true;
      clearBtn.classList.add('opacity-50', 'cursor-not-allowed');

      setTimeout(() => {
        clearCooldown = false;
        clearBtn.disabled = false;
        clearBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }, 500);
    }
  });

  const copyLinkBtn = document.getElementById('copy-link-btn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const originalText = copyLinkBtn.textContent;
        copyLinkBtn.textContent = '✓ Copied!';
        copyLinkBtn.classList.add('bg-green-600');
        copyLinkBtn.classList.remove('bg-blue-700');
        setTimeout(() => {
          copyLinkBtn.textContent = originalText;
          copyLinkBtn.classList.remove('bg-green-600');
          copyLinkBtn.classList.add('bg-blue-700');
        }, 2000);
      } catch (err) {
        alert('Failed to copy: ' + window.location.href);
      }
    });
  }

  const usernameDisplay = document.getElementById('username-display');
  if (usernameDisplay) {
    usernameDisplay.addEventListener('click', () => {
      const newUsername = prompt('Enter your username:', username);
      if (newUsername && newUsername.trim()) {
        username = newUsername.trim();
        localStorage.setItem('username', username);
        usernameDisplay.textContent = username;
        socket.emit('join', { room: roomCode, username });
      }
    });
  }
}

function mousePressed() {
  lastEmitX = mouseX;
  lastEmitY = mouseY;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  background(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);
  if (typeof brush !== 'undefined') brush.load();
}
