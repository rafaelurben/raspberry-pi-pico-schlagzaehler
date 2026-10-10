#ifndef OSAL_CRITICAL_SECTION_H
#define OSAL_CRITICAL_SECTION_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t saved_interrupt_status;
    uint32_t lock_val;
} CriticalSection;

void CriticalSection_init(CriticalSection* cs);
void CriticalSection_enter(CriticalSection* cs);
void CriticalSection_leave(CriticalSection* cs);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_CRITICAL_SECTION_H */
