"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // client/src/worklets/epicenter-worklet.ts
  var DENORMAL_FLOOR = 1e-24;
  var BiquadFilter = class {
    constructor(type, freq, sr, Q = 1) {
      this.type = type;
      this.freq = freq;
      this.sr = sr;
      this.Q = Q;
      __publicField(this, "b0", 0);
      __publicField(this, "b1", 0);
      __publicField(this, "b2", 0);
      __publicField(this, "a1", 0);
      __publicField(this, "a2", 0);
      __publicField(this, "x1", 0);
      __publicField(this, "x2", 0);
      __publicField(this, "y1", 0);
      __publicField(this, "y2", 0);
      this.updateCoeffs(type, freq, Q);
    }
    denormalFloor(value) {
      return Math.abs(value) < DENORMAL_FLOOR ? 0 : value;
    }
    updateCoeffs(type, freq, Q = 1) {
      this.type = type;
      this.freq = freq;
      this.Q = Q;
      const clampedFreq = Math.max(5, Math.min(freq, this.sr / 2.5));
      const clampedQ = Math.max(0.1, Math.min(Q, 10));
      const omega = 2 * Math.PI * clampedFreq / this.sr;
      const sinOmega = Math.sin(omega);
      const cosOmega = Math.cos(omega);
      const alpha = sinOmega / (2 * clampedQ);
      let b0, b1, b2;
      let a0, a1, a2;
      if (type === "lowpass") {
        b0 = (1 - cosOmega) / 2;
        b1 = 1 - cosOmega;
        b2 = (1 - cosOmega) / 2;
      } else {
        b0 = (1 + cosOmega) / 2;
        b1 = -(1 + cosOmega);
        b2 = (1 + cosOmega) / 2;
      }
      a0 = 1 + alpha;
      a1 = -2 * cosOmega;
      a2 = 1 - alpha;
      this.b0 = b0 / a0;
      this.b1 = b1 / a0;
      this.b2 = b2 / a0;
      this.a1 = a1 / a0;
      this.a2 = a2 / a0;
    }
    process(sample) {
      const cleanSample = this.denormalFloor(sample);
      const y0 = this.b0 * cleanSample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.denormalFloor(this.x1);
      this.x1 = this.denormalFloor(cleanSample);
      this.y2 = this.denormalFloor(this.y1);
      this.y1 = this.denormalFloor(y0);
      return this.denormalFloor(y0);
    }
    reset() {
      this.x1 = this.x2 = this.y1 = this.y2 = 0;
    }
  };
  var EpicenterProcessor = class extends AudioWorkletProcessor {
    constructor(options) {
      super();
      __publicField(this, "channels", []);
      __publicField(this, "lastSweepFreq", 45);
      __publicField(this, "lastWidth", 50);
      __publicField(this, "lastIntensity", 50);
    }
    static get parameterDescriptors() {
      return [
        { name: "sweepFreq", defaultValue: 45, minValue: 27, maxValue: 63, automationRate: "k-rate" },
        { name: "width", defaultValue: 50, minValue: 0, maxValue: 100, automationRate: "k-rate" },
        { name: "intensity", defaultValue: 50, minValue: 0, maxValue: 100, automationRate: "k-rate" },
        { name: "balance", defaultValue: 50, minValue: 0, maxValue: 100, automationRate: "k-rate" },
        { name: "volume", defaultValue: 100, minValue: 0, maxValue: 150, automationRate: "k-rate" }
      ];
    }
    denormalFloor(value) {
      return Math.abs(value) < DENORMAL_FLOOR ? 0 : value;
    }
    ensureChannelState(numChannels, params) {
      while (this.channels.length < numChannels) {
        const state = {
          lowpassHarm: new BiquadFilter("lowpass", params.sweepFreq * 4, sampleRate, 0.8),
          highpassHarm: new BiquadFilter("highpass", params.sweepFreq * 1.5, sampleRate, 0.8),
          envelopeFilter: new BiquadFilter("lowpass", 25, sampleRate, 0.707),
          bassSmooth: new BiquadFilter("lowpass", params.sweepFreq * 1.1, sampleRate, 0.707),
          voiceHighpass: new BiquadFilter("highpass", 150, sampleRate, 0.707),
          flipState1: 1,
          lastSample1: 0,
          flipState2: 1,
          lastSample2: 0,
          flipCounter1: 0,
          flipCounter2: 0
        };
        this.channels.push(state);
      }
      const paramsChanged = params.sweepFreq !== this.lastSweepFreq || params.width !== this.lastWidth;
      if (paramsChanged) {
        for (const state of this.channels) {
          state.lowpassHarm.updateCoeffs("lowpass", params.sweepFreq * 4, 0.8);
          state.highpassHarm.updateCoeffs("highpass", params.sweepFreq * 1.5, 0.8);
          state.bassSmooth.updateCoeffs("lowpass", params.sweepFreq * 1.1, 0.707);
        }
        this.lastSweepFreq = params.sweepFreq;
        this.lastWidth = params.width;
      }
    }
    process(inputs, outputs, parameters) {
      const input = inputs[0];
      const output = outputs[0];
      if (!input || input.length === 0) {
        return true;
      }
      const numChannels = input.length;
      const sweepFreq = parameters.sweepFreq[0];
      const width = parameters.width[0];
      const intensity = parameters.intensity[0];
      const balance = parameters.balance[0];
      const volume = parameters.volume[0];
      if (intensity <= 0.01) {
        for (let ch = 0; ch < numChannels; ch++) {
          const inChan = input[ch];
          const outChan = output[ch];
          for (let i = 0; i < inChan.length; i++) {
            outChan[i] = inChan[i];
          }
        }
        return true;
      }
      const widthFactor = width / 100;
      const bassGain = intensity / 100 * 2.5;
      const balanceFactor = balance / 100;
      const voiceWeight = 1 - balanceFactor * 0.4;
      const bassWeight = 0.5 + balanceFactor * 0.4;
      const volumeGain = Math.min(volume / 100, 1);
      this.ensureChannelState(numChannels, { sweepFreq, width });
      for (let ch = 0; ch < numChannels; ch++) {
        const inChan = input[ch];
        const outChan = output[ch];
        const state = this.channels[ch];
        for (let i = 0; i < inChan.length; i++) {
          let sample = this.denormalFloor(inChan[i]);
          let harmonic = state.lowpassHarm.process(sample);
          harmonic = state.highpassHarm.process(harmonic);
          harmonic = this.denormalFloor(harmonic);
          const env = Math.abs(harmonic);
          let envelope = state.envelopeFilter.process(env);
          envelope = this.denormalFloor(envelope);
          const harmonicSmoothed = (state.lastSample1 + harmonic) * 0.5;
          if (state.lastSample1 <= 0 && harmonic > 0) {
            state.flipCounter1 = 0;
            state.flipState1 *= -1;
          }
          state.flipCounter1++;
          state.lastSample1 = harmonic;
          const halfSignal = state.flipState1 * envelope;
          const halfSmoothed = (state.lastSample2 + halfSignal) * 0.5;
          if (state.lastSample2 <= 0 && halfSignal > 0) {
            state.flipCounter2 = 0;
            state.flipState2 *= -1;
          }
          state.flipCounter2++;
          state.lastSample2 = halfSignal;
          const quarterSignal = state.flipState2 * envelope;
          let bass = halfSignal * 0.6 + quarterSignal * 0.4;
          bass = state.bassSmooth.process(bass);
          bass = this.denormalFloor(bass);
          const restoredBass = bass * bassGain;
          const voice = state.voiceHighpass.process(sample);
          const mixed = voice * voiceWeight + restoredBass * bassWeight;
          let output_sample = mixed * volumeGain;
          if (output_sample > 0.95) {
            output_sample = 0.95 + Math.tanh((output_sample - 0.95) * 2) * 0.05;
          } else if (output_sample < -0.95) {
            output_sample = -0.95 + Math.tanh((output_sample + 0.95) * 2) * 0.05;
          }
          outChan[i] = this.denormalFloor(output_sample);
        }
      }
      return true;
    }
  };
  registerProcessor("epicenter-processor", EpicenterProcessor);
})();
