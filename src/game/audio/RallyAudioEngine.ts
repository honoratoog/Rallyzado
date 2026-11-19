/**
 * Procedural Web Audio API sound engine for Rallyzado.
 * Zero external audio assets required:
 *  - Multi-oscillator rally engine (boxer/inline-5 character) with waveshaper saturation & dynamic lowpass
 *  - Subtle turbocharger whine + blow-off valve flutter on throttle lift
 *  - Dual-layer skid/gravel noise (asphalt tire screech bandpass + crunchy gravel spray)
 *  - Motorsport SFX: countdown 3-2-1-GO beeps, checkpoint chime, finish fanfare, impact thud
 */
class RallyAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Engine nodes
  private oscPrimary: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private oscTurbo: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private turboGain: GainNode | null = null;

  // Skid & gravel nodes
  private skidNoiseSource: AudioBufferSourceNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private gravelFilter: BiquadFilterNode | null = null;
  private gravelGain: GainNode | null = null;

  private initialized = false;
  private muted = false;
  private prevThrottle = 0;
  private prevRpmNorm = 0;
  private lastFlutterTime = 0;

  private createSaturationCurve(amount = 28): Float32Array<ArrayBuffer> {
    const samples = 256;
    const buffer = new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
    const length = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Slight pink-ish blend for richer gravel/tire texture
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.45) * 0.85));
    }
    return buffer;
  }

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.34;
    master.connect(ctx.destination);
    this.masterGain = master;

    // --- ENGINE SYNTH ---
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.createSaturationCurve(22);
    shaper.oversample = '2x';

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 340;
    engineFilter.Q.value = 2.6;
    this.engineFilter = engineFilter;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.001;
    this.engineGain = engineGain;

    const oscPrimary = ctx.createOscillator();
    oscPrimary.type = 'sawtooth';
    oscPrimary.frequency.value = 55;
    this.oscPrimary = oscPrimary;

    const oscHarmonic = ctx.createOscillator();
    oscHarmonic.type = 'triangle';
    oscHarmonic.frequency.value = 110;
    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = 0.45;
    this.oscHarmonic = oscHarmonic;

    const oscSub = ctx.createOscillator();
    oscSub.type = 'square';
    oscSub.frequency.value = 27.5;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.25;
    this.oscSub = oscSub;

    // Turbo whine
    const oscTurbo = ctx.createOscillator();
    oscTurbo.type = 'sine';
    oscTurbo.frequency.value = 1200;
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0.0001;
    this.oscTurbo = oscTurbo;
    this.turboGain = turboGain;

    oscPrimary.connect(shaper);
    oscHarmonic.connect(harmonicGain);
    harmonicGain.connect(shaper);
    oscSub.connect(subGain);
    subGain.connect(shaper);

    shaper.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);

    oscTurbo.connect(turboGain);
    turboGain.connect(master);

    oscPrimary.start();
    oscHarmonic.start();
    oscSub.start();
    oscTurbo.start();

    // --- SKID & GRAVEL NOISE ---
    const noiseBuf = this.createNoiseBuffer(ctx, 2.5);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    this.skidNoiseSource = noiseSrc;

    // Asphalt tire screech bandpass
    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 1150;
    screechFilter.Q.value = 4.2;
    const screechGain = ctx.createGain();
    screechGain.gain.value = 0;
    this.screechFilter = screechFilter;
    this.screechGain = screechGain;

    // Gravel / dirt spray filter
    const gravelFilter = ctx.createBiquadFilter();
    gravelFilter.type = 'bandpass';
    gravelFilter.frequency.value = 620;
    gravelFilter.Q.value = 0.9;
    const gravelGain = ctx.createGain();
    gravelGain.gain.value = 0;
    this.gravelFilter = gravelFilter;
    this.gravelGain = gravelGain;

    noiseSrc.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(master);

    noiseSrc.connect(gravelFilter);
    gravelFilter.connect(gravelGain);
    gravelGain.connect(master);

    noiseSrc.start();

    this.initialized = true;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.34, this.ctx.currentTime, 0.04);
    }
  }

  public updateTelemetry(params: {
    rpmNormalized: number;
    throttle: number;
    slipIntensity: number;
    speedKmh: number;
    active: boolean;
  }): void {
    if (!this.initialized || !this.ctx || !this.oscPrimary || !this.oscHarmonic || !this.oscSub) {
      return;
    }

    const now = this.ctx.currentTime;
    const { rpmNormalized, throttle, slipIntensity, speedKmh, active } = params;

    if (!active) {
      this.engineGain?.gain.setTargetAtTime(0.035, now, 0.12);
      this.oscPrimary.frequency.setTargetAtTime(42, now, 0.1);
      this.oscHarmonic.frequency.setTargetAtTime(84, now, 0.1);
      this.oscSub.frequency.setTargetAtTime(21, now, 0.1);
      this.engineFilter?.frequency.setTargetAtTime(220, now, 0.1);
      this.turboGain?.gain.setTargetAtTime(0, now, 0.08);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.06);
      this.gravelGain?.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    // Rally boxer/inline-5 fundamental frequency (42 Hz idle -> 215 Hz redline)
    const clampedRpm = Math.max(0, Math.min(1.08, rpmNormalized));
    const baseFreq = 44 + clampedRpm * 168;
    this.oscPrimary.frequency.setTargetAtTime(baseFreq, now, 0.035);
    this.oscHarmonic.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.035);
    this.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.035);

    // Filter opens wide under throttle & high RPM
    const filterFreq = 240 + clampedRpm * 1650 + throttle * 750;
    this.engineFilter?.frequency.setTargetAtTime(filterFreq, now, 0.045);

    const engLevel = 0.14 + throttle * 0.13 + clampedRpm * 0.08;
    this.engineGain?.gain.setTargetAtTime(engLevel, now, 0.045);

    // Subtle turbo spool whine above 45% RPM on throttle
    const turboIntensity = Math.max(0, clampedRpm - 0.35) * throttle;
    this.oscTurbo?.frequency.setTargetAtTime(1100 + clampedRpm * 2400, now, 0.06);
    this.turboGain?.gain.setTargetAtTime(turboIntensity * 0.025, now, 0.06);

    // Rally turbo BOV flutter on sudden throttle lift from high RPM
    if (
      this.prevThrottle > 0.65 &&
      throttle < 0.15 &&
      this.prevRpmNorm > 0.6 &&
      now - this.lastFlutterTime > 0.7
    ) {
      this.lastFlutterTime = now;
      this.playTurboFlutter();
    }

    // Skid & gravel sound proportional to slip & speed
    const speedGate = Math.min(1, speedKmh / 18);
    const skid = Math.max(0, Math.min(1, slipIntensity)) * speedGate;
    this.screechFilter?.frequency.setTargetAtTime(980 + skid * 620, now, 0.05);
    this.screechGain?.gain.setTargetAtTime(skid * 0.22, now, 0.045);

    this.gravelFilter?.frequency.setTargetAtTime(480 + speedKmh * 4.5, now, 0.06);
    this.gravelGain?.gain.setTargetAtTime(skid * 0.18 + (speedGate * 0.03), now, 0.05);

    this.prevThrottle = throttle;
    this.prevRpmNorm = clampedRpm;
  }

  private playTurboFlutter(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.065;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1850 - i * 240, t);
      osc.frequency.exponentialRampToValueAtTime(900 - i * 120, t + 0.055);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.032 * (1 - i * 0.25), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.058);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.062);
    }
  }

  public playCountdownBeep(isGo: boolean): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isGo ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    if (isGo) {
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12);
    }

    const dur = isGo ? 0.36 : 0.16;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isGo ? 0.24 : 0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  public playCheckpointChime(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [659.25, 987.77]; // E5 -> B5
    notes.forEach((freq, i) => {
      const t = now + i * 0.07;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playFinishFanfare(isRecord: boolean): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = isRecord
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.085;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.48);
    });
  }

  public playImpact(strength = 0.5): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.14);
    const amp = Math.min(0.28, 0.06 + strength * 0.22);
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }
}

export const rallyAudio = new RallyAudioEngine();
