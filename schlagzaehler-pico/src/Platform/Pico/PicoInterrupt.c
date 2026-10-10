#include "PicoInterrupt.h"
#include "hardware/sync.h"

uint32_t Interrupt_disable(void) {
    return save_and_disable_interrupts();
}

void Interrupt_restore(uint32_t status) {
    restore_interrupts(status);
}

void CriticalSection_init(CriticalSection* cs) {
    if (cs) {
        cs->saved_interrupt_status = 0;
        cs->lock_val = 0;
    }
}

void CriticalSection_enter(CriticalSection* cs) {
    if (cs) {
        cs->saved_interrupt_status = save_and_disable_interrupts();
    }
}

void CriticalSection_leave(CriticalSection* cs) {
    if (cs) {
        restore_interrupts(cs->saved_interrupt_status);
    }
}
