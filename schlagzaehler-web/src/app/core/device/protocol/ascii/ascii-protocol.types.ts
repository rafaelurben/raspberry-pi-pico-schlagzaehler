// Validation Sets for protocol integrity
import type { GameEndReason, GameMode, GameState, SensorState } from '../../models/device.model';

export const VALID_GAME_MODES: ReadonlySet<GameMode> = new Set<GameMode>([
  'COUNT',
  'TIMED',
  'RACE',
  'UNKNOWN',
]);
export const VALID_GAME_STATES: ReadonlySet<GameState> = new Set<GameState>([
  'BOOT',
  'MENU',
  'READY',
  'RUNNING',
  'FINISHED',
  'CAPTURING',
  'UNKNOWN',
]);
export const VALID_SENSOR_STATES: ReadonlySet<SensorState> = new Set<SensorState>([
  'INIT',
  'CALIBRATING',
  'ARMED',
  'LOCKOUT',
  'CAPTURE_ARMED',
  'CAPTURING',
  'CAPTURE_TX_WAIT',
  'ERROR',
  'UNKNOWN',
]);
export const VALID_END_REASONS: ReadonlySet<GameEndReason> = new Set<GameEndReason>([
  'NONE',
  'TIME_LIMIT',
  'TARGET_REACHED',
  'ABORTED',
]);
