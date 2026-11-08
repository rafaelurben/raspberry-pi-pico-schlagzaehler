import {
  BinaryFrame,
  CRC_SIZE,
  HEADER_SIZE,
  MIN_FRAME_SIZE,
  PROTOCOL_VERSION,
  SYNC_BYTE_0,
  SYNC_BYTE_1,
} from '../../binary/binary-protocol.types';
import { computeCrc16 } from './crc16';

/**
 * Builds and serializes a framed binary protocol message with CRC-16-CCITT check sequence.
 */
export function serializeBinaryFrame(
  type: number,
  payload: Uint8Array = new Uint8Array(0),
  flags = 0,
  seq = 0,
): Uint8Array {
  const payloadLen = payload.length;
  const frameLength = HEADER_SIZE + payloadLen + CRC_SIZE;
  const frame = new Uint8Array(frameLength);

  // Sync Word: 0xAA55 (little-endian: 0x55, 0xAA)
  frame[0] = SYNC_BYTE_0;
  frame[1] = SYNC_BYTE_1;

  // Proto Ver (4b) & Flags (4b)
  frame[2] = (PROTOCOL_VERSION & 0x0f) | ((flags & 0x0f) << 4);

  // Message Type (8b)
  frame[3] = type & 0xff;

  // Payload Length (16b little-endian)
  frame[4] = payloadLen & 0xff;
  frame[5] = (payloadLen >> 8) & 0xff;

  // Sequence ID (16b little-endian)
  frame[6] = seq & 0xff;
  frame[7] = (seq >> 8) & 0xff;

  // Payload
  if (payloadLen > 0) {
    frame.set(payload, HEADER_SIZE);
  }

  // CRC-16 over Header + Payload
  const crc = computeCrc16(frame.subarray(0, HEADER_SIZE + payloadLen));
  frame[HEADER_SIZE + payloadLen] = crc & 0xff;
  frame[HEADER_SIZE + payloadLen + 1] = (crc >> 8) & 0xff;

  return frame;
}

export interface FrameExtractionResult {
  readonly status: 'complete' | 'incomplete' | 'crc_error';
  readonly frame?: BinaryFrame;
  readonly totalLength?: number;
  readonly computedCrc?: number;
  readonly expectedCrc?: number;
}

/**
 * BinaryFrameParser accumulates incoming raw Uint8Array byte chunks from serial/transport,
 * scans for 0xAA55 sync words, verifies frame CRC-16, and emits validated BinaryFrames.
 */
export class BinaryFrameParser {
  private buffer: Uint8Array = new Uint8Array(0);

  /**
   * Attempts to parse a single frame starting at index 0 of `buffer`.
   */
  static extractFrame(buffer: Uint8Array): FrameExtractionResult {
    if (buffer.length < MIN_FRAME_SIZE) {
      return { status: 'incomplete' };
    }

    const payloadLen = buffer[4] | (buffer[5] << 8);
    const totalFrameLength = HEADER_SIZE + payloadLen + CRC_SIZE;

    if (buffer.length < totalFrameLength) {
      return { status: 'incomplete', totalLength: totalFrameLength };
    }

    const computedCrc = computeCrc16(buffer.subarray(0, HEADER_SIZE + payloadLen));
    const expectedCrc =
      buffer[HEADER_SIZE + payloadLen] | (buffer[HEADER_SIZE + payloadLen + 1] << 8);

    if (computedCrc !== expectedCrc) {
      console.error(
        `[BinaryFrameParser] CRC-16 mismatch: expected 0x${expectedCrc.toString(16).padStart(4, '0')}, computed 0x${computedCrc.toString(16).padStart(4, '0')}`,
      );
      return { status: 'crc_error', computedCrc, expectedCrc };
    }

    const verFlags = buffer[2];
    const flags = (verFlags >> 4) & 0x0f;
    const msgType = buffer[3];
    const seqId = buffer[6] | (buffer[7] << 8);
    const payload = buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);

    return {
      status: 'complete',
      frame: {
        type: msgType,
        flags,
        seq: seqId,
        payload,
      },
      totalLength: totalFrameLength,
    };
  }

  /**
   * Pushes incoming raw bytes, parses all complete validated frames,
   * and retains any partial or incomplete frame data for subsequent chunks.
   *
   * @param chunk Incoming Uint8Array of bytes
   * @returns Array of validated BinaryFrames
   */
  push(chunk: Uint8Array): BinaryFrame[] {
    if (chunk.length === 0) {
      return [];
    }

    // Append incoming chunk to accumulated buffer
    if (this.buffer.length === 0) {
      this.buffer = new Uint8Array(chunk);
    } else {
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer, 0);
      merged.set(chunk, this.buffer.length);
      this.buffer = merged;
    }

    const frames: BinaryFrame[] = [];

    while (this.buffer.length >= 2) {
      // Find the next occurrence of sync word: 0x55, 0xAA
      let syncIndex = -1;
      for (let i = 0; i < this.buffer.length - 1; i++) {
        if (this.buffer[i] === SYNC_BYTE_0 && this.buffer[i + 1] === SYNC_BYTE_1) {
          syncIndex = i;
          break;
        }
      }

      if (syncIndex === -1) {
        // No sync word found in buffer. Keep the trailing byte if it is 0x55 (could be part of next chunk's sync word)
        if (this.buffer.at(-1) === SYNC_BYTE_0) {
          this.buffer = this.buffer.slice(-1);
        } else {
          this.buffer = new Uint8Array(0);
        }
        break;
      }

      // Discard any preceding bytes before the sync word
      if (syncIndex > 0) {
        this.buffer = this.buffer.slice(syncIndex);
      }

      const result = BinaryFrameParser.extractFrame(this.buffer);

      if (result.status === 'incomplete') {
        break; // Wait for full payload + CRC
      }

      if (result.status === 'complete' && result.frame && result.totalLength) {
        frames.push(result.frame);
        this.buffer = this.buffer.slice(result.totalLength);
      } else {
        // CRC mismatch or invalid frame. Advance by 1 byte to resynchronize
        this.buffer = this.buffer.slice(1);
      }
    }

    return frames;
  }

  /**
   * Clears accumulated unparsed bytes.
   */
  reset(): void {
    this.buffer = new Uint8Array(0);
  }

  /**
   * Gets current unparsed bytes in buffer.
   */
  get buffered(): Uint8Array {
    return this.buffer;
  }
}
