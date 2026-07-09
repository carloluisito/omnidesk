import { downmixToMono, resampleLinear, floatToInt16 } from '../../shared/pcm-math';

const TARGET_RATE = 16000;

// AudioWorklet processor that forwards raw mono frames to the main thread.
const WORKLET_SRC = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0];
    if (ch && ch[0]) this.port.postMessage(ch.map(c => c.slice()));
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

export class PcmRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private frames: Float32Array[][] = []; // list of channel-arrays
  private inRate = 48000;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === 'function';
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new AudioContext();
    this.inRate = this.ctx.sampleRate;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.frames = [];

    if (this.ctx.audioWorklet) {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(this.ctx, 'pcm-tap');
      node.port.onmessage = (e) => this.frames.push(e.data as Float32Array[]);
      this.source.connect(node);
      this.node = node;
    } else {
      // Fallback for webviews without AudioWorklet.
      const proc = this.ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => this.frames.push([e.inputBuffer.getChannelData(0).slice()]);
      this.source.connect(proc);
      proc.connect(this.ctx.destination);
      this.node = proc;
    }
  }

  async stop(): Promise<ArrayBuffer> {
    // Flatten each captured chunk to mono, then concatenate.
    const monoChunks = this.frames.map((chs) => downmixToMono(chs));
    const total = monoChunks.reduce((n, c) => n + c.length, 0);
    const mono = new Float32Array(total);
    let off = 0;
    for (const c of monoChunks) { mono.set(c, off); off += c.length; }

    const resampled = resampleLinear(mono, this.inRate, TARGET_RATE);
    const int16 = floatToInt16(resampled);
    this.dispose();
    // floatToInt16 allocates a fresh Int16Array, so its backing store is a real
    // ArrayBuffer (never SharedArrayBuffer); the cast narrows ArrayBufferLike.
    return int16.buffer as ArrayBuffer;
  }

  dispose(): void {
    try { this.node?.disconnect(); } catch { /* noop */ }
    try { this.source?.disconnect(); } catch { /* noop */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null; this.stream = null; this.node = null; this.source = null;
  }
}
