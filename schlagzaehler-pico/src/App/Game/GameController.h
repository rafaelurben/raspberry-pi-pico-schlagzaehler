#ifndef APP_GAME_GAME_CONTROLLER_H
#define APP_GAME_GAME_CONTROLLER_H

#include <stdint.h>
#include <stdbool.h>
#include "GameState.h"
#include "Modes/CountMode.h"
#include "Modes/TimedMode.h"
#include "Modes/RaceMode.h"
#include "../../Common/Events.h"
#include "../../Common/Messages.h"
#include "../../Common/Config.h"
#include "../../OSAL/inc/Queue.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    GameStateModel state_model;
    CountMode count_mode;
    TimedMode timed_mode;
    RaceMode race_mode;
    Config config;

    OsalQueue* queue_to_core1;

    SensorState last_sensor_state;
    GameState pre_capture_state;
    uint64_t last_timer_broadcast_us;
} GameController;

void GameController_init(GameController* gc, const Config* config, OsalQueue* queue_to_core1);

void GameController_on_sensor_state(GameController* gc, SensorState sensor_state, uint16_t baseline, uint16_t noise, uint16_t threshold);
void GameController_on_hit(GameController* gc, const HitEvent* hit);
void GameController_on_button(GameController* gc, const ButtonEvent* btn);
void GameController_on_command(GameController* gc, const Core1ToCore0Message* cmd);
void GameController_tick(GameController* gc);

const GameStateModel* GameController_get_state(const GameController* gc);

#ifdef __cplusplus
}
#endif

#endif /* APP_GAME_GAME_CONTROLLER_H */
