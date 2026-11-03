# Interface Control Document (ICD): Companion Protocol & Inter-Core IPC

**Project:** Schlagzähler – Piezo-based Hit Detection and Game System  
**Document Version:** 1.0.0  
**Target Firmware:** Raspberry Pi Pico W (`pico_w`, RP2040, dual-core ARM Cortex-M0+)  
**Companion Software:** Schlagzähler Web Dashboard (Angular v22, W3C Web Serial API)  
**Related Source Files:**

- Firmware:
    - [`src/Common/Messages.h`](../schlagzaehler-pico/src/Common/Messages.h)
    - [`src/Common/GameTypes.h`](../schlagzaehler-pico/src/Common/GameTypes.h)
    - [`src/Common/Events.h`](../schlagzaehler-pico/src/Common/Events.h)
    - [`src/App/Companion/CompanionProtocol.h`](../schlagzaehler-pico/src/App/Companion/CompanionProtocol.h)
    - [`src/App/Companion/CommandHandler.h`](../schlagzaehler-pico/src/App/Companion/CommandHandler.h)
- Web Application:
    - [`companion-protocol.ts`](../schlagzaehler-web/src/app/core/device/protocol/companion-protocol.ts)
    - [`device.model.ts`](../schlagzaehler-web/src/app/core/device/models/device.model.ts)
- PlantUML Sequence: [`sequence_companion_protocol.puml`](../docs/diagrams/sequence_companion_protocol.puml)

---

## 1. System Overview & Architectural Boundaries

The Schlagzähler system employs a strictly decoupled dual-core architecture to guarantee deterministic, real-time piezo
hit detection while concurrently managing a TFT display and duplex USB serial communication.

```
┌────────────────────────────────────────────────────────┐
│              Schlagzähler Companion Web App            │
│                 (Angular v22 / Web Serial)             │
└───────────────────────────▲────────────────────────────┘
                            │ USB CDC Serial (115200 baud, ASCII \n)
                            ▼
┌────────────────────────────────────────────────────────┐
│             RP2040 Core 1 (Display & I/O)              │
│  - UsbSerialDriver (stdio_usb)                         │
│  - CompanionProtocol parser & chunked transmitter      │
│  - CommandHandler                                      │
│  - DisplayPresenter (ST7735 128x160 SPI TFT)           │
└───────────────▲────────────────────────┬───────────────┘
                │                        │
  queue_core0_to_core1 (Cap: 16)         │ queue_core1_to_core0 (Cap: 8)
  Core0ToCore1Message                    │ Core1ToCore0Message
  (State, Hits, Timer, Telemetry)        │ (Commands: Start, Mode, Calib...)
                │                        │
┌───────────────┴────────────────────────▼───────────────┐
│          RP2040 Core 0 (Real-Time Sensing & Logic)     │
│  - 50 kHz ADC DMA ping-pong buffers                    │
│  - HitDetector (Exponential decay, dynamic threshold)  │
│  - Authoritative GameController & GameModes            │
│  - ButtonController (Debouncing & vibration suppression)│
└────────────────────────────────────────────────────────┘
```

- **Core 0** is the **sole authoritative source of truth** for hit detection, sensor calibration, scoring, timers, and
  game state transitions. Core 0 never performs blocking serial or display I/O.
- **Core 1** manages asynchronous communications: it polls incoming serial bytes from USB CDC, parses command strings
  into typed `Core1ToCore0Message` structs, pushes them into `queue_core1_to_core0`, drains `queue_core0_to_core1`, and
  formats outgoing ASCII telemetry.
- **Communication Safety**: The two cores communicate exclusively via lock-safe OSAL ring buffers (`OsalQueue`). Neither
  core can block or starve the other.

---

## 2. Companion Protocol Specification (External Wire Protocol)

### 2.1 Transport Layer Details

- **Medium**: USB CDC Virtual COM Port (ACM).
- **Baud Rate**: `115200` baud.
- **Line Delimiter**: ASCII Line Feed (`\n` / `0x0A`).
- **Format**: Plaintext ASCII key-value tokens separated by whitespace: `<EVENT_OR_COMMAND> [key=value]...`.

---

### 2.2 Incoming Commands (Web Companion → Pico W)

Commands are transmitted from the companion application to the Pico device. Leading whitespace is ignored.

