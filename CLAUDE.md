# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a collaborative "sound-to-paint" web application for Core Lab Fall 2025. Users join rooms and paint together using their microphone input to control brush properties in real-time.

## Tech Stack

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: p5.js 1.9.0 + p5.sound + Tailwind CSS
- **Communication**: WebSocket rooms for real-time collaboration
- **Port**: 3005

## Development Commands

```bash
# Install dependencies
npm install

# Start server (runs on http://localhost:3005)
npm start

# Kill existing server on port 3005 and restart
lsof -ti:3005 | xargs kill -9; npm start
```

## Project Structure

```
2025FallCorelab_Collaborative/
├── server.js           # Express + Socket.io server
├── package.json        # Dependencies: express, socket.io
├── public/
│   ├── index.html     # UI with Tailwind CSS + library imports
│   └── sketch.js      # p5.js sketch with audio analysis
└── Basic.md           # Project specification
```

## Architecture

### Server (server.js)
- Serves static files from `public/` directory
- Manages WebSocket rooms via Socket.io
- Relays events within rooms: `join`, `sound:stroke`, `sound:state`, `canvas:clear`
- Tracks online user count per room

### Client (sketch.js)
**Key Features:**
- Full-screen canvas with responsive resizing
- Microphone input via p5.AudioIn
- Audio analysis: p5.Amplitude (0.7 smoothing) + p5.FFT (0.7 smoothing, 64 bins)
- Noise gate: 0.02 threshold
- Room-based collaboration via Socket.io

**Sound-to-Visual Mapping:**
```javascript
// Per Basic.md specification
size  = map(amplitude, 0, 0.35, 2, 60, true)
hue   = map(centroid, 300, 4000, 220, 20, true)  // spectral centroid
sat   = map(mid, 0, 255, 30, 90, true)            // mid-frequency (bin 16)
light = map(treble, 0, 255, 40, 80, true)         // high-frequency (bin 48)
```

**Brush Implementation:**
- **Type**: Color-field smear with three concentric circles
- **Blend Mode**: ADD (for glow effect)
- **Circles**:
  1. Outer: size × 1.5, alpha 0.1 (large, faint halo)
  2. Middle: size × 1.0, alpha 0.3 (main body)
  3. Inner: size × 0.5, alpha 0.6 (bright core)
- **Trail Effect**: Background overlay with fill(0, 0, 0, 0.05) each frame

**Audio Processing:**
- Amplitude smoothing: `lerp(prevA, currentA, 0.3)` with max clamp at 0.4
- Input gain: Adjustable via UI slider (0.5 - 2.0, default 1.0)
- Gate check: Returns zero-size params if amplitude < 0.02

### UI Controls (index.html)
- **Room Code**: Auto-generated or from URL parameter `?room=XXXXXX`
- **Copy Link Button**: Copies shareable room URL to clipboard with visual feedback
- **Username**: Click to edit, auto-saved to localStorage, persists across sessions
- **Mic Toggle**: ON/OFF with permission handling and loading state
- **Sensitivity Slider**: Adjusts input gain (0.5x - 2.0x)
- **Clear Button**: Clears canvas with confirmation and 500ms debounce (broadcasts to room)
- **Online Counter**: Shows current users in room

## Socket.io Events

### Client → Server
- `join`: `{ room: string, username: string }` - Join a room
- `sound:stroke`: `{ x, y, size, hue, sat, light }` - Broadcast brush stroke
- `sound:state`: `{ gate, gain }` - Broadcast audio settings
- `canvas:clear`: (no data) - Request canvas clear

### Server → Client
- `room:info`: `{ room, userCount }` - Sent on join
- `room:count`: `{ count }` - Broadcast when users join/leave
- `user:joined`: `{ username, id }` - Notify room of new user
- `sound:stroke`: `{ x, y, size, hue, sat, light }` - Relay brush stroke
- `sound:state`: `{ gate, gain }` - Relay audio settings
- `canvas:clear`: (no data) - Relay clear command

## Important Implementation Notes

### CDN Stability
- **Use cdnjs.cloudflare.com** for p5.js (NOT jsdelivr)
- jsdelivr had loading issues; cdnjs is more stable
- Current version: p5.js 1.9.0 + p5.sound 1.9.0

### Audio Initialization Timing
- **Critical**: Create `p5.Amplitude` and `p5.FFT` AFTER `mic.start()`
- Creating them before mic starts causes RingBuffer errors
- Add 500ms delay after `mic.start()` before creating analyzers
- Always check `if (!amp || !fft)` in `analyzeSound()` for safety

### Browser Compatibility
- Requires user gesture to start audio (click Mic button)
- Must call `getAudioContext().resume()` before `mic.start()`
- HTTPS or localhost required for microphone access

## Broadcasting Status

**ENABLED** - Multi-user collaboration is active!

- Stroke broadcasting: Every 3rd frame (~50-80ms throttle)
- Emits: `{ x, y, size, hue, sat, light }` to all users in same room
- Receives: Automatically renders other users' strokes via `drawBrush()`
- Sound state: Broadcasts sensitivity changes (logged but not auto-applied)

## Color Mode

- HSL: Hue (0-360°), Saturation (0-100%), Lightness (0-100%)
- Set in setup: `colorMode(HSL, 360, 100, 100)`
- Allows smooth spectral color mapping from blue (220°) to red-orange (20°)

## Collaboration Features

### Room Sharing
1. **Auto-generation**: Opening the app without `?room=` parameter creates a new room
2. **URL persistence**: Room code automatically added to URL
3. **Share link**: Click "📋 Copy" button to copy shareable URL
4. **Visual feedback**: Button shows "✓ Copied!" for 2 seconds

### Username Management
1. **Persistence**: Username stored in browser localStorage
2. **Default**: "Guest" if no username set
3. **Editing**: Click username in top bar to change
4. **Re-join**: Changing username triggers socket re-join with new name

### Canvas Synchronization
1. **Stroke broadcasting**: Every 3rd frame (~50-80ms)
2. **Real-time rendering**: Other users see strokes instantly
3. **Clear sync**: Clear button affects all users in room (with confirmation)
4. **Debounce**: 500ms cooldown on Clear button prevents spam

## Testing Workflow

1. Start server: `npm start`
2. Open browser: `http://localhost:3005`
3. **Test room creation**: URL should auto-update with `?room=XXXXXX`
4. **Test username**: Click username, change it, refresh page to verify persistence
5. **Test share link**: Click "📋 Copy" and paste to verify full URL copied
6. Click "Mic" button and grant permission
7. Make sound/music near microphone
8. Move mouse while making sound to paint
9. Test sensitivity slider for different input levels
10. **Multi-user collaboration**:
    - Copy the share link
    - Open in new tab or send to another device
    - Both users should see real-time drawing
    - Test Clear button synchronization
