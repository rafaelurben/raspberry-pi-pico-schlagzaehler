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

    expect(events).toEqual([
      { type: 'ascii', content: 'BOOT success=1 msg=Ready' },
      { type: 'ascii', content: 'SENSOR status=ARMED' },
    ]);
    expect(parser.buffered).toHaveLength(0);
  });

  it('should filter out unprintable garbage and control characters', () => {
    // 0x01, 0x02, 0x00, 0x7f, etc. should be stripped before valid ASCII line
    const chunk = new Uint8Array([
      0x00,
      0x01,
      0x1f,
      0x7f,
      ...encoder.encode('STATE old=READY new=RUNNING\r\n'),
    ]);
    const events = parser.push(chunk);

    expect(events).toEqual([{ type: 'ascii', content: 'STATE old=READY new=RUNNING' }]);
  });

  it('should parse binary frames correctly', () => {
    const frame = serializeBinaryFrame(BinaryMessageType.MSG_SCORE, new Uint8Array([5, 0, 0, 0]));
    const events = parser.push(frame);

    expect(events).toHaveLength(1);
    const parsed = events[0];
    expect(parsed.type).toBe('binary');
    if (parsed.type === 'binary') {
      expect(parsed.content.type).toBe(BinaryMessageType.MSG_SCORE);
      expect(Array.from(parsed.content.payload)).toEqual([5, 0, 0, 0]);
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
    expect(events[0]).toEqual({ type: 'ascii', content: 'BOOT success=1 msg=Ready' });
    expect(events[1].type).toBe('binary');
    if (events[1].type === 'binary') {
      expect(events[1].content.type).toBe(BinaryCommandType.CMD_START);
    }
  });

  it('should handle fragmented ASCII lines across chunks', () => {
    const chunk1 = encoder.encode('STATE old=READY ');
    const chunk2 = encoder.encode('new=RUNNING\r\n');

    expect(parser.push(chunk1)).toHaveLength(0);
    const events = parser.push(chunk2);

    expect(events).toEqual([{ type: 'ascii', content: 'STATE old=READY new=RUNNING' }]);
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
    expect(events[0].type).toBe('binary');
  });
});
