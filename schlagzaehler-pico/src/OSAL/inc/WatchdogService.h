#ifndef OSAL_WATCHDOG_SERVICE_H
#define OSAL_WATCHDOG_SERVICE_H

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

/**
 * @brief Initialize the watchdog service with specified timeout in milliseconds.
 * @param service Pointer to WatchdogService instance.
 * @param timeout_ms Watchdog timeout duration in milliseconds (0 to disable).
 */
void WatchdogService_init(WatchdogService* service, uint32_t timeout_ms);

/**
 * @brief Feed the watchdog from Core 0 to register liveness.
 * @param service Pointer to WatchdogService instance.
 */
void WatchdogService_feed_core0(WatchdogService* service);

/**
 * @brief Feed the watchdog from Core 1 to register liveness.
 * @param service Pointer to WatchdogService instance.
 */
void WatchdogService_feed_core1(WatchdogService* service);

/**
 * @brief Periodic tick to verify both cores are alive and update hardware watchdog.
 * @param service Pointer to WatchdogService instance.
 * @return true if both cores are healthy within the timeout window, false otherwise.
 */
bool WatchdogService_tick(WatchdogService* service);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_WATCHDOG_SERVICE_H */
