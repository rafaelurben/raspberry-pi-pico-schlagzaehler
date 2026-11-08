import { DeviceState, GameState, SelectableGameMode, SensorState } from '../models/device.model';
import { parseAsciiPayload, serializeAsciiCommand } from './ascii-payload-parser';
import {
  parseBinaryPayload,
  resetSequenceCounter,
  serializeBinaryCommand,
} from './binary-payload-parser';
import { BinaryCaptureAction, BinaryGameMode } from './binary-protocol.types';
import {
  HandshakeCommandPayload,
  SensorCalibration,
  UnifiedProtocolCommand,
  UnifiedProtocolMessage,
} from './companion-protocol.types';
import { TransportEvent } from '../transport/device-transport.interface';

export { resetSequenceCounter, serializeAsciiCommand, serializeBinaryCommand };
export type {
  HandshakeCommandPayload,
  SensorCalibration,
  UnifiedProtocolCommand,
  UnifiedProtocolMessage,
};

/**
 * Command builder generating UnifiedProtocolCommand objects.
 */
export const CompanionCommands = {
  start: (): UnifiedProtocolCommand => ({ type: 'START' }),
  reset: (): UnifiedProtocolCommand => ({ type: 'RESET' }),
  calibrate: (): UnifiedProtocolCommand => ({ type: 'CALIBRATE' }),
  status: (): UnifiedProtocolCommand => ({ type: 'STATUS' }),
  setMode: (mode: SelectableGameMode | BinaryGameMode): UnifiedProtocolCommand => ({
    type: 'SET_MODE',
    payload: { mode },
  }),
  setParameter: (param: number): UnifiedProtocolCommand => ({
    type: 'SET_PARAMETER',
    payload: { parameter: Math.max(1, Math.floor(param)) },
  }),
  setSensitivity: (noiseFactor: number): UnifiedProtocolCommand => ({
    type: 'SET_SENSITIVITY',
    payload: { noiseFactor },
  }),
  capture: (
    action: 'start' | 'stop' | BinaryCaptureAction,
    target?: number | 'all',
  ): UnifiedProtocolCommand => ({
    type: 'CAPTURE',
    payload: { action, target },
  }),
  captureStart: (target?: number | 'all'): UnifiedProtocolCommand => ({
    type: 'CAPTURE',
    payload: { action: 'start', target },
  }),
  captureStop: (): UnifiedProtocolCommand => ({
    type: 'CAPTURE',
    payload: { action: 'stop' },
  }),
  handshake: (payload?: HandshakeCommandPayload): UnifiedProtocolCommand => ({
    type: 'HANDSHAKE',
    payload,
  }),
} as const;

function computeIsReady(
  connectionState: DeviceState['connectionState'],
  gameState: GameState,
  sensorState: SensorState,
): boolean {
  if (connectionState !== 'connected' || sensorState === 'ERROR') {
    return false;
  }
  return gameState === 'READY' || gameState === 'RUNNING' || sensorState === 'ARMED';
}

/**
 * Universal protocol parser converting any neutral TransportEvent (binary frame or ASCII line)
 * into a strongly typed UnifiedProtocolMessage.
 */
export function parseTransportEvent(event: TransportEvent): UnifiedProtocolMessage | null {
  if (event.type === 'binary') {
    return parseBinaryPayload(event.content);
  }
  return parseAsciiPayload(event.content);
}

/**
 * Core application state reducer that applies any UnifiedProtocolMessage to a DeviceState.
 * After Layer 2, there is zero difference between ASCII and binary message handling.
 */
