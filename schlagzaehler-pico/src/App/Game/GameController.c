#include "GameController.h"
#include "../../OSAL/Time.h"
#include <string.h>

static void send_msg(GameController* gc, const Core0ToCore1Message* msg) {
    if (gc && gc->queue_to_core1) {
        OsalQueue_push(gc->queue_to_core1, msg);
    }
}

static void broadcast_state_change(GameController* gc, GameState old_s, GameState new_s) {
    Core0ToCore1Message msg = {
        .type = MSG_GAME_STATE_CHANGED,
        .timestamp_us = Time_now_us(),
        .data.game_state = {
            .old_state = old_s,
            .new_state = new_s
        }
    };
    send_msg(gc, &msg);
}

static void broadcast_mode_change(GameController* gc) {
    Core0ToCore1Message msg = {
        .type = MSG_GAME_MODE_CHANGED,
        .timestamp_us = Time_now_us(),
        .data.game_mode = {
            .mode = gc->state_model.active_mode,
            .parameter = gc->state_model.parameter
        }
    };
    send_msg(gc, &msg);
}

static void broadcast_score_change(GameController* gc) {
    Core0ToCore1Message msg = {
        .type = MSG_SCORE_CHANGED,
        .timestamp_us = Time_now_us(),
        .data.score = {
            .score = gc->state_model.score
        }
    };
    send_msg(gc, &msg);
}

static void broadcast_timer_change(GameController* gc) {
    Core0ToCore1Message msg = {
        .type = MSG_TIMER_CHANGED,
        .timestamp_us = Time_now_us(),
        .data.timer = {
            .elapsed_ms = gc->state_model.elapsed_ms,
            .remaining_ms = gc->state_model.remaining_ms
        }
    };
    send_msg(gc, &msg);
}

static void broadcast_game_finished(GameController* gc) {
    Core0ToCore1Message msg = {
        .type = MSG_GAME_FINISHED,
        .timestamp_us = Time_now_us(),
        .data.game_finished = {
            .final_score = gc->state_model.score,
            .total_time_ms = gc->state_model.elapsed_ms,
            .reason = gc->state_model.end_reason
        }
    };
    send_msg(gc, &msg);
}

void GameController_init(GameController* gc, const Config* config, OsalQueue* queue_to_core1) {
    if (!gc) return;

    if (config) {
        gc->config = *config;
    } else {
        Config_set_defaults(&gc->config);
    }

    gc->queue_to_core1 = queue_to_core1;
    gc->last_timer_broadcast_us = 0;

    GameState_init(&gc->state_model, gc->config.default_mode);
    gc->state_model.parameter = gc->config.timed_duration_s;

    CountMode_init(&gc->count_mode);
    TimedMode_init(&gc->timed_mode, gc->config.timed_duration_s);
    RaceMode_init(&gc->race_mode, gc->config.race_target_hits);
}

void GameController_on_sensor_state(GameController* gc, SensorState sensor_state, uint16_t baseline, uint16_t noise, uint16_t threshold) {
    if (!gc) return;

    /* Notify Core 1 */
    Core0ToCore1Message s_msg = {
        .type = MSG_SENSOR_STATUS_CHANGED,
        .timestamp_us = Time_now_us(),
        .data.sensor_status.state = sensor_state
    };
    send_msg(gc, &s_msg);

    if (sensor_state == SENSOR_STATE_ARMED) {
        Core0ToCore1Message c_msg = {
            .type = MSG_CALIBRATION_RESULT,
            .timestamp_us = Time_now_us(),
            .data.calibration_result = {
                .success = true,
                .baseline = baseline,
                .noise = noise,
                .threshold = threshold
            }
        };
        send_msg(gc, &c_msg);

        if (gc->state_model.state == GAME_STATE_BOOT) {
            GameState old_s = gc->state_model.state;
            gc->state_model.state = GAME_STATE_READY;
            broadcast_state_change(gc, old_s, GAME_STATE_READY);
            broadcast_mode_change(gc);
        }
    } else if (sensor_state == SENSOR_STATE_ERROR) {
        Core0ToCore1Message c_msg = {
            .type = MSG_CALIBRATION_RESULT,
            .timestamp_us = Time_now_us(),
            .data.calibration_result = {
                .success = false,
                .baseline = baseline,
                .noise = noise,
                .threshold = threshold
            }
        };
        send_msg(gc, &c_msg);
    }
}

static void start_game(GameController* gc) {
    uint64_t now = Time_now_us();
    GameState old_s = gc->state_model.state;
    gc->state_model.state = GAME_STATE_RUNNING;
    gc->state_model.start_time_us = now;
    gc->state_model.score = 0;
    gc->state_model.end_reason = GAME_END_NONE;

    if (gc->state_model.active_mode == GAME_MODE_COUNT) {
        CountMode_start(&gc->count_mode, now);
    } else if (gc->state_model.active_mode == GAME_MODE_TIMED) {
        TimedMode_set_duration_s(&gc->timed_mode, gc->state_model.parameter);
        TimedMode_start(&gc->timed_mode, now);
    } else if (gc->state_model.active_mode == GAME_MODE_RACE) {
        RaceMode_set_target_hits(&gc->race_mode, gc->state_model.parameter);
        RaceMode_start(&gc->race_mode, now);
    }

    broadcast_state_change(gc, old_s, GAME_STATE_RUNNING);
}

