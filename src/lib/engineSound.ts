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

export type ExhaustType = 'stock' | 'sport' | 'straight';

export interface EngineParams {
  /** 気筒数 (3〜12) */
  cylinders: number;
  /** エンジン回転数 (RPM) */
  rpm: number;
  /** スロットル開度 (0.0〜1.0) — 負荷・音量・音色の明るさに影響 */
  throttle: number;
  /** マフラー種別 — 倍音構成・フィルター開度・ノイズ量が変わる */
  exhaust: ExhaustType;
  /** マスター音量 (0.0〜1.0) */
  volume: number;
}

const MIN_RPM = 700;
const MAX_RPM = 8500;

/** マフラー種別ごとの音響プロファイル */
interface ExhaustProfile {
  /** 倍音の数 */
  harmonics: number;
  /** 倍音減衰の指数（小さいほど高次倍音が残りラフな音に） */
  rolloffPow: number;
  /** 低次倍音の強調係数 */
  lowBoost: number;
  /** lowpass カットオフの基準値と可変幅 */
  cutoffBase: number;
  cutoffDrive: number;
  /** メカノイズ量の倍率 */
  noiseMul: number;
  /** 排気パルス音量の倍率 */
  pulseMul: number;
}

const EXHAUST_PROFILES: Record<ExhaustType, ExhaustProfile> = {
  stock: {
    harmonics: 24,
    rolloffPow: 1.0,
    lowBoost: 1.6,
    cutoffBase: 400,
    cutoffDrive: 4200,
    noiseMul: 1.0,
    pulseMul: 1.0,
  },
  sport: {
    harmonics: 28,
    rolloffPow: 0.82,
    lowBoost: 1.4,
    cutoffBase: 600,
    cutoffDrive: 5400,
    noiseMul: 1.3,
    pulseMul: 1.12,
  },
  straight: {
    harmonics: 32,
    rolloffPow: 0.62,
    lowBoost: 1.2,
    cutoffBase: 800,
    cutoffDrive: 7000,
    noiseMul: 1.7,
    pulseMul: 1.25,
  },
};

export class EngineSimulator {
  private ctx: AudioContext | null = null;
  private running = false;

  // ノードグラフ
  private master!: GainNode;
  private lowpass!: BiquadFilterNode;
  private compressor!: DynamicsCompressorNode;
  private analyser!: AnalyserNode;

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

  private params: EngineParams = {
    cylinders: 4,
    rpm: MIN_RPM,
    throttle: 0,
    exhaust: 'stock',
    volume: 0.8,
  };
  /** 現在ノードグラフに適用されている排気波形の種別 */
  private appliedExhaust: ExhaustType = 'stock';

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
    this.params.volume = clamp(this.params.volume, 0, 1);

    if (this.running && this.ctx) {
      // 排気波形はオシレーター再生中でも差し替え可能
      if (this.params.exhaust !== this.appliedExhaust) {
        this.appliedExhaust = this.params.exhaust;
        this.pulseOsc.setPeriodicWave(makeExhaustWave(this.ctx, this.appliedExhaust));
      }
      this.applyParams(this.params, this.ctx.currentTime, 0.08);
    }
  }

  /**
   * バックファイア（アフターファイア）: アクセルオフ時の「パンパン」音。
   * 短いノイズバーストを数発、ランダムな間隔でスケジュールする。
   */
  backfire(intensity = 0.7): void {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const shots = 2 + Math.floor(Math.random() * 3); // 2〜4発
    let t = ctx.currentTime + 0.02;

    for (let i = 0; i < shots; i++) {
      const dur = 0.05 + Math.random() * 0.07; // 50〜120ms
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, 0.2);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 300 + Math.random() * 600;
      bp.Q.value = 1.1;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      const peak = (0.25 + Math.random() * 0.25) * intensity;
      env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.001), t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      // lowpass を通さず compressor へ直結し、こもらず「パンッ」と抜けさせる
      src.connect(bp).connect(env).connect(this.compressor);
      src.start(t);
      src.stop(t + dur + 0.05);

      t += 0.06 + Math.random() * 0.2;
    }
  }

  /** スペクトラムデータを取得する（停止中は false） */
  getSpectrum(out: Uint8Array<ArrayBuffer>): boolean {
    if (!this.running || !this.analyser) return false;
    this.analyser.getByteFrequencyData(out);
    return true;
  }

  /** 波形データを取得する（停止中は false） */
  getWaveform(out: Uint8Array<ArrayBuffer>): boolean {
    if (!this.running || !this.analyser) return false;
    this.analyser.getByteTimeDomainData(out);
    return true;
  }

  /** アナライザーのビン数（getSpectrum 用バッファサイズ） */
  get spectrumSize(): number {
    return 128; // fftSize 256 の半分
  }

  /** 現在の点火周波数 (Hz) */
  firingFrequency(p: EngineParams = this.params): number {
    return (p.rpm / 60) * (p.cylinders / 2);
  }

  // ---- 内部 ----------------------------------------------------------------

  private buildGraph(ctx: AudioContext): void {
    // 出力段: lowpass -> compressor -> analyser -> master -> destination
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.75;

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 900;
    this.lowpass.Q.value = 1.2;

    this.lowpass.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.master);
    this.master.connect(ctx.destination);

    // --- 排気パルス列（メインの音色）---
    this.appliedExhaust = this.params.exhaust;
    this.pulseOsc = ctx.createOscillator();
    this.pulseOsc.setPeriodicWave(makeExhaustWave(ctx, this.appliedExhaust));
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
    const prof = EXHAUST_PROFILES[p.exhaust];

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

    // フィルター開度（負荷が高い・回転が高いほど明るく、マフラーが抜けるほど開く）
    const cutoff = prof.cutoffBase + drive * prof.cutoffDrive + rpmNorm * 1500;
    setSmooth(this.lowpass.frequency, cutoff, now, smooth);

    // バンドパス中心も回転で持ち上げる
    setSmooth(this.noiseBandpass.frequency, 900 + rpmNorm * 2600, now, smooth);

    // 各レイヤーの音量バランス
    setSmooth(this.pulseGain.gain, (0.32 + drive * 0.30) * prof.pulseMul, now, smooth);
    setSmooth(this.subGain.gain, 0.45 - rpmNorm * 0.18, now, smooth);
    setSmooth(this.noiseGain.gain, (0.04 + drive * 0.12) * prof.noiseMul, now, smooth);
    setSmooth(this.noiseLfoDepth.gain, (0.03 + drive * 0.10) * prof.noiseMul, now, smooth);

    // マスター音量（アイドルでも鳴り、吹かすと大きく、volume 0 で無音）
    const vol = (0.28 + drive * 0.6) * p.volume;
    setSmooth(this.master.gain, Math.max(vol, 0.0001), now, smooth);
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
 * マフラー種別により倍音の数・減衰カーブが変わり、
 * 抜けの良いマフラーほど高次倍音が残りラフで乾いた音になる。
 */
function makeExhaustWave(ctx: AudioContext, type: ExhaustType): PeriodicWave {
  const prof = EXHAUST_PROFILES[type];
  const n = prof.harmonics;
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const rolloff = 1 / Math.pow(i, prof.rolloffPow);
    const lowBoost = i <= 6 ? prof.lowBoost : 1.0;
    imag[i] = rolloff * lowBoost;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** ホワイトノイズのループ用バッファを生成する */
function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export const ENGINE_LIMITS = { MIN_RPM, MAX_RPM };
