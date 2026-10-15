import { WindowInertia } from "../../src/lib/window-inertia";
const canvas = document.querySelector<HTMLCanvasElement>("#actor")!,
  ctx = canvas.getContext("2d")!;
const card = document.querySelector<HTMLElement>("#window")!,
  arena = document.querySelector<HTMLElement>("#arena")!,
  handle = document.querySelector<HTMLElement>("#handle")!;
const status = document.querySelector<HTMLElement>("#state")!,
  metrics = document.querySelector<HTMLElement>("#metrics")!;
const model = new WindowInertia({ x: 112, y: 37 });
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const neutral = new Image(),
  impact = new Image(),
  impactRight = new Image();
neutral.src = new URL("./neutral-rgba.png", import.meta.url).href;
impact.src = new URL("./impact-left-rgba.png", import.meta.url).href;
impactRight.src = new URL("./impact-right-rgba.png", import.meta.url).href;
await Promise.all([neutral.decode(), impact.decode(), impactRight.decode()]);
let position = { x: 0, y: 0 },
  previous = { x: 0, y: 0 },
  pointer: null | {
    id: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
  } = null;
let scenario: null | {
  name: string;
  at: number;
  startX: number;
  startY: number;
  distance: number;
} = null;
let last = performance.now(),
  typingAt = -1000,
  lastSerial = 0,
  totalHits = 0,
  brakingUntil = 0,
  previousVX = 0;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
