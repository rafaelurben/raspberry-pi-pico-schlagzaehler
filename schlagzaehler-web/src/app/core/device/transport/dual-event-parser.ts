import { SYNC_BYTE_0, SYNC_BYTE_1 } from '../protocol/binary-protocol.types';
import { BinaryFrameParser } from '../protocol/binary-frame-parser';
import { TransportEvent } from './device-transport.interface';

export type { TransportEvent };

/**
 * Checks if a string contains only printable characters and common whitespace (tabs).
 * Discards arbitrary binary garbage or corrupt control bytes.
 */
function isPrintableAscii(str: string): boolean {
  if (str.length === 0) return false;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) {
      return false;
    }
  }
  return true;
}

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
      // 0. Skip leading control / non-printable noise bytes (except \r, \n, \t)
      const b0 = this.buffer[0];
      if ((b0 < 0x20 && b0 !== 0x09 && b0 !== 0x0a && b0 !== 0x0d) || b0 === 0x7f) {
        this.buffer = this.buffer.slice(1);
        continue;
      }

      // 1. Check if buffer starts with binary sync word: 0x55, 0xAA
      if (
        this.buffer.length >= 2 &&
        this.buffer[0] === SYNC_BYTE_0 &&
        this.buffer[1] === SYNC_BYTE_1
      ) {
        const result = BinaryFrameParser.extractFrame(this.buffer);

        if (result.status === 'incomplete') {
          break; // Incomplete frame, wait for more data
        }

        if (result.status === 'complete' && result.frame && result.totalLength) {
          events.push({
            type: 'binary',
            content: result.frame,
          });
          this.buffer = this.buffer.slice(result.totalLength);
          continue;
        } else {
          // CRC mismatch: error already logged by BinaryFrameParser.
          // Advance 1 byte and resume scanning to find subsequent sync word or newline
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
          if (isPrintableAscii(line)) {
            events.push({
              type: 'ascii',
              content: line,
            });
          } else {
            console.warn('[DualEventParser] Discarded corrupt/non-printable ASCII line:', line);
          }
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
          if (isPrintableAscii(prefixStr)) {
            events.push({
              type: 'ascii',
              content: prefixStr,
            });
          } else {
            console.warn(
              '[DualEventParser] Discarded non-printable noise before binary sync word:',
              prefixBytes,
            );
          }
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
