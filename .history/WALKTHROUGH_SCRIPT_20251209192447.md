# Sound Paint - Code Walkthrough Script

## Part 1: Introduction

Hi everyone! Today I'm going to walk you through the core code of my **Sound Paint** project. This is a collaborative web application where multiple users can paint together on a shared canvas, and the cool part is — your voice and sounds control the brush! So basically, the idea is that when you make sounds into your microphone, it changes the color and size of your brush strokes in real-time.

I'm going to focus on three main files that really showcase what I learned in web development and creative coding — they're the heart of the application:

1. **`server.js`** - The backend server that handles real-time communication
2. **`public/sketch.js`** - The p5.js sketch that does all the audio analysis and drawing
3. **`public/index.html`** - The user interface with all the controls

Let me show you how everything works together.

---

## Part 2: Non-Technical Overview - How the Application Works

Before we dive into the code, let me explain how this application works using some everyday analogies.

### First, the "Walkie-Talkie Station" (Server)

Think of the server like a **walkie-talkie base station**. When multiple people are in the same "room," the base station makes sure everyone can hear each other. If I draw something, the station broadcasts my drawing to everyone else in the room. If someone else draws, I receive their strokes too. It's like a group chat, but for paintbrush movements!

### Second, the "Sound-to-Color Translator" (Audio Analysis)

This is like having a **magical paintbrush** that listens to your voice. Imagine if your paintbrush could understand:
- **How loud you are** → determines the brush size and color warmth (loud = big brush, warm colors like red/orange; quiet = small brush, cool colors like blue)
- **The tone of your voice** → determines how vibrant and bright the colors are

It's like the brush is dancing to your voice!

### Third, the "Control Panel" (User Interface)

This is simply the **dashboard** where you can adjust settings — like choosing different brush styles (marker, watercolor, pencil), adjusting sensitivity, and seeing a live preview of what your sound is producing.

### How They Work Together

```
Your Voice → Microphone → Audio Analysis → Brush Parameters
                                              ↓
                                         Draw on Canvas
                                              ↓
                                    Send to Server (Socket.io)
                                              ↓
                                    Broadcast to Other Users
                                              ↓
                                    They See Your Strokes!
```

Alright, now let's look at the actual code...

---

## Part 3: Detailed Code Walkthrough

---

### File 1: `server.js` - The Real-Time Communication Hub

This is the backend server that manages all the real-time collaboration. Let me walk through it section by section.

#### Lines 1-8: Setting Up the Server

```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
```

Okay, so here I'm importing all the necessary libraries. I chose **Express** because it's the most popular web framework for Node.js — super easy to set up. And then **Socket.io** is the magic that makes real-time communication possible. You know, normally HTTP is like sending letters back and forth, but Socket.io is like having an open phone line — instant communication!

I'm creating an HTTP server and wrapping it with Socket.io. This pattern is pretty standard for real-time apps.

#### Lines 10-12: Configuration

```javascript
const PORT = process.env.PORT || 3005;
app.use(express.static(path.join(__dirname, 'public')));
```

Here I'm setting the port to 3005 by default, but it can be overridden by environment variables — which is useful for deployment. The `express.static` line tells Express to serve all the files in the `public` folder. So when someone visits the website, they get the HTML, CSS, and JavaScript files automatically.

#### Lines 14-28: Handling User Connections and Room Joining

```javascript
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (data) => {
    const { room, username } = data;
    if (!room || !username) return;

    socket.join(room);
    console.log(`[${room}] ${username} joined`);

    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
    socket.to(room).emit('user:joined', { username, id: socket.id });
    socket.emit('room:info', { room, userCount: roomSize });
    io.to(room).emit('room:count', { count: roomSize });
  });
```

This is where the room system works! When a user connects, Socket.io automatically gives them a unique `socket.id`. Then when they emit a `join` event with their room code and username, I use `socket.join(room)` to put them in that specific room.

I think of rooms like different "channels" on Discord. People in the same room can see each other's drawings, but they can't see what's happening in other rooms.

The cool thing here is on line 24-27 — I'm sending back information to let everyone know someone joined. `socket.to(room)` sends to everyone EXCEPT the sender, while `io.to(room)` sends to EVERYONE including the sender. This distinction is really important!

#### Lines 30-42: Broadcasting Drawing Strokes

