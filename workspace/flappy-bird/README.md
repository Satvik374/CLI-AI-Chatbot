# 🐦 Flappy Bird

A 2D Flappy Bird clone built with vanilla HTML5 Canvas + JavaScript. No build tools, no dependencies.

## ▶️ How to play

Just open `index.html` in your browser.

```bash
# from this folder, on Windows you can simply:
start index.html
```

## 🎮 Controls

| Action  | Key / Input              |
|---------|--------------------------|
| Flap    | `Space` / Click / Tap    |
| Restart | `R` (or click on game-over) |

## ✨ Features

- Smooth gravity + flap physics
- Procedurally spawning pipes with randomized gaps
- Score counter + persistent best score (saved in `localStorage`)
- Animated bird (rotation + flapping wing)
- Parallax-style scrolling ground & drifting clouds
- Game states: **Ready → Playing → Game Over**
- Mobile-friendly (touch supported)

## 📁 Files

- `index.html` — markup / canvas
- `style.css` — page styling
- `game.js` — all game logic
