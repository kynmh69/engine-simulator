/**
 * engineSound.ts
 *
 * Web Audio API を用いた4ストローク・レシプロエンジンの音響シミュレーション。
 *
 * 物理モデル（簡易）:
 *  - 4ストロークエンジンは、各シリンダーがクランク2回転に1回燃焼する。
 *  - 1回転あたりの燃焼回数 = 気筒数 / 2
 *  - 燃焼（点火）周波数 f = (RPM / 60) * (気筒数 / 2)  [Hz]
 *
 * 直列等間隔点火のエンジンでは点火が等間隔に並ぶため、
 * 排気音の基本周波数は点火周波数 f に一致する。
 * 気筒数が多いほど f が高くなり、滑らかで高い音に、
 * 気筒数が少ないほど f が低くなり、低くて「ドコドコ」とした歯切れの良い音になる。
 */

export interface EngineParams {
  /** 気筒数 (3〜12) */
  cylinders: number;
  /** エンジン回転数 (RPM) */
  rpm: number;
  /** スロットル開度 (0.0〜1.0) — 負荷・音量・音色の明るさに影響 */
  throttle: number;
}

const MIN_RPM = 700;
const MAX_RPM = 8500;

export class EngineSimulator {
  private ctx: AudioContext | null = null;
  private running = false;

  // ノードグラフ
  private master!: GainNode;
  private lowpass!: BiquadFilterNode;
  private compressor!: DynamicsCompressorNode;

  // 排気音（点火パルス列）
  private pulseOsc!: OscillatorNode;
  private pulseGain!: GainNode;

  // 低音の唸り（ボディ）
  private subOsc!: OscillatorNode;
  private subGain!: GainNode;

  // 機械的ノイズ（吸気・メカノイズ）
  private noiseSrc!: AudioBufferSourceNode;
  private noiseBandpass!: BiquadFilterNode;
  private noiseGain!: GainNode;
  // ノイズを点火に同期させて脈動させるためのLFO
  private noiseLfo!: OscillatorNode;
  private noiseLfoDepth!: GainNode;

  // わずかな回転ムラを表現するためのデチューンLFO
  private wobbleLfo!: OscillatorNode;
  private wobbleDepth!: GainNode;

  private params: EngineParams = { cylinders: 4, rpm: MIN_RPM, throttle: 0 };

  /** 現在の設定（読み取り用） */
  get current(): EngineParams {
    return { ...this.params };
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** AudioContext を生成・初期化する（ユーザー操作後に呼ぶこと） */
  async start(initial?: Partial<EngineParams>): Promise<void> {
    if (this.running) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    this.ctx = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (initial) {
      this.params = { ...this.params, ...initial };
    }

    this.buildGraph(ctx);
    this.running = true;

    // 起動時のセル始動風に、RPM を一瞬持ち上げてからアイドルへ落とす
    const now = ctx.currentTime;
    this.applyParams(this.params, now, 0.05);
  }

  /** エンジンを停止し、リソースを解放する */
  async stop(): Promise<void> {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // フェードアウトしてから停止
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, 0.15);

    const stopAt = now + 0.6;
    [
      this.pulseOsc,
      this.subOsc,
      this.noiseLfo,
      this.wobbleLfo,
    ].forEach((n) => {
      try {
        n.stop(stopAt);
      } catch {
        /* noop */
      }
    });
    try {
      this.noiseSrc.stop(stopAt);
    } catch {
      /* noop */
    }

    this.running = false;
    window.setTimeout(() => {
      ctx.close().catch(() => {});
      this.ctx = null;
    }, 800);
  }

  /** パラメータを更新する（実行中のみ反映） */
  update(p: Partial<EngineParams>): void {
    this.params = { ...this.params, ...p };
    this.params.cylinders = clamp(Math.round(this.params.cylinders), 3, 12);
    this.params.rpm = clamp(this.params.rpm, MIN_RPM, MAX_RPM);
    this.params.throttle = clamp(this.params.throttle, 0, 1);

    if (this.running && this.ctx) {
      this.applyParams(this.params, this.ctx.currentTime, 0.08);
    }
  }

  /** 現在の点火周波数 (Hz) */
  firingFrequency(p: EngineParams = this.params): number {
    return (p.rpm / 60) * (p.cylinders / 2);
  }

  // ---- 内部 ----------------------------------------------------------------

