#include "DisplayPresenter.h"
#include "../../Drivers/DisplayDriver.h"
#include <stdio.h>
#include <string.h>

void DisplayPresenter_init(DisplayPresenter* presenter) {
    if (!presenter) return;

    presenter->state = GAME_STATE_BOOT;
    presenter->active_mode = GAME_MODE_COUNT;
    presenter->menu_selected_mode = GAME_MODE_COUNT;
    presenter->score = 0;
    presenter->parameter = 30;
    presenter->elapsed_ms = 0;
    presenter->remaining_ms = 0;
    presenter->end_reason = GAME_END_NONE;

    presenter->sensor_state = SENSOR_STATE_INIT;
    presenter->calib_percent = 0;
    presenter->baseline = 0;
    presenter->threshold = 0;

    presenter->needs_full_redraw = true;
    presenter->needs_score_redraw = false;
    presenter->needs_timer_redraw = false;
    presenter->last_rendered_state = (GameState)99;
}

void DisplayPresenter_handle_message(DisplayPresenter* presenter, const Core0ToCore1Message* msg) {
    if (!presenter || !msg) return;

    switch (msg->type) {
        case MSG_GAME_STATE_CHANGED:
            presenter->state = msg->data.game_state.new_state;
            if (presenter->state == GAME_STATE_MENU) {
                presenter->menu_selected_mode = presenter->active_mode;
            }
            presenter->needs_full_redraw = true;
            break;
        case MSG_GAME_MODE_CHANGED:
            presenter->active_mode = msg->data.game_mode.mode;
            presenter->menu_selected_mode = msg->data.game_mode.menu_selected_mode;
            presenter->parameter = msg->data.game_mode.parameter;
            presenter->needs_full_redraw = true;
            break;
        case MSG_SCORE_CHANGED:
            presenter->score = msg->data.score.score;
            presenter->needs_score_redraw = true;
            break;
        case MSG_TIMER_CHANGED:
            presenter->elapsed_ms = msg->data.timer.elapsed_ms;
            presenter->remaining_ms = msg->data.timer.remaining_ms;
            presenter->needs_timer_redraw = true;
            break;
        case MSG_GAME_FINISHED:
            presenter->score = msg->data.game_finished.final_score;
            presenter->elapsed_ms = msg->data.game_finished.total_time_ms;
            presenter->end_reason = msg->data.game_finished.reason;
            presenter->needs_full_redraw = true;
            break;
        case MSG_CALIBRATION_PROGRESS:
            presenter->calib_percent = msg->data.calibration_progress.progress_percent;
            presenter->needs_timer_redraw = true;
            break;
        case MSG_CALIBRATION_RESULT:
            presenter->baseline = msg->data.calibration_result.baseline;
            presenter->threshold = msg->data.calibration_result.threshold;
            if (!msg->data.calibration_result.success) {
                presenter->sensor_state = SENSOR_STATE_ERROR;
                presenter->needs_full_redraw = true;
            } else if (presenter->state == GAME_STATE_BOOT) {
                presenter->needs_full_redraw = true;
            }
            break;
        case MSG_SENSOR_STATUS_CHANGED:
            presenter->sensor_state = msg->data.sensor_status.state;
            if (presenter->sensor_state == SENSOR_STATE_ERROR) {
                presenter->needs_full_redraw = true;
            }
            break;
        default:
            break;
    }
}

