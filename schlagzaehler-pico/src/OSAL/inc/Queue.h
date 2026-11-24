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
 * @brief Initialize a queue with item size and capacity.
 */
bool OsalQueue_init(OsalQueue* q, size_t item_size, size_t capacity);

/**
 * @brief Non-blocking push. Returns false and increments overflow_count if full.
 */
bool OsalQueue_push(OsalQueue* q, const void* item);

/**
 * @brief Non-blocking pop. Returns false if empty.
 */
bool OsalQueue_pop(OsalQueue* q, void* item);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_QUEUE_H */
