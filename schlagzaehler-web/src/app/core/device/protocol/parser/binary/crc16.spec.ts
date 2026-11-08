import { describe, expect, it } from 'vitest';
import { computeCrc16, CRC16_INITIAL, verifyCrc16 } from './crc16';

describe('CRC-16-CCITT', () => {
  it('should compute standard test vector "123456789" correctly (0x29B1)', () => {
    const textEncoder = new TextEncoder();
    const testVector = textEncoder.encode('123456789');
    const crc = computeCrc16(testVector);
    expect(crc).toBe(0x29b1);
    expect(verifyCrc16(testVector, 0x29b1)).toBe(true);
    expect(verifyCrc16(testVector, 0x1234)).toBe(false);
  });

  it('should return initial value 0xFFFF for empty input', () => {
    const empty = new Uint8Array(0);
    expect(computeCrc16(empty)).toBe(CRC16_INITIAL);
  });

  it('should compute single byte correctly', () => {
    const single = new Uint8Array([0x41]); // 'A'
    const crc = computeCrc16(single);
    expect(crc).toBeGreaterThan(0);
    expect(verifyCrc16(single, crc)).toBe(true);
  });

  it('should support incremental / chunked CRC calculation', () => {
    const textEncoder = new TextEncoder();
    const chunk1 = textEncoder.encode('12345');
    const chunk2 = textEncoder.encode('6789');

    const crc1 = computeCrc16(chunk1);
    const crcTotal = computeCrc16(chunk2, crc1);

    expect(crcTotal).toBe(0x29b1);
  });
});
