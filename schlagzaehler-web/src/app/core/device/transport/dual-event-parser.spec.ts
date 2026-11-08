import { beforeEach, describe, expect, it } from 'vitest';
import { serializeBinaryFrame } from '../protocol/binary-frame-parser';
import { BinaryCommandType, BinaryMessageType } from '../protocol/binary-protocol.types';
import { DualEventParser } from './dual-event-parser';

describe('DualEventParser', () => {
  let parser: DualEventParser;
  const encoder = new TextEncoder();

  beforeEach(() => {
    parser = new DualEventParser();
  });

  it('should parse newline-delimited ASCII lines', () => {
    const chunk = encoder.encode('BOOT success=1 msg=Ready\r\nSENSOR status=ARMED\n');
    const events = parser.push(chunk);

    expect(events).toEqual(['BOOT success=1 msg=Ready', 'SENSOR status=ARMED']);
    expect(parser.buffered).toHaveLength(0);
  });

  it('should parse binary frames correctly', () => {
    const frame = serializeBinaryFrame(BinaryMessageType.MSG_SCORE, new Uint8Array([5, 0, 0, 0]));
    const events = parser.push(frame);

    expect(events).toHaveLength(1);
    const parsed = events[0];
    expect(typeof parsed).toBe('object');
    if (typeof parsed !== 'string') {
      expect(parsed.type).toBe(BinaryMessageType.MSG_SCORE);
      expect(Array.from(parsed.payload)).toEqual([5, 0, 0, 0]);
    }
  });

  it('should parse ASCII lines followed by binary frames in the same stream', () => {
    const asciiChunk = encoder.encode('BOOT success=1 msg=Ready\n');
    const binaryFrame = serializeBinaryFrame(BinaryCommandType.CMD_START, new Uint8Array(0), 0, 1);

    const merged = new Uint8Array(asciiChunk.length + binaryFrame.length);
    merged.set(asciiChunk, 0);
    merged.set(binaryFrame, asciiChunk.length);

    const events = parser.push(merged);

    expect(events).toHaveLength(2);
    expect(events[0]).toBe('BOOT success=1 msg=Ready');
    expect(typeof events[1]).toBe('object');
    if (typeof events[1] !== 'string') {
      expect(events[1].type).toBe(BinaryCommandType.CMD_START);
    }
  });

  it('should handle fragmented ASCII lines across chunks', () => {
    const chunk1 = encoder.encode('STATE old=READY ');
    const chunk2 = encoder.encode('new=RUNNING\r\n');

    expect(parser.push(chunk1)).toHaveLength(0);
    const events = parser.push(chunk2);

    expect(events).toEqual(['STATE old=READY new=RUNNING']);
  });

  it('should handle fragmented binary frames across chunks', () => {
    const frame = serializeBinaryFrame(
      BinaryMessageType.MSG_TIMER,
      new Uint8Array([10, 0, 0, 0, 20, 0, 0, 0]),
      0,
      12,
    );
    const chunk1 = frame.slice(0, 6);
    const chunk2 = frame.slice(6);

    expect(parser.push(chunk1)).toHaveLength(0);
    const events = parser.push(chunk2);

    expect(events).toHaveLength(1);
    expect(typeof events[0]).toBe('object');
  });
});
