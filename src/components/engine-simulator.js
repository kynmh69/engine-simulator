// Engine Simulator - Web Audio API based engine sound synthesis

const FIRING_ORDERS = {
  3:  [1, 2, 3],
  4:  [1, 3, 4, 2],
  5:  [1, 2, 4, 5, 3],
  6:  [1, 5, 3, 6, 2, 4],
  7:  [1, 3, 5, 7, 2, 4, 6],
  8:  [1, 5, 4, 2, 6, 3, 7, 8],
  9:  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  10: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9],
  11: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  12: [1, 7, 5, 11, 3, 9, 6, 12, 2, 8, 4, 10],
};

class EngineSimulator {
  constructor() {
    this.audioCtx = null;
    this.isRunning = false;
    this.cylinders = 4;
    this.rpm = 1000;
    this.volume = 0.7;
    this.animationId = null;
    this.nextFireTime = 0;
    this.cylinderPhases = [];
    this.masterGain = null;
    this.schedulerInterval = null;
    this.lookahead = 0.1;
    this.scheduleAheadTime = 0.2;
    this.waveformData = new Float32Array(800);
    this.currentCylinder = 0;
    this.pistonPositions = [];

    this.initDOM();
    this.updateCylindersView();
    this.renderLoop();
  }

  initDOM() {
    this.startBtn = document.getElementById('start-btn');
    this.stopBtn = document.getElementById('stop-btn');
    this.rpmSlider = document.getElementById('rpm-slider');
    this.rpmDisplay = document.getElementById('rpm-display');
    this.volumeSlider = document.getElementById('volume-slider');
    this.volumeDisplay = document.getElementById('volume-display');
    this.cylBtns = document.querySelectorAll('.cyl-btn');
    this.cylindersView = document.getElementById('cylinders-view');
    this.canvas = document.getElementById('waveform-canvas');
    this.ctx2d = this.canvas.getContext('2d');
    this.infoCylinders = document.getElementById('info-cylinders');
    this.infoRpm = document.getElementById('info-rpm');
    this.infoFiring = document.getElementById('info-firing');
    this.infoStatus = document.getElementById('info-status');

    this.startBtn.addEventListener('click', () => this.start());
    this.stopBtn.addEventListener('click', () => this.stop());

    this.rpmSlider.addEventListener('input', (e) => {
      this.rpm = parseInt(e.target.value);
      this.rpmDisplay.textContent = this.rpm;
      this.infoRpm.textContent = this.rpm;
    });

    this.volumeSlider.addEventListener('input', (e) => {
      this.volume = parseInt(e.target.value) / 100;
      this.volumeDisplay.textContent = e.target.value;
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(this.volume * 0.8, this.audioCtx.currentTime, 0.05);
      }
    });

