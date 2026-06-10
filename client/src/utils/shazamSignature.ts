/**
 * Pure TypeScript port of the Shazam audio fingerprinting algorithm (DejaVu signature format).
 * Derived from the Metrolist Kotlin generator.
 */

const SAMPLE_RATE = 16000;
const FFT_SIZE = 2048;
const FFT_OUTPUT_SIZE = 1025; // FFT_SIZE / 2 + 1
const MAX_PEAKS = 255;
const MAX_TIME_SECONDS = 12.0;
const RING_BUF_SIZE = 256;

const BAND_250_520 = 0;
const BAND_520_1450 = 1;
const BAND_1450_3500 = 2;
const BAND_3500_5500 = 3;

// Precompute Hanning window values
const HANNING = new Float64Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  HANNING[i] = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * (i + 1)) / 2049.0));
}

class CRC32 {
  private static table: Int32Array = CRC32.makeTable();

  private static makeTable(): Int32Array {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        if (c & 1) {
          c = 0xedb88320 ^ (c >>> 1);
        } else {
          c = c >>> 1;
        }
      }
      table[i] = c;
    }
    return table;
  }

  private crc = 0xffffffff;

  update(bytes: Uint8Array, offset: number, length: number) {
    let crc = this.crc;
    for (let i = offset; i < offset + length; i++) {
      crc = (crc >>> 8) ^ CRC32.table[(crc ^ bytes[i]) & 0xff];
    }
    this.crc = crc;
  }

  getValue(): number {
    return (this.crc ^ 0xffffffff) >>> 0;
  }
}

class ByteBuilder {
  private bytes: number[] = [];

  write(byte: number) {
    this.bytes.push(byte & 0xff);
  }

  writeUint16LE(value: number) {
    this.bytes.push(value & 0xff);
    this.bytes.push((value >>> 8) & 0xff);
  }

  writeUint32LE(value: number) {
    this.bytes.push(value & 0xff);
    this.bytes.push((value >>> 8) & 0xff);
    this.bytes.push((value >>> 16) & 0xff);
    this.bytes.push((value >>> 24) & 0xff);
  }

  writeBytes(arr: Uint8Array) {
    for (let i = 0; i < arr.length; i++) {
      this.bytes.push(arr[i]);
    }
  }

  toArray(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function computeRfft(windowed: Float64Array): Float64Array {
  const n = windowed.length;
  const re = new Float64Array(windowed);
  const im = new Float64Array(n);

  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >>> 1;
    while (j & bit) {
      j ^= bit;
      bit >>>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tmpRe = re[i]; re[i] = re[j]; re[j] = tmpRe;
      const tmpIm = im[i]; im[i] = im[j]; im[j] = tmpIm;
    }
  }

  let len = 2;
  while (len <= n) {
    const halfLen = len >>> 1;
    const ang = -Math.PI / halfLen;
    const wBaseRe = Math.cos(ang);
    const wBaseIm = Math.sin(ang);
    let i = 0;
    while (i < n) {
      let wRe = 1.0;
      let wIm = 0.0;
      for (let k = 0; k < halfLen; k++) {
        const u = i + k;
        const v = u + halfLen;
        const evenRe = re[u];
        const evenIm = im[u];
        const oddRe = re[v] * wRe - im[v] * wIm;
        const oddIm = re[v] * wIm + im[v] * wRe;
        re[u] = evenRe + oddRe;
        im[u] = evenIm + oddIm;
        re[v] = evenRe - oddRe;
        im[v] = evenIm - oddIm;
        const newWRe = wRe * wBaseRe - wIm * wBaseIm;
        wIm = wRe * wBaseIm + wIm * wBaseRe;
        wRe = newWRe;
      }
      i += len;
    }
    len <<= 1;
  }

  const scaleFactor = 1.0 / 131072; // 1 / 2^17
  const minVal = 1e-10;
  const magnitudes = new Float64Array(1025);
  for (let idx = 0; idx < 1025; idx++) {
    const r = re[idx];
    const img = im[idx];
    const mag = (r * r + img * img) * scaleFactor;
    magnitudes[idx] = mag < minVal ? minVal : mag;
  }
  return magnitudes;
}

interface FrequencyPeak {
  fftPassNumber: number;
  peakMagnitude: number;
  correctedPeakFrequencyBin: number;
}

class SignatureGeneratorState {
  private samplesRing = new Int16Array(FFT_SIZE);
  private samplesPos = 0;

  private fftOutputs = Array.from({ length: RING_BUF_SIZE }, () => new Float64Array(FFT_OUTPUT_SIZE));
  private fftPos = 0;
  private fftNumWritten = 0;

