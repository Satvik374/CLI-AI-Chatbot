# 🏁 Horizon Drive — 3D Browser Racing

A fully procedural 3D arcade racing game built with **Three.js**. Every asset (car, terrain, track, trees, rocks, buildings, mountains, signs, textures) is authored in code — no external models or images.

## ▶️ How to play

Just open `index.html` **via a local web server** (because it uses ES modules from a CDN — opening with `file://` will fail due to CORS).

### Quick options on Windows:

```bash
# Option 1: Python (if installed)
cd workspace/racing-game
python -m http.server 8000
# then visit http://localhost:8000

# Option 2: Node.js
npx serve workspace/racing-game

# Option 3: VS Code "Live Server" extension — right-click index.html → Open with Live Server
```

## 🎮 Controls

| Action       | Keys                |
|--------------|---------------------|
| Throttle     | `W` / `↑`           |
| Brake / Reverse | `S` / `↓`        |
| Steer        | `A` `D` / `←` `→`   |
| Handbrake / Drift | `SPACE`        |
| Camera       | `C` (chase / far / hood) |
| Reset to track | `R`               |

## ✨ Features

- Closed-loop **race track** with curbs, dashed lane markers, and start/finish line
- **3-lap race** with checkpoint progression and lap timer
- Persistent **best time** stored in `localStorage`
- **Procedural car** with body, glass windshield, headlights, taillights, spoiler, wheels with rims & calipers, working steering & rolling animation
- **Arcade physics**: throttle/brake/reverse, speed-sensitive steering, body roll & pitch, off-track grip loss
- **Drifting** with the handbrake — emits **tire-smoke particles**
- **Open environment**: rolling hills, ~400 trees, ~120 rocks, 30 buildings (city skyline), distant mountains, roadside signs
- **Realistic sky** (Three.js `Sky` shader) + sun + soft shadows
- **Bloom** post-processing for that glossy "modern racing game" look
- **Animated speedometer** (SVG gauge with needle, color arc, gear indicator)
- 3 camera modes (chase, far chase, hood-cam) with **dynamic FOV based on speed**

## ⚠️ Honest note about scope

This is **not** Forza Horizon 5 — that game has hundreds of GB of hand-crafted assets and a 500-person studio behind it. What this *is*: a polished, fun, fully-procedural arcade racer that runs in any modern browser at 60 FPS, with everything authored from primitives + canvas-generated textures.

Want it pushed further? Things I could add next:
- Multiple selectable cars / paint colors
- AI opponents on the same track
- Day/night cycle with working headlights at night
- Boost / nitro system
- Multiple tracks or open-world free-roam
- Engine sound synthesis (Web Audio)

## 📁 Files

- `index.html` — markup, HUD, loader, importmap
- `style.css` — HUD, speedometer, finish panel
- `game.js` — entire 3D game (≈700 lines)
