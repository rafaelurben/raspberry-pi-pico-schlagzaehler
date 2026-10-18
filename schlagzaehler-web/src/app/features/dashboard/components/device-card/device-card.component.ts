import { Component, computed, input, OnDestroy, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Device, SelectableGameMode } from '../../../../core/device/models/device.model';
import { RenameDeviceEvent } from '../../../settings/components/device-list/device-list.component';

export interface ChangeModeEvent {
  readonly deviceId: string;
  readonly mode: SelectableGameMode;
}

export interface ChangeParameterEvent {
  readonly deviceId: string;
  readonly parameter: number;
}

@Component({
  selector: 'app-device-card',
  imports: [FormsModule],
  templateUrl: './device-card.component.html',
})
export class DeviceCardComponent implements OnInit, OnDestroy {
  readonly device = input.required<Device>();

  readonly modeChange = output<ChangeModeEvent>();
  readonly parameterChange = output<ChangeParameterEvent>();
  readonly resetGame = output<string>();
  readonly reconnect = output<string>();
  readonly rename = output<RenameDeviceEvent>();

  readonly availableModes: readonly SelectableGameMode[] = ['COUNT', 'TIMED', 'RACE'];

  readonly nowMs = signal<number>(Date.now());
  readonly isEditingName = signal<boolean>(false);
  readonly editingNameValue = signal<string>('');

  private timerIntervalId: ReturnType<typeof setInterval> | null = null;

  readonly isConnected = computed(() => this.device().state.connectionState === 'connected');

  readonly selectedMode = computed<SelectableGameMode>(() => {
    const mode = this.device().state.mode;
    if (mode === 'TIMED' || mode === 'RACE' || mode === 'COUNT') {
      return mode;
    }
    return 'COUNT';
  });

  readonly isTimedMode = computed(() => this.device().state.mode === 'TIMED');

  readonly hasParameter = computed(() => {
    const mode = this.selectedMode();
    return mode === 'TIMED' || mode === 'RACE';
  });

  readonly parameterValue = computed<number>(() => {
    const param = this.device().state.parameter;
    if (param > 0) {
      return param;
    }
    return this.selectedMode() === 'TIMED' ? 30 : 20;
  });

  /**
   * Computes the current time or remaining time in milliseconds, automatically
   * interpolating between heartbeats from the Pico when the game is RUNNING.
   */
  readonly displayedTimeMs = computed<number>(() => {
    const state = this.device().state;
    const now = this.nowMs();
    const isRunning =
      state.connectionState === 'connected' &&
      state.gameState === 'RUNNING' &&
      state.lastTimerUpdatedAt != null;

    const deltaMs = isRunning ? Math.max(0, now - state.lastTimerUpdatedAt!) : 0;

    if (state.mode === 'TIMED') {
      const baseRemaining =
        state.gameState === 'RUNNING' || state.remainingMs > 0 || state.gameState === 'FINISHED'
          ? state.remainingMs
          : state.parameter > 0
            ? state.parameter * 1000
            : 0;
      return Math.max(0, baseRemaining - deltaMs);
    }

    return Math.max(0, state.elapsedMs + deltaMs);
  });

  readonly formattedTime = computed<string>(() => {
    const totalMs = Math.max(0, Math.floor(this.displayedTimeMs()));
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const tenths = Math.floor((totalMs % 1000) / 100);

    const minStr = minutes.toString().padStart(2, '0');
    const secStr = seconds.toString().padStart(2, '0');
    return `${minStr}:${secStr}.${tenths}`;
  });

  readonly readinessLabel = computed<string>(() => {
    const state = this.device().state;
    if (state.connectionState !== 'connected') {
      return 'Offline';
    }
    if (state.sensorState === 'CALIBRATING') {
      return 'Calibrating';
    }
    if (state.sensorState === 'ERROR') {
      return 'Sensor Error';
    }
    if (state.gameState !== 'UNKNOWN') {
      return state.gameState;
    }
    return state.isReady ? 'READY' : 'Connected';
  });

  ngOnInit(): void {
    this.timerIntervalId = setInterval(() => {
      if (
        this.device().state.connectionState === 'connected' &&
        this.device().state.gameState === 'RUNNING'
      ) {
        this.nowMs.set(Date.now());
      }
    }, 50);
  }

  ngOnDestroy(): void {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
  }

  onModeSelect(newMode: string): void {
    if (newMode === 'COUNT' || newMode === 'TIMED' || newMode === 'RACE') {
      this.modeChange.emit({
        deviceId: this.device().id,
        mode: newMode,
      });
    }
  }

  onParameterInput(rawValue: string | number): void {
    const parsed = typeof rawValue === 'number' ? rawValue : Number.parseInt(String(rawValue), 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      this.parameterChange.emit({
        deviceId: this.device().id,
        parameter: Math.floor(parsed),
      });
    }
  }

  onResetClick(): void {
    this.resetGame.emit(this.device().id);
  }

  onReconnectClick(): void {
    this.reconnect.emit(this.device().id);
  }

  startEditName(): void {
    this.editingNameValue.set(this.device().name);
    this.isEditingName.set(true);
  }

  cancelEditName(): void {
    this.isEditingName.set(false);
    this.editingNameValue.set('');
  }

  saveEditName(): void {
    const trimmed = this.editingNameValue().trim();
    if (trimmed) {
      this.rename.emit({ deviceId: this.device().id, name: trimmed });
    }
    this.isEditingName.set(false);
    this.editingNameValue.set('');
  }
}
