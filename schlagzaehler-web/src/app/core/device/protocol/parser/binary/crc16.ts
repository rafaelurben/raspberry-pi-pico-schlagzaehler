/**
 * CRC-16-CCITT implementation for the Schlagzähler companion binary protocol.
 * Polynomial: 0x1021 (x^16 + x^12 + x^5 + 1), Initial Value: 0xFFFF, No reflection, Final XOR: 0x0000.
 */

export const CRC16_POLYNOMIAL = 0x1021;
export const CRC16_INITIAL = 0xffff;

/**
 * Precomputed 256-entry lookup table for CRC-16-CCITT.
 */
export const CRC16_TABLE = new Uint16Array(256);

// Initialize lookup table
for (let i = 0; i < 256; i++) {
  let curr = (i << 8) & 0xffff;
  for (let j = 0; j < 8; j++) {
    if ((curr & 0x8000) !== 0) {
      curr = ((curr << 1) ^ CRC16_POLYNOMIAL) & 0xffff;
    } else {
      curr = (curr << 1) & 0xffff;
    }
  }
  CRC16_TABLE[i] = curr;
}

/**
 * Computes the 16-bit CRC-16-CCITT check sequence over a byte buffer.
 *
 * @param data Array or slice of bytes to calculate CRC over
 * @param initial Initial register value (defaults to 0xFFFF)
 * @returns 16-bit unsigned integer CRC
 */
export function computeCrc16(data: Uint8Array, initial: number = CRC16_INITIAL): number {
  let crc = initial & 0xffff;
  for (const byte of data) {
    crc = ((crc << 8) ^ CRC16_TABLE[((crc >> 8) ^ byte) & 0xff]) & 0xffff;
  }
  return crc;
}

/**
 * Verifies if the computed CRC-16-CCITT matches the expected 16-bit CRC.
 *
 * @param data Byte buffer to verify
 * @param expectedCrc Expected 16-bit unsigned integer CRC
 * @returns True if computed CRC equals expected CRC
 */
export function verifyCrc16(data: Uint8Array, expectedCrc: number): boolean {
  return computeCrc16(data) === (expectedCrc & 0xffff);
}
