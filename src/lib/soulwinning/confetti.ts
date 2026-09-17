/**
 * A small canvas confetti burst. Hand-rolled rather than pulled in as a
 * dependency: the whole thing is one loop, and the palette lives in one place
 * so the brand colours can be dropped in when they land.
 */

// The site palette. White is deliberately absent: it disappears against the
// #fafaf9 canvas the counter now sits on.
const COLORS = ["#3ba6f1", "#c1e1f7", "#3398e1", "#0c0a09", "#f5c542"];

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  life: number;
};

export function burstConfetti(canvas: HTMLCanvasElement, count = 60): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  // Two cannons firing inward from the lower corners, the way a stage burst
  // reads on a big screen — a single centre puff gets lost behind the number.
  const scale = Math.max(1, width / 900);
  const pieces: Piece[] = Array.from({ length: count }, (_, index) => {
    const fromLeft = index % 2 === 0;
    const angle = (fromLeft ? -Math.PI / 3 : (-Math.PI * 2) / 3) + (Math.random() - 0.5) * 0.7;
    const speed = (11 + Math.random() * 10) * scale;
    return {
      x: fromLeft ? width * 0.08 : width * 0.92,
      y: height * 0.95,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: (7 + Math.random() * 9) * scale,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      life: 1,
    };
  });

  let frame = 0;

  const tick = () => {
    frame += 1;
    context.clearRect(0, 0, width, height);

    let alive = false;
    for (const piece of pieces) {
      piece.vy += 0.34 * scale; // gravity
      piece.vx *= 0.985;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rotation += piece.spin;
      piece.life -= 0.009;

      if (piece.life <= 0 || piece.y > height + 40) continue;
      alive = true;

      context.save();
      context.globalAlpha = Math.max(piece.life, 0);
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.6);
      context.restore();
    }

    if (alive && frame < 400) {
      requestAnimationFrame(tick);
    } else {
      context.clearRect(0, 0, width, height);
    }
  };

  requestAnimationFrame(tick);
}
