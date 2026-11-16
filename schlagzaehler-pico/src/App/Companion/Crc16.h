#ifndef APP_COMPANION_CRC16_H
#define APP_COMPANION_CRC16_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* -------------------------------------------------------------
 * CRC-16-CCITT (Polynomial 0x1021, Initial Value 0xFFFF)
 * ------------------------------------------------------------- */
#define CRC16_CCITT_INIT 0xFFFFU
#define CRC16_CCITT_POLY 0x1021U

/**
 * @brief Updates a running CRC-16-CCITT with a single byte.
 *
 * @param crc Current CRC value.
 * @param byte Data byte to process.
 * @return Updated CRC-16 value.
 */
static inline uint16_t crc16_ccitt_update(uint16_t crc, uint8_t byte) {
    crc ^= (uint16_t)byte << 8;
    for (int i = 0; i < 8; ++i) {
        if (crc & 0x8000U) {
            crc = (uint16_t)((crc << 1) ^ CRC16_CCITT_POLY);
        } else {
            crc = (uint16_t)(crc << 1);
        }
    }
    return crc;
}

/**
 * @brief Continues computing CRC-16-CCITT over a buffer starting from a running CRC value.
 *
 * @param running_crc Current running CRC state.
 * @param data Pointer to input data buffer.
 * @param length Number of bytes in the buffer.
 * @return Updated 16-bit CRC checksum.
 */
static inline uint16_t crc16_ccitt_partial(uint16_t running_crc, const uint8_t* data, size_t length) {
    if (!data) return running_crc;
    for (size_t i = 0; i < length; ++i) {
        running_crc = crc16_ccitt_update(running_crc, data[i]);
    }
    return running_crc;
}

/**
 * @brief Computes CRC-16-CCITT over a buffer.
 *
 * @param data Pointer to input data buffer.
 * @param length Number of bytes in the buffer.
 * @return 16-bit CRC checksum (0xFFFF if data is NULL or length is 0).
 */
static inline uint16_t crc16_ccitt(const uint8_t* data, size_t length) {
    return crc16_ccitt_partial(CRC16_CCITT_INIT, data, length);
}

/**
 * @brief Verifies whether the CRC-16-CCITT computed over data matches expected_crc.
 *
 * @param data Pointer to input data buffer.
 * @param length Number of bytes in the buffer.
 * @param expected_crc The expected 16-bit CRC checksum.
 * @return true if matches, false otherwise.
 */
static inline bool crc16_ccitt_verify(const uint8_t* data, size_t length, uint16_t expected_crc) {
    return crc16_ccitt(data, length) == expected_crc;
}

#ifdef __cplusplus
}
#endif

#endif /* APP_COMPANION_CRC16_H */
