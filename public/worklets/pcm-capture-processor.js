/**
 * DESTRIA TECH INC — AudioWorklet PCM 16kHz Capture Processor
 *
 * Runs off the main UI thread on the Web Audio rendering thread:
 * - Anti-aliased box-averaged downsampling from hardware sampleRate (44.1kHz / 48kHz)
 *   to exact 16,000 Hz signed 16-bit little-endian PCM (Int16Array) for Gemini Live API.
 * - Computes real-time frame RMS energy for adaptive Voice Activity Detection (VAD)
 *   and barge-in speech interruption without leaking microphone audio to speakers.
 */

class DestriaPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetSampleRate = opts.targetSampleRate || 16000;
    this.frameSize = opts.frameSize || 2048; // ~128ms at 16kHz
    this.buffer = new Int16Array(this.frameSize);
    this.bufferOffset = 0;
    this.inputAccumulator = 0;
    this.inputAccumCount = 0;
    this.sampleCursor = 0;
    this.energySum = 0;
    this.energyCount = 0;
  }

  process(inputs) {
    const input = inputs && inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const channelData = input[0];
    const ratio = sampleRate / this.targetSampleRate;

    if (ratio <= 1.001) {
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        this.energySum += s * s;
        this.energyCount += 1;
        this.buffer[this.bufferOffset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.bufferOffset >= this.frameSize) {
          this.flushFrame();
        }
      }
      return true;
    }

    // Anti-aliased box-filter downsampling to exact 16kHz
    for (let i = 0; i < channelData.length; i++) {
      const sample = channelData[i];
      this.inputAccumulator += sample;
      this.inputAccumCount += 1;
      this.sampleCursor += 1;

      if (this.sampleCursor >= ratio) {
        const avg = this.inputAccumCount > 0 ? this.inputAccumulator / this.inputAccumCount : 0;
        const clamped = Math.max(-1, Math.min(1, avg));
        this.energySum += clamped * clamped;
        this.energyCount += 1;
        this.buffer[this.bufferOffset++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        this.inputAccumulator = 0;
        this.inputAccumCount = 0;
        this.sampleCursor -= ratio;

        if (this.bufferOffset >= this.frameSize) {
          this.flushFrame();
        }
      }
    }

    return true;
  }

  flushFrame() {
    const rms = this.energyCount > 0 ? Math.sqrt(this.energySum / this.energyCount) : 0;
    const pcmCopy = new Int16Array(this.buffer);
    this.port.postMessage(
      {
        type: 'pcm_frame',
        pcmBuffer: pcmCopy.buffer,
        rms,
        sampleRate: this.targetSampleRate,
      },
      [pcmCopy.buffer]
    );
    this.bufferOffset = 0;
    this.energySum = 0;
    this.energyCount = 0;
  }
}

registerProcessor('destria-pcm-capture-processor', DestriaPcmCaptureProcessor);