void GameController_on_hit(GameController* gc, const HitEvent* hit) {
    if (!gc || !hit) return;

    /* Always forward hit event to Core 1 */
    Core0ToCore1Message h_msg = {
        .type = MSG_HIT_DETECTED,
        .timestamp_us = hit->timestamp_us,
        .data.hit = *hit
    };
    send_msg(gc, &h_msg);

    if (gc->state_model.state == GAME_STATE_READY) {
        /* Hit starts the game in READY state! */
        start_game(gc);
        gc->state_model.score = 1;
        broadcast_score_change(gc);
        return;
    }

    if (gc->state_model.state == GAME_STATE_RUNNING) {
        gc->state_model.score++;
        broadcast_score_change(gc);

        /* Evaluate mode completion */
        if (gc->state_model.active_mode == GAME_MODE_RACE) {
            if (RaceMode_on_hit(&gc->race_mode, gc->state_model.score)) {
                /* Target reached! */
                uint64_t now = Time_now_us();
                gc->state_model.end_time_us = now;
                gc->state_model.elapsed_ms = (uint32_t)((now - gc->state_model.start_time_us) / 1000ULL);
                gc->state_model.end_reason = GAME_END_TARGET_REACHED;
                GameState old_s = gc->state_model.state;
                gc->state_model.state = GAME_STATE_FINISHED;
                broadcast_state_change(gc, old_s, GAME_STATE_FINISHED);
                broadcast_game_finished(gc);
            }
        }
    }
}

void GameController_on_button(GameController* gc, const ButtonEvent* btn) {
    if (!gc || !btn || !btn->pressed) return;

    GameState state = gc->state_model.state;

    if (state == GAME_STATE_MENU) {
        if (btn->button == BTN_ID_UP) {
            gc->state_model.menu_selected_mode =
                (GameMode)((gc->state_model.menu_selected_mode + GAME_MODE_COUNT_TOTAL - 1) % GAME_MODE_COUNT_TOTAL);
            broadcast_mode_change(gc);
        } else if (btn->button == BTN_ID_DOWN) {
            gc->state_model.menu_selected_mode =
                (GameMode)((gc->state_model.menu_selected_mode + 1) % GAME_MODE_COUNT_TOTAL);
            broadcast_mode_change(gc);
        } else if (btn->button == BTN_ID_RIGHT) {
            /* Select mode and enter READY */
            gc->state_model.active_mode = gc->state_model.menu_selected_mode;
            if (gc->state_model.active_mode == GAME_MODE_TIMED) {
                gc->state_model.parameter = gc->config.timed_duration_s;
            } else if (gc->state_model.active_mode == GAME_MODE_RACE) {
                gc->state_model.parameter = gc->config.race_target_hits;
            } else {
                gc->state_model.parameter = 0;
            }
            GameState_reset_score(&gc->state_model);
            gc->state_model.state = GAME_STATE_READY;
            broadcast_state_change(gc, GAME_STATE_MENU, GAME_STATE_READY);
            broadcast_mode_change(gc);
            broadcast_score_change(gc);
        }
        return;
    }

    if (state == GAME_STATE_READY) {
        if (btn->button == BTN_ID_LEFT) {
            /* Return to MENU */
            gc->state_model.menu_selected_mode = gc->state_model.active_mode;
            gc->state_model.state = GAME_STATE_MENU;
            broadcast_state_change(gc, GAME_STATE_READY, GAME_STATE_MENU);
        } else if (btn->button == BTN_ID_RIGHT) {
            /* Reset counter */
            GameState_reset_score(&gc->state_model);
            broadcast_score_change(gc);
        } else if (btn->button == BTN_ID_UP) {
            if (gc->state_model.active_mode == GAME_MODE_TIMED) {
                gc->state_model.parameter += 5;
                if (gc->state_model.parameter > 300) gc->state_model.parameter = 300;
                broadcast_mode_change(gc);
            } else if (gc->state_model.active_mode == GAME_MODE_RACE) {
                gc->state_model.parameter += 10;
                if (gc->state_model.parameter > 500) gc->state_model.parameter = 500;
                broadcast_mode_change(gc);
            }
        } else if (btn->button == BTN_ID_DOWN) {
            if (gc->state_model.active_mode == GAME_MODE_TIMED) {
                if (gc->state_model.parameter > 5) gc->state_model.parameter -= 5;
                broadcast_mode_change(gc);
            } else if (gc->state_model.active_mode == GAME_MODE_RACE) {
                if (gc->state_model.parameter > 10) gc->state_model.parameter -= 10;
                broadcast_mode_change(gc);
            }
        }
        return;
    }

    if (state == GAME_STATE_RUNNING) {
        if (btn->button == BTN_ID_LEFT) {
            /* Abort to MENU */
            gc->state_model.menu_selected_mode = gc->state_model.active_mode;
            gc->state_model.state = GAME_STATE_MENU;
            broadcast_state_change(gc, GAME_STATE_RUNNING, GAME_STATE_MENU);
        } else if (btn->button == BTN_ID_RIGHT) {
            /* Restart: back to READY */
            GameState_reset_score(&gc->state_model);
            gc->state_model.state = GAME_STATE_READY;
            broadcast_state_change(gc, GAME_STATE_RUNNING, GAME_STATE_READY);
            broadcast_score_change(gc);
        }
        return;
    }

    if (state == GAME_STATE_FINISHED) {
        if (btn->button == BTN_ID_LEFT) {
            /* Return to MENU */
            gc->state_model.menu_selected_mode = gc->state_model.active_mode;
            gc->state_model.state = GAME_STATE_MENU;
            broadcast_state_change(gc, GAME_STATE_FINISHED, GAME_STATE_MENU);
        } else if (btn->button == BTN_ID_RIGHT) {
            /* Restart in same mode */
            GameState_reset_score(&gc->state_model);
            gc->state_model.state = GAME_STATE_READY;
            broadcast_state_change(gc, GAME_STATE_FINISHED, GAME_STATE_READY);
            broadcast_score_change(gc);
        }
        return;
    }
}

