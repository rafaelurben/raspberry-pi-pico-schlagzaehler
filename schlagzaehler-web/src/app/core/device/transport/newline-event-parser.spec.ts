import { describe, expect, it } from 'vitest';
import { NewlineEventParser } from './newline-event-parser';

describe('NewlineEventParser', () => {
  it('should parse one complete event', () => {
    const parser = new NewlineEventParser();
    const result = parser.push('HIT\n');

    expect(result).toEqual(['HIT']);
    expect(parser.buffered).toBe('');
  });

  it('should parse multiple events in one chunk', () => {
    const parser = new NewlineEventParser();
    const result = parser.push('HIT\nTEST\nVALUE: 42\n');

    expect(result).toEqual(['HIT', 'TEST', 'VALUE: 42']);
    expect(parser.buffered).toBe('');
  });

  it('should parse one event split across multiple chunks', () => {
    const parser = new NewlineEventParser();

    const chunk1 = parser.push('H');
    expect(chunk1).toEqual([]);
    expect(parser.buffered).toBe('H');

    const chunk2 = parser.push('I');
    expect(chunk2).toEqual([]);
    expect(parser.buffered).toBe('HI');

    const chunk3 = parser.push('T\n');
    expect(chunk3).toEqual(['HIT']);
    expect(parser.buffered).toBe('');
  });

  it('should parse multiple events with a partial final event', () => {
    const parser = new NewlineEventParser();

    const result1 = parser.push('EVENT_1\nEVENT_2\nPARTIAL_');
    expect(result1).toEqual(['EVENT_1', 'EVENT_2']);
    expect(parser.buffered).toBe('PARTIAL_');

    const result2 = parser.push('EVENT_3\n');
    expect(result2).toEqual(['PARTIAL_EVENT_3']);
    expect(parser.buffered).toBe('');
  });

  it('should cleanly handle CRLF line endings', () => {
    const parser = new NewlineEventParser();
    const result = parser.push('EVENT_CRLF_1\r\nEVENT_CRLF_2\r\n');

    expect(result).toEqual(['EVENT_CRLF_1', 'EVENT_CRLF_2']);
    expect(parser.buffered).toBe('');
  });

  it('should handle CRLF split across chunk boundaries (CR in chunk 1, LF in chunk 2)', () => {
    const parser = new NewlineEventParser();

    const chunk1 = parser.push('SPLIT_EVENT\r');
    expect(chunk1).toEqual([]);
    expect(parser.buffered).toBe('SPLIT_EVENT\r');

    const chunk2 = parser.push('\nNEXT_EVENT\r\n');
    expect(chunk2).toEqual(['SPLIT_EVENT', 'NEXT_EVENT']);
    expect(parser.buffered).toBe('');
  });

  it('should ignore empty lines with LF and CRLF', () => {
    const parser = new NewlineEventParser();
    const result = parser.push('\n\n\r\n   HIT\n\n\r\n');

    expect(result).toEqual(['   HIT']);
    expect(parser.buffered).toBe('');
  });

  it('should handle arbitrary chunk boundaries as specified in requirements', () => {
    // Requirements example:
    // "H"
    // "IT\nTE"
    // "ST\n"
    // resulting in ["HIT", "TEST"]
    const parser = new NewlineEventParser();

    const chunk1 = parser.push('H');
    expect(chunk1).toEqual([]);

    const chunk2 = parser.push('IT\nTE');
    expect(chunk2).toEqual(['HIT']);
    expect(parser.buffered).toBe('TE');

    const chunk3 = parser.push('ST\n');
    expect(chunk3).toEqual(['TEST']);
    expect(parser.buffered).toBe('');
  });

  it('should flush any non-empty trailing remainder and reset buffer', () => {
    const parser = new NewlineEventParser();
    parser.push('TRAILING_LINE\r');

    const flushed = parser.flush();
    expect(flushed).toEqual(['TRAILING_LINE']);
    expect(parser.buffered).toBe('');

    // Calling flush on empty buffer should return empty array
    expect(parser.flush()).toEqual([]);
  });

  it('should clear buffer on reset', () => {
    const parser = new NewlineEventParser();
    parser.push('PARTIAL_DATA');
    expect(parser.buffered).toBe('PARTIAL_DATA');

    parser.reset();
    expect(parser.buffered).toBe('');
    expect(parser.flush()).toEqual([]);
  });
});
