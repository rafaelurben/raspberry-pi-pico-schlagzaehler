#include "PicoQueue.h"
#include "pico/util/queue.h"
#include "pico/time.h"
#include <stdlib.h>

bool OsalQueue_init(OsalQueue* q, void* buffer, size_t item_size, size_t capacity) {
    (void)buffer;
    if (!q || item_size == 0 || capacity == 0) return false;
    queue_t* pq = (queue_t*)malloc(sizeof(queue_t));
    if (!pq) return false;
    if (!queue_init(pq, (uint)item_size, (uint)capacity)) {
        free(pq);
        return false;
    }
    q->impl = pq;
    q->item_size = item_size;
    q->capacity = capacity;
    q->overflow_count = 0;
    return true;
}

bool OsalQueue_push(OsalQueue* q, const void* item) {
    if (!q || !q->impl || !item) return false;
    queue_t* pq = (queue_t*)q->impl;
    if (queue_try_add(pq, item)) {
        return true;
    }
    q->overflow_count++;
    return false;
}

bool OsalQueue_push_blocking(OsalQueue* q, const void* item) {
    if (!q || !q->impl || !item) return false;
    queue_t* pq = (queue_t*)q->impl;
    queue_add_blocking(pq, item);
    return true;
}

bool OsalQueue_pop(OsalQueue* q, void* item) {
    if (!q || !q->impl || !item) return false;
    queue_t* pq = (queue_t*)q->impl;
    return queue_try_remove(pq, item);
}

bool OsalQueue_pop_blocking(OsalQueue* q, void* item) {
    if (!q || !q->impl || !item) return false;
    queue_t* pq = (queue_t*)q->impl;
    queue_remove_blocking(pq, item);
    return true;
}

bool OsalQueue_pop_timeout_us(OsalQueue* q, void* item, uint64_t timeout_us) {
    if (!q || !q->impl || !item) return false;
    queue_t* pq = (queue_t*)q->impl;
    absolute_time_t deadline = make_timeout_time_us(timeout_us);
    while (true) {
        if (queue_try_remove(pq, item)) {
            return true;
        }
        if (time_reached(deadline)) {
            return false;
        }
        tight_loop_contents();
    }
}

size_t OsalQueue_count(const OsalQueue* q) {
    if (!q || !q->impl) return 0;
    return (size_t)queue_get_level((queue_t*)q->impl);
}

uint32_t OsalQueue_get_overflows(const OsalQueue* q) {
    return q ? q->overflow_count : 0;
}

bool OsalQueue_is_empty(const OsalQueue* q) {
    if (!q || !q->impl) return true;
    return queue_is_empty((queue_t*)q->impl);
}

bool OsalQueue_is_full(const OsalQueue* q) {
    if (!q || !q->impl) return false;
    return queue_is_full((queue_t*)q->impl);
}
