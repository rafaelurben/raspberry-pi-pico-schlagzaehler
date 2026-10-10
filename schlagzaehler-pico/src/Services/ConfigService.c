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

const Config* ConfigService_get(const ConfigService* service) {
    return service ? &service->current_config : NULL;
}

bool ConfigService_set_mode(ConfigService* service, GameMode mode) {
    if (!service || mode >= GAME_MODE_COUNT_TOTAL) return false;
    service->current_config.default_mode = mode;
    return true;
}

bool ConfigService_set_parameter(ConfigService* service, uint32_t parameter) {
    if (!service) return false;

    if (service->current_config.default_mode == GAME_MODE_TIMED) {
        if (parameter < 5) parameter = 5;
        if (parameter > 600) parameter = 600;
        service->current_config.timed_duration_s = parameter;
        return true;
    } else if (service->current_config.default_mode == GAME_MODE_RACE) {
        if (parameter < 5) parameter = 5;
        if (parameter > 1000) parameter = 1000;
        service->current_config.race_target_hits = parameter;
        return true;
    }
    return false;
}

bool ConfigService_set_sensitivity(ConfigService* service, float noise_factor) {
    if (!service) return false;
    if (noise_factor < 1.0f) noise_factor = 1.0f;
    if (noise_factor > 30.0f) noise_factor = 30.0f;
    service->current_config.noise_factor = noise_factor;
    return true;
}