function limitPosition() {
  position.x = clamp(
    position.x,
    8,
    Math.max(8, arena.clientWidth - card.offsetWidth - 8),
  );
  position.y = clamp(
    position.y,
    8,
    Math.max(8, arena.clientHeight - card.offsetHeight - 30),
  );
}
function reset() {
  scenario = null;
  pointer = null;
  model.reset();
  position = {
    x: Math.max(8, (arena.clientWidth - card.offsetWidth) / 2),
    y: 26,
  };
  limitPosition();
  previous = { ...position };
  previousVX = 0;
  lastSerial = 0;
  totalHits = 0;
  render(performance.now());
}
function run(name: string) {
  reset();
  if (reduced.matches) return;
  const distance = Math.min(
    250,
    Math.max(0, arena.clientWidth - card.offsetWidth - 24),
  );
  position.x = 12;
  previous = { ...position };
  scenario = {
    name,
    at: performance.now(),
    startX: position.x,
    startY: position.y,
    distance,
  };
}
function animateWindow(now: number) {
  if (!scenario) return;
  const t = (now - scenario.at) / 1000,
    { distance, startX } = scenario;
  let p: number;
  if (scenario.name === "jerk") {
    p = smooth(t / 0.075);
    if (t > 0.075) scenario = null;
  } else if (scenario.name === "medium") {
    p = smooth(t / 0.85);
    if (t > 0.85) scenario = null;
  } else if (scenario.name === "brake") {
    // Ease into a roughly constant speed, then a hard stop. The STOP is an impulse too.
    p = t < 0.25 ? (0.5 * (t * t)) / (0.25 * 0.72) : (t - 0.125) / 0.72;
    if (p >= 1) {
      p = 1;
      scenario = null;
    }
  } else {
    p = smooth(t / 3.4);
    if (t > 3.4) scenario = null;
  }
  position.x = startX + distance * clamp(p, 0, 1);
  limitPosition();
}
function drawBody(now: number) {
  const s = model.state,
    hit = s.impact;
  const age = hit?.age ?? 10;
  const wave = (now - typingAt) / 1000;
  const typing =
    !reduced.matches && wave < 0.2
      ? Math.sin(wave * 65) * Math.exp(-wave * 19) * 1.4
      : 0;
  const squash = hit ? hit.strength * Math.exp(-age * 12) : 0;
  const horizontal = hit && (hit.side === "left" || hit.side === "right");
  const cx = 176 + s.x,
    cy = 154 + s.y;
  // New authored impact pose for the actual contact, not a sideways-rotated rest image.
  if (horizontal && age < 0.125) {
    const pose = hit!.side === "right" ? impactRight : impact;
    const w = 112 + hit!.strength * 15,
      h = Math.min(200, (w * pose.height) / pose.width);
    const contactX = hit!.side === "left" ? 9 : 343;
    const recovery = smooth((age - 0.075) / 0.05);
    const center =
      (hit!.side === "left" ? contactX + w / 2 : contactX - w / 2) *
        (1 - recovery) +
      cx * recovery;
    ctx.save();
    ctx.translate(center, cy);
    ctx.drawImage(pose, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else {
    const h = 222 * (1 - (horizontal ? 0.05 : 0.2) * squash),
      w = 103 * (1 + (horizontal ? 0.1 : 0.2) * squash);
    // Local body bending with a quiet base, rather than rotating the entire picture.
    const bend = s.bend + typing;
    for (let row = 0; row < neutral.height; row += 3) {
      const progress = row / neutral.height,
        weight = (1 - progress) ** 1.7;
      const shift = bend * weight;
      const stripe = Math.min(3, neutral.height - row);
      ctx.drawImage(
        neutral,
        0,
        row,
        neutral.width,
        stripe,
        cx - w / 2 + shift,
        cy - h / 2 + progress * h,
        w,
        (stripe / neutral.height) * h + 0.35,
      );
    }
  }
  if (hit && age < 0.22) {
    const fade = 1 - age / 0.22;
    ctx.strokeStyle = `rgba(80,75,58,${fade * 0.8})`;
    ctx.lineWidth = 1.5;
    const edge = hit.side === "left" ? 10 : hit.side === "right" ? 342 : cx;
    const y = hit.side === "top" ? 7 : hit.side === "bottom" ? 299 : cy - 55;
    for (let i = 0; i < 3; i++) {
      const sign = hit.side === "right" ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(edge + sign * (5 + i * 7), y - 12 - i * 9);
      ctx.lineTo(edge + sign * (11 + i * 9), y - 20 - i * 10);
      ctx.stroke();
    }
  }
}
function render(now: number) {
  ctx.clearRect(0, 0, 352, 306);
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(0, 0, 352, 306);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;
  ctx.strokeRect(7.5, 3.5, 337, 299);
  const hit = model.state.impact;
  if (hit && hit.age < 0.12) {
    ctx.strokeStyle = `rgba(63,63,63,${1 - hit.age / 0.12})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(7.5, 3.5, 337, 299);
  }
  drawBody(now);
  card.style.transform = `translate(${position.x}px,${position.y}px)`;
  const s = model.state;
  const sides = {
    left: "левый край",
    right: "правый край",
    top: "верхний край",
    bottom: "нижний край",
  };
  status.textContent = reduced.matches
    ? "Движение отключено системной настройкой"
    : hit && hit.age < 0.125
      ? `Удар: ${sides[hit.side]}`
      : hit
        ? "Отскок и восстановление"
        : now < brakingUntil
          ? "Торможение — по инерции вперёд"
          : Math.abs(s.x) > 1 || Math.abs(s.y) > 1
            ? "Инерция и затухание"
            : "Покой";
  metrics.textContent = `Окно: ${Math.round(previousVX)} px/s · смещение: ${Math.round(s.x)} px · удары: ${totalHits}`;
  canvas.dataset.impact = hit?.side || "";
  canvas.dataset.offset = String(s.x);
  canvas.dataset.bend = String(s.bend);
  canvas.dataset.hits = String(totalHits);
}
function tick(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  model.setEnabled(!reduced.matches);
  animateWindow(now);
  if (dt > 0 && dt < 0.25) {
    const vx = (position.x - previous.x) / dt,
      vy = (position.y - previous.y) / dt;
    if (Math.abs(previousVX) > 150 && Math.abs(vx) < 20)
      brakingUntil = now + 650;
    model.velocity(vx, vy);
    model.advance(dt);
    previousVX = vx;
  } else model.reset();
  previous = { ...position };
  if (model.state.impact && model.state.impact.serial !== lastSerial) {
    totalHits++;
    lastSerial = model.state.impact.serial;
  }
  render(now);
  requestAnimationFrame(tick);
}
handle.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  scenario = null;
  pointer = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    originX: position.x,
    originY: position.y,
  };
  handle.setPointerCapture(e.pointerId);
});
handle.addEventListener("pointermove", (e) => {
  if (pointer?.id !== e.pointerId) return;
  position.x = pointer.originX + e.clientX - pointer.x;
  position.y = pointer.originY + e.clientY - pointer.y;
  limitPosition();
});
function release() {
  pointer = null;
}
handle.addEventListener("pointerup", release);
handle.addEventListener("pointercancel", release);
handle.addEventListener("lostpointercapture", release);
window.addEventListener("blur", () => {
  pointer = null;
  scenario = null;
  model.reset();
  previous = { ...position };
});
window.addEventListener("resize", () => {
  limitPosition();
  previous = { ...position };
  model.reset();
});
document.querySelector("input")!.addEventListener("input", () => {
  typingAt = performance.now();
});
document
  .querySelectorAll<HTMLButtonElement>("[data-scenario]")
  .forEach((button) => (button.onclick = () => run(button.dataset.scenario!)));
document.querySelector<HTMLButtonElement>("#reset")!.onclick = reset;
reset();
requestAnimationFrame(tick);
// Review/test hooks only. This page is not imported by the production app.
Object.assign(window, {
  __inertiaDemo: { run, reset, state: () => structuredClone(model.state) },
});
