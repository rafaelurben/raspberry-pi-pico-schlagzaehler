#ifndef APP_GAME_GAME_STATE_H
#define APP_GAME_GAME_STATE_H

#include <stdint.h>
#include <stdbool.h>
#include "../../Common/GameTypes.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    GameState state;
    GameMode active_mode;
    GameMode menu_selected_mode;
    uint32_t score;
    uint32_t parameter;
    uint64_t start_time_us;
    uint64_t end_time_us;
    GameEndReason end_reason;
    uint32_t elapsed_ms;
    uint32_t remaining_ms;
} GameStateModel;

void GameState_init(GameStateModel* model, GameMode default_mode);
void GameState_set_state(GameStateModel* model, GameState new_state);
void GameState_set_mode(GameStateModel* model, GameMode mode, uint32_t param);
void GameState_reset_score(GameStateModel* model);

#ifdef __cplusplus
}
#endif

#endif /* APP_GAME_GAME_STATE_H */
