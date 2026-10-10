#include "CoreStartup.h"
#include "pico/multicore.h"

void CoreStartup_launch_core1(Core1EntryFunc entry) {
    if (entry) {
        multicore_launch_core1(entry);
    }
}

void CoreStartup_reset_core1(void) {
    multicore_reset_core1();
}
