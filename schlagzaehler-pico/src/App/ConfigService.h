#ifndef APP_CONFIG_SERVICE_H
#define APP_CONFIG_SERVICE_H

#include "../Common/Config.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    Config current_config;
} ConfigService;

/**
 * @brief Initialize the configuration service with optional initial configuration.
 * @param service Pointer to ConfigService instance.
 * @param initial_config Pointer to starting configuration, or NULL to load defaults.
 */
void ConfigService_init(ConfigService* service, const Config* initial_config);

/**
 * @brief Update the hit detection sensitivity noise factor.
 * @param service Pointer to ConfigService instance.
 * @param noise_factor Sensitivity noise factor (clamped between 1.0 and 1000.0).
 * @return true if updated successfully, false on invalid pointer.
 */
bool ConfigService_set_sensitivity(ConfigService* service, float noise_factor);

#ifdef __cplusplus
}
#endif

#endif /* APP_CONFIG_SERVICE_H */
