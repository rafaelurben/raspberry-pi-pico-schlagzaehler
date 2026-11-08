import {
  BinaryFrame,
  CRC_SIZE,
  HEADER_SIZE,
  MIN_FRAME_SIZE,
  SYNC_BYTE_0,
  SYNC_BYTE_1,
} from '../protocol/binary-protocol.types';
import { computeCrc16 } from '../protocol/crc16';

export type TransportEvent = string | BinaryFrame;

/**
 * DualEventParser seamlessly parses an incoming raw byte stream from Web Serial
 * into either BinaryFrames (when 0xAA55 framed packets arrive) or string lines (for fallback ASCII protocol).
 */
export class DualEventParser {
  private buffer: Uint8Array = new Uint8Array(0);
  private readonly textDecoder = new TextDecoder('utf-8', { fatal: false });

  /**
   * Pushes incoming raw bytes and extracts any complete BinaryFrames or ASCII lines.
   */
  push(chunk: Uint8Array): TransportEvent[] {
    if (chunk.length === 0) {
      return [];
    }

    if (this.buffer.length === 0) {
      this.buffer = new Uint8Array(chunk);
    } else {
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer, 0);
      merged.set(chunk, this.buffer.length);
      this.buffer = merged;
    }

    const events: TransportEvent[] = [];

    while (this.buffer.length > 0) {
      // 1. Check if buffer starts with binary sync word: 0x55, 0xAA
      if (
        this.buffer.length >= 2 &&
        this.buffer[0] === SYNC_BYTE_0 &&
        this.buffer[1] === SYNC_BYTE_1
      ) {
        if (this.buffer.length < MIN_FRAME_SIZE) {
          break; // Incomplete header, wait for more data
        }

        const payloadLen = this.buffer[4] | (this.buffer[5] << 8);
        const totalFrameLength = HEADER_SIZE + payloadLen + CRC_SIZE;

        if (this.buffer.length < totalFrameLength) {
          break; // Incomplete frame, wait for more data
        }

        const computedCrc = computeCrc16(this.buffer.subarray(0, HEADER_SIZE + payloadLen));
        const expectedCrc =
          this.buffer[HEADER_SIZE + payloadLen] | (this.buffer[HEADER_SIZE + payloadLen + 1] << 8);

        if (computedCrc === expectedCrc) {
          const verFlags = this.buffer[2];
          const flags = (verFlags >> 4) & 0x0f;
          const msgType = this.buffer[3];
          const seqId = this.buffer[6] | (this.buffer[7] << 8);
          const payload = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);

          events.push({
            type: msgType,
            flags,
            seq: seqId,
            payload,
          });

          this.buffer = this.buffer.slice(totalFrameLength);
          continue;
        } else {
          // CRC mismatch: not a valid binary frame. Advance 1 byte and resume scanning
          this.buffer = this.buffer.slice(1);
          continue;
        }
      }

      // 2. Buffer does not start with sync word: scan for newline (\n) or sync word
      const nlIdx = this.buffer.indexOf(0x0a);

      let syncIdx = -1;
      for (let i = 0; i < this.buffer.length - 1; i++) {
        if (this.buffer[i] === SYNC_BYTE_0 && this.buffer[i + 1] === SYNC_BYTE_1) {
          syncIdx = i;
          break;
        }
      }

      if (nlIdx !== -1 && (syncIdx === -1 || nlIdx < syncIdx)) {
        // Full ASCII line found before any sync word
        const lineBytes = this.buffer.subarray(0, nlIdx);
        this.buffer = this.buffer.slice(nlIdx + 1);

        let line = this.textDecoder.decode(lineBytes);
        if (line.endsWith('\r')) {
          line = line.slice(0, -1);
        }
        line = line.trim();
        if (line.length > 0) {
          events.push(line);
        }
        continue;
      }

      if (syncIdx !== -1 && (nlIdx === -1 || syncIdx < nlIdx)) {
        // Binary sync word appears ahead of any newline
        const prefixBytes = this.buffer.subarray(0, syncIdx);
        let prefixStr = this.textDecoder.decode(prefixBytes);
        if (prefixStr.endsWith('\r')) {
          prefixStr = prefixStr.slice(0, -1);
        }
        prefixStr = prefixStr.trim();
        if (prefixStr.length > 0) {
          events.push(prefixStr);
        }

        this.buffer = this.buffer.slice(syncIdx);
        continue;
      }

      // Neither \n nor sync word found: wait for more chunks
      break;
    }

    return events;
  }

  /**
   * Resets the accumulated buffer.
   */
  reset(): void {
    this.buffer = new Uint8Array(0);
  }

  /**
   * Gets current unparsed bytes.
   */
  get buffered(): Uint8Array {
    return this.buffer;
  }
}
