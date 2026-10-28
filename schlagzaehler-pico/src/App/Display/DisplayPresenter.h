#ifndef APP_DISPLAY_DISPLAY_PRESENTER_H
#define APP_DISPLAY_DISPLAY_PRESENTER_H

#include <stdint.h>
#include <stdbool.h>
#include "../../Common/Messages.h"
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
    uint32_t elapsed_ms;
    uint32_t remaining_ms;
    GameEndReason end_reason;

    SensorState sensor_state;
    uint8_t calib_percent;
    uint16_t baseline;
    uint16_t threshold;
    uint8_t capture_target;

    bool needs_full_redraw;
    bool needs_score_redraw;
    bool needs_timer_redraw;

    GameState last_rendered_state;
} DisplayPresenter;

void DisplayPresenter_init(DisplayPresenter* presenter);

/**
 * @brief Handle a message received from Core 0.
 */
void DisplayPresenter_handle_message(DisplayPresenter* presenter, const Core0ToCore1Message* msg);

/**
 * @brief Render any pending UI updates to the display.
 */
void DisplayPresenter_render(DisplayPresenter* presenter);

#ifdef __cplusplus
}
#endif

#endif /* APP_DISPLAY_DISPLAY_PRESENTER_H */