export function applyUnifiedMessageToDeviceState(
  currentState: DeviceState,
  msg: UnifiedProtocolMessage,
  nowMs: number = Date.now(),
): DeviceState {
  switch (msg.type) {
    case 'GAME_STATE': {
      const newState = msg.payload.state;
      if (newState === 'UNKNOWN') return currentState;

      let elapsedMs = currentState.elapsedMs;
      let remainingMs = currentState.remainingMs;
      let score = currentState.score;
      let lastTimerUpdatedAt = currentState.lastTimerUpdatedAt;
      let endReason = currentState.endReason;

      if (newState === 'RUNNING' && currentState.gameState !== 'RUNNING') {
        elapsedMs = 0;
        remainingMs =
          currentState.mode === 'TIMED' && currentState.parameter > 0
            ? currentState.parameter * 1000
            : currentState.remainingMs;
        endReason = 'NONE';
        lastTimerUpdatedAt = nowMs;
      } else if (newState === 'READY') {
        score = 0;
        elapsedMs = 0;
        remainingMs =
          currentState.mode === 'TIMED' && currentState.parameter > 0
            ? currentState.parameter * 1000
            : 0;
        endReason = 'NONE';
        lastTimerUpdatedAt = null;
      } else if (newState !== 'RUNNING') {
        lastTimerUpdatedAt = null;
      }

      return new DeviceState({
        ...currentState,
        gameState: newState,
        score,
        elapsedMs,
        remainingMs,
        endReason,
        lastTimerUpdatedAt,
        isReady: computeIsReady(currentState.connectionState, newState, currentState.sensorState),
      });
    }

    case 'GAME_MODE': {
      const { mode, parameter } = msg.payload;
      const isRunning = currentState.gameState === 'RUNNING';
      const elapsedMs = isRunning ? currentState.elapsedMs : 0;
      const remainingMs = isRunning
        ? currentState.remainingMs
        : mode === 'TIMED' && parameter > 0
          ? parameter * 1000
          : 0;

      return new DeviceState({
        ...currentState,
        mode,
        parameter,
        elapsedMs,
        remainingMs,
      });
    }

    case 'SCORE': {
      return new DeviceState({
        ...currentState,
        score: msg.payload.score,
      });
    }

    case 'TIMER': {
      const { elapsedMs, remainingMs } = msg.payload;
      return new DeviceState({
        ...currentState,
        elapsedMs,
        remainingMs,
        lastTimerUpdatedAt: currentState.gameState === 'RUNNING' ? nowMs : null,
      });
    }

    case 'GAME_FINISHED': {
      const { finalScore, totalTimeMs, reason } = msg.payload;
      const remainingMs = reason === 'TIME_LIMIT' ? 0 : currentState.remainingMs;

      return new DeviceState({
        ...currentState,
        gameState: 'FINISHED',
        score: finalScore,
        elapsedMs: totalTimeMs,
        remainingMs,
        endReason: reason,
        lastTimerUpdatedAt: null,
        isReady: computeIsReady(currentState.connectionState, 'FINISHED', currentState.sensorState),
      });
    }

    case 'SENSOR_STATUS': {
      const sensorState = msg.payload.state;
      if (sensorState === 'UNKNOWN') return currentState;

      return new DeviceState({
        ...currentState,
        sensorState,
        isReady: computeIsReady(currentState.connectionState, currentState.gameState, sensorState),
      });
    }

    case 'CALIBRATION_RESULT': {
      if (msg.payload.repeated) {
        return currentState;
      }
      const sensorState: SensorState = msg.payload.ignored ? 'ERROR' : 'ARMED';
      return new DeviceState({
        ...currentState,
        sensorState,
        isReady: computeIsReady(currentState.connectionState, currentState.gameState, sensorState),
      });
    }

    case 'HANDSHAKE_ACK': {
      const ack = msg.payload;
      return new DeviceState({
        ...currentState,
        hardwareGen: ack.hardwareGen,
        hardwareRev: ack.hardwareRev,
        protoMajor: ack.protoMajor,
        protoMinor: ack.protoMinor,
        fwVersion: `${ack.fwMajor}.${ack.fwMinor}.${ack.fwPatch}`,
        uptimeMs: ack.uptimeMs,
      });
    }

    default:
      return currentState;
  }
}
