/**
 * EngineProcessor
 * ----------------
 * A real-time 4-stroke engine sound synthesizer running on the audio thread.
 *
 * Model:
 *  - The crankshaft angle advances every sample based on the current RPM.
 *  - A 4-stroke engine fires each cylinder once every 720 crank degrees.
 *    For an evenly-spaced inline engine with N cylinders the firing interval
 *    is 720 / N degrees.
 *  - Every firing injects a short, exponentially decaying "combustion pulse"
 *    into a round-robin voice pool. Summing the ringing voices produces the
 *    characteristic idle "thump-thump" that blends into a smooth roar as the
 *    firing rate climbs with RPM.
 */

const TWO_PI = Math.PI * 2;
const VOICE_COUNT = 12;

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 800, minValue: 0, maxValue: 15000, automationRate: 'k-rate' },
      { name: 'cylinders', defaultValue: 4, minValue: 3, maxValue: 12, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'masterGain', defaultValue: 0.9, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.crankAngle = 0; // 0 .. 720 degrees
    this.firingIndex = -1; // last firing slot we passed within the current cycle

    // Round-robin combustion voices. Each voice rings out after being struck.
    this.voiceT = new Float32Array(VOICE_COUNT).fill(1e3);
    this.voiceAmp = new Float32Array(VOICE_COUNT);
    this.voiceRes = new Float32Array(VOICE_COUNT); // per-strike resonance (Hz)
    this.voiceNoise = new Float32Array(VOICE_COUNT); // noise seed level
    this.nextVoice = 0;

    // Simple one-pole low-pass state to tame harshness.
    this.lpState = 0;
  }

  fire(cylCount, rpm, throttle) {
    const v = this.nextVoice;
    this.nextVoice = (this.nextVoice + 1) % VOICE_COUNT;

    // Base resonance drops slightly as cylinder count grows (bigger engine,
    // deeper thud) and rises a touch with RPM for a livelier top end.
    const base = 95 - cylCount * 2.5 + (rpm / 15000) * 40;
    // Random detune per firing gives the engine a "living" imperfection.
    const detune = 0.94 + Math.random() * 0.12;

    this.voiceT[v] = 0;
    this.voiceAmp[v] = 0.85 + Math.random() * 0.3;
    this.voiceRes[v] = base * detune;
    this.voiceNoise[v] = 0.25 + throttle * 0.55;
  }

  process(_inputs, outputs, params) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const rpm = params.rpm[0];
    const cylCount = Math.round(params.cylinders[0]);
    const throttle = params.throttle[0];
    const masterGain = params.masterGain[0];

    const fireInterval = 720 / cylCount;
    const degPerSample = (rpm / 60) * 360 / sampleRate;

    // Combustion ring decay: shorter tail at high RPM so pulses stay crisp.
    const tau = Math.max(0.018, 0.05 - (rpm / 15000) * 0.03);

    // Brightness of the one-pole LP follows throttle & RPM.
    const cutoff = 0.06 + throttle * 0.35 + (rpm / 15000) * 0.25;

    const ch0 = output[0];
    const dt = 1 / sampleRate;

    for (let i = 0; i < ch0.length; i++) {
      // Advance crank and detect firings that occurred this sample.
      this.crankAngle += degPerSample;
      while (this.crankAngle >= 720) {
        this.crankAngle -= 720;
        this.firingIndex = -1;
      }
      const slot = Math.floor(this.crankAngle / fireInterval);
      if (slot !== this.firingIndex) {
        this.firingIndex = slot;
        if (rpm > 1) this.fire(cylCount, rpm, throttle);
      }

      // Sum the ringing combustion voices.
      let sample = 0;
      for (let v = 0; v < VOICE_COUNT; v++) {
        const t = this.voiceT[v];
        if (t > 0.25) continue; // voice has fully decayed
        const amp = this.voiceAmp[v];
        const fr = this.voiceRes[v];
        const env = Math.exp(-t / tau);
        const tone =
          Math.sin(TWO_PI * fr * t) +
          0.5 * Math.sin(TWO_PI * 2 * fr * t) +
          0.25 * Math.sin(TWO_PI * 3 * fr * t);
        const noiseEnv = Math.exp(-t / 0.006) * this.voiceNoise[v];
        const noise = (Math.random() * 2 - 1) * noiseEnv;
        sample += amp * env * (tone * 0.5 + noise);
        this.voiceT[v] = t + dt;
      }

      // Gentle one-pole low-pass to remove digital fizz.
      this.lpState += cutoff * (sample - this.lpState);
      let out = this.lpState;

      // Soft clip for a bit of mechanical grit.
      out = Math.tanh(out * 1.6) * 0.6;

      ch0[i] = out * masterGain;
    }

    // Mirror to any additional channels (stereo).
    for (let c = 1; c < output.length; c++) {
      output[c].set(ch0);
    }

    // Keep the processor alive.
    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);