| Command          | Syntax / Example                                | Valid Device States                          | Core 0 Action & Side Effects                                                    | Expected Outgoing Response                                                                   |
|------------------|-------------------------------------------------|----------------------------------------------|---------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| **START**        | `START`                                         | `MENU`, `READY`, `FINISHED`                  | Launches or restarts game. Starts countdown or stopwatch.                       | `STATE old=... new=RUNNING`, `SCORE value=0`, `TIMER ...`                                    |
| **RESET**        | `RESET`                                         | Any (`RUNNING`, `FINISHED`, `MENU`)          | Cancels active game/capture; resets score to 0; sets state to `READY`.          | `STATE old=... new=READY`, `SCORE value=0`                                                   |
| **CALIB**        | `CALIB`                                         | `MENU`, `READY`, `ERROR`                     | Aborts capture; triggers 1500 ms baseline/noise calibration on Core 0.          | `SENSOR status=CALIBRATING`, followed by `CALIB ...` and `SENSOR status=ARMED`               |
| **STATUS**       | `STATUS`                                        | Any                                          | Requests instantaneous full state synchronization.                              | `SENSOR status=...`, `STATE old=... new=...`, `MODE active=... param=...`, `SCORE value=...` |
| **MODE**         | `MODE:<COUNT\|TIMED\|RACE>` or `MODE:<0\|1\|2>` | `MENU`, `READY`                              | Switches game mode and resets mode parameters to defaults.                      | `MODE active=<MODE> param=<val>`                                                             |
| **PARAM**        | `PARAM:<u32>` (e.g. `PARAM:45`)                 | `READY`                                      | Sets game mode parameter (countdown seconds in `TIMED`; target hits in `RACE`). | `MODE active=<MODE> param=<val>`                                                             |
| **SENS**         | `SENS:<float>` (e.g. `SENS:4.5`)                | Any                                          | Updates dynamic noise factor multiplier (`noise_factor`) in `ConfigService`.    | None directly (effective on next hit check)                                                  |
| **CAPTURE**      | `CAPTURE` or `CAPTURE:START`                    | `READY`, `MENU`, `FINISHED`                  | Arms 10 kHz circular pre-trigger buffer (0.1 s) waiting for threshold hit.      | `SENSOR status=CAPTURE_ARMED`                                                                |
| **CAPTURE:STOP** | `CAPTURE:STOP`                                  | `CAPTURE_ARMED`, `CAPTURING`, `TRANSMITTING` | Aborts raw capture; returns sensor to armed baseline state.                     | `SENSOR status=ARMED`                                                                        |

---

### 2.3 Outgoing Telemetry & Events (Pico W → Web Companion)

Events are serialized and transmitted by Core 1 as soon as corresponding messages are popped from
`queue_core0_to_core1`.