```javascript
  socket.on('sound:stroke', (data) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      socket.to(room).emit('sound:stroke', data);
    });
  });

  socket.on('sound:state', (data) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      socket.to(room).emit('sound:state', data);
    });
  });
```

So this is the heart of the collaboration! When a user draws something, they emit a `sound:stroke` event with all the brush data — position, color, size, everything. The server then broadcasts this to everyone else in the same room.

I had to filter out `socket.id` from the rooms because Socket.io automatically puts each socket in a "room" with its own ID. So I'm only broadcasting to actual collaborative rooms, not back to the sender.

#### Lines 44-58: Canvas Clear and Disconnect Handling

```javascript
  socket.on('canvas:clear', () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      socket.to(room).emit('canvas:clear');
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('room:count', { count: roomSize });
    });
  });
```

The `canvas:clear` event is straightforward — when someone clears the canvas, everyone else's canvas gets cleared too.

The disconnect handler is important for updating the online user count. When someone leaves, I broadcast the new count to everyone remaining in the room. This keeps the "X online" counter accurate.

---

### File 2: `public/sketch.js` - The Creative Engine

This is where all the magic happens! This file handles audio analysis, drawing, and communication with the server.

#### Lines 1-21: Global Variables and Configuration

```javascript
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
```

I'm declaring all my global variables here. The key audio-related ones are:
- `mic` - the microphone input
- `amp` - amplitude analyzer (measures loudness)
- `fft` - Fast Fourier Transform (analyzes frequency content)

The `GATE_THRESHOLD` at 0.02 is like a noise gate — if the sound is too quiet (below 2%), we ignore it. This prevents random background noise from triggering the brush.

I chose `[15, 15, 20]` for the background color because it's a very dark blue-gray — it makes the colorful brush strokes really pop!

#### Lines 23-42: Setup Function

```javascript
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
```

In the setup function, I'm creating a full-screen WEBGL canvas. I chose WEBGL mode because it gives better performance for the kind of additive blending effects I'm using.

On lines 30-33, I'm checking if the p5.brush library is loaded. This is a really cool external library that provides realistic brush textures like watercolor and charcoal. The `brush.scaleBrushes(1.5)` makes all the brushes 50% bigger by default.

Then I initialize all the different systems — room management, socket connection, microphone, and UI controls. I like breaking things into separate `init` functions because it keeps the code organized.

#### Lines 44-86: The Draw Loop

```javascript
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
```

The draw function runs 60 times per second. Let me break this down:

**Lines 45-53**: The trail effect. If trail strength is greater than 0, I draw a semi-transparent rectangle over the entire canvas. This creates a fading effect where old strokes gradually disappear. The `push()/pop()` and coordinate translations are needed because we're in WEBGL mode.

**Line 56**: I call `analyzeSound()` EVERY frame, even if the mouse isn't pressed. This is important because I want the audio preview panel to always update and show what the microphone is picking up.

**Lines 64-72**: For the "jitter" brush mode, I interpolate between the previous and current mouse positions. This creates smoother strokes when you move the mouse fast. Without this, you'd get dots instead of continuous lines.

**Lines 77-81**: I only emit strokes every 2nd frame (`frameCount % 2 === 0`). This is a throttling technique — sending data every single frame would flood the network. Every 2nd frame is about 30 times per second, which is still smooth but much more efficient.

#### Lines 88-135: The Audio Analysis Function (The Core!)

```javascript
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
```

This is probably the most interesting function in the whole project! Let me explain the sound-to-visual mapping:

**Lines 98-100**: I'm getting the amplitude (loudness) from the microphone and applying the user's sensitivity setting. The `lerp` function smooths out the values so they don't jump around too much — it blends 30% of the new value with 70% of the old value. The `min(..., 0.5)` caps the maximum to prevent clipping.

**Lines 102-104**: The FFT gives us a spectrum array where each index represents a different frequency. Index 16 is roughly in the mid-frequency range (like human voice), and index 48 is high frequencies (like cymbals or "s" sounds).

**Lines 106-108**: Here's the mapping magic!
- **Hue**: Amplitude maps from 220 (blue) to 20 (red/orange). So quiet sounds are cool blue, loud sounds are warm red!
- **Saturation**: Mid frequencies control how vibrant the color is (60% to 100%)
- **Lightness**: High frequencies control brightness (50% to 85%)

