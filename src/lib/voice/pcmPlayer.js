export class PcmPlayer {
  constructor({ sampleRate = 24000 } = {}) {
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) {
      throw new Error('Web Audio (AudioContext) is not supported in this browser.');
    }

    this.sampleRate = sampleRate;
    this.audioContext = new AudioContextImpl();
    this.gain = this.audioContext.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(this.audioContext.destination);

    this._nextTime = 0;
    this._sources = new Set();
  }

  async resume() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  playChunk(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) return;

    const int16 = new Int16Array(arrayBuffer);
    if (!int16.length) return;

    const floats = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      floats[i] = int16[i] / 0x8000;
    }

    const buffer = this.audioContext.createBuffer(1, floats.length, this.sampleRate);
    buffer.copyToChannel(floats, 0, 0);

    const src = this.audioContext.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);

    const now = this.audioContext.currentTime;
    if (!this._nextTime || this._nextTime < now + 0.01) {
      this._nextTime = now + 0.02;
    }

    this._sources.add(src);
    src.onended = () => {
      this._sources.delete(src);
    };

    src.start(this._nextTime);
    this._nextTime += buffer.duration;
  }

  stop() {
    for (const src of this._sources) {
      try {
        src.stop();
      } catch (_) {
        // ignore
      }
    }
    this._sources.clear();
    this._nextTime = 0;
  }

  async close() {
    this.stop();
    try {
      this.gain.disconnect();
    } catch (_) {
      // ignore
    }
    try {
      await this.audioContext.close();
    } catch (_) {
      // ignore
    }
  }
}

