// Live models that drive the whole-cell layer. Each one is a published model or measurement, run in slowed time.
// (Whole-cell molecule motion runs on the GPU from the streamed proteome; see cellworker.js.)

// Fast deterministic PRNG and an approximately normal sample (sum of four uniforms, unit variance).
let rngState = 0x9e3779b9;
const uniform = () => { rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5; return (rngState >>> 0) / 4294967296; };
const gauss = () => (uniform() + uniform() + uniform() + uniform() - 2) * 1.7320508;

// Min oscillation: Howard, Rutenberg & de Vet, PRL 87:278102 (2001), 1D along the cell axis with the paper's
// parameters and densities (MinD 1500/µm, MinE 85/µm, 2 µm cell). Upper-case = cytoplasmic, lower-case = membrane.
export class MinSim {
  constructor(bins = 100, length = 2) {
    this.n = bins; this.dx = length / bins; this.dt = 2.5e-4; this.time = 0;
    const p = { DD: .28, DE: .6, s1: 20, s1p: .028, s2: .0063, s3: .04, s4: .8, s4p: .027 }; Object.assign(this, p);
    this.D = new Float64Array(bins).fill(300); this.d = new Float64Array(bins); this.E = new Float64Array(bins).fill(85); this.e = new Float64Array(bins);
    // Asymmetric start (the paper reports the same final pattern as from near-uniform noise, but reached sooner).
    for (let i = 0; i < bins; i++) if (i < bins / 2) this.d[i] = 2400;
    this.lapD = new Float64Array(bins); this.lapE = new Float64Array(bins);
  }
  step(steps) {
    const { n, dx, dt, D, d, E, e, lapD, lapE } = this, k = 1 / (dx * dx);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n; i++) {
        const l = i ? i - 1 : 0, r = i < n - 1 ? i + 1 : n - 1;
        lapD[i] = (D[l] - 2 * D[i] + D[r]) * k; lapE[i] = (E[l] - 2 * E[i] + E[r]) * k;
      }
      for (let i = 0; i < n; i++) {
        const attach = this.s1 * D[i] / (1 + this.s1p * e[i]), release = this.s2 * e[i] * d[i], on = this.s3 * D[i] * E[i], off = this.s4 * e[i] / (1 + this.s4p * D[i]);
        D[i] += dt * (this.DD * lapD[i] - attach + release); d[i] += dt * (attach - release);
        E[i] += dt * (this.DE * lapE[i] - on + off); e[i] += dt * (on - off);
      }
    }
    this.time += steps * dt;
  }
  // Advance by model seconds, bounded per frame.
  advance(seconds) { this.step(Math.min(1200, Math.round(seconds / this.dt))); }
}

// Motor switching: CheY-P fluctuates (Ornstein-Uhlenbeck) around a set point; the clockwise bias follows the
// ultrasensitive Hill curve of Cluzel, Surette & Leibler, Science 287:1652 (2000): H ≈ 10.3, K ≈ 3.1 µM.
export class ChemotaxisSim {
  constructor() { this.y = 2.7; this.mean = 2.7; this.sigma = .22; this.tau = 6; this.hill = 10.3; this.k = 3.1; this.cwExit = 1 / 1.6; this.history = []; this.clock = 0; this.cw = false; }
  get bias() { return 1 / (1 + Math.pow(this.k / this.y, this.hill)); }
  step(dt) {
    this.y += (this.mean - this.y) / this.tau * dt + this.sigma * Math.sqrt(2 * dt / this.tau) * gauss();
    this.y = Math.max(1.5, Math.min(4.5, this.y));
    this.clock += dt;
    while (this.clock >= .1) { this.clock -= .1; this.history.push([this.y, this.cw]); if (this.history.length > 600) this.history.shift(); }
  }
  // Two-state switching whose stationary CW fraction equals the Hill bias.
  wantsCW(dt) { const b = Math.min(this.bias, .95); return uniform() < b / (1 - b) * this.cwExit * dt; }
  wantsCCW(dt) { return uniform() < this.cwExit * dt; }
}
