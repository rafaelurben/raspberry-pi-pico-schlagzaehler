#ifndef SERVICES_CONFIG_SERVICE_H
#define SERVICES_CONFIG_SERVICE_H

#include "../Common/Config.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    Config current_config;
} ConfigService;

void ConfigService_init(ConfigService* service, const Config* initial_config);
const Config* ConfigService_get(const ConfigService* service);

bool ConfigService_set_mode(ConfigService* service, GameMode mode);
bool ConfigService_set_parameter(ConfigService* service, uint32_t parameter);
bool ConfigService_set_sensitivity(ConfigService* service, float noise_factor);

#ifdef __cplusplus
}
#endif

#endif /* SERVICES_CONFIG_SERVICE_H */
