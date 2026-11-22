#ifndef APP_CONFIG_SERVICE_H
#define APP_CONFIG_SERVICE_H

#include "../Common/Config.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    Config current_config;
} ConfigService;

void ConfigService_init(ConfigService* service, const Config* initial_config);
bool ConfigService_set_sensitivity(ConfigService* service, float noise_factor);

#ifdef __cplusplus
}
#endif

#endif /* APP_CONFIG_SERVICE_H */
