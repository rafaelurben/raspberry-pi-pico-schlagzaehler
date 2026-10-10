#ifndef SERVICES_WATCHDOG_SERVICE_H
#define SERVICES_WATCHDOG_SERVICE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t timeout_ms;
    volatile uint64_t last_core0_feed_us;
    volatile uint64_t last_core1_feed_us;
    bool enabled;
} WatchdogService;

void WatchdogService_init(WatchdogService* service, uint32_t timeout_ms);
void WatchdogService_feed_core0(WatchdogService* service);
void WatchdogService_feed_core1(WatchdogService* service);
bool WatchdogService_tick(WatchdogService* service);

#ifdef __cplusplus
}
#endif

#endif /* SERVICES_WATCHDOG_SERVICE_H */
