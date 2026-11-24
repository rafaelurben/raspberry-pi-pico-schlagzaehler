#include "../../inc/Queue.h"
#include "pico/util/queue.h"
#include "pico/time.h"
#include <stdlib.h>

bool OsalQueue_init(OsalQueue* q, size_t item_size, size_t capacity) {
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

bool OsalQueue_pop(OsalQueue* q, void* item) {
    if (!q || !q->impl || !item) return false;
    queue_t* pq = (queue_t*)q->impl;
    return queue_try_remove(pq, item);
}
