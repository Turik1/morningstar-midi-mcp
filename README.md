# Morningstar MIDI MCP Server

A Model Context Protocol (MCP) server for configuring [Morningstar Engineering](https://www.morningstar.io/) MIDI foot controllers using natural language.

> **"I have an MC8 Pro and a Quad Cortex Mini. Put the tuner on long press bottom-left."**

The server resolves the switch position, looks up the correct MIDI CC from the [OpenMIDI](https://github.com/Morningstar-Engineering/openmidi) database, checks for conflicts, and programs your controller via USB.

## Features

- Configure Morningstar controllers using natural language through Claude
- 545+ device profiles from OpenMIDI — knows the MIDI implementation of hundreds of pedals, amps, and synths
- Physical layout mapping — say "bottom-left" instead of memorizing switch letters
- Conflict detection — warns before overwriting existing presets
- Supports MC3, MC6 MKII, MC6 Pro, MC8, and MC8 Pro

## Tools

- **connect** — Find and connect to a Morningstar controller via USB-MIDI
  - `port_name` (string, optional): MIDI port name. Auto-detects if omitted.

- **get_controller_info** — Query controller model, firmware version, and capabilities

- **get_preset** — Read the current state of a preset
  - `preset` (string, required): Switch letter (A–H) or position (`top-left`, `bottom-right`, etc.)

- **set_preset_message** — Program a MIDI message onto a preset
  - `preset` (string, required): Switch letter or position
  - `action` (string, required): `press`, `release`, `long_press`, `double_tap`, etc.
  - `type` (string, required): `CC` or `PC`
  - `cc_number` / `cc_value` (number, optional): CC parameters
  - `pc_number` (number, optional): Program Change number
  - `channel` (number, required): MIDI channel (0–15, where 0 = channel 1)
  - `slot` (number, optional): Message slot 0–15. Auto-assigns if omitted.
  - `force` (boolean, optional): Overwrite existing message in slot

- **set_preset_name** — Rename a preset
  - `preset` (string, required): Switch letter or position
  - `name` (string, required): New name
  - `name_type` (string, optional): `short`, `toggle`, or `long` (default: `short`)

- **get_bank_name** / **set_bank_name** — Read or rename the current bank

- **lookup_device** — Search the OpenMIDI database for a device's MIDI implementation
  - `device_name` (string, required): Device name (e.g., "Quad Cortex", "Timeline", "HX Stomp")

- **display_message** — Show text on the controller's LCD
  - `text` (string, required): Up to 20 characters
  - `duration_ms` (number, optional): Display duration in ms (default: 2000)

## Installation

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "morningstar": {
      "command": "npx",
      "args": ["-y", "morningstar-midi-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add morningstar-midi-mcp -- npx -y morningstar-midi-mcp
```

### Build from source

```bash
git clone --recurse-submodules https://github.com/Turik1/morningstar-midi-mcp.git
cd morningstar-midi-mcp
npm install
npm run build
```

## Setup

### 1. Connect your controller

Connect your Morningstar controller to your computer via USB. The server auto-detects Morningstar devices.

### 2. Configure your rig (optional)

Create `~/.config/morningstar-mcp/setup.yaml` to save your device setup:

```yaml
controller: MC8 Pro

devices:
  - name: Quad Cortex Mini
    midi_channel: 1
  - name: Strymon Timeline
    midi_channel: 2
```

Without this file, you can tell Claude your setup in conversation.

## Supported Controllers

| Model | Presets | Layout |
|-------|---------|--------|
| MC3 | 3 | A B C |
| MC6 MKII | 6 | A B C / D E F |
| MC6 Pro | 6 | A B C / D E F |
| MC8 | 8 | A B C D / E F G H |
| MC8 Pro | 8 | A B C D / E F G H |

## How It Works

The server communicates with Morningstar controllers using the [SysEx protocol](https://manuals.morningstar.io/mc-midi-controller/sysex-documentation-for-external-applications) over USB-MIDI. It bundles the [OpenMIDI](https://github.com/Morningstar-Engineering/openmidi) database (maintained by Morningstar Engineering) containing MIDI CC/PC mappings for 545+ devices.

Since the SysEx protocol cannot read preset messages back from the controller, the server maintains a local shadow state at `~/.config/morningstar-mcp/state.json` to track what has been written. Changes made outside this tool (e.g., via the Morningstar Web Editor) are not visible.

## Development

```bash
npm install
npm test          # Run tests (60 tests)
npm run build     # Compile TypeScript
```

## License

MIT