| Event Type          | Wire Syntax / Pattern                                                                       | Fields & Types                                                                                                                                          | Description / Trigger Condition                                                                    |
|---------------------|---------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| **`BOOT`**          | `BOOT success=<0\|1> msg=<text>`                                                            | `success`: bool (0/1)<br>`msg`: string                                                                                                                  | Emitted once during initial hardware & OSAL startup.                                               |
| **`SENSOR`**        | `SENSOR status=<STATUS>`                                                                    | `status`: enum string (`INIT`, `CALIBRATING`, `ARMED`, `LOCKOUT`, `CAPTURE_ARMED`, `CAPTURING`, `TRANSMITTING`, `ERROR`)                                | Emitted whenever sensor state transitions (e.g. calibration start/finish, capture armed, lockout). |
| **`CALIB`**         | `CALIB success=<0\|1> baseline=<u16> noise=<u16> threshold=<u16>`                           | `success`: bool<br>`baseline`: ADC counts (0–4095)<br>`noise`: max noise span<br>`threshold`: computed trigger threshold                                | Emitted upon completion of a sensor calibration routine.                                           |
| **`HIT`**           | `HIT id=<u32> peak=<u16> intensity=<u16>`                                                   | `id`: hit counter<br>`peak`: maximum ADC amplitude reached<br>`intensity`: peak delta above baseline                                                    | Emitted in real time whenever a valid piezo hit is detected.                                       |
| **`STATE`**         | `STATE old=<STATE> new=<STATE>`                                                             | `old`, `new`: enum string (`BOOT`, `MENU`, `READY`, `RUNNING`, `FINISHED`, `CAPTURING`)                                                                 | Emitted whenever the authoritative game state machine transitions.                                 |
| **`MODE`**          | `MODE active=<MODE> param=<u32>`                                                            | `active`: `COUNT` \| `TIMED` \| `RACE`<br>`param`: duration (s) or target hits                                                                          | Emitted when mode or target parameter is selected or changed.                                      |
| **`SCORE`**         | `SCORE value=<u32>`                                                                         | `value`: accumulated hit count                                                                                                                          | Emitted on game start, game reset, or immediately after a registered hit.                          |
| **`TIMER`**         | `TIMER elapsed=<u32> remaining=<u32>`                                                       | `elapsed`: elapsed active game time (ms)<br>`remaining`: remaining time in `TIMED` mode (ms)                                                            | Emitted periodically (every 100 ms) while game is in `RUNNING` state.                              |
| **`RESULT`**        | `RESULT score=<u32> time_ms=<u32> reason=<REASON>`                                          | `score`: final hit score<br>`time_ms`: total elapsed duration<br>`reason`: `NONE` \| `TIME_LIMIT` \| `TARGET_REACHED` \| `ABORTED`                      | Emitted when a game ends before entering `FINISHED` state.                                         |
| **`CAPTURE_START`** | `CAPTURE_START rate=<u32> pre=<u16> count=<u16> baseline=<u16> noise=<u16> threshold=<u16>` | `rate`: sample rate Hz (10000)<br>`pre`: pre-trigger sample count (1000)<br>`count`: total buffer size (21000)<br>`baseline`, `noise`, `threshold`: u16 | Emitted when a 2.1-second raw capture buffer is complete and data streaming begins.                |
| **`CAPTURE_DATA`**  | `CAPTURE_DATA offset=<u16> values=<v0>,<v1>,...`                                            | `offset`: buffer start index<br>`values`: comma-separated u16 ADC samples (50 per line)                                                                 | Emitted in non-blocking chunks across Core 1 loop iterations.                                      |
| **`CAPTURE_END`**   | `CAPTURE_END count=<u16>`                                                                   | `count`: total streamed samples (21000)                                                                                                                 | Emitted when the entire capture buffer has been transmitted.                                       |
| **`ERROR`**         | `ERROR code=<u32> comp=<name> msg=<text>`                                                   | `code`: numeric error code<br>`comp`: subsystem name<br>`msg`: descriptive message                                                                      | Emitted on hardware or OSAL faults (e.g. DMA timeout, ADC out of range).                           |

---

## 3. Inter-Core IPC Message Reference (`Messages.h`)

### 3.1 IPC Queue Architecture

Dual-core synchronization is implemented through two lock-safe statically allocated ring buffers:

```c
/* Capacity constants defined in src/Common/Config.h */
#define QUEUE_CORE0_TO_CORE1_CAPACITY  16U
#define QUEUE_CORE1_TO_CORE0_CAPACITY   8U
```

- **Non-blocking execution**: `OsalQueue_push()` and `OsalQueue_pop()` are lock-free and interrupt-safe for
  single-producer single-consumer (SPSC) patterns across the two RP2040 cores.
- **Overflow resilience**: If `queue_core0_to_core1` fills up (e.g. during heavy display rendering bursts), stale
  non-critical status updates drop safely without blocking Core 0's 50 kHz ADC processing.

---

### 3.2 Messages: Core 0 $\rightarrow$ Core 1 (`Core0ToCore1Message`)

Core 0 produces events representing state changes, hit telemetry, and calibration updates.

```c
typedef struct {
    Core0ToCore1MsgType type;
    uint64_t timestamp_us;
    union {
        MsgBootStatus           boot_status;
        MsgCalibrationProgress  calibration_progress;
        MsgCalibrationResult    calibration_result;
        MsgSensorStatusChanged  sensor_status;
        MsgHitDetected          hit;
        MsgGameStateChanged     game_state;
        MsgGameModeChanged      game_mode;
        MsgScoreChanged         score;
        MsgTimerChanged         timer;
        MsgGameFinished         game_finished;
        MsgConfigChanged        config;
        MsgCaptureReady         capture_ready;
        MsgError                error;
    } data;
} Core0ToCore1Message;
```

#### Detailed Message Payloads:

| `Core0ToCore1MsgType`       | Payload Struct                | Fields & Types                                                                                                                                                                  | Purpose / Consumer Action                                                                 |
|-----------------------------|-------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| `MSG_BOOT_STATUS`           | `MsgBootStatus`               | `bool success`<br>`char message[32]`                                                                                                                                            | System boot status. Emits `BOOT` wire message.                                            |
| `MSG_CALIBRATION_PROGRESS`  | `MsgCalibrationProgress`      | `uint8_t progress_percent`                                                                                                                                                      | Displayed on ST7735 boot/calibration progress bar.                                        |
| `MSG_CALIBRATION_RESULT`    | `MsgCalibrationResult`        | `bool success`<br>`uint16_t baseline`<br>`uint16_t noise`<br>`uint16_t threshold`                                                                                               | Calibration outcome. Emits `CALIB` wire message.                                          |
| `MSG_SENSOR_STATUS_CHANGED` | `MsgSensorStatusChanged`      | `SensorState state`                                                                                                                                                             | Sensor state transition. Emits `SENSOR` wire message.                                     |
| `MSG_HIT_DETECTED`          | `MsgHitDetected` (`HitEvent`) | `uint32_t hit_id`<br>`uint16_t peak_value`<br>`uint16_t intensity`<br>`uint64_t timestamp_us`                                                                                   | Hit registered. Emits `HIT` wire message; triggers hit flash on display.                  |
| `MSG_GAME_STATE_CHANGED`    | `MsgGameStateChanged`         | `GameState old_state`<br>`GameState new_state`                                                                                                                                  | Authoritative state transition. Emits `STATE`; updates display screen layout.             |
| `MSG_GAME_MODE_CHANGED`     | `MsgGameModeChanged`          | `GameMode mode`<br>`GameMode menu_selected_mode`<br>`uint32_t parameter`                                                                                                        | Mode/param change. Emits `MODE`; updates header and countdown/target target on screen.    |
| `MSG_SCORE_CHANGED`         | `MsgScoreChanged`             | `uint32_t score`                                                                                                                                                                | Score updated. Emits `SCORE`; dirties score region on display.                            |
| `MSG_TIMER_CHANGED`         | `MsgTimerChanged`             | `uint32_t elapsed_ms`<br>`uint32_t remaining_ms`                                                                                                                                | Millisecond timer update. Emits `TIMER`; dirties timer region on display.                 |
| `MSG_GAME_FINISHED`         | `MsgGameFinished`             | `uint32_t final_score`<br>`uint32_t total_time_ms`<br>`GameEndReason reason`                                                                                                    | Game finished. Emits `RESULT`; displays victory/summary screen.                           |
| `MSG_CONFIG_CHANGED`        | `MsgConfigChanged`            | `Config config`                                                                                                                                                                 | Full config broadcast for UI inspection.                                                  |
| `MSG_CAPTURE_READY`         | `MsgCaptureReady`             | `uint32_t sample_rate_hz`<br>`uint16_t pre_samples`<br>`uint16_t total_samples`<br>`uint16_t baseline`<br>`uint16_t noise`<br>`uint16_t threshold`<br>`const uint16_t* samples` | Signals completed capture buffer. Triggers `CAPTURE_START` and chunked transmission loop. |
| `MSG_ERROR`                 | `MsgError`                    | `uint32_t error_code`<br>`char component[16]`<br>`char message[32]`                                                                                                             | Subsystem error. Emits `ERROR` wire message.                                              |

---

### 3.3 Messages: Core 1 $\rightarrow$ Core 0 (`Core1ToCore0Message`)

Core 1 deserializes incoming serial commands and queues them for Core 0 execution.

```c
typedef struct {
    Core1ToCore0MsgType type;
    uint64_t timestamp_us;
    union {
        MsgSetGameMode      set_mode;
        MsgSetGameParameter set_parameter;
        MsgSetSensitivity   set_sensitivity;
        MsgRequestCapture   request_capture;
    } data;
} Core1ToCore0Message;
```

#### Detailed Message Payloads:

| `Core1ToCore0MsgType`     | Payload Struct        | Fields & Types       | Triggering Serial Command   | Core 0 Effect                                                               |
|---------------------------|-----------------------|----------------------|-----------------------------|-----------------------------------------------------------------------------|
| `MSG_START_GAME`          | *(none)*              | *(no payload)*       | `START`                     | Calls `GameController_start()`. Sets state to `RUNNING`.                    |
| `MSG_RESET_GAME`          | *(none)*              | *(no payload)*       | `RESET`                     | Cancels game/capture; resets score; sets state to `READY`.                  |
| `MSG_SET_GAME_MODE`       | `MsgSetGameMode`      | `GameMode mode`      | `MODE:<COUNT\|TIMED\|RACE>` | Sets `active_mode` and `menu_selected_mode`; sets default parameters.       |
| `MSG_SET_GAME_PARAMETER`  | `MsgSetGameParameter` | `uint32_t parameter` | `PARAM:<u32>`               | Updates `state_model.parameter` (e.g. race target or timed duration).       |
| `MSG_SET_SENSITIVITY`     | `MsgSetSensitivity`   | `float noise_factor` | `SENS:<float>`              | Updates noise factor in `ConfigService` and `HitDetector`.                  |
| `MSG_REQUEST_CALIBRATION` | *(none)*              | *(no payload)*       | `CALIB`                     | Resets calib progress and invokes `HitDetector_start_calibration()`.        |
| `MSG_REQUEST_STATUS`      | *(none)*              | *(no payload)*       | `STATUS`                    | Triggers immediate broadcast of sensor status, game state, mode, and score. |
| `MSG_REQUEST_CAPTURE`     | `MsgRequestCapture`   | `bool enable`        | `CAPTURE` / `CAPTURE:STOP`  | Starts or stops raw waveform capture engine (`HitDetector_start_capture`).  |

---

## 4. End-to-End Command & Event Mapping Matrix

This matrix establishes the complete relationship between companion wire commands, internal IPC messages, Core 0 logic,
and resulting wire telemetry.

| Companion Wire Command / Trigger           | Core 1 Translation (`Core1ToCore0Message`)      | Core 0 Handling & State Mutation                                                                     | Resulting Core 0 Msg (`Core0ToCore1Message`)                                                              | Companion Wire Telemetry                                                                             |
|:-------------------------------------------|:------------------------------------------------|:-----------------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------------------------|
| `START`                                    | `MSG_START_GAME`                                | Calls `start_game(gc)`<br>Transitions `READY` &rarr; `RUNNING`                                       | `MSG_GAME_STATE_CHANGED`<br>`MSG_SCORE_CHANGED`<br>`MSG_TIMER_CHANGED`                                    | `STATE old=READY new=RUNNING`<br>`SCORE value=0`<br>`TIMER elapsed=0 remaining=...`                  |
| `RESET`                                    | `MSG_RESET_GAME`                                | Calls `HitDetector_stop_capture()`<br>Calls `GameState_reset_score()`<br>Sets state to `READY`       | `MSG_GAME_STATE_CHANGED`<br>`MSG_SCORE_CHANGED`                                                           | `STATE old=... new=READY`<br>`SCORE value=0`                                                         |
| `MODE:TIMED`                               | `MSG_SET_GAME_MODE`<br>(`mode=GAME_MODE_TIMED`) | Sets `active_mode = TIMED`<br>Sets default parameter (`30s`)<br>Resets score                         | `MSG_GAME_MODE_CHANGED`                                                                                   | `MODE active=TIMED param=30`                                                                         |
| `PARAM:45`                                 | `MSG_SET_GAME_PARAMETER`<br>(`parameter=45`)    | Updates `state_model.parameter = 45`                                                                 | `MSG_GAME_MODE_CHANGED`                                                                                   | `MODE active=TIMED param=45`                                                                         |
| `SENS:4.5`                                 | `MSG_SET_SENSITIVITY`<br>(`noise_factor=4.5`)   | Updates `config_service` and `hit_detector.config.noise_factor`                                      | *(none)*                                                                                                  | *(none)*                                                                                             |
| `CALIB`                                    | `MSG_REQUEST_CALIBRATION`                       | Invokes `HitDetector_start_calibration()`<br>Samples 1500 ms baseline and noise                      | `MSG_SENSOR_STATUS_CHANGED`<br>`MSG_CALIBRATION_RESULT`<br>`MSG_SENSOR_STATUS_CHANGED`                    | `SENSOR status=CALIBRATING`<br>`CALIB success=1 baseline=... noise=...`<br>`SENSOR status=ARMED`     |
| `STATUS`                                   | `MSG_REQUEST_STATUS`                            | Invokes broadcast functions for cached sensor state, game state, mode, and score                     | `MSG_SENSOR_STATUS_CHANGED`<br>`MSG_GAME_STATE_CHANGED`<br>`MSG_GAME_MODE_CHANGED`<br>`MSG_SCORE_CHANGED` | `SENSOR status=ARMED`<br>`STATE old=... new=...`<br>`MODE active=... param=...`<br>`SCORE value=...` |
| `CAPTURE`                                  | `MSG_REQUEST_CAPTURE`<br>(`enable=true`)        | Invokes `HitDetector_start_capture()`<br>Arms 0.1 s circular pre-trigger buffer                      | `MSG_SENSOR_STATUS_CHANGED`                                                                               | `SENSOR status=CAPTURE_ARMED`                                                                        |
| `CAPTURE:STOP`                             | `MSG_REQUEST_CAPTURE`<br>(`enable=false`)       | Invokes `HitDetector_stop_capture()`<br>Cancels active capture or streaming                          | `MSG_SENSOR_STATUS_CHANGED`                                                                               | `SENSOR status=ARMED`                                                                                |
| *(Hardware Interrupt)*<br>**Piezo Hit**    | *(ADC DMA Hardware IRQ)*                        | `HitDetector_process_buffer()` detects threshold cross<br>`GameController_on_hit()` increments score | `MSG_HIT_DETECTED`<br>`MSG_SCORE_CHANGED`                                                                 | `HIT id=1 peak=1850 intensity=1272`<br>`SCORE value=1`                                               |
| *(Timer Tick)*<br>**100 ms Periodic Tick** | *(Core 0 Main Loop)*                            | `GameController_tick()` updates elapsed and remaining duration                                       | `MSG_TIMER_CHANGED`                                                                                       | `TIMER elapsed=1000 remaining=44000`                                                                 |
| *(Game Rule)*<br>**Game Finished**         | *(Time Limit / Target Hit)*                     | `GameController_finish(reason)`<br>Transitions `RUNNING` &rarr; `FINISHED`                           | `MSG_GAME_FINISHED`<br>`MSG_GAME_STATE_CHANGED`                                                           | `RESULT score=24 time_ms=45000 reason=...`<br>`STATE old=RUNNING new=FINISHED`                       |