**Lines 127-130**: The brush size also responds to sound! It scales from 50% to 250% of the base size depending on amplitude. This makes loud sounds create big, bold strokes.

#### Lines 137-180: Audio Preview UI Update

```javascript
function updateAudioPreview(amplitude, mid, treble, hue, sat, light) {
  const volumeBar = document.getElementById('volume-bar');
  const volumeValue = document.getElementById('volume-value');
  if (volumeBar && volumeValue) {
    const volumePercent = Math.min(amplitude / 0.4 * 100, 100);
    volumeBar.style.width = volumePercent + '%';
    volumeBar.style.backgroundColor = amplitude > GATE_THRESHOLD ? '#22c55e' : '#6b7280';
    volumeValue.textContent = Math.round(volumePercent) + '%';
  }
  // ... similar for mid and treble bars
}
```

This function updates the visual preview panel in real-time. The cool thing is the volume bar changes color — it's green when above the gate threshold (meaning your sound will affect the brush) and gray when below (meaning it's being ignored as background noise).

#### Lines 208-229: The Jittery Brush Effect

```javascript
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
```

This is my custom brush that I'm really proud of! It creates a glowing, organic-looking effect by:

1. Using **ADD blend mode** — colors add together and get brighter where they overlap
2. Drawing **multiple jittered circles** at random offsets around the brush position
3. Each circle has **three layers** — a big faint outer glow, a medium middle layer, and a small bright core

The result looks like a soft, glowing light trail. It's very different from the hard-edged brushes you typically see!

#### Lines 323-355: Socket Event Handlers

```javascript
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    socket.emit('join', { room: roomCode, username });
  });

  socket.on('sound:stroke', (data) => {
    drawBrush(data.x, data.y, data);
  });

  socket.on('canvas:clear', () => {
    background(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);
  });
}
```

This sets up all the socket event listeners. When we receive a `sound:stroke` event from another user, we call `drawBrush()` to render their stroke on our canvas. It's beautifully simple — the same drawing functions work for both local and remote strokes!

#### Lines 367-492: UI Initialization

```javascript
function initUI() {
  const micBtn = document.getElementById('mic-toggle');

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
      } catch (err) {
        alert(`Microphone access failed: ${err.message}`);
      }
    }
  });
  // ... more UI handlers
}
```

The microphone initialization was tricky! Here's what I learned:

1. **Line 379**: You MUST call `getAudioContext().resume()` before starting the mic. This is a browser security requirement — audio can only start after a user gesture.

2. **Line 381**: I add a 500ms delay after `mic.start()` before creating the analyzers. I found that creating them too early causes weird "RingBuffer" errors. The microphone needs a moment to initialize.

3. **Lines 383-387**: The `0.7` parameter for Amplitude and FFT is the smoothing factor. Higher values mean smoother but slower-responding readings.

---

### File 3: `public/index.html` - The User Interface

#### Lines 8-12: Library Imports

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.2/p5.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.2/addons/p5.sound.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/p5.brush@1.1/dist/p5.brush.js"></script>
<script src="/socket.io/socket.io.js"></script>
```

I'm using several libraries:
- **Tailwind CSS** for styling — it lets me write styles directly in HTML classes, which is super fast for prototyping
- **p5.js** for creative coding and the canvas
- **p5.sound** for audio input and analysis
- **p5.brush** for realistic brush textures
- **Socket.io client** for real-time communication

I chose to use CDN links instead of npm packages because it keeps the project simple and doesn't require a build step.

#### Lines 20-92: The Control Bar

```html
<div id="top-bar" class="bg-gray-900 bg-opacity-90 backdrop-blur-sm text-white px-4 py-2 flex items-center gap-4 text-sm">
  <!-- Brush selector, mic toggle, sliders, audio preview... -->
