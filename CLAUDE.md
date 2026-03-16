# morningstar-midi-mcp

MCP server for configuring Morningstar Engineering MIDI controllers via natural language.

## Stack
- TypeScript ES modules (`"type": "module"`), Node16 module resolution, strict mode
- `npm test` — vitest run; `npm run build` — tsc to `build/`
- zod v4 (not v3) — API identical for basic schemas; MCP SDK supports both
- Imports use `.js` extension for `.ts` source files (Node16 ESM requirement)

## Project Structure
- `src/protocol.ts` — SysEx message encoding/decoding, checksum
- `src/commands.ts` — High-level Morningstar controller commands
- `src/midi.ts` — USB-MIDI connection layer (jzz wrapper)
- `src/models.ts` — Controller model definitions and physical layouts
- `src/devices.ts` — OpenMIDI device database loader and search
- `src/tools.ts` — MCP tool registrations
- `src/config.ts` — setup.yaml loading
- `src/state.ts` — Shadow state for tracking written preset messages
- `src/index.ts` — Entry point
- `docs/superpowers/specs/` — Design spec
- `docs/superpowers/plans/` — Implementation plan

## Git
- Conventional commits required: `feat:`, `fix:`, `docs:`, `refactor:`, etc.

## MCP Constraints
- stdio transport — NEVER `console.log()`, only `console.error()` (corrupts JSON-RPC)
- Tool registration: `server.tool(name, { param: z.string() }, handler)`

## OpenMIDI Submodule (`openmidi/`)
- CC number field is `value` (NOT `number`) in YAML files
- Brand/device names from `mapping.json`, not directory names
- Path: `openmidi/data/brands/<brand-slug>/<model-slug>.yaml`

## Key Module Facts
- `resolvePreset(identifier, modelName)` — second arg is model name string, not device ID
- `DeviceDatabase.search()` — case-insensitive substring on `brand + device`
- `ShadowState` tracks written messages locally (SysEx can't read preset messages back)
- `buildSysExMessage()` — use in tests to construct valid mock SysEx responses

## jzz Type Declarations (`src/jzz.d.ts`)
- Do NOT use `extends Promise<Self>` pattern — causes TS1062 circular reference
- Use `Promise<T>` return types on methods instead