---

## 5. High-Frequency Raw Signal Capture Protocol

To analyze piezo impact dynamics without distorting hit detection, raw signals are captured directly in SRAM on Core 0
and streamed across USB serial on Core 1:

1. **Arming**: Companion sends `CAPTURE`. Core 0 transitions to `SENSOR_STATE_CAPTURE_ARMED`.
2. **Circular Pre-Trigger**: Core 0 continuously fills a 1,000-sample circular buffer at 10 kHz (max-pooled 5:1 from 50
   kHz ADC DMA), representing 100 ms of pre-hit mechanical vibrations.
3. **Trigger & Recording**: When a sample crosses the trigger threshold, Core 0 transitions to `SENSOR_STATE_CAPTURING`,
   freezes the pre-trigger buffer, and records 20,000 post-trigger samples over 2.0 s.
4. **Handoff**: Core 0 pushes `MSG_CAPTURE_READY` containing the pointer to the 21,000-sample buffer to Core 1.
5. **Non-blocking Streaming**:
    - Core 1 transmits `CAPTURE_START rate=10000 pre=1000 count=21000 ...`.
    - Core 1 transmits `CAPTURE_DATA offset=<offset> values=<v0>,<v1>,...` in lines of 50 samples
      (`COMPANION_CAPTURE_SAMPLES_PER_LINE`).
    - Only 1 line is transmitted per Core 1 tick (`COMPANION_CAPTURE_LINES_PER_TICK = 1`) to ensure display redraws and
      serial reads never experience frame drops.
    - When offset reaches 21,000, Core 1 transmits `CAPTURE_END count=21000` and automatically sends
      `MSG_REQUEST_CAPTURE(false)` to return the sensor to armed mode.

---

## 6. Sequence Diagrams

The complete interaction sequence diagram illustrating connection handshakes, calibration, configuration, real-time hit
streaming, game completion, and raw capture is maintained at:

- PlantUML Source: [`docs/diagrams/sequence_companion_protocol.puml`](diagrams/sequence_companion_protocol.puml)
- Supporting diagrams:
    - [`docs/diagrams/sequence_pico_setup.puml`](diagrams/sequence_pico_setup.puml)
    - [`docs/diagrams/sequence_pico_core0_loop.puml`](diagrams/sequence_pico_core0_loop.puml)
    - [`docs/diagrams/sequence_pico_core1_loop.puml`](diagrams/sequence_pico_core1_loop.puml)
