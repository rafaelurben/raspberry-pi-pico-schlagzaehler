#include "ConfigService.h"
#include <stddef.h>

void ConfigService_init(ConfigService* service, const Config* initial_config) {
    if (!service) return;

    if (initial_config) {
        service->current_config = *initial_config;
    } else {
        Config_set_defaults(&service->current_config);
    }
}


bool ConfigService_set_sensitivity(ConfigService* service, float noise_factor) {
    if (!service) return false;
    if (noise_factor < 1.0f) noise_factor = 1.0f;
    if (noise_factor > 1000.0f) noise_factor = 1000.0f;
    service->current_config.noise_factor = noise_factor;
    return true;
}