void GameController_on_command(GameController* gc, const Core1ToCore0Message* cmd) {
    if (!gc || !cmd) return;

    switch (cmd->type) {
        case MSG_START_GAME:
            if (gc->state_model.state == GAME_STATE_READY) {
                start_game(gc);
            }
            break;
        case MSG_RESET_GAME:
            GameState_reset_score(&gc->state_model);
            gc->state_model.state = GAME_STATE_READY;
            broadcast_state_change(gc, gc->state_model.state, GAME_STATE_READY);
            broadcast_score_change(gc);
            break;
        case MSG_SET_GAME_MODE:
            gc->state_model.active_mode = cmd->data.set_mode.mode;
            gc->state_model.menu_selected_mode = cmd->data.set_mode.mode;
            GameState_reset_score(&gc->state_model);
            broadcast_mode_change(gc);
            break;
        case MSG_SET_GAME_PARAMETER:
            gc->state_model.parameter = cmd->data.set_parameter.parameter;
            broadcast_mode_change(gc);
            break;
        case MSG_REQUEST_STATUS:
            broadcast_state_change(gc, gc->state_model.state, gc->state_model.state);
            broadcast_mode_change(gc);
            broadcast_score_change(gc);
            broadcast_timer_change(gc);
            break;
        default:
            break;
    }
}

void GameController_tick(GameController* gc) {
    if (!gc || gc->state_model.state != GAME_STATE_RUNNING) return;

    uint64_t now = Time_now_us();
    uint32_t elapsed_ms = 0;
    uint32_t remaining_ms = 0;

    if (gc->state_model.active_mode == GAME_MODE_TIMED) {
        bool time_up = TimedMode_on_tick(&gc->timed_mode, now, &elapsed_ms, &remaining_ms);
        gc->state_model.elapsed_ms = elapsed_ms;
        gc->state_model.remaining_ms = remaining_ms;

        if (time_up) {
            gc->state_model.end_time_us = now;
            gc->state_model.end_reason = GAME_END_TIME_LIMIT;
            GameState old_s = gc->state_model.state;
            gc->state_model.state = GAME_STATE_FINISHED;
            broadcast_timer_change(gc);
            broadcast_state_change(gc, old_s, GAME_STATE_FINISHED);
            broadcast_game_finished(gc);
            return;
        }
    } else if (gc->state_model.active_mode == GAME_MODE_RACE) {
        RaceMode_on_tick(&gc->race_mode, now, &elapsed_ms);
        gc->state_model.elapsed_ms = elapsed_ms;
        gc->state_model.remaining_ms = 0;
    } else if (gc->state_model.active_mode == GAME_MODE_COUNT) {
        CountMode_on_tick(&gc->count_mode, now, &elapsed_ms, &remaining_ms);
        gc->state_model.elapsed_ms = elapsed_ms;
        gc->state_model.remaining_ms = 0;
    }

    /* Broadcast timer updates every 250ms to keep queue load reasonable while responsive */
    if (now - gc->last_timer_broadcast_us >= 250000ULL) {
        gc->last_timer_broadcast_us = now;
        broadcast_timer_change(gc);
    }
}

const GameStateModel* GameController_get_state(const GameController* gc) {
    return gc ? &gc->state_model : NULL;
}
