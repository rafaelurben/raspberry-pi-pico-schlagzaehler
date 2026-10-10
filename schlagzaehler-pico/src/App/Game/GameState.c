#include "GameState.h"

void GameState_init(GameStateModel* model, GameMode default_mode) {
    if (!model) return;

    model->state = GAME_STATE_BOOT;
    model->active_mode = default_mode;
    model->menu_selected_mode = default_mode;
    model->score = 0;
    model->parameter = 30;
    model->start_time_us = 0;
    model->end_time_us = 0;
    model->end_reason = GAME_END_NONE;
    model->elapsed_ms = 0;
    model->remaining_ms = 0;
}

void GameState_set_state(GameStateModel* model, GameState new_state) {
    if (!model) return;
    model->state = new_state;
}

void GameState_set_mode(GameStateModel* model, GameMode mode, uint32_t param) {
    if (!model) return;
    model->active_mode = mode;
    model->parameter = param;
}

void GameState_reset_score(GameStateModel* model) {
    if (!model) return;
    model->score = 0;
    model->start_time_us = 0;
    model->end_time_us = 0;
    model->elapsed_ms = 0;
    model->remaining_ms = 0;
    model->end_reason = GAME_END_NONE;
}