static void render_boot(DisplayPresenter* presenter) {
    if (presenter->needs_full_redraw) {
        DisplayDriver_clear(DISPLAY_COLOR_BLACK);
        DisplayDriver_draw_string(10, 15, "SCHLAGZAEHLER", DISPLAY_COLOR_CYAN, DISPLAY_COLOR_BLACK, DISPLAY_FONT_RETRO);
        DisplayDriver_draw_line(0, 35, 127, 35, DISPLAY_COLOR_GRAY);

        if (presenter->sensor_state == SENSOR_STATE_ERROR) {
            DisplayDriver_draw_string(10, 50, "SENSOR FEHLER!", DISPLAY_COLOR_RED, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
            DisplayDriver_draw_string(5, 70, "Piezo pruefen...", DISPLAY_COLOR_WHITE, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
            return;
        }

        DisplayDriver_draw_string(15, 55, "Kalibriere...", DISPLAY_COLOR_YELLOW, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
        DisplayDriver_draw_rect(14, 75, 100, 12, DISPLAY_COLOR_WHITE);
    }

    if (presenter->sensor_state == SENSOR_STATE_ERROR) {
        return;
    }

    /* Progress bar fill and percentage */
    uint16_t fill_w = (presenter->calib_percent * 96) / 100;
    if (fill_w > 96) fill_w = 96;
    if (fill_w > 0) {
        DisplayDriver_fill_rect(16, 77, fill_w, 8, DISPLAY_COLOR_GREEN);
    }

    char buf[16];
    snprintf(buf, sizeof(buf), "%3d%%", presenter->calib_percent);
    DisplayDriver_draw_string(48, 95, buf, DISPLAY_COLOR_WHITE, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
}

static void render_menu(DisplayPresenter* presenter) {
    DisplayDriver_clear(DISPLAY_COLOR_BLACK);
    DisplayDriver_draw_string(15, 10, "SPIELMODUS", DISPLAY_COLOR_YELLOW, DISPLAY_COLOR_BLACK, DISPLAY_FONT_RETRO);
    DisplayDriver_draw_line(0, 28, 127, 28, DISPLAY_COLOR_GRAY);

    const char* modes[] = { "1. Zaehlen", "2. Zeit", "3. Rennen" };
    for (int i = 0; i < 3; ++i) {
        int y = 40 + i * 22;
        if ((GameMode)i == presenter->menu_selected_mode) {
            DisplayDriver_fill_rect(4, y - 2, 120, 18, DISPLAY_COLOR_BLUE);
            DisplayDriver_draw_string(10, y, modes[i], DISPLAY_COLOR_WHITE, DISPLAY_COLOR_BLUE, DISPLAY_FONT_DEFAULT);
            DisplayDriver_draw_string(105, y, ">", DISPLAY_COLOR_YELLOW, DISPLAY_COLOR_BLUE, DISPLAY_FONT_DEFAULT);
        } else {
            DisplayDriver_draw_string(10, y, modes[i], DISPLAY_COLOR_GRAY, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
        }
    }

    DisplayDriver_draw_line(0, 110, 127, 110, DISPLAY_COLOR_DARKGRAY);
    DisplayDriver_draw_string(5, 115, "UP/DOWN   OK:RECHTS", DISPLAY_COLOR_CYAN, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
}

static void render_ready(DisplayPresenter* presenter) {
    DisplayDriver_clear(DISPLAY_COLOR_BLACK);

    const char* mode_title = GameMode_to_string(presenter->active_mode);
    DisplayDriver_draw_string(10, 10, mode_title, DISPLAY_COLOR_CYAN, DISPLAY_COLOR_BLACK, DISPLAY_FONT_RETRO);
    DisplayDriver_draw_line(0, 28, 127, 28, DISPLAY_COLOR_GRAY);

    char param_str[32];
    if (presenter->active_mode == GAME_MODE_TIMED) {
        snprintf(param_str, sizeof(param_str), "Zeit: %lus (+/-)", (unsigned long)presenter->parameter);
        DisplayDriver_draw_string(10, 40, param_str, DISPLAY_COLOR_YELLOW, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
    } else if (presenter->active_mode == GAME_MODE_RACE) {
        snprintf(param_str, sizeof(param_str), "Ziel: %lu Hits", (unsigned long)presenter->parameter);
        DisplayDriver_draw_string(10, 40, param_str, DISPLAY_COLOR_YELLOW, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
    }

    DisplayDriver_draw_string(25, 65, "BEREIT!", DISPLAY_COLOR_GREEN, DISPLAY_COLOR_BLACK, DISPLAY_FONT_RETRO);
    DisplayDriver_draw_string(15, 88, "Schlag = Start", DISPLAY_COLOR_WHITE, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);

    DisplayDriver_draw_line(0, 110, 127, 110, DISPLAY_COLOR_DARKGRAY);
    DisplayDriver_draw_string(5, 115, "L:Menue  R:Reset", DISPLAY_COLOR_GRAY, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
}

static void render_running(DisplayPresenter* presenter) {
    if (presenter->needs_full_redraw) {
        DisplayDriver_clear(DISPLAY_COLOR_BLACK);
        const char* mode_title = GameMode_to_string(presenter->active_mode);
        DisplayDriver_draw_string(10, 8, mode_title, DISPLAY_COLOR_CYAN, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
        DisplayDriver_draw_line(0, 22, 127, 22, DISPLAY_COLOR_GRAY);
        DisplayDriver_draw_line(0, 110, 127, 110, DISPLAY_COLOR_DARKGRAY);
        DisplayDriver_draw_string(5, 115, "L:Menue  R:Reset", DISPLAY_COLOR_GRAY, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
    }

    /* Redraw score area */
    if (presenter->needs_full_redraw || presenter->needs_score_redraw) {
        DisplayDriver_fill_rect(10, 32, 108, 30, DISPLAY_COLOR_BLACK);
        char score_str[32];
        snprintf(score_str, sizeof(score_str), "%lu", (unsigned long)presenter->score);
        DisplayDriver_draw_string(45, 36, score_str, DISPLAY_COLOR_YELLOW, DISPLAY_COLOR_BLACK, DISPLAY_FONT_BIG);
    }

    /* Redraw timer area */
    if (presenter->needs_full_redraw || presenter->needs_timer_redraw) {
        DisplayDriver_fill_rect(10, 72, 108, 25, DISPLAY_COLOR_BLACK);
        char time_str[32];
        if (presenter->active_mode == GAME_MODE_TIMED) {
            snprintf(time_str, sizeof(time_str), "Rest: %lu.%1lus",
                     (unsigned long)(presenter->remaining_ms / 1000),
                     (unsigned long)((presenter->remaining_ms % 1000) / 100));
            DisplayDriver_draw_string(15, 75, time_str, DISPLAY_COLOR_WHITE, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
        } else {
            snprintf(time_str, sizeof(time_str), "Zeit: %lu.%1lus",
                     (unsigned long)(presenter->elapsed_ms / 1000),
                     (unsigned long)((presenter->elapsed_ms % 1000) / 100));
            DisplayDriver_draw_string(15, 75, time_str, DISPLAY_COLOR_WHITE, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
        }
    }
}

static void render_finished(DisplayPresenter* presenter) {
    DisplayDriver_clear(DISPLAY_COLOR_BLACK);
    DisplayDriver_draw_string(25, 10, "FERTIG!", DISPLAY_COLOR_GREEN, DISPLAY_COLOR_BLACK, DISPLAY_FONT_RETRO);
    DisplayDriver_draw_line(0, 30, 127, 30, DISPLAY_COLOR_GRAY);

    char score_str[32];
    snprintf(score_str, sizeof(score_str), "Hits: %lu", (unsigned long)presenter->score);
    DisplayDriver_draw_string(20, 45, score_str, DISPLAY_COLOR_YELLOW, DISPLAY_COLOR_BLACK, DISPLAY_FONT_RETRO);

    char time_str[32];
    snprintf(time_str, sizeof(time_str), "Zeit: %lu.%1lus",
             (unsigned long)(presenter->elapsed_ms / 1000),
             (unsigned long)((presenter->elapsed_ms % 1000) / 100));
    DisplayDriver_draw_string(15, 70, time_str, DISPLAY_COLOR_WHITE, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);

    const char* reason = GameEndReason_to_string(presenter->end_reason);
    DisplayDriver_draw_string(15, 90, reason, DISPLAY_COLOR_CYAN, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);

    DisplayDriver_draw_line(0, 110, 127, 110, DISPLAY_COLOR_DARKGRAY);
    DisplayDriver_draw_string(5, 115, "R:Neu   L:Menue", DISPLAY_COLOR_GRAY, DISPLAY_COLOR_BLACK, DISPLAY_FONT_DEFAULT);
}

void DisplayPresenter_render(DisplayPresenter* presenter) {
    if (!presenter) return;

    if (!presenter->needs_full_redraw && !presenter->needs_score_redraw && !presenter->needs_timer_redraw) {
        return;
    }

    switch (presenter->state) {
        case GAME_STATE_BOOT:
            render_boot(presenter);
            break;
        case GAME_STATE_MENU:
            render_menu(presenter);
            break;
        case GAME_STATE_READY:
            render_ready(presenter);
            break;
        case GAME_STATE_RUNNING:
            render_running(presenter);
            break;
        case GAME_STATE_FINISHED:
            render_finished(presenter);
            break;
    }

    presenter->last_rendered_state = presenter->state;
    presenter->needs_full_redraw = false;
    presenter->needs_score_redraw = false;
    presenter->needs_timer_redraw = false;
}
