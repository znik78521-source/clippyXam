/** Microsoft Agent-style frame graph; independent of React and browser timers. */
export interface SpriteFrame {
  duration: number;
  images?: number[][];
  exitBranch?: number;
  branching?: { branches: { weight: number; frameIndex: number }[] };
}
export interface SpriteAnimation {
  frames: SpriteFrame[];
  useExitBranching?: boolean;
}
export interface SpriteData {
  framesize: number[];
  overlayCount?: number;
  animations: Record<string, SpriteAnimation>;
}
const REST: SpriteFrame = { duration: 100, images: [[0, 0]] };
export function nextFrame(
  animation: SpriteAnimation,
  index: number,
  exiting: boolean,
  random = Math.random,
): number | "hold" | null {
  const frame = animation.frames[index];
  if (!frame) return null;
  const valid = (n: unknown): n is number =>
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= 0 &&
    n < animation.frames.length;
  let next = index + 1;
  if (exiting && valid(frame.exitBranch)) next = frame.exitBranch;
  else if (frame.branching) {
    let roll = Math.max(0, Math.min(0.999999, random())) * 100;
    for (const branch of frame.branching.branches) {
      if (
        !Number.isFinite(branch.weight) ||
        branch.weight <= 0 ||
        !valid(branch.frameIndex)
      )
        continue;
      if (roll < branch.weight) {
        next = branch.frameIndex;
        break;
      }
      roll -= branch.weight;
    }
  }
  // useExitBranching's final frame is a zero-duration sentinel, NOT an image.
  if (animation.useExitBranching && next === animation.frames.length - 1)
    return exiting ? null : "hold";
  return valid(next) ? next : null;
}
export class SpritePlayer {
  private desired = "RestPose";
  private current = "RestPose";
  private index = 0;
  private nextAt = 0;
  private cycleUntil = 0;
  private exitUntil = 0;
  private exiting = false;
  private resting = true;
  private repeatDelay = 500;
  private frame: SpriteFrame = REST;
  private steps = 0;
  constructor(
    private data: SpriteData,
    private random = Math.random,
    private options: { forceOpening?: boolean } = {},
  ) {}
  request(name: string, now: number, repeatDelay = 500) {
    const desired = this.data.animations[name]?.frames.length
      ? name
      : "RestPose";
    this.repeatDelay = repeatDelay;
    if (desired === this.desired) return;
    this.desired = desired;
    if (this.resting) this.start(now);
    else if (!this.exiting) {
      this.exiting = true;
      this.exitUntil = now + 2000;
    }
    this.nextAt = Math.min(this.nextAt, now + 100);
  }
  private start(now: number) {
    this.current = this.desired;
    this.index = 0;
    this.steps = 0;
    this.exiting = false;
    this.resting = this.current === "RestPose";
    this.frame = this.data.animations[this.current]?.frames[0] || REST;
    this.cycleUntil = now + (this.repeatDelay >= 4000 ? 10000 : 20000);
    this.nextAt = now + this.duration();
  }
  private duration() {
    return Number.isFinite(this.frame.duration)
      ? Math.max(10, Math.min(10000, this.frame.duration))
      : 100;
  }
  tick(now: number): SpriteFrame {
    if (this.exiting && now >= this.exitUntil) {
      this.finish(now);
      return this.frame;
    }
    if (now < this.nextAt) return this.frame;
    if (this.resting) {
      if (this.desired !== "RestPose") this.start(now);
      else this.nextAt = now + 100;
      return this.frame;
    }
    if (!this.exiting && (now >= this.cycleUntil || this.steps >= 1200)) {
      this.exiting = true;
      this.exitUntil = now + 2000;
    }
    const animation = this.data.animations[this.current];
    let next = nextFrame(animation, this.index, this.exiting, this.random);
    // Agent idle packs contain 85–97% opening branches which skip the entire
    // action. Our director already schedules idle frequency: an explicit action
    // must actually start, while all internal branches/exit frames stay original.
    if (
      this.options.forceOpening &&
      this.index === 0 &&
      !this.exiting &&
      animation.frames.length > 2 &&
      (next === "hold" || next === animation.frames.length - 1)
    )
      next = 1;
    if (next === null) this.finish(now);
    else if (next === "hold") this.nextAt = now + 80;
    else {
      this.index = next;
      this.steps++;
      this.frame = this.data.animations[this.current].frames[next];
      this.nextAt = now + this.duration();
    }
    return this.frame;
  }
  private finish(now: number) {
    if (this.desired !== this.current) {
      this.start(now);
      return;
    }
    this.resting = true;
    this.exiting = false;
    this.frame = this.data.animations.RestPose?.frames[0] || REST;
    this.nextAt = now + this.repeatDelay;
  }
  reset() {
    this.current = this.desired = "RestPose";
    this.exiting = false;
    this.resting = true;
    this.frame = REST;
  }
}
