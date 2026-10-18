#ifndef OSAL_QUEUE_H
#define OSAL_QUEUE_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct OsalQueue OsalQueue;

struct OsalQueue {
    void* impl;
    size_t item_size;
    size_t capacity;
    volatile uint32_t overflow_count;
};

/**
 * @brief Initialize a queue with storage buffer, item size, and capacity.
 */
bool OsalQueue_init(OsalQueue* q, void* buffer, size_t item_size, size_t capacity);

/**
 * @brief Non-blocking push. Returns false and increments overflow_count if full.
 */
bool OsalQueue_push(OsalQueue* q, const void* item);

/**
 * @brief Blocking push until space is available.
 */
bool OsalQueue_push_blocking(OsalQueue* q, const void* item);

/**
 * @brief Non-blocking pop. Returns false if empty.
 */
bool OsalQueue_pop(OsalQueue* q, void* item);

/**
 * @brief Blocking pop until an item is available.
 */
bool OsalQueue_pop_blocking(OsalQueue* q, void* item);

/**
 * @brief Pop with timeout in microseconds.
 */
bool OsalQueue_pop_timeout_us(OsalQueue* q, void* item, uint64_t timeout_us);

/**
 * @brief Get current item count in queue.
 */
size_t OsalQueue_count(const OsalQueue* q);

/**
 * @brief Get total number of dropped/overflow messages.
 */
uint32_t OsalQueue_get_overflows(const OsalQueue* q);

/**
 * @brief Check if queue is empty.
 */
bool OsalQueue_is_empty(const OsalQueue* q);

/**
 * @brief Check if queue is full.
 */
bool OsalQueue_is_full(const OsalQueue* q);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_QUEUE_H */
