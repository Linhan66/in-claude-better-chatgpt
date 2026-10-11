(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  const W = 400; // logical width
  const H = 600; // logical height
  const GROUND_H = 90;
  const GROUND_Y = H - GROUND_H;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // Render at device pixel ratio so everything stays crisp.
  function resizeBackingStore() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeBackingStore();
  window.addEventListener("resize", resizeBackingStore);

  // ---------------------------------------------------------------------------
  // Tuning (units are pixels and seconds)
  // ---------------------------------------------------------------------------

  const GRAVITY = 1500;
  const FLAP_VELOCITY = -430;
  const MAX_FALL_SPEED = 650;
  const SCROLL_SPEED = 150;
  const PIPE_WIDTH = 66;
  const PIPE_GAP = 150;
  const PIPE_SPACING = 220; // horizontal distance between pipe pairs
  const PIPE_MARGIN = 70; // min distance from gap to top / ground
  const BIRD_X = 110;
  const BIRD_RADIUS = 13;
  const FIXED_DT = 1 / 120;

  // ---------------------------------------------------------------------------
  // Persistent best score (storage may be unavailable)
  // ---------------------------------------------------------------------------

  const BEST_KEY = "flappy-bird-best";
  function loadBest() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (e) {
      return 0;
    }
  }
  function saveBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  // Sound (generated with Web Audio, no files)
  // ---------------------------------------------------------------------------

  let audioCtx = null;
  let muted = false;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function tone(freqStart, freqEnd, duration, type, volume) {
    if (muted || !audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  const sfx = {
    flap: () => tone(520, 760, 0.09, "triangle", 0.12),
    score: () => {
      tone(880, 880, 0.08, "square", 0.06);
      setTimeout(() => tone(1320, 1320, 0.12, "square", 0.06), 70);
    },
    hit: () => tone(260, 60, 0.3, "sawtooth", 0.14),
  };

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  const State = { READY: 0, PLAYING: 1, DYING: 2, OVER: 3 };

  const game = {
    state: State.READY,
    score: 0,
    best: loadBest(),
    newBest: false,
    paused: false,
    time: 0, // total time, drives idle animations
    distance: 0, // how far the world has scrolled
    overTimer: 0, // time since game over, gates restart
    flash: 0, // white flash on hit
    shake: 0, // screen shake on hit
  };

  const bird = {
    y: H * 0.42,
    vy: 0,
    rotation: 0,
    wingPhase: 0,
  };

  let pipes = [];
  let scorePop = 0; // little bounce on the score when it increases

  function randomGapY() {
    const min = PIPE_MARGIN + PIPE_GAP / 2;
    const max = GROUND_Y - PIPE_MARGIN - PIPE_GAP / 2;
    return min + Math.random() * (max - min);
  }

  function spawnPipe(x) {
    pipes.push({ x, gapY: randomGapY(), scored: false });
  }

  function reset() {
    game.state = State.READY;
    game.score = 0;
    game.newBest = false;
    game.overTimer = 0;
    game.flash = 0;
    game.shake = 0;
    bird.y = H * 0.42;
    bird.vy = 0;
    bird.rotation = 0;
    pipes = [];
  }

  function startPlaying() {
    game.state = State.PLAYING;
    pipes = [];
    // First pipe appears just off screen, the rest follow at fixed spacing.
    spawnPipe(W + 40);
    flap();
  }

  function flap() {
    bird.vy = FLAP_VELOCITY;
    bird.wingPhase = 0;
    sfx.flap();
  }

  function die() {
    if (game.state !== State.PLAYING) return;
    game.state = State.DYING;
    game.flash = 1;
    game.shake = 0.35;
    sfx.hit();
    if (game.score > game.best) {
      game.best = game.score;
      game.newBest = true;
      saveBest(game.best);
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  function onPress() {
    ensureAudio();
    if (game.paused) {
      game.paused = false;
      return;
    }
    switch (game.state) {
      case State.READY:
        startPlaying();
        break;
      case State.PLAYING:
        flap();
        break;
      case State.OVER:
        if (game.overTimer > 0.6) reset();
        break;
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Enter") {
      e.preventDefault();
      if (!e.repeat) onPress();
    } else if (e.code === "KeyP" || e.code === "Escape") {
      if (game.state === State.PLAYING) game.paused = !game.paused;
    } else if (e.code === "KeyM") {
      muted = !muted;
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    onPress();
  });

  // Auto-pause when the tab is hidden so the bird doesn't fall unattended.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === State.PLAYING) game.paused = true;
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  function circleRectHit(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function update(dt) {
    game.time += dt;
    game.flash = Math.max(0, game.flash - dt * 3);
    game.shake = Math.max(0, game.shake - dt);
    scorePop = Math.max(0, scorePop - dt * 4);

    const worldMoving = game.state === State.READY || game.state === State.PLAYING;
    if (worldMoving) game.distance += SCROLL_SPEED * dt;

    switch (game.state) {
      case State.READY:
        // Gentle hover while waiting for the first flap.
        bird.y = H * 0.42 + Math.sin(game.time * 3) * 8;
        bird.rotation = 0;
        bird.wingPhase += dt * 10;
        break;

      case State.PLAYING:
        updateBird(dt);
        updatePipes(dt);
        checkCollisions();
        break;

      case State.DYING:
        updateBird(dt);
        if (bird.y + BIRD_RADIUS >= GROUND_Y) {
          bird.y = GROUND_Y - BIRD_RADIUS;
          bird.vy = 0;
          game.state = State.OVER;
          game.overTimer = 0;
        }
        break;

      case State.OVER:
        game.overTimer += dt;
        break;
    }
  }

  function updateBird(dt) {
    bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL_SPEED);
    bird.y += bird.vy * dt;

    // Can't fly off the top of the screen.
    if (bird.y - BIRD_RADIUS < 0) {
      bird.y = BIRD_RADIUS;
      bird.vy = Math.max(bird.vy, 0);
    }

    // Nose up when rising, dive when falling fast.
    const target = bird.vy < 0 ? -0.45 : Math.min(Math.PI / 2, (bird.vy / MAX_FALL_SPEED) * 1.9 - 0.3);
    const ease = bird.vy < 0 ? 18 : 6;
    bird.rotation += (target - bird.rotation) * Math.min(1, ease * dt);

    if (game.state === State.PLAYING) bird.wingPhase += dt * (bird.vy < 0 ? 22 : 12);
  }

  function updatePipes(dt) {
    for (const p of pipes) p.x -= SCROLL_SPEED * dt;

    // Remove pipes that have left the screen.
    while (pipes.length && pipes[0].x + PIPE_WIDTH < -10) pipes.shift();

    // Keep the next pipe coming at a fixed spacing, each with a new random gap.
    const last = pipes[pipes.length - 1];
    if (!last || last.x < W + 40 - PIPE_SPACING) {
      spawnPipe(last ? last.x + PIPE_SPACING : W + 40);
    }

    // Score once the bird has fully passed a pipe's centre line.
    for (const p of pipes) {
      if (!p.scored && p.x + PIPE_WIDTH / 2 < BIRD_X) {
        p.scored = true;
        game.score += 1;
        scorePop = 1;
        sfx.score();
      }
    }
  }

  function checkCollisions() {
    if (bird.y + BIRD_RADIUS >= GROUND_Y) {
      bird.y = GROUND_Y - BIRD_RADIUS;
      die();
      return;
    }
    const r = BIRD_RADIUS - 1; // tiny bit of forgiveness
    for (const p of pipes) {
      if (p.x > BIRD_X + r || p.x + PIPE_WIDTH < BIRD_X - r) continue;
      const topH = p.gapY - PIPE_GAP / 2;
      const botY = p.gapY + PIPE_GAP / 2;
      if (
        circleRectHit(BIRD_X, bird.y, r, p.x, -100, PIPE_WIDTH, topH + 100) ||
        circleRectHit(BIRD_X, bird.y, r, p.x, botY, PIPE_WIDTH, GROUND_Y - botY)
      ) {
        die();
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------------

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function outlinedText(text, x, y, size, fill, align) {
    ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(4, size / 6);
    ctx.strokeStyle = "#2a2140";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill || "#fff";
    ctx.fillText(text, x, y);
  }

  // Deterministic pseudo-random so background features repeat seamlessly.
  function hash(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  // ---------------------------------------------------------------------------
  // Background layers (parallax: further layers scroll slower)
  // ---------------------------------------------------------------------------

  const skyGradient = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  skyGradient.addColorStop(0, "#4ec0e9");
  skyGradient.addColorStop(0.65, "#8fd8f0");
  skyGradient.addColorStop(1, "#d4f1f9");

  function drawSky() {
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, W, GROUND_Y);

    // Sun
    const sunGlow = ctx.createRadialGradient(320, 95, 10, 320, 95, 90);
    sunGlow.addColorStop(0, "rgba(255, 250, 210, 0.9)");
    sunGlow.addColorStop(1, "rgba(255, 250, 210, 0)");
    ctx.fillStyle = sunGlow;
    ctx.fillRect(220, 0, 200, 200);
    ctx.fillStyle = "#fff6c4";
    ctx.beginPath();
    ctx.arc(320, 95, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds() {
    const speed = 0.15;
    const tile = 180;
    const offset = (game.distance * speed) % tile;
    const firstIndex = Math.floor((game.distance * speed) / tile);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    for (let i = -1; i < W / tile + 2; i++) {
      const idx = firstIndex + i;
      const x = i * tile - offset + hash(idx) * 80;
      const y = 50 + hash(idx + 31) * 140;
      const s = 0.7 + hash(idx + 7) * 0.6;
      cloud(x, y, s);
    }
  }

  function cloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(x + 20 * s, y - 14 * s, 20 * s, Math.PI, Math.PI * 1.85);
    ctx.arc(x + 46 * s, y - 10 * s, 16 * s, Math.PI * 1.2, Math.PI * 1.95);
    ctx.arc(x + 62 * s, y, 18 * s, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function drawCity() {
    const speed = 0.3;
    const bw = 34;
    const shift = game.distance * speed;
    const first = Math.floor(shift / bw);
    const base = GROUND_Y - 40;

    ctx.fillStyle = "#a7dcc8";
    for (let i = -1; i < W / bw + 2; i++) {
      const idx = first + i;
      const x = idx * bw - shift;
      const h = 40 + hash(idx) * 70;
      ctx.fillRect(x, base - h, bw - 3, h + 40);
      // windows
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      for (let wy = base - h + 8; wy < base - 4; wy += 12) {
        for (let wx = x + 5; wx < x + bw - 10; wx += 9) {
          if (hash(idx * 13 + wx * 0.7 + wy) > 0.45) ctx.fillRect(wx, wy, 4, 5);
        }
      }
      ctx.fillStyle = "#a7dcc8";
    }
  }

  function drawHills() {
    const speed = 0.55;
    const shift = game.distance * speed;
    ctx.fillStyle = "#6fcf73";
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let x = 0; x <= W; x += 6) {
      const wx = x + shift;
      const y = GROUND_Y - 30 - Math.sin(wx * 0.018) * 12 - Math.sin(wx * 0.047 + 1.3) * 7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Bushes along the hill line
    const tile = 48;
    const first = Math.floor(shift / tile);
    ctx.fillStyle = "#56b95c";
    for (let i = -1; i < W / tile + 2; i++) {
      const idx = first + i;
      const x = idx * tile - shift;
      const r = 12 + hash(idx + 3) * 10;
      ctx.beginPath();
      ctx.arc(x, GROUND_Y - 4, r, Math.PI, 0);
      ctx.arc(x + r * 1.1, GROUND_Y - 4, r * 0.8, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawGround() {
    // Dirt
    const dirt = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    dirt.addColorStop(0, "#e2d08f");
    dirt.addColorStop(1, "#cdb46a");
    ctx.fillStyle = dirt;
    ctx.fillRect(0, GROUND_Y, W, GROUND_H);

    // Grass strip with scrolling diagonal stripes
    const stripeH = 16;
    ctx.fillStyle = "#79d14b";
    ctx.fillRect(0, GROUND_Y, W, stripeH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, GROUND_Y, W, stripeH);
    ctx.clip();
    ctx.fillStyle = "#5fb836";
    const period = 24;
    const offset = game.distance % period;
    for (let x = -period - offset; x < W + period; x += period) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + stripeH);
      ctx.lineTo(x + 12, GROUND_Y + stripeH);
      ctx.lineTo(x + 24, GROUND_Y);
      ctx.lineTo(x + 12, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = "#4a8f2a";
    ctx.fillRect(0, GROUND_Y + stripeH, W, 3);
    ctx.fillStyle = "#3d2f1c";
    ctx.fillRect(0, GROUND_Y - 2, W, 2);

    // Pebbles in the dirt
    ctx.fillStyle = "rgba(140, 110, 50, 0.35)";
    const tile = 40;
    const first = Math.floor(game.distance / tile);
    for (let i = -1; i < W / tile + 2; i++) {
      const idx = first + i;
      const x = idx * tile - game.distance + hash(idx) * 30;
      const y = GROUND_Y + 30 + hash(idx + 5) * 45;
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + hash(idx + 9) * 4, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Pipes
  // ---------------------------------------------------------------------------

  const pipeBody = ctx.createLinearGradient(0, 0, PIPE_WIDTH, 0);
  pipeBody.addColorStop(0, "#5aa83a");
  pipeBody.addColorStop(0.25, "#9be26a");
  pipeBody.addColorStop(0.55, "#74c947");
  pipeBody.addColorStop(1, "#3f8a26");

  const LIP_H = 26;
  const LIP_OVERHANG = 5;
  const lipBody = ctx.createLinearGradient(-LIP_OVERHANG, 0, PIPE_WIDTH + LIP_OVERHANG, 0);
  lipBody.addColorStop(0, "#5aa83a");
  lipBody.addColorStop(0.25, "#a6ec74");
  lipBody.addColorStop(0.55, "#7dd24f");
  lipBody.addColorStop(1, "#3f8a26");

  function drawPipe(p) {
    const topH = p.gapY - PIPE_GAP / 2;
    const botY = p.gapY + PIPE_GAP / 2;

    ctx.save();
    ctx.translate(Math.round(p.x), 0);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#2b5a1a";

    // Top pipe
    ctx.fillStyle = pipeBody;
    ctx.fillRect(0, -5, PIPE_WIDTH, topH - LIP_H + 5);
    ctx.strokeRect(0, -5, PIPE_WIDTH, topH - LIP_H + 5);
    ctx.fillStyle = lipBody;
    roundRect(-LIP_OVERHANG, topH - LIP_H, PIPE_WIDTH + LIP_OVERHANG * 2, LIP_H, 4);
    ctx.fill();
    ctx.stroke();

    // Bottom pipe
    ctx.fillStyle = pipeBody;
    ctx.fillRect(0, botY + LIP_H, PIPE_WIDTH, GROUND_Y - botY - LIP_H + 5);
    ctx.strokeRect(0, botY + LIP_H, PIPE_WIDTH, GROUND_Y - botY - LIP_H + 5);
    ctx.fillStyle = lipBody;
    roundRect(-LIP_OVERHANG, botY, PIPE_WIDTH + LIP_OVERHANG * 2, LIP_H, 4);
    ctx.fill();
    ctx.stroke();

    // Highlights
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(10, 0, 5, topH - LIP_H);
    ctx.fillRect(10, botY + LIP_H, 5, GROUND_Y - botY - LIP_H);
    ctx.fillRect(4, topH - LIP_H + 4, 5, LIP_H - 8);
    ctx.fillRect(4, botY + 4, 5, LIP_H - 8);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Bird
  // ---------------------------------------------------------------------------

  function drawBird() {
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rotation);

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#3a2a14";

    // Tail
    ctx.fillStyle = "#f2a516";
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.lineTo(-24, -9);
    ctx.lineTo(-22, 2);
    ctx.lineTo(-25, 8);
    ctx.lineTo(-13, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Body
    const body = ctx.createRadialGradient(-4, -6, 2, 0, 0, 20);
    body.addColorStop(0, "#fff17a");
    body.addColorStop(0.6, "#ffd23a");
    body.addColorStop(1, "#f2a516");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = "#fff6d0";
    ctx.beginPath();
    ctx.ellipse(1, 6, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(7, -5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1e1a2e";
    ctx.beginPath();
    ctx.arc(9, -5, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(9.8, -6, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Beak (two parts)
    ctx.fillStyle = "#ff7a3d";
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.quadraticCurveTo(24, -1, 23, 3);
    ctx.lineTo(11, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e85f25";
    ctx.beginPath();
    ctx.moveTo(11, 4);
    ctx.lineTo(21, 4);
    ctx.quadraticCurveTo(18, 9, 10, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wing, flapping between up and down positions
    const flapAmount = game.state === State.DYING || game.state === State.OVER ? 0 : Math.sin(bird.wingPhase);
    ctx.save();
    ctx.translate(-5, 1);
    ctx.rotate(flapAmount * 0.6);
    ctx.fillStyle = "#fff8d8";
    ctx.beginPath();
    ctx.ellipse(-2, 0, 9, 5.5, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // HUD and overlays
  // ---------------------------------------------------------------------------

  function drawScore() {
    const scale = 1 + scorePop * 0.25;
    ctx.save();
    ctx.translate(W / 2, 70);
    ctx.scale(scale, scale);
    outlinedText(String(game.score), 0, 0, 52, "#fff");
    ctx.restore();
  }

  function drawReady() {
    outlinedText("Flappy Bird", W / 2, 130, 46, "#ffd23a");
    outlinedText("Get Ready!", W / 2, 190, 30, "#7ee06a");

    // Tap hint with a pulsing hand-free arrow
    const pulse = 0.5 + Math.sin(game.time * 5) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.65 + pulse * 0.35;
    ctx.fillStyle = "rgba(42, 33, 64, 0.55)";
    roundRect(W / 2 - 110, 330, 220, 44, 22);
    ctx.fill();
    outlinedText("Tap or press Space", W / 2, 352, 20, "#fff");
    ctx.restore();

    // Little up-arrow next to the bird
    ctx.save();
    ctx.translate(BIRD_X, bird.y - 38 - pulse * 4);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#2a2140";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(9, 2);
    ctx.lineTo(3, 2);
    ctx.lineTo(3, 10);
    ctx.lineTo(-3, 10);
    ctx.lineTo(-3, 2);
    ctx.lineTo(-9, 2);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    if (game.best > 0) outlinedText(`Best: ${game.best}`, W / 2, 400, 20, "#fff");
  }

  function medalFor(score) {
    if (score >= 40) return { name: "Platinum", color: "#e6f4ff", rim: "#9fb8cc" };
    if (score >= 30) return { name: "Gold", color: "#ffd84d", rim: "#c79a12" };
    if (score >= 20) return { name: "Silver", color: "#e3e7ee", rim: "#9aa3b2" };
    if (score >= 10) return { name: "Bronze", color: "#e09a5a", rim: "#a3622c" };
    return null;
  }

  function drawGameOver() {
    // Panel slides up a little as it appears
    const t = Math.min(1, game.overTimer / 0.35);
    const ease = 1 - Math.pow(1 - t, 3);
    const panelY = 210 + (1 - ease) * 60;

    ctx.fillStyle = `rgba(20, 16, 36, ${0.25 * ease})`;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = ease;

    outlinedText("Game Over", W / 2, 150 + (1 - ease) * 20, 46, "#ff8a5c");

    const pw = 280;
    const ph = 160;
    const px = (W - pw) / 2;

    ctx.fillStyle = "#2a2140";
    roundRect(px - 3, panelY - 3, pw + 6, ph + 6, 16);
    ctx.fill();
    ctx.fillStyle = "#f3e6b5";
    roundRect(px, panelY, pw, ph, 14);
    ctx.fill();
    ctx.fillStyle = "#e5d29a";
    roundRect(px + 10, panelY + 10, pw - 20, ph - 20, 10);
    ctx.fill();

    // Medal
    const medal = medalFor(game.score);
    const mx = px + 66;
    const my = panelY + ph / 2 + 6;
    ctx.font = "700 14px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#a0773a";
    ctx.fillText("MEDAL", mx, panelY + 32);
    ctx.lineWidth = 3;
    if (medal) {
      ctx.fillStyle = medal.color;
      ctx.strokeStyle = medal.rim;
      ctx.beginPath();
      ctx.arc(mx, my, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Star
      ctx.fillStyle = medal.rim;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 14 : 6;
        ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#d6c184";
      ctx.strokeStyle = "#c2ab6a";
      ctx.beginPath();
      ctx.arc(mx, my, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Scores
    const sx = px + pw - 30;
    ctx.textAlign = "right";
    ctx.fillStyle = "#a0773a";
    ctx.font = "700 14px system-ui, -apple-system, sans-serif";
    ctx.fillText("SCORE", sx, panelY + 32);
    ctx.fillText("BEST", sx, panelY + 92);
    outlinedText(String(game.score), sx, panelY + 58, 30, "#fff", "right");
    outlinedText(String(game.best), sx, panelY + 118, 30, "#fff", "right");

    if (game.newBest) {
      ctx.fillStyle = "#ff5a5a";
      roundRect(sx - 118, panelY + 106, 44, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 12px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("NEW", sx - 96, panelY + 117);
    }

    ctx.restore();

    if (game.overTimer > 0.6) {
      const pulse = 0.6 + Math.sin(game.time * 5) * 0.4;
      ctx.save();
      ctx.globalAlpha = pulse;
      outlinedText("Tap or press Space to restart", W / 2, panelY + ph + 50, 20, "#fff");
      ctx.restore();
    }
  }

  function drawPaused() {
    ctx.fillStyle = "rgba(20, 16, 36, 0.45)";
    ctx.fillRect(0, 0, W, H);
    outlinedText("Paused", W / 2, H / 2 - 20, 46, "#fff");
    outlinedText("Tap or press Space to resume", W / 2, H / 2 + 30, 18, "#fff");
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function render() {
    ctx.save();
    if (game.shake > 0) {
      const m = game.shake * 14;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    drawSky();
    drawClouds();
    drawCity();
    drawHills();
    for (const p of pipes) drawPipe(p);
    drawGround();
    drawBird();

    ctx.restore();

    if (game.state === State.PLAYING || game.state === State.DYING) drawScore();
    if (game.state === State.READY) drawReady();
    if (game.state === State.OVER) drawGameOver();
    if (game.paused) drawPaused();

    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${game.flash * 0.8})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (muted) {
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(42, 33, 64, 0.7)";
      ctx.fillText("muted (M)", W - 10, H - 12);
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop: fixed physics step so gravity feels the same at any frame rate
  // ---------------------------------------------------------------------------

  let last = performance.now();
  let acc = 0;

  function frame(now) {
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.1) elapsed = 0.1; // avoid huge jumps after a stall

    if (!game.paused) {
      acc += elapsed;
      while (acc >= FIXED_DT) {
        update(FIXED_DT);
        acc -= FIXED_DT;
      }
    }

    render();
    requestAnimationFrame(frame);
  }

  reset();
  requestAnimationFrame(frame);

  // Exposed for automated testing only.
  window.__flappy = { game, bird, get pipes() { return pipes; }, State, GROUND_Y, PIPE_GAP };
})();
