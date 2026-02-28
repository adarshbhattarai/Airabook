/* global AudioWorkletProcessor, registerProcessor, sampleRate */

// AudioWorklet runs in its own context; no imports from app code here.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const targetSampleRate = options?.processorOptions?.targetSampleRate || 16000;
    this._targetSampleRate = targetSampleRate;
    this._ratio = sampleRate / targetSampleRate; // inputRate / outputRate

    this._tail = new Float32Array(0);
    this._pos = 0; // fractional index into combined buffer
  }

  _resampleLinear(inputChunk) {
    // Combine tail + new input
    const combined = new Float32Array(this._tail.length + inputChunk.length);
    combined.set(this._tail, 0);
    combined.set(inputChunk, this._tail.length);

    const ratio = this._ratio;
    let pos = this._pos;

    // Estimate output length (safe upper bound) to avoid dynamic arrays.
    const maxOut = Math.ceil((combined.length - pos - 1) / ratio);
    if (maxOut <= 0) {
      this._tail = combined;
      return new Float32Array(0);
    }

    const out = new Float32Array(maxOut);
    let outIdx = 0;

    while (pos + 1 < combined.length && outIdx < maxOut) {
      const i = pos | 0; // faster floor for positive numbers
      const frac = pos - i;
      const s0 = combined[i];
      const s1 = combined[i + 1];
      out[outIdx++] = s0 + (s1 - s0) * frac;
      pos += ratio;
    }

    const keepFrom = pos | 0;
    this._tail = combined.slice(keepFrom);
    this._pos = pos - keepFrom;

    return outIdx === out.length ? out : out.slice(0, outIdx);
  }

  process(inputs, outputs) {
    const input = inputs?.[0]?.[0];
    const output = outputs?.[0]?.[0];

    if (output) {
      // ensure silence (this node is only for capture)
      output.fill(0);
    }

    if (!input || input.length === 0) return true;

    const resampled = this._resampleLinear(input);
    if (resampled.length === 0) return true;

    // RMS for simple VAD/audio meter
    let sumSq = 0;
    for (let i = 0; i < resampled.length; i++) {
      const x = resampled[i];
      sumSq += x * x;
    }
    const rms = Math.sqrt(sumSq / resampled.length);

    const pcm = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      let x = resampled[i];
      if (x > 1) x = 1;
      else if (x < -1) x = -1;
      pcm[i] = x < 0 ? x * 0x8000 : x * 0x7fff;
    }

    // Transfer the underlying buffer to avoid copy.
    this.port.postMessage({ pcmBuffer: pcm.buffer, rms }, [pcm.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);