  private spreadFfts = Array.from({ length: RING_BUF_SIZE }, () => new Float64Array(FFT_OUTPUT_SIZE));
  private spreadPos = 0;
  private spreadNumWritten = 0;

  private numSamples = 0;

  private bandPeaks: FrequencyPeak[][] = Array.from({ length: 4 }, () => []);
  private totalPeaks = 0;

  process(pcm: Int16Array): string {
    let offset = 0;
    while (offset + 128 <= pcm.length) {
      const elapsedSec = this.numSamples / SAMPLE_RATE;
      if (elapsedSec >= MAX_TIME_SECONDS && this.totalPeaks >= MAX_PEAKS) break;

      this.numSamples += 128;
      this.feedSamples(pcm, offset, 128);
      this.doFFT();
      this.doPeakSpreadingAndRecognition();
      offset += 128;
    }
    return this.encodeSignature();
  }

  private feedSamples(pcm: Int16Array, start: number, count: number) {
    for (let k = start; k < start + count; k++) {
      this.samplesRing[this.samplesPos] = pcm[k];
      this.samplesPos = (this.samplesPos + 1) % FFT_SIZE;
    }
  }

  private doFFT() {
    const windowed = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      windowed[i] = this.samplesRing[(this.samplesPos + i) % FFT_SIZE] * HANNING[i];
    }
    const result = computeRfft(windowed);
    this.fftOutputs[this.fftPos].set(result);
    this.fftPos = (this.fftPos + 1) % RING_BUF_SIZE;
    this.fftNumWritten++;
  }

  private doPeakSpreadingAndRecognition() {
    this.doPeakSpreading();
    if (this.spreadNumWritten >= 47) {
      this.doPeakRecognition();
    }
  }

  private doPeakSpreading() {
    const lastFftIdx = (this.fftPos - 1 + RING_BUF_SIZE) % RING_BUF_SIZE;
    const spread = new Float64Array(this.fftOutputs[lastFftIdx]);

    for (let pos = 0; pos < FFT_OUTPUT_SIZE - 2; pos++) {
      spread[pos] = Math.max(spread[pos], spread[pos + 1], spread[pos + 2]);
    }

    for (let pos = 0; pos < FFT_OUTPUT_SIZE; pos++) {
      let maxVal = spread[pos];
      for (const offset of [-1, -3, -6]) {
        const idx = ((this.spreadPos + offset) % RING_BUF_SIZE + RING_BUF_SIZE) % RING_BUF_SIZE;
        const oldVal = this.spreadFfts[idx][pos];
        if (oldVal > maxVal) maxVal = oldVal;
        this.spreadFfts[idx][pos] = maxVal;
      }
    }

    this.spreadFfts[this.spreadPos].set(spread);
    this.spreadPos = (this.spreadPos + 1) % RING_BUF_SIZE;
    this.spreadNumWritten++;
  }

  private doPeakRecognition() {
    const fftMinus46 = this.fftOutputs[(this.fftPos - 46 + RING_BUF_SIZE * 2) % RING_BUF_SIZE];
    const spreadMinus49 = this.spreadFfts[(this.spreadPos - 49 + RING_BUF_SIZE * 2) % RING_BUF_SIZE];

    const otherOffsets = [-53, -45, 165, 172, 179, 186, 193, 200, 214, 221, 228, 235, 242, 249];

    for (let binPos = 10; binPos < FFT_OUTPUT_SIZE - 8; binPos++) {
      const fftVal = fftMinus46[binPos];
      if (fftVal < 1.0 / 64.0 || fftVal < spreadMinus49[binPos]) continue;

      let maxNeighborSpread49 = 0.0;
      for (const neighborOffset of [-10, -7, -4, -3, 1, 2, 5, 8]) {
        const v = spreadMinus49[binPos + neighborOffset];
        if (v > maxNeighborSpread49) maxNeighborSpread49 = v;
      }
      if (fftVal <= maxNeighborSpread49) continue;

      let maxNeighborOther = maxNeighborSpread49;
      for (const otherOffset of otherOffsets) {
        const spreadIdx = ((this.spreadPos + otherOffset) % RING_BUF_SIZE + RING_BUF_SIZE) % RING_BUF_SIZE;
        const v = this.spreadFfts[spreadIdx][binPos - 1];
        if (v > maxNeighborOther) maxNeighborOther = v;
      }
      if (fftVal <= maxNeighborOther) continue;

      const fftNumber = this.spreadNumWritten - 46;

      const peakMag = Math.log(Math.max(1.0 / 64.0, fftVal)) * 1477.3 + 6144;
      const peakMagBefore = Math.log(Math.max(1.0 / 64.0, fftMinus46[binPos - 1])) * 1477.3 + 6144;
      const peakMagAfter = Math.log(Math.max(1.0 / 64.0, fftMinus46[binPos + 1])) * 1477.3 + 6144;

      const peakVariation1 = peakMag * 2 - peakMagBefore - peakMagAfter;
      const peakVariation2 = (peakMagAfter - peakMagBefore) * 32 / peakVariation1;

      const correctedBin = binPos * 64.0 + peakVariation2;
      const frequencyHz = correctedBin * (16000.0 / 2.0 / 1024.0 / 64.0);

      let band = -1;
      if (frequencyHz < 250.0) continue;
      else if (frequencyHz < 520.0) band = BAND_250_520;
      else if (frequencyHz < 1450.0) band = BAND_520_1450;
      else if (frequencyHz < 3500.0) band = BAND_1450_3500;
      else if (frequencyHz <= 5500.0) band = BAND_3500_5500;
      else continue;

      this.bandPeaks[band].push({
        fftPassNumber: fftNumber,
        peakMagnitude: Math.floor(peakMag),
        correctedPeakFrequencyBin: Math.floor(correctedBin)
      });
      this.totalPeaks++;
    }
  }