  private buildGraph(ctx: AudioContext): void {
    // 出力段: lowpass -> compressor -> master -> destination
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 900;
    this.lowpass.Q.value = 1.2;

    this.lowpass.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    // --- 排気パルス列（メインの音色）---
    this.pulseOsc = ctx.createOscillator();
    this.pulseOsc.setPeriodicWave(makeExhaustWave(ctx));
    this.pulseGain = ctx.createGain();
    this.pulseGain.gain.value = 0.5;
    this.pulseOsc.connect(this.pulseGain).connect(this.lowpass);

    // --- 低音ボディ（サイン波の唸り）---
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.35;
    this.subOsc.connect(this.subGain).connect(this.lowpass);

    // --- メカニカルノイズ ---
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = makeNoiseBuffer(ctx);
    this.noiseSrc.loop = true;

    this.noiseBandpass = ctx.createBiquadFilter();
    this.noiseBandpass.type = 'bandpass';
    this.noiseBandpass.frequency.value = 1400;
    this.noiseBandpass.Q.value = 0.7;

    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.06;

    this.noiseSrc.connect(this.noiseBandpass).connect(this.noiseGain).connect(this.lowpass);

    // ノイズを点火周波数で脈動させるLFO
    this.noiseLfo = ctx.createOscillator();
    this.noiseLfo.type = 'sawtooth';
    this.noiseLfoDepth = ctx.createGain();
    this.noiseLfoDepth.gain.value = 0.05;
    this.noiseLfo.connect(this.noiseLfoDepth).connect(this.noiseGain.gain);

    // 回転ムラ（微小なピッチ揺らぎ）
    this.wobbleLfo = ctx.createOscillator();
    this.wobbleLfo.type = 'sine';
    this.wobbleLfo.frequency.value = 8;
    this.wobbleDepth = ctx.createGain();
    this.wobbleDepth.gain.value = 2;
    this.wobbleLfo.connect(this.wobbleDepth);
    this.wobbleDepth.connect(this.pulseOsc.detune);
    this.wobbleDepth.connect(this.subOsc.detune);

    // 起動
    const t = ctx.currentTime;
    this.pulseOsc.start(t);
    this.subOsc.start(t);
    this.noiseSrc.start(t);
    this.noiseLfo.start(t);
    this.wobbleLfo.start(t);
  }

  private applyParams(p: EngineParams, now: number, smooth: number): void {
    const f = this.firingFrequency(p);
    const rpmNorm = (p.rpm - MIN_RPM) / (MAX_RPM - MIN_RPM); // 0..1
    const drive = clamp(p.throttle * 0.7 + rpmNorm * 0.6, 0, 1);

    // メイン点火周波数
    setSmooth(this.pulseOsc.frequency, f, now, smooth);
    // 低音は点火の半分（クランク基本振動寄り）で重さを出す
    setSmooth(this.subOsc.frequency, Math.max(f * 0.5, 20), now, smooth);
    // ノイズの脈動も点火に同期
    setSmooth(this.noiseLfo.frequency, f, now, smooth);

    // 回転ムラ: 気筒数が少ないほど大きく、回転が上がるほど速く
    const wobbleHz = clamp(f / 3, 4, 30);
    const wobbleCents = clamp((13 - p.cylinders) * 1.6, 2, 18);
    setSmooth(this.wobbleLfo.frequency, wobbleHz, now, smooth);
    setSmooth(this.wobbleDepth.gain, wobbleCents, now, smooth);

    // フィルター開度（負荷が高い・回転が高いほど明るく）
    const cutoff = 400 + drive * 4200 + rpmNorm * 1500;
    setSmooth(this.lowpass.frequency, cutoff, now, smooth);

    // バンドパス中心も回転で持ち上げる
    setSmooth(this.noiseBandpass.frequency, 900 + rpmNorm * 2600, now, smooth);

    // 各レイヤーの音量バランス
    setSmooth(this.pulseGain.gain, 0.32 + drive * 0.30, now, smooth);
    setSmooth(this.subGain.gain, 0.45 - rpmNorm * 0.18, now, smooth);
    setSmooth(this.noiseGain.gain, 0.04 + drive * 0.12, now, smooth);
    setSmooth(this.noiseLfoDepth.gain, 0.03 + drive * 0.10, now, smooth);

    // マスター音量（アイドルでも鳴り、吹かすと大きく）
    const vol = 0.22 + drive * 0.5;
    setSmooth(this.master.gain, vol, now, smooth);
  }
}

// ---- ヘルパー --------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function setSmooth(param: AudioParam, value: number, now: number, tau: number): void {
  // 指数的に滑らかに目標値へ近づける（ノイズ・クリック防止）
  param.setTargetAtTime(value, now, Math.max(tau, 0.005));
}

/**
 * 排気パルスらしい倍音構成の周期波を生成する。
 * 低次倍音を強め、高次へ向けて緩やかに減衰させることで
 * 「ボーッ」とした排気の唸りと歯切れを両立させる。
 */
function makeExhaustWave(ctx: AudioContext): PeriodicWave {
  const n = 24;
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    // 1/i の自然な減衰に、低次を少し強調する係数を掛ける
    const rolloff = 1 / i;
    const lowBoost = i <= 6 ? 1.6 : 1.0;
    imag[i] = rolloff * lowBoost;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** ホワイトノイズのループ用バッファを生成する */
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 2;
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export const ENGINE_LIMITS = { MIN_RPM, MAX_RPM };
