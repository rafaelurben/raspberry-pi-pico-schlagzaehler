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
    uint8_t capture_target;
    GameState pre_capture_state;
    uint64_t last_timer_broadcast_us;
} GameController;

/**
 * @brief Initialize the game controller, game modes, and inter-core telemetry queue.
 * @param gc Pointer to GameController instance.
 * @param config Pointer to system configuration.
 * @param queue_to_core1 Pointer to message queue targeting Core 1.
 */
void GameController_init(GameController* gc, const Config* config, OsalQueue* queue_to_core1);

/**
 * @brief Handle a sensor state transition, calibration result, or capture state notification.
 * @param gc Pointer to GameController instance.
 * @param sensor_state New sensor state.
 * @param capture_target Active capture channel target (0, 1, 2, or 255 for ALL).
 * @param baselines Array of calibrated sensor baseline values.
 * @param noises Array of calibrated sensor noise values.
 * @param thresholds Array of active sensor detection thresholds.
 * @param ignored Array of booleans indicating if a sensor is ignored/disconnected.
 */
void GameController_on_sensor_state(
    GameController* gc,
    SensorState sensor_state,
    uint8_t capture_target,
    const uint16_t baselines[SENSOR_COUNT],
    const uint16_t noises[SENSOR_COUNT],
    const uint16_t thresholds[SENSOR_COUNT],
    const bool ignored[SENSOR_COUNT]
);

/**
 * @brief Process a confirmed hit event detected by the hit detector.
 * @param gc Pointer to GameController instance.
 * @param hit Pointer to detected HitEvent.
 */
void GameController_on_hit(GameController* gc, const HitEvent* hit);

/**
 * @brief Process an input button event (UP, DOWN, LEFT, RIGHT).
 * @param gc Pointer to GameController instance.
 * @param btn Pointer to ButtonEvent.
 */
void GameController_on_button(GameController* gc, const ButtonEvent* btn);

/**
 * @brief Process a companion command forwarded from Core 1.
 * @param gc Pointer to GameController instance.
 * @param cmd Pointer to Core1ToCore0Message command.
 */
void GameController_on_command(GameController* gc, const Core1ToCore0Message* cmd);

/**
 * @brief Periodic game controller tick: updates timers, mode rules, and state broadcasts.
 * @param gc Pointer to GameController instance.
 */
void GameController_tick(GameController* gc);

/**
 * @brief Get a read-only pointer to the underlying game state model.
 * @param gc Pointer to GameController instance.
 * @return Const pointer to GameStateModel.
 */
const GameStateModel* GameController_get_state(const GameController* gc);

#ifdef __cplusplus
}
#endif

#endif /* APP_GAME_GAME_CONTROLLER_H */
