#include "../../inc/Interrupt.h"
#include "hardware/sync.h"

uint32_t Interrupt_disable(void) {
    return save_and_disable_interrupts();
}

void Interrupt_restore(uint32_t status) {
    restore_interrupts(status);
}
