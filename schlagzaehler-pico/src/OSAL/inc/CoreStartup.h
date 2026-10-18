#ifndef OSAL_CORE_STARTUP_H
#define OSAL_CORE_STARTUP_H

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*Core1EntryFunc)(void);

/**
 * @brief Launch Core 1 with the specified entry function.
 */
void CoreStartup_launch_core1(Core1EntryFunc entry);

/**
 * @brief Reset Core 1 to initial state.
 */
void CoreStartup_reset_core1(void);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_CORE_STARTUP_H */