</div>
```

The top bar uses Tailwind's flexbox utilities to create a horizontal toolbar. I added `backdrop-blur-sm` to give it a frosted glass effect — it looks modern and doesn't completely block the canvas behind it.

#### Lines 59-88: Audio Preview Panel

```html
<div id="audio-preview" class="flex items-center gap-3 px-3 py-1 bg-gray-800 rounded border border-gray-600">
  <div class="flex items-center gap-2">
    <span class="text-gray-400 text-xs">Preview:</span>
    <div id="brush-preview" class="w-8 h-8 rounded-full border-2 border-gray-500"></div>
  </div>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-1">
      <span class="text-gray-500 text-xs w-10">Vol:</span>
      <div class="w-24 h-2 bg-gray-700 rounded overflow-hidden">
        <div id="volume-bar" class="h-full bg-green-500 transition-all duration-75"></div>
      </div>
    </div>
    <!-- Mid and High frequency bars... -->
  </div>
</div>
```

This is the audio preview panel I added to help users understand the sound-to-visual mapping. The `transition-all duration-75` makes the bars animate smoothly — 75ms is fast enough to feel responsive but smooth enough to not look jittery.

---

## Part 4: Troubleshooting & Reflection

### Challenge 1: Audio Initialization Timing

**Problem**: When I first built this, the audio analyzers would throw "RingBuffer allocation failed" errors randomly.

**What I tried**:
- Creating amp and fft in setup() — didn't work
- Checking if mic was ready before creating analyzers — still failed sometimes

**Solution**: I discovered that p5.AudioIn needs a brief moment to initialize after `start()` is called. Adding a 500ms delay with `await new Promise(resolve => setTimeout(resolve, 500))` fixed it completely.

**What I learned**: Browser audio APIs are asynchronous and need time to set up. Always give them breathing room!

### Challenge 2: WEBGL Coordinate System

**Problem**: In WEBGL mode, the origin (0,0) is at the CENTER of the canvas, not the top-left. My mouse coordinates were all wrong, and remote strokes appeared in the wrong positions.

**What I tried**:
- Converting coordinates manually everywhere — messy and error-prone

**Solution**: I created a consistent system: always store and transmit coordinates in screen space (top-left origin), then convert to WEBGL space (center origin) only when drawing. Lines 59-62 and 274-277 show this pattern.

**What I learned**: When mixing different coordinate systems, pick one as the "source of truth" and convert at the boundaries.

### Challenge 3: Network Throttling

**Problem**: Sending brush data every frame (60fps) was way too much data. The collaboration felt laggy and sometimes crashed.

**What I tried**:
- Reducing to every 5th frame — too choppy
- Only sending on mouseUp — lost the real-time feel

**Solution**: Sending every 2nd frame (line 77: `frameCount % 2 === 0`) hits the sweet spot — about 30 updates per second. Still smooth, but half the bandwidth.

**What I learned**: Real-time doesn't mean "as fast as possible" — it means "fast enough to feel instant."

### Challenge 4: Sound Responsiveness

**Problem**: Users complained they couldn't see the effect of their voice. The color changes were too subtle.

**What I tried**:
- Increasing the mapping ranges — colors became garish

**Solution**: Added the visual audio preview panel (lines 137-180 in sketch.js) so users can SEE what the microphone is picking up. Also made sound affect brush SIZE, not just color — this is much more noticeable.

**What I learned**: Feedback is crucial! Users need to see that the system is responding to them.

### Unresolved Issues / Future Improvements

1. **Canvas state sync**: New users joining a room see a blank canvas. I'd love to implement canvas state sharing so they can see existing drawings.

2. **Mobile support**: The touch interaction works, but microphone access is inconsistent on mobile browsers.

3. **Recording/Playback**: It would be cool to record a painting session and play it back like a time-lapse.

---

## Part 5: Conclusion

So that's Sound Paint! To recap, we covered:

1. **`server.js`** — A Socket.io server managing real-time room-based collaboration
2. **`sketch.js`** — The p5.js sketch with audio analysis, sound-to-visual mapping, and multiple brush modes
3. **`index.html`** — The UI with Tailwind CSS and real-time audio preview

The key concepts I demonstrated:
- **Real-time WebSocket communication** with Socket.io rooms
- **Audio analysis** using p5.Amplitude and p5.FFT
- **Creative coding patterns** like blend modes, interpolation, and generative brushes
- **State synchronization** between multiple clients

What I'm most proud of is how the audio preview panel came together — it really helps users understand and control the sound-to-visual connection. And the jittery glow brush effect is something I developed myself, and I think it looks really beautiful!

Thanks for watching, and I hope this walkthrough helps you understand how Sound Paint works!

---

*Script prepared for Core Lab Fall 2025*