  private encodeSignature(): string {
    const contentsStream = new ByteBuilder();

    for (let bandId = 0; bandId <= 3; bandId++) {
      const peaks = this.bandPeaks[bandId];
      if (peaks.length === 0) continue;

      const peakBuf = new ByteBuilder();
      let prevFftPassNumber = 0;

      for (const peak of peaks) {
        const diff = peak.fftPassNumber - prevFftPassNumber;
        if (diff >= 255) {
          peakBuf.write(0xff);
          peakBuf.writeUint32LE(peak.fftPassNumber);
          prevFftPassNumber = peak.fftPassNumber;
        }
        peakBuf.write(peak.fftPassNumber - prevFftPassNumber);
        peakBuf.writeUint16LE(peak.peakMagnitude);
        peakBuf.writeUint16LE(peak.correctedPeakFrequencyBin);
        prevFftPassNumber = peak.fftPassNumber;
      }

      const peakBytes = peakBuf.toArray();

      contentsStream.writeUint32LE(0x60030040 + bandId);
      contentsStream.writeUint32LE(peakBytes.length);
      contentsStream.writeBytes(peakBytes);

      const padBytes = (4 - (peakBytes.length % 4)) % 4;
      for (let p = 0; p < padBytes; p++) {
        contentsStream.write(0);
      }
    }

    const contents = contentsStream.toArray();
    const sizeMinusHeader = contents.length + 8;
    const samplesAndOffset = Math.floor(this.numSamples + SAMPLE_RATE * 0.24);

    const header = new ByteBuilder();
    header.writeUint32LE(0xcafe2580 | 0);
    header.writeUint32LE(0); // crc32 placeholder
    header.writeUint32LE(sizeMinusHeader);
    header.writeUint32LE(0x94119c00 | 0);
    header.writeUint32LE(0);
    header.writeUint32LE(0);
    header.writeUint32LE(0);
    header.writeUint32LE(3 << 27);
    header.writeUint32LE(0);
    header.writeUint32LE(0);
    header.writeUint32LE(samplesAndOffset);
    header.writeUint32LE((15 << 19) + 0x40000);

    const fullBuf = new ByteBuilder();
    fullBuf.writeBytes(header.toArray());
    fullBuf.writeUint32LE(0x40000000);
    fullBuf.writeUint32LE(contents.length + 8);
    fullBuf.writeBytes(contents);

    const fullBytes = fullBuf.toArray();

    const crc = new CRC32();
    crc.update(fullBytes, 8, fullBytes.length - 8);
    const crc32Value = crc.getValue();

    fullBytes[4] = crc32Value & 0xff;
    fullBytes[5] = (crc32Value >>> 8) & 0xff;
    fullBytes[6] = (crc32Value >>> 16) & 0xff;
    fullBytes[7] = (crc32Value >>> 24) & 0xff;

    const base64 = uint8ArrayToBase64(fullBytes);
    return `data:audio/vnd.shazam.sig;base64,${base64}`;
  }
}

/**
 * Generates a Shazam-compatible audio signature from 16-bit PCM mono samples (16kHz).
 */
export function generateShazamSignature(samples: Int16Array): string {
  if (samples.length < 2) {
    throw new Error('samples must be a non-empty Int16Array');
  }
  const state = new SignatureGeneratorState();
  return state.process(samples);
}
