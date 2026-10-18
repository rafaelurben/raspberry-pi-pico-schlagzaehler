#include "OSAL/inc/Board.h"
#include "Common/Config.h"
#include "App/App.h"

int main(void) {
    /* Initialize hardware board, stdio, and LEDs */
    Board_init();

    /* Load default configuration */
    Config config;
    Config_set_defaults(&config);

    /* Initialize application, start Core 1 and hardware pipelines */
    App app;
    App_init(&app, &config);

    /* Run Core 0 authoritative processing loop */
    for (;;) {
        App_run_core0(&app);
    }

    return 0;
}
