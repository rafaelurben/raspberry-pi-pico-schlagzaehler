#ifndef COMMON_CRC_H
#define COMMON_CRC_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Calculate CRC-16 (CCITT, polynomial 0x1021, init 0xFFFF).
 */
uint16_t Crc_calculate16(const uint8_t* data, size_t length);

/**
 * @brief Calculate CRC-32 (IEEE 802.3, polynomial 0xEDB88320).
 */
uint32_t Crc_calculate32(const uint8_t* data, size_t length);

#ifdef __cplusplus
}
#endif

#endif /* COMMON_CRC_H */
