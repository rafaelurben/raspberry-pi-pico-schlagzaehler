#include "WatchdogService.h"
#include "../OSAL/Time.h"
#include "hardware/watchdog.h"

void WatchdogService_init(WatchdogService* service, uint32_t timeout_ms) {
    if (!service) return;
    service->timeout_ms = timeout_ms;
    uint64_t now = Time_now_us();
    service->last_core0_feed_us = now;
    service->last_core1_feed_us = now;
    service->enabled = (timeout_ms > 0);

    if (service->enabled) {
        watchdog_enable(timeout_ms, 1);
    }
}

void WatchdogService_feed_core0(WatchdogService* service) {
    if (service) {
        service->last_core0_feed_us = Time_now_us();
    }
}

void WatchdogService_feed_core1(WatchdogService* service) {
    if (service) {
        service->last_core1_feed_us = Time_now_us();
    }
}

bool WatchdogService_tick(WatchdogService* service) {
    if (!service || !service->enabled) return true;

    uint64_t now = Time_now_us();
    uint64_t timeout_us = (uint64_t)service->timeout_ms * 1000ULL;

    /* Both cores must have checked in within the allowed window */
    if ((now - service->last_core0_feed_us <= timeout_us) &&
        (now - service->last_core1_feed_us <= timeout_us)) {
        watchdog_update();
        return true;
    }

    return false;
}
