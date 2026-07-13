/**
 * EngineSimulator
 * ---------------
 * Wraps the Web Audio graph and the RPM physics model. The heavy DSP lives in
 * the `engine-processor` AudioWorklet; this class handles lifecycle, parameter
 * smoothing and the throttle → RPM dynamics.
 */
import { ENGINE_SPECS, type EngineSpec } from './config';

export class EngineSimulator {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private masterGain: GainNode | null = null;

  private spec: EngineSpec = ENGINE_SPECS[4];
  private rpm = 0;
  private targetRpm = 0;
  private throttle = 0; // 0..1
  private volume = 0.8;
  private running = false;
  private rafId = 0;
  private lastTime = 0;

  /** Called on every animation frame with the current live state. */
  onUpdate: ((state: { rpm: number; throttle: number }) => void) | null = null;

  get isRunning(): boolean {
    return this.running;
  }

  get currentSpec(): EngineSpec {
    return this.spec;
  }

  get currentRpm(): number {
    return this.rpm;
  }

  async start(): Promise<void> {
    if (this.running) return;

    if (!this.ctx) {
      this.ctx = new AudioContext();
      await this.ctx.audioWorklet.addModule('/engine-processor.js');

      this.node = new AudioWorkletNode(this.ctx, 'engine-processor', {
        outputChannelCount: [2],
      });

      // A little post-processing for body and warmth.
      const lowShelf = this.ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 120;
      lowShelf.gain.value = 6;

      const peaking = this.ctx.createBiquadFilter();
      peaking.type = 'peaking';
      peaking.frequency.value = 320;
      peaking.Q.value = 0.8;
      peaking.gain.value = 4;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      this.node.connect(lowShelf);
      lowShelf.connect(peaking);
      peaking.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    await this.ctx.resume();

    this.running = true;
    this.rpm = this.spec.idleRpm * 0.4;
    this.applyCylinders();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.rpm = 0;
    this.targetRpm = 0;
    this.throttle = 0;
    if (this.node && this.ctx) {
      const p = this.node.parameters.get('rpm');
      p?.setValueAtTime(0, this.ctx.currentTime);
    }
    if (this.ctx) void this.ctx.suspend();
    this.onUpdate?.({ rpm: 0, throttle: 0 });
  }

  setCylinders(count: number): void {
    this.spec = ENGINE_SPECS[count] ?? ENGINE_SPECS[4];
    if (this.running) this.applyCylinders();
  }

  setThrottle(value: number): void {
    this.throttle = Math.max(0, Math.min(1, value));
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  private applyCylinders(): void {
    if (!this.node || !this.ctx) return;
    const p = this.node.parameters.get('cylinders');
    p?.setValueAtTime(this.spec.cylinders, this.ctx.currentTime);
  }

  private loop = (time: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, (time - this.lastTime) / 1000) || 0.016;
    this.lastTime = time;

    const { idleRpm, redlineRpm, inertia } = this.spec;

    // Throttle maps to a target RPM between idle and redline.
    this.targetRpm = idleRpm + this.throttle * (redlineRpm - idleRpm);

    // Idle wobble for realism.
    const wobble = this.throttle < 0.02 ? (Math.random() - 0.5) * 30 : 0;

    // Spin up quickly, spool down more gently (engine braking / flywheel).
    const accelerating = this.targetRpm > this.rpm;
    const rate = (accelerating ? 3.2 : 2.0) / inertia;
    this.rpm += (this.targetRpm + wobble - this.rpm) * Math.min(1, rate * dt);
    this.rpm = Math.max(0, this.rpm);

    if (this.node && this.ctx) {
      const now = this.ctx.currentTime;
      this.node.parameters.get('rpm')?.setTargetAtTime(this.rpm, now, 0.02);
      this.node.parameters.get('throttle')?.setTargetAtTime(this.throttle, now, 0.05);
    }

    this.onUpdate?.({ rpm: this.rpm, throttle: this.throttle });
    this.rafId = requestAnimationFrame(this.loop);
  };
}
