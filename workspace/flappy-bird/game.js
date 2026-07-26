// ---------- Flappy Bird ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;

// ---------- Game constants ----------
const GRAVITY = 0.45;
const FLAP_STRENGTH = -8;
const PIPE_WIDTH = 60;
const PIPE_GAP = 150;
const PIPE_SPEED = 2.4;
const PIPE_SPAWN_INTERVAL = 90; // frames
const GROUND_HEIGHT = 80;

// ---------- Game state ----------
let bird, pipes, frame, score, best, state;
best = parseInt(localStorage.getItem("flappyBest") || "0", 10);

function reset() {
  bird = {
    x: 80,
    y: H / 2,
    vy: 0,
    radius: 14,
    rotation: 0,
  };
  pipes = [];
  frame = 0;
  score = 0;
  state = "ready"; // ready | playing | gameover
}
reset();

// ---------- Input ----------
function flap() {
  if (state === "ready") {
    state = "playing";
    bird.vy = FLAP_STRENGTH;
  } else if (state === "playing") {
    bird.vy = FLAP_STRENGTH;
  } else if (state === "gameover") {
    reset();
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    flap();
  } else if (e.code === "KeyR") {
    reset();
  }
});
canvas.addEventListener("mousedown", flap);
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  flap();
}, { passive: false });

// ---------- Pipes ----------
function spawnPipe() {
  const minTop = 40;
  const maxTop = H - GROUND_HEIGHT - PIPE_GAP - 40;
  const topHeight = Math.random() * (maxTop - minTop) + minTop;
  pipes.push({
    x: W,
    topHeight,
    bottomY: topHeight + PIPE_GAP,
    passed: false,
  });
}

// ---------- Collision ----------
function circleRectCollide(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

function checkCollisions() {
  // Ground / ceiling
  if (bird.y + bird.radius >= H - GROUND_HEIGHT) return true;
  if (bird.y - bird.radius <= 0) return true;

  // Pipes
  for (const p of pipes) {
    if (
      circleRectCollide(bird.x, bird.y, bird.radius, p.x, 0, PIPE_WIDTH, p.topHeight) ||
      circleRectCollide(bird.x, bird.y, bird.radius, p.x, p.bottomY, PIPE_WIDTH, H - GROUND_HEIGHT - p.bottomY)
    ) {
      return true;
    }
  }
  return false;
}

// ---------- Update ----------
function update() {
  if (state === "playing") {
    bird.vy += GRAVITY;
    bird.y += bird.vy;
    bird.rotation = Math.max(-0.5, Math.min(1.2, bird.vy / 10));

    frame++;
    if (frame % PIPE_SPAWN_INTERVAL === 0) spawnPipe();

    for (const p of pipes) {
      p.x -= PIPE_SPEED;
      if (!p.passed && p.x + PIPE_WIDTH < bird.x) {
        p.passed = true;
        score++;
      }
    }
    pipes = pipes.filter((p) => p.x + PIPE_WIDTH > 0);

    if (checkCollisions()) {
      state = "gameover";
      if (score > best) {
        best = score;
        localStorage.setItem("flappyBest", String(best));
      }
    }
  } else if (state === "ready") {
    // Gentle hover
    bird.y = H / 2 + Math.sin(Date.now() / 200) * 6;
  }
}

// ---------- Draw ----------
function drawBackground() {
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, H - GROUND_HEIGHT);
  sky.addColorStop(0, "#4ec0ca");
  sky.addColorStop(1, "#a8e6f0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H - GROUND_HEIGHT);

  // Distant clouds
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 4; i++) {
    const cx = ((frame * 0.3 + i * 130) % (W + 80)) - 40;
    const cy = 60 + (i % 2) * 40;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.arc(cx + 18, cy + 4, 14, 0, Math.PI * 2);
    ctx.arc(cx - 16, cy + 4, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPipes() {
  for (const p of pipes) {
    // Pipe body
    ctx.fillStyle = "#5cb85c";
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topHeight);
    ctx.fillRect(p.x, p.bottomY, PIPE_WIDTH, H - GROUND_HEIGHT - p.bottomY);

    // Pipe outline
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, 0, PIPE_WIDTH, p.topHeight);
    ctx.strokeRect(p.x, p.bottomY, PIPE_WIDTH, H - GROUND_HEIGHT - p.bottomY);

    // Pipe caps
    ctx.fillStyle = "#3a8f3a";
    ctx.fillRect(p.x - 4, p.topHeight - 18, PIPE_WIDTH + 8, 18);
    ctx.fillRect(p.x - 4, p.bottomY, PIPE_WIDTH + 8, 18);
    ctx.strokeRect(p.x - 4, p.topHeight - 18, PIPE_WIDTH + 8, 18);
    ctx.strokeRect(p.x - 4, p.bottomY, PIPE_WIDTH + 8, 18);

    // Highlight stripe
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(p.x + 6, 0, 6, p.topHeight);
    ctx.fillRect(p.x + 6, p.bottomY, 6, H - GROUND_HEIGHT - p.bottomY);
  }
}

function drawGround() {
  // Dirt
  ctx.fillStyle = "#ded895";
  ctx.fillRect(0, H - GROUND_HEIGHT, W, GROUND_HEIGHT);

  // Grass strip
  ctx.fillStyle = "#7ec850";
  ctx.fillRect(0, H - GROUND_HEIGHT, W, 16);

  // Moving grass detail
  ctx.fillStyle = "#5fa83a";
  const offset = state === "playing" ? frame * PIPE_SPEED : 0;
  for (let x = -((offset) % 20); x < W; x += 20) {
    ctx.fillRect(x, H - GROUND_HEIGHT + 12, 10, 4);
  }

  // Outline
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - GROUND_HEIGHT);
  ctx.lineTo(W, H - GROUND_HEIGHT);
  ctx.stroke();
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rotation);

  // Body
  ctx.fillStyle = "#ffeb3b";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, bird.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wing (flapping)
  const wingPhase = Math.sin(Date.now() / 80) * 4;
  ctx.fillStyle = "#f5c518";
  ctx.beginPath();
  ctx.ellipse(-2, 4 + wingPhase, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(6, -4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(7, -4, 2, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = "#ff7043";
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(20, -2);
  ctx.lineTo(20, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawText(text, x, y, size = 32, color = "#fff", stroke = "#000") {
  ctx.font = `bold ${size}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawUI() {
  if (state === "playing" || state === "gameover") {
    drawText(String(score), W / 2, 60, 48);
  }

  if (state === "ready") {
    drawText("Get Ready!", W / 2, H / 2 - 120, 36, "#ffeb3b");
    drawText("Press SPACE / Tap to start", W / 2, H / 2 - 80, 16);
  }

  if (state === "gameover") {
    // Panel
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(40, H / 2 - 110, W - 80, 200);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(40, H / 2 - 110, W - 80, 200);

    drawText("Game Over", W / 2, H / 2 - 70, 32, "#ff5252");
    drawText(`Score: ${score}`, W / 2, H / 2 - 20, 22);
    drawText(`Best:  ${best}`, W / 2, H / 2 + 10, 22, "#ffeb3b");
    drawText("Press SPACE or R to restart", W / 2, H / 2 + 60, 14);
  }
}

// ---------- Main loop ----------
function loop() {
  update();

  drawBackground();
  drawPipes();
  drawGround();
  drawBird();
  drawUI();

  requestAnimationFrame(loop);
}
loop();