    this.cylBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.cylBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.cylinders = parseInt(btn.dataset.cylinders);
        this.infoCylinders.textContent = this.cylinders;
        this.infoFiring.textContent = FIRING_ORDERS[this.cylinders].join('-');
        this.updateCylindersView();
        if (this.isRunning) {
          this.stop();
          this.start();
        }
      });
    });

    // init info
    this.infoCylinders.textContent = this.cylinders;
    this.infoFiring.textContent = FIRING_ORDERS[this.cylinders].join('-');
  }

  initAudio() {
    if (this.audioCtx) return;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = this.volume * 0.8;

    // Low-pass filter for engine rumble
    this.lowPass = this.audioCtx.createBiquadFilter();
    this.lowPass.type = 'lowpass';
    this.lowPass.frequency.value = 800;
    this.lowPass.Q.value = 1.5;

    // High-pass to remove DC
    this.highPass = this.audioCtx.createBiquadFilter();
    this.highPass.type = 'highpass';
    this.highPass.frequency.value = 30;

    // Compressor for dynamics
    this.compressor = this.audioCtx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.1;

    this.masterGain.connect(this.lowPass);
    this.lowPass.connect(this.highPass);
    this.highPass.connect(this.compressor);
    this.compressor.connect(this.audioCtx.destination);

    // Analyser for waveform
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.connect(this.audioCtx.destination);
    this.compressor.connect(this.analyser);
  }

  // Synthesize a single cylinder firing event
  scheduleFiring(startTime, cylinderIndex) {
    const ctx = this.audioCtx;

    // Combustion burst - main thump
    const burstGain = ctx.createGain();
    burstGain.gain.setValueAtTime(0, startTime);
    burstGain.gain.linearRampToValueAtTime(1.2, startTime + 0.003);
    burstGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
    burstGain.connect(this.masterGain);

    // Low frequency component (combustion)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const baseFreq = 40 + (this.rpm / 8000) * 80;
    osc1.frequency.setValueAtTime(baseFreq * 2.5, startTime);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, startTime + 0.08);
    osc1.connect(burstGain);
    osc1.start(startTime);
    osc1.stop(startTime + 0.15);

    // Mid frequency - mechanical knock
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(baseFreq * 5, startTime);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, startTime + 0.05);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.3, startTime);
    g2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
    osc2.connect(g2);
    g2.connect(this.masterGain);
    osc2.start(startTime);
    osc2.stop(startTime + 0.1);

    // Noise burst for exhaust character
    const bufferSize = Math.floor(ctx.sampleRate * 0.15);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 200 + cylinderIndex * 30;
    noiseFilter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSource.start(startTime);
    noiseSource.stop(startTime + 0.15);

    // Exhaust valve click
    const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.005), ctx.sampleRate);
    const cd = clickBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;
    const cg = ctx.createGain();
    cg.gain.value = 0.15;
    clickSrc.connect(cg);
    cg.connect(this.masterGain);
    const exhaust = startTime + 0.06;
    clickSrc.start(exhaust);
    clickSrc.stop(exhaust + 0.006);

    // Mark this cylinder as firing for animation
    const cylIndex = cylinderIndex;
    setTimeout(() => {
      this.pistonPositions[cylIndex] = 1.0;
    }, (startTime - ctx.currentTime) * 1000);
  }

  scheduler() {
    if (!this.isRunning) return;
    const cycleTime = (60 / this.rpm) * 2; // 4-stroke: 2 crankshaft rotations per cycle
    const firingInterval = cycleTime / this.cylinders;
    const firingOrder = FIRING_ORDERS[this.cylinders];
    const now = this.audioCtx.currentTime;

    while (this.nextFireTime < now + this.scheduleAheadTime) {
      const cylIndex = this.currentCylinder % this.cylinders;
      const physCyl = firingOrder[cylIndex] - 1;
      this.scheduleFiring(this.nextFireTime, physCyl);
      this.nextFireTime += firingInterval;
      this.currentCylinder++;
    }
  }

  async start() {
    if (this.isRunning) return;
    this.initAudio();

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.isRunning = true;
    this.currentCylinder = 0;
    this.nextFireTime = this.audioCtx.currentTime + 0.05;

    // Update filter based on RPM
    this.lowPass.frequency.value = 300 + (this.rpm / 8000) * 1500;

    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;
    this.infoStatus.textContent = '稼働中';
    this.infoStatus.style.color = '#2ecc71';

    this.schedulerInterval = setInterval(() => {
      if (!this.isRunning) return;
      // Update filter frequency based on current RPM
      this.lowPass.frequency.setTargetAtTime(
        300 + (this.rpm / 8000) * 1500,
        this.audioCtx.currentTime, 0.1
      );
      this.scheduler();
    }, 25);
  }

  stop() {
    this.isRunning = false;
    clearInterval(this.schedulerInterval);
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
    this.infoStatus.textContent = '停止中';
    this.infoStatus.style.color = '#e0e0e0';
    this.pistonPositions = new Array(this.cylinders).fill(0);
  }

  updateCylindersView() {
    const n = this.cylinders;
    this.pistonPositions = new Array(n).fill(0);
    const firingOrder = FIRING_ORDERS[n];

    this.cylindersView.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'cylinder-wrapper';
      wrapper.innerHTML = `
        <div class="cylinder-num">${i + 1}</div>
        <div class="cylinder-body">
          <div class="cylinder-bore">
            <div class="piston" id="piston-${i}"></div>
          </div>
          <div class="cylinder-label">cyl.${i + 1}</div>
        </div>
      `;
      this.cylindersView.appendChild(wrapper);
    }
  }

  renderLoop() {
    const now = performance.now();

    // Animate pistons
    const n = this.cylinders;
    for (let i = 0; i < n; i++) {
      if (this.isRunning) {
        // Calculate piston position from crankshaft angle
        const firingOrder = FIRING_ORDERS[n];
        const cycleTime = (60 / this.rpm) * 2000; // ms
        const offset = (firingOrder.indexOf(i + 1) / n) * cycleTime;
        const t = ((now - offset) % cycleTime) / cycleTime;
        // 4-stroke: 0=TDC combustion, 0.5=BDC
        const angle = t * Math.PI * 4;
        const pos = (1 - Math.cos(angle)) / 2; // 0=top, 1=bottom
        this.pistonPositions[i] = pos;

        const piston = document.getElementById(`piston-${i}`);
        if (piston) {
          const travel = 70; // px
          piston.style.transform = `translateY(${pos * travel}px)`;
          // Firing flash
          const isFiring = t < 0.1 || t > 0.9;
          piston.style.background = isFiring
            ? 'linear-gradient(180deg, #ff6b35, #ffcc00)'
            : 'linear-gradient(180deg, #888, #555)';
          piston.style.boxShadow = isFiring ? '0 0 12px rgba(255,107,53,0.8)' : 'none';
        }
      } else {
        const piston = document.getElementById(`piston-${i}`);
        if (piston) {
          piston.style.transform = 'translateY(0px)';
          piston.style.background = 'linear-gradient(180deg, #666, #444)';
          piston.style.boxShadow = 'none';
        }
      }
    }

    // Draw waveform
    if (this.analyser && this.isRunning) {
      const buf = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(buf);
      this.drawWaveform(buf);
    } else {
      this.drawFlatLine();
    }

    if (this.isRunning) {
      this.infoRpm.textContent = this.rpm;
    }

    this.animationId = requestAnimationFrame(() => this.renderLoop());
  }

  drawWaveform(data) {
    const canvas = this.canvas;
    const ctx = this.ctx2d;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0d18';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    for (let y = 0; y <= H; y += H / 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = '#2a2a3e';
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Waveform
    ctx.beginPath();
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 2;
    const step = W / data.length;
    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = H / 2 + data[i] * (H / 2) * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Label
    ctx.fillStyle = '#555';
    ctx.font = '11px monospace';
    ctx.fillText('WAVEFORM', 8, 16);
  }

  drawFlatLine() {
    const canvas = this.canvas;
    const ctx = this.ctx2d;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0d18';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.font = '11px monospace';
    ctx.fillText('WAVEFORM', 8, 16);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new EngineSimulator();
});
