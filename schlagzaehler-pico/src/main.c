#include "OSAL/inc/Board.h"
#include "Common/Config.h"
#include "App/App.h"

static App s_app;

int main(void) {
    /* Initialize hardware board, stdio, and LEDs */
    Board_init();

    /* Load default configuration */
    Config config;
    Config_set_defaults(&config);

    /* Initialize application, start Core 1 and hardware pipelines */
    App_init(&s_app, &config);

    /* Run Core 0 authoritative processing loop */
    for (;;) {
        App_run_core0(&s_app);
    }

    return 0;
}
