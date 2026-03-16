# Morningstar MCP Server — Design Spec

## Overview

An open-source MCP server (MIT license) that allows users to configure Morningstar Engineering MIDI foot controllers (MC3, MC6 MKII, MC6 Pro, MC8, MC8 Pro) using natural language through Claude Desktop or Claude Code.

### Core Use Case

> "I have an MC8 Pro and a Quad Cortex Mini. Put the tuner on long press bottom-left."

The server resolves "bottom-left" to Switch E, looks up "tuner" in OpenMIDI (CC#49), checks local state for conflicts, and writes the SysEx command.

## Architecture

Four layers, each with a single responsibility:

### 1. MIDI Layer

Low-level USB-MIDI communication (USB only, no Bluetooth).

- Open/close MIDI ports via `jzz` library (fallback: `midi` / `easymidi` if SysEx support is insufficient)
- Send and receive SysEx messages
- Checksum calculation: XOR bytes from index 1 through index n-3 (byte before checksum), then AND with 0x7F. Exact byte range to be confirmed against hardware during implementation — the 0x7F mask ensures functional correctness regardless of whether F0 is included.
- Transaction ID management for request/response correlation
- List available MIDI devices
- Timeout handling: 2-second default timeout for SysEx responses, configurable
- Disconnect detection: monitor MIDI port availability

### 2. Morningstar Layer

Morningstar SysEx protocol implementation.

**SysEx Message Format:**
```
Byte  Hex    Purpose
 0    F0     SysEx Start
 1    00     Manufacturer ID 1
 2    21     Manufacturer ID 2
 3    24     Manufacturer ID 3
 4    xx     Device Model ID
 5    00     (reserved)
 6    70     Opcode 1 (always 0x70)
 7    xx     Opcode 2 (command)
 8    xx     Opcode 3 (sub-parameter)
 9    xx     Opcode 4 (sub-parameter)
10    xx     Opcode 5 (sub-parameter)
11    xx     Opcode 6 (sub-parameter)
12    xx     Opcode 7 (sub-parameter)
13    xx     Transaction ID
14    00     (reserved)
15    00     (reserved)
16+   pp     Payload (variable length)
n-1   yy     Checksum
n     F7     SysEx End
```

Manufacturer ID: `00 21 24` (Morningstar Engineering).

**Error responses** use Op2=`0x7F` with the error code in Op3: 0x00=success, 0x01=wrong model ID, 0x02=wrong checksum, 0x03=wrong payload size.

**Commands:**
- Encodes/decodes all documented SysEx commands (Op2 values 0x00–0x32)
- Device Model ID mapping: MC3=0x05, MC6=0x03 (assumed MKII), MC6 Pro=0x06, MC8=0x04, MC8 Pro=0x08
- Preset names: read/write short name, toggle name, long name
- Preset messages: write only (up to 16 messages per preset). No SysEx command exists to read individual preset messages — this is a protocol limitation.
- Bank operations: read/rename current bank, bank up/down, toggle page (Op2=0x00, Op3=0x02 — relevant for controllers with multiple pages)
- Bank navigation: no direct "go to bank N" command exists. Navigation uses sequential bank up/down commands. The server tracks current bank position to calculate the shortest path (up vs. down).
- Controller info query (Op2=0x32): returns 9-byte payload — model ID, firmware version (4 bytes), messages per preset, preset short name size, preset long name size, bank name size. Bank count is not returned — hardcoded per model (MC8 Pro: 128 banks).
- Message types: PC, CC with action types (Press, Release, Long Press, etc.) and toggle positions
- Handles save vs. temporary override (Op4/Op6 = 0x7F for persistent save)
- Name length limits per device model (e.g., MC8 Pro: 32 chars, MC6 MKII: 8 chars). Names exceeding the limit are truncated with a warning.
- Display LCD message (Op2=0x11): show text on controller display for user feedback (e.g., "Config saved")

### 3. Device Knowledge Layer

Maps natural language intent to MIDI commands.

**OpenMIDI Integration:**
- Loads device profiles from Morningstar's OpenMIDI repository (YAML files)
- Resolves device name → brand/model → CC/PC mappings
- Example: "Quad Cortex Mini tuner" → CC#49, Value 0, Channel 1
- Bundled with the server (git submodule of Morningstar-Engineering/openmidi)
- OpenMIDI labels are not standardized (e.g., "Tuner" vs "Tuner Toggle" vs "Tuner On/Off"). Claude handles semantic matching — the tool returns all available CC/PC entries and Claude picks the right one.
- If multiple device matches are found, return all matches and let Claude/user disambiguate
- Fallback: user can specify raw CC/PC values if device is not in OpenMIDI

**Physical Layout Mapping:**
- Maps positional descriptions to preset indices per controller model
- MC8 Pro / MC8 layout:
  ```
  Top row:    A(0)  B(1)  C(2)  D(3)
  Bottom row: E(4)  F(5)  G(6)  H(7)
  ```
- MC6 Pro / MC6 MKII: A(0) B(1) C(2) / D(3) E(4) F(5)
- MC3: A(0) B(1) C(2)
- Positional aliases: "top-left"=A, "bottom-right"=H, etc. Claude translates natural language (any language) to these English aliases before calling the tool.
- Users can also use Morningstar switch names directly ("Switch E")

### 4. MCP Layer

MCP tools that Claude can call.

Stdio transport for Claude Desktop / Claude Code integration.

## Setup Configuration

Users define their rig in a `setup.yaml` file (optional — can also be provided per conversation):

```yaml
controller: MC8 Pro
midi_channel: 1

devices:
  - name: Quad Cortex Mini
    midi_channel: 1
  - name: Strymon Timeline
    midi_channel: 2
```

- Located at `~/.config/morningstar-mcp/setup.yaml` or project root
- Can be overridden per conversation (user tells Claude to add/change devices)
- Controller auto-detection via SysEx `get_controller_info` if not specified

## Local State (Shadow State)

Since the SysEx protocol cannot read preset messages (only names), the server maintains a local JSON state file to track what has been written:

- Stored at `~/.config/morningstar-mcp/state.json`
- Updated every time the server writes a preset message
- Used for conflict detection: "Switch E already has Press=Scene 1 (written by this tool). Add Long Press=Tuner?"
- Limitations: does not reflect changes made outside this tool (e.g., via the Web Editor). A "sync" operation could be added later if bulk-dump commands are verified.
- State can be reset/cleared by the user if it gets out of sync

## MCP Tools (MVP)

### connect

Find and connect to a Morningstar controller via USB-MIDI.

- Lists available MIDI ports
- Sends `get_controller_info` (Op2=0x32) to identify the device
- Returns: model name, firmware version, presets per bank, name length limits
- Stores connection state for subsequent tool calls

### get_controller_info

Query connected controller for model, firmware, and capabilities.

- Returns: model, firmware version, presets per bank, name length limits
- Bank count is provided from a hardcoded lookup table per model

### get_preset

Read the current state of a preset.

- Input: preset identifier (A-H or positional like "bottom-left"), bank (optional, defaults to current)
- Returns: preset short name, toggle name, long name (via SysEx), plus any messages from local state
- Note: messages are only available if they were written by this tool (from shadow state)

### set_preset_message

Program a MIDI message onto a preset.

- Input: preset identifier, action type (press/release/long press/etc.), message type (CC/PC), message parameters, target device name, message slot (0-15, optional — defaults to first unused slot in local state)
- **Safety behavior:** checks local state for conflicts. If the action/slot is already occupied, returns a warning with the existing message and asks for confirmation.
- Resolves device-specific CC/PC values via OpenMIDI lookup
- Saves persistently (Op4/Op6 = 0x7F)
- Updates local state after successful write

### set_preset_name

Rename a preset (short name, toggle name, or long name).

- Input: preset identifier, name type, new name
- Validates name length against device limits; truncates with warning if exceeded

### get_bank_name / set_bank_name

Read or rename the current bank.

- Bank navigation: if a specific bank is requested, the server navigates there via sequential bank up/down commands

### lookup_device

Look up a device in the OpenMIDI database.

- Input: device name (fuzzy match)
- Returns: all available CC/PC mappings with human-readable function names
- Claude handles semantic matching from the returned list
- Useful for users to explore what their device supports

## Safety Behavior

- **Local state check before write:** checks shadow state for conflicts before modifying a preset
- **Conflict warning:** if a preset slot is already occupied (per local state), inform the user and ask for confirmation
- **Persistent save explicit:** all writes use the save flag (0x7F) — no silent temporary overrides
- **State limitation transparency:** the server clearly communicates that it cannot see changes made outside this tool

## Error Handling

- **SysEx timeout:** if no response within 2 seconds, retry once, then return error
- **Invalid checksum in response:** return error with raw bytes for debugging
- **MIDI port disconnect:** detect and return clear error, prompt user to reconnect
- **SysEx error codes:** parse and surface descriptive messages (wrong model, wrong checksum, wrong payload)
- **Name too long:** truncate to device limit and warn user
- **OpenMIDI no match:** return "device not found" with suggestions, offer raw CC/PC fallback
- **Multiple OpenMIDI matches:** return all matches for Claude/user to disambiguate

## Supported Controllers

All Morningstar MC-series controllers sharing the same SysEx protocol:

| Model | Device ID | Presets | Banks | Preset Name (short/toggle/long) | Bank Name |
|-------|-----------|---------|-------|---------------------------------|-----------|
| MC3 | 0x05 | 3 | TBD | 10/10/16 | 16 |
| MC6 (MKII) | 0x03 | 6 | TBD | 8/8/24 | 24 |
| MC6 Pro | 0x06 | 6 | TBD | 32/32/32 | 32 |
| MC8 | 0x04 | 8 | TBD | 10/10/24 | 24 |
| MC8 Pro | 0x08 | 8 | 128 | 32/32/32 | 32 |

Tested on: MC8 Pro. Other models should work but are community-verified.
Device ID 0x03 is listed as "MC6" in official docs — assumed to cover MC6 MKII.

## Tech Stack

- **Language:** TypeScript (ES2022, Node16 module resolution)
- **MCP SDK:** `@modelcontextprotocol/sdk` v1.x (stdio transport)
- **MIDI:** `jzz` (cross-platform USB-MIDI, SysEx support — to be verified in first implementation spike; fallback: `midi` or `easymidi`)
- **Schema validation:** `zod`
- **Device profiles:** OpenMIDI YAML data (git submodule of Morningstar-Engineering/openmidi)
- **YAML parsing:** `yaml` package
- **Build:** `tsc`, output to `build/`
- **Package:** published to npm, runnable via `npx morningstar-mcp`
- **License:** MIT

## Project Structure

```
morningstar-mcp/
├── src/
│   ├── index.ts              # Entry point, MCP server setup
│   ├── midi.ts               # MIDI port management, SysEx send/receive
│   ├── protocol.ts           # SysEx message encoding/decoding
│   ├── commands.ts           # High-level Morningstar command functions
│   ├── models.ts             # Controller model definitions & layouts
│   ├── devices.ts            # OpenMIDI data loader & lookup
│   ├── tools.ts              # All MCP tool definitions
│   ├── config.ts             # setup.yaml loading & validation
│   └── state.ts              # Local shadow state management
├── openmidi/                  # Git submodule: Morningstar-Engineering/openmidi
├── docs/
├── package.json
├── tsconfig.json
└── setup.yaml.example
```

## Testing Strategy

- **Unit tests (no hardware):** SysEx encoding/decoding, checksum calculation, OpenMIDI lookup, layout mapping, state management
- **Integration tests (MC8 Pro required):** connect, read names, write preset, bank navigation
- **Test framework:** vitest

## Out of Scope (MVP)

- Bluetooth MIDI
- Expression pedal configuration
- LED color customization (Pro-only)
- Setlist generation
- Direct communication with target devices
- Web UI
- ML5/ML5R/ML10X loop switcher support (different protocol)
- Backup/restore (relies on undocumented bulk-dump commands — deferred until verified on hardware)

## Known Limitations

- **Cannot read preset messages via SysEx:** The official protocol only supports reading preset names, not the programmed MIDI messages. The server uses local shadow state as a workaround. Changes made outside this tool (Web Editor, on-device) are not visible.
- **No direct bank jump:** Navigation to a specific bank requires sequential bank up/down commands.
- **Undocumented commands:** The Python reference library suggests additional commands (editor mode, bulk dump, copy/paste) that are not in the official docs. These are deferred to post-MVP until verified.

## References

- [SysEx Documentation](https://manuals.morningstar.io/mc-midi-controller/sysex-documentation-for-external-applications)
- [OpenMIDI Repository](https://github.com/Morningstar-Engineering/openmidi)
- [guyburton/morningstarmidi (Python reference)](https://github.com/guyburton/morningstarmidi)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Morningstar Engineering GitHub](https://github.com/Morningstar-Engineering)
