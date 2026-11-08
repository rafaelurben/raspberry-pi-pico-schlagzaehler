import { beforeEach, describe, expect, it } from 'vitest';
import { BinaryFrameParser, serializeBinaryFrame } from './binary-frame-parser';
import { BinaryCommandType, BinaryMessageType } from './binary-protocol.types';

describe('BinaryFrameParser', () => {
  let parser: BinaryFrameParser;

  beforeEach(() => {
    parser = new BinaryFrameParser();
  });

  it('should parse a single valid frame with 0-byte payload', () => {
    const frame = serializeBinaryFrame(BinaryCommandType.CMD_START, new Uint8Array(0), 0, 42);
    const result = parser.push(frame);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(BinaryCommandType.CMD_START);
    expect(result[0].flags).toBe(0);
    expect(result[0].seq).toBe(42);
    expect(result[0].payload).toHaveLength(0);
    expect(parser.buffered).toHaveLength(0);
  });

  it('should parse a frame with non-empty payload and flags', () => {
    const payload = new Uint8Array([10, 20, 30, 40]);
    const frame = serializeBinaryFrame(BinaryMessageType.MSG_SCORE, payload, 0x05, 100);
    const result = parser.push(frame);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(BinaryMessageType.MSG_SCORE);
    expect(result[0].flags).toBe(0x05);
    expect(result[0].seq).toBe(100);
    expect(Array.from(result[0].payload)).toEqual([10, 20, 30, 40]);
    expect(parser.buffered.length).toBe(0);
  });

  it('should parse multiple frames received in a single chunk', () => {
    const f1 = serializeBinaryFrame(BinaryCommandType.CMD_START, new Uint8Array(0), 0, 1);
    const f2 = serializeBinaryFrame(BinaryMessageType.MSG_SCORE, new Uint8Array([1, 2]), 0, 2);
    const f3 = serializeBinaryFrame(BinaryCommandType.CMD_RESET, new Uint8Array(0), 0, 3);

    const merged = new Uint8Array(f1.length + f2.length + f3.length);
    merged.set(f1, 0);
    merged.set(f2, f1.length);
    merged.set(f3, f1.length + f2.length);

    const result = parser.push(merged);

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe(BinaryCommandType.CMD_START);
    expect(result[1].type).toBe(BinaryMessageType.MSG_SCORE);
    expect(result[2].type).toBe(BinaryCommandType.CMD_RESET);
    expect(parser.buffered).toHaveLength(0);
  });

  it('should handle chunk fragmentation across header, payload, and CRC', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const frame = serializeBinaryFrame(BinaryMessageType.MSG_CALIBRATION_RESULT, payload, 0, 99);

    // Split into 3 arbitrary chunks
    const chunk1 = frame.slice(0, 5); // Split inside header
    const chunk2 = frame.slice(5, 12); // Split inside payload
    const chunk3 = frame.slice(12); // Rest of payload + CRC

    expect(parser.push(chunk1)).toHaveLength(0);
    expect(parser.push(chunk2)).toHaveLength(0);

    const result = parser.push(chunk3);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(BinaryMessageType.MSG_CALIBRATION_RESULT);
    expect(result[0].seq).toBe(99);
    expect(Array.from(result[0].payload)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('should handle byte-by-byte incoming streaming', () => {
    const payload = new Uint8Array([0xaa, 0xbb]);
    const frame = serializeBinaryFrame(BinaryMessageType.MSG_TIMER, payload, 0, 77);

    const allEmitted: ReturnType<typeof parser.push> = [];
    for (const byte of frame) {
      const byteChunk = new Uint8Array([byte]);
      const frames = parser.push(byteChunk);
      allEmitted.push(...frames);
    }

    expect(allEmitted).toHaveLength(1);
    expect(allEmitted[0].type).toBe(BinaryMessageType.MSG_TIMER);
    expect(allEmitted[0].seq).toBe(77);
    expect(Array.from(allEmitted[0].payload)).toEqual([0xaa, 0xbb]);
  });

  it('should discard preceding garbage bytes and resynchronize on valid sync word', () => {
    const garbage = new Uint8Array([0x12, 0x34, 0x55, 0x99, 0xfe]); // 0x55 followed by non-0xAA
    const validFrame = serializeBinaryFrame(BinaryCommandType.CMD_STATUS, new Uint8Array(0), 0, 10);

    const merged = new Uint8Array(garbage.length + validFrame.length);
    merged.set(garbage, 0);
    merged.set(validFrame, garbage.length);

    const result = parser.push(merged);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(BinaryCommandType.CMD_STATUS);
    expect(result[0].seq).toBe(10);
  });

  it('should reject frame with corrupted CRC and resynchronize on subsequent frame', () => {
    const corruptFrame = serializeBinaryFrame(
      BinaryCommandType.CMD_START,
      new Uint8Array([1, 2]),
      0,
      1,
    );
    // Corrupt one payload byte
    corruptFrame[8] ^= 0xff;

    const validFrame = serializeBinaryFrame(BinaryCommandType.CMD_RESET, new Uint8Array(0), 0, 2);

    const combined = new Uint8Array(corruptFrame.length + validFrame.length);
    combined.set(corruptFrame, 0);
    combined.set(validFrame, corruptFrame.length);

    const result = parser.push(combined);
    // Corrupt frame rejected, valid second frame recovered
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(BinaryCommandType.CMD_RESET);
    expect(result[0].seq).toBe(2);
  });

  it('should handle false sync word embedded in corrupt data', () => {
    // 0x55, 0xAA followed by junk with invalid CRC
    const falseSync = new Uint8Array([0x55, 0xaa, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const validFrame = serializeBinaryFrame(BinaryCommandType.CMD_START, new Uint8Array(0), 0, 5);

    const combined = new Uint8Array(falseSync.length + validFrame.length);
    combined.set(falseSync, 0);
    combined.set(validFrame, falseSync.length);

    const result = parser.push(combined);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(BinaryCommandType.CMD_START);
    expect(result[0].seq).toBe(5);
  });

  it('should reset buffer state when reset() is called', () => {
    parser.push(new Uint8Array([0x55, 0xaa, 0x01]));
    expect(parser.buffered.length).toBeGreaterThan(0);

    parser.reset();
    expect(parser.buffered).toHaveLength(0);
  });
});
