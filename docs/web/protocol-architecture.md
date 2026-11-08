# Web Companion Protocol Architecture

This document describes the 3-tier architecture used in `schlagzaehler-web` to receive, decode, and process both binary TLV frames and fallback ASCII lines from the Schlagzähler firmware.

---

## Inbound Messages - Architecture

```mermaid
flowchart TD
    subgraph Layer 1: Transport
        Serial["Web Serial Port"] --> DEP["DualEventParser / BinaryFrameParser"]
        DEP -->|CRC error| CE["console.error"]
        DEP -->|Corrupt non-ASCII bytes| CW["console.warn"]
        DEP -->|Emits| TE["TransportEvent<br/>({type: 'ascii', content: string} | {type: 'binary', content: BinaryFrame})"]
    end

    subgraph Layer 2: Protocol Decoders
        TE -->|type === 'binary'| BPP["BinaryPayloadParser"]
        TE -->|type === 'ascii'| APP["AsciiPayloadParser"]
        BPP -->|Truncated / Invalid| PE["console.error / console.warn"]
        BPP -->|Normalizes to| UPM["Unified Protocol Message<br/>(encoding: 'binary' | 'ascii', type, payload)"]
        APP -->|Normalizes to| UPM
    end

    subgraph Layer 3: Application Logic
        UPM --> DMS["DeviceManagerService"]
        DMS --> State["Update DeviceState / Metadata"]
        DMS --> Capture["Assemble Piezo Waveform Capture"]
        DMS --> EventLog["Live Event Log (Clean Printable Text)"]
    end
```

### Layer 1: Transport & Stream Demultiplexing
- **`DualEventParser` / `BinaryFrameParser`**: Consumes incoming raw `Uint8Array` byte chunks from the `WebSerialTransport`.
- Distinguishes binary frames (prefixed by `0xAA55` sync word) from ASCII lines (terminated by `\n`).
- Verifies CRC-16 checksums on binary frames. If a checksum fails, it logs `console.error` and recovers without desyncing.
- Filters corrupt or unprintable bytes preceding sync words, logging `console.warn` instead of passing garbage downstream.
- Emits neutral, discriminated `TransportEvent` objects:
  ```typescript
  export type TransportEvent =
    | { readonly type: 'ascii'; readonly content: string }
    | { readonly type: 'binary'; readonly content: BinaryFrame };
  ```

### Layer 2: Protocol Decoders (Unified Protocol Message Normalization)
- **`BinaryPayloadParser`**: Decodes raw `BinaryFrame` payload byte buffers into strongly typed payloads using DataView with strict length validation. Logs `console.warn` / `console.error` on malformed packets.
- **`AsciiPayloadParser`**: Parses key-value ASCII lines into corresponding typed payloads.
- **Normalization**: After Layer 2, **there is no more difference between ASCII and binary messages**, except for an attribute indicating how the message arrived (`encoding: 'binary' | 'ascii'`). Both streams converge into a single discriminated `UnifiedProtocolMessage` union.

### Layer 3: Application Logic
- **`DeviceManagerService`**: Subscribes to the stream of unified protocol messages.
- Updates authoritative `DeviceState` and `DeviceMetadata` in a single reducer without duplicate branches for ASCII vs. binary.
- Routes waveform chunks (`CAPTURE_START`, `CAPTURE_DATA`, `CAPTURE_END`) directly into the capture builder.
- Formats clean, human-readable representations for the Live Event Log, guaranteeing zero unprintable characters.

---

## Outbound Commands - Architecture

Just as inbound telemetry is normalized across ASCII and binary into `UnifiedProtocolMessage`, outbound commands follow a symmetrical, encoding-agnostic flow:

```mermaid
flowchart TD
    subgraph Layer 3: Application Logic
        CMD["CompanionCommands<br/>(start, reset, calibrate, status, setMode, setParameter, setSensitivity, capture, handshake)"]
        CMD --> UPC["UnifiedProtocolCommand<br/>({type, payload?})"]
    end

    subgraph Layer 2: Protocol Encoders
        UPC --> DMS["DeviceManagerService.sendCommand()"]
        DMS -->|device.state.protoMajor !== undefined| BPP["BinaryPayloadParser.serializeBinaryCommand()"]
        DMS -->|ASCII fallback| APP["AsciiPayloadParser.serializeAsciiCommand()"]
        BPP --> Frame["Uint8Array Binary Frame (Sync, CRC-16)"]
        APP --> Line["ASCII String"]
    end

    subgraph Layer 1: Transport
        Frame --> Serial["Web Serial Port"]
        Line --> Serial
    end
```

### Command Flow Details:

1. **`CompanionCommands`**: Simple, declarative factory producing `UnifiedProtocolCommand` objects.
2. **`DeviceManagerService.sendCommand(deviceId, command)`**: Automatically detects whether the target device has negotiated binary mode (`device.state.protoMajor !== undefined`).
3. **`BinaryPayloadParser.serializeBinaryCommand(cmd, seq?)`**: Builds packed binary frames with sequence tracking and CRC-16 checksums.
4. **`AsciiPayloadParser.serializeAsciiCommand(cmd)`**: Formats ASCII command strings (e.g., `START`, `MODE:COUNT`, `SENS:2.0`).
5. **`companion-protocol.ts`**: Remains lean and declarative, delegating low-level serialization to the respective payload parser.

