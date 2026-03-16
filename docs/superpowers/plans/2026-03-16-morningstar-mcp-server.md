# Morningstar MCP Server Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that lets Claude configure Morningstar MIDI foot controllers via natural language over USB-MIDI SysEx.

**Architecture:** Four-layer stack — MIDI transport (jzz), Morningstar SysEx protocol, device knowledge (OpenMIDI + layouts), MCP tools (stdio). Local shadow state tracks written preset messages since the protocol can't read them back.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk v1.x, jzz, zod, yaml, vitest

**Spec:** `docs/superpowers/specs/2026-03-16-morningstar-mcp-server-design.md`

---

## Chunk 1: Foundation

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `setup.yaml.example`
- Create: `LICENSE`

- [ ] **Step 1: Initialize npm project and install dependencies**

```bash
cd /home/artur/code/morningstar-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod jzz yaml
npm install -D typescript @types/node vitest
```

- [ ] **Step 2: Update package.json**

Replace the generated `package.json` with:

```json
{
  "name": "morningstar-mcp",
  "version": "0.1.0",
  "description": "MCP server for configuring Morningstar Engineering MIDI controllers via natural language",
  "type": "module",
  "main": "build/index.js",
  "bin": {
    "morningstar-mcp": "./build/index.js"
  },
  "files": ["build/", "openmidi/data/"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "start": "node build/index.js",
    "postinstall": "git submodule update --init || true"
  },
  "keywords": ["mcp", "midi", "morningstar", "sysex"],
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "jzz": "^1.8.0",
    "yaml": "^2.7.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
build/
*.tgz
```

- [ ] **Step 5: Create setup.yaml.example**

```yaml
# Morningstar MCP Server Configuration
# Copy to ~/.config/morningstar-mcp/setup.yaml

controller: MC8 Pro

devices:
  - name: Quad Cortex Mini
    midi_channel: 1
  - name: Strymon Timeline
    midi_channel: 2
```

- [ ] **Step 6: Create LICENSE (MIT)**

Standard MIT license file with year 2026.

- [ ] **Step 7: Create src directory, empty index.ts, and jzz type declaration**

```bash
mkdir -p src
```

Create `src/index.ts`:

```typescript
#!/usr/bin/env node
// Morningstar MCP Server - entry point
```

Create `src/jzz.d.ts` (jzz has no TypeScript types):

```typescript
declare module 'jzz' {
  function JZZ(): JZZ.Engine;
  namespace JZZ {
    interface Engine extends Promise<Engine> {
      info(): { inputs: PortInfo[]; outputs: PortInfo[] };
      openMidiIn(name?: string): MidiPort;
      openMidiOut(name?: string): MidiPort;
    }
    interface PortInfo {
      name: string;
      manufacturer: string;
    }
    interface MidiPort extends Promise<MidiPort> {
      send(data: number[]): MidiPort;
      connect(handler: (msg: number[]) => void): MidiPort;
      disconnect(handler: (msg: number[]) => void): MidiPort;
      close(): Promise<void>;
      name(): string;
    }
  }
  export = JZZ;
}
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 8: Add OpenMIDI as git submodule**

```bash
git submodule add https://github.com/Morningstar-Engineering/openmidi.git openmidi
```

- [ ] **Step 9: Verify build works**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .gitmodules setup.yaml.example LICENSE src/index.ts src/jzz.d.ts vitest.config.ts openmidi
git commit -m "feat: initialize project with dependencies and scaffolding"
```

---

### Task 2: SysEx Protocol Encoding/Decoding

**Files:**
- Create: `src/protocol.ts`
- Create: `src/protocol.test.ts`

This is the core of the Morningstar layer — encoding outgoing SysEx messages and decoding responses. Pure functions, no I/O, fully testable without hardware.

**Reference:** SysEx message format from spec (bytes 0-n), checksum algorithm, error response format.

- [ ] **Step 1: Write failing tests for checksum calculation**

Create `src/protocol.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateChecksum } from './protocol.js';

describe('calculateChecksum', () => {
  it('XORs bytes from index 1 to n-3 and masks with 0x7F', () => {
    // Simple message: F0 00 21 24 08 00 70 32 00 00 00 00 00 00 00 00 [checksum] F7
    // XOR bytes 1..14: 00^21^24^08^00^70^32^00^00^00^00^00^00^00^00
    const messageWithoutChecksumAndF7 = [
      0xF0, 0x00, 0x21, 0x24, 0x08, 0x00, 0x70, 0x32,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    const result = calculateChecksum(messageWithoutChecksumAndF7);
    // 00^21=21, 21^24=05, 05^08=0D, 0D^00=0D, 0D^70=7D, 7D^32=4F,
    // rest are 00 so stays 4F, 4F & 7F = 4F
    expect(result).toBe(0x4F);
  });

  it('masks result with 0x7F', () => {
    // Construct bytes that XOR to something > 0x7F
    const message = [0xF0, 0x7F, 0x7F]; // XOR of 7F^7F = 0, but let's test with 0xFF
    // Actually, since all MIDI data bytes are 0-127, XOR result will always be <=127
    // But the mask ensures safety regardless
    const result = calculateChecksum(message);
    expect(result).toBe(0x7F & (0x7F ^ 0x7F)); // 0
    expect(result).toBeLessThanOrEqual(0x7F);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/protocol.test.ts
```

Expected: FAIL — `calculateChecksum` not found.

- [ ] **Step 3: Implement checksum calculation**

Create `src/protocol.ts`:

```typescript
/**
 * Morningstar SysEx Protocol
 *
 * Message format:
 * [F0] [00 21 24] [deviceId] [00] [70] [op2] [op3] [op4] [op5] [op6] [op7] [txnId] [00] [00] [payload...] [checksum] [F7]
 *
 * Manufacturer ID: 00 21 24 (Morningstar Engineering)
 */

export const MANUFACTURER_ID = [0x00, 0x21, 0x24] as const;
export const SYSEX_START = 0xF0;
export const SYSEX_END = 0xF7;
export const OPCODE_1 = 0x70;

/** XOR bytes from index 1 through end, then AND with 0x7F */
export function calculateChecksum(messageWithoutChecksumAndEnd: number[]): number {
  let checksum = 0;
  for (let i = 1; i < messageWithoutChecksumAndEnd.length; i++) {
    checksum ^= messageWithoutChecksumAndEnd[i];
  }
  return checksum & 0x7F;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/protocol.test.ts
```

Expected: PASS

- [ ] **Step 5: Write failing tests for buildSysExMessage**

Add to `src/protocol.test.ts`:

```typescript
import { calculateChecksum, buildSysExMessage, SYSEX_START, SYSEX_END } from './protocol.js';

describe('buildSysExMessage', () => {
  it('builds a complete SysEx message with correct structure', () => {
    const msg = buildSysExMessage({
      deviceId: 0x08, // MC8 Pro
      op2: 0x32,      // get controller info
      op3: 0x00,
      op4: 0x00,
      op5: 0x00,
      op6: 0x00,
      op7: 0x00,
      transactionId: 0x01,
      payload: [],
    });

    expect(msg[0]).toBe(SYSEX_START);
    expect(msg[1]).toBe(0x00); // manufacturer
    expect(msg[2]).toBe(0x21);
    expect(msg[3]).toBe(0x24);
    expect(msg[4]).toBe(0x08); // device ID
    expect(msg[5]).toBe(0x00); // reserved
    expect(msg[6]).toBe(0x70); // opcode 1
    expect(msg[7]).toBe(0x32); // op2
    expect(msg[13]).toBe(0x01); // transaction ID
    expect(msg[msg.length - 1]).toBe(SYSEX_END);
  });

  it('includes payload bytes', () => {
    const msg = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x01, // update preset short name
      op3: 0x00, // preset A
      op4: 0x7F, // save
      op5: 0x00,
      op6: 0x00,
      op7: 0x00,
      transactionId: 0x00,
      payload: [0x54, 0x55, 0x4E, 0x45, 0x52], // "TUNER" in ASCII
    });

    // Payload starts at byte 16
    expect(msg[16]).toBe(0x54); // T
    expect(msg[17]).toBe(0x55); // U
    expect(msg[18]).toBe(0x4E); // N
    expect(msg[19]).toBe(0x45); // E
    expect(msg[20]).toBe(0x52); // R
  });

  it('calculates correct checksum', () => {
    const msg = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x32,
      op3: 0x00,
      op4: 0x00,
      op5: 0x00,
      op6: 0x00,
      op7: 0x00,
      transactionId: 0x00,
      payload: [],
    });

    // Verify checksum: XOR bytes 1 through n-3, AND 0x7F
    const bytesForChecksum = msg.slice(0, -2); // exclude checksum and F7
    const expectedChecksum = calculateChecksum(bytesForChecksum);
    expect(msg[msg.length - 2]).toBe(expectedChecksum);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run src/protocol.test.ts
```

Expected: FAIL — `buildSysExMessage` not found.

- [ ] **Step 7: Implement buildSysExMessage**

Add to `src/protocol.ts`:

```typescript
export interface SysExMessageParams {
  deviceId: number;
  op2: number;
  op3: number;
  op4: number;
  op5: number;
  op6: number;
  op7: number;
  transactionId: number;
  payload: number[];
}

export function buildSysExMessage(params: SysExMessageParams): number[] {
  const message = [
    SYSEX_START,
    ...MANUFACTURER_ID,
    params.deviceId,
    0x00, // reserved
    OPCODE_1,
    params.op2,
    params.op3,
    params.op4,
    params.op5,
    params.op6,
    params.op7,
    params.transactionId,
    0x00, // reserved
    0x00, // reserved
    ...params.payload,
  ];
  const checksum = calculateChecksum(message);
  message.push(checksum);
  message.push(SYSEX_END);
  return message;
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run src/protocol.test.ts
```

Expected: all PASS

- [ ] **Step 9: Write failing tests for parseSysExResponse**

Add to `src/protocol.test.ts`:

```typescript
import {
  calculateChecksum,
  buildSysExMessage,
  parseSysExResponse,
  SYSEX_START,
  SYSEX_END,
} from './protocol.js';

describe('parseSysExResponse', () => {
  it('parses a valid response', () => {
    // Build a response as the controller would send it
    const response = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x32,
      op3: 0x00,
      op4: 0x00,
      op5: 0x00,
      op6: 0x00,
      op7: 0x00,
      transactionId: 0x01,
      payload: [0x08, 0x03, 0x00, 0x02, 0x00, 0x10, 0x20, 0x20, 0x20], // 9-byte controller info
    });

    const parsed = parseSysExResponse(response);
    expect(parsed.deviceId).toBe(0x08);
    expect(parsed.op2).toBe(0x32);
    expect(parsed.transactionId).toBe(0x01);
    expect(parsed.payload).toEqual([0x08, 0x03, 0x00, 0x02, 0x00, 0x10, 0x20, 0x20, 0x20]);
    expect(parsed.error).toBeUndefined();
  });

  it('detects error responses', () => {
    const response = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x7F, // error response
      op3: 0x01, // wrong model ID
      op4: 0x00,
      op5: 0x00,
      op6: 0x00,
      op7: 0x00,
      transactionId: 0x01,
      payload: [],
    });

    const parsed = parseSysExResponse(response);
    expect(parsed.error).toBe('WRONG_MODEL_ID');
  });

  it('detects invalid checksum', () => {
    const response = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x32,
      op3: 0x00,
      op4: 0x00,
      op5: 0x00,
      op6: 0x00,
      op7: 0x00,
      transactionId: 0x00,
      payload: [],
    });
    // Corrupt the checksum
    response[response.length - 2] = 0x00;

    const parsed = parseSysExResponse(response);
    expect(parsed.error).toBe('INVALID_CHECKSUM');
  });

  it('detects non-Morningstar messages', () => {
    const response = [0xF0, 0x7E, 0x00, 0x00, 0xF7]; // different manufacturer
    const parsed = parseSysExResponse(response);
    expect(parsed.error).toBe('NOT_MORNINGSTAR');
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

```bash
npx vitest run src/protocol.test.ts
```

Expected: FAIL — `parseSysExResponse` not found.

- [ ] **Step 11: Implement parseSysExResponse**

Add to `src/protocol.ts`:

```typescript
const ERROR_CODES: Record<number, string> = {
  0x00: 'SUCCESS',
  0x01: 'WRONG_MODEL_ID',
  0x02: 'WRONG_CHECKSUM',
  0x03: 'WRONG_PAYLOAD_SIZE',
};

export interface SysExResponse {
  deviceId: number;
  op2: number;
  op3: number;
  op4: number;
  op5: number;
  op6: number;
  op7: number;
  transactionId: number;
  payload: number[];
  error?: string;
}

export function parseSysExResponse(data: number[]): SysExResponse {
  // Validate basic structure
  if (data[0] !== SYSEX_START || data[data.length - 1] !== SYSEX_END) {
    return { deviceId: 0, op2: 0, op3: 0, op4: 0, op5: 0, op6: 0, op7: 0, transactionId: 0, payload: [], error: 'INVALID_SYSEX' };
  }

  // Check manufacturer ID
  if (data[1] !== MANUFACTURER_ID[0] || data[2] !== MANUFACTURER_ID[1] || data[3] !== MANUFACTURER_ID[2]) {
    return { deviceId: 0, op2: 0, op3: 0, op4: 0, op5: 0, op6: 0, op7: 0, transactionId: 0, payload: [], error: 'NOT_MORNINGSTAR' };
  }

  // Verify checksum
  const bytesForChecksum = data.slice(0, -2);
  const expectedChecksum = calculateChecksum(bytesForChecksum);
  const actualChecksum = data[data.length - 2];
  if (expectedChecksum !== actualChecksum) {
    return { deviceId: 0, op2: 0, op3: 0, op4: 0, op5: 0, op6: 0, op7: 0, transactionId: 0, payload: [], error: 'INVALID_CHECKSUM' };
  }

  const response: SysExResponse = {
    deviceId: data[4],
    op2: data[7],
    op3: data[8],
    op4: data[9],
    op5: data[10],
    op6: data[11],
    op7: data[12],
    transactionId: data[13],
    payload: data.slice(16, -2), // bytes 16 through n-3
  };

  // Check for error response
  if (response.op2 === 0x7F && response.op3 !== 0x00) {
    response.error = ERROR_CODES[response.op3] ?? `UNKNOWN_ERROR_${response.op3}`;
  }

  return response;
}
```

- [ ] **Step 12: Run tests to verify they all pass**

```bash
npx vitest run src/protocol.test.ts
```

Expected: all PASS

- [ ] **Step 13: Write failing tests for helper functions (nameToBytes, bytesToName)**

Add to `src/protocol.test.ts`:

```typescript
import {
  // ... existing imports
  nameToBytes,
  bytesToName,
} from './protocol.js';

describe('nameToBytes / bytesToName', () => {
  it('converts ASCII string to byte array', () => {
    expect(nameToBytes('TUNER')).toEqual([0x54, 0x55, 0x4E, 0x45, 0x52]);
  });

  it('converts byte array to ASCII string', () => {
    expect(bytesToName([0x54, 0x55, 0x4E, 0x45, 0x52])).toBe('TUNER');
  });

  it('strips trailing null bytes from name', () => {
    expect(bytesToName([0x54, 0x55, 0x4E, 0x00, 0x00])).toBe('TUN');
  });

  it('truncates name to maxLength', () => {
    expect(nameToBytes('THIS IS A VERY LONG NAME', 8)).toEqual([0x54, 0x48, 0x49, 0x53, 0x20, 0x49, 0x53, 0x20]);
  });
});
```

- [ ] **Step 14: Run test to verify it fails**

```bash
npx vitest run src/protocol.test.ts
```

Expected: FAIL

- [ ] **Step 15: Implement nameToBytes and bytesToName**

Add to `src/protocol.ts`:

```typescript
export function nameToBytes(name: string, maxLength?: number): number[] {
  const bytes = Array.from(name).map((c) => c.charCodeAt(0) & 0x7F);
  if (maxLength !== undefined && bytes.length > maxLength) {
    return bytes.slice(0, maxLength);
  }
  return bytes;
}

export function bytesToName(bytes: number[]): string {
  // Strip trailing null bytes
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end--;
  }
  return String.fromCharCode(...bytes.slice(0, end));
}
```

- [ ] **Step 16: Run all tests**

```bash
npx vitest run src/protocol.test.ts
```

Expected: all PASS

- [ ] **Step 17: Commit**

```bash
git add src/protocol.ts src/protocol.test.ts
git commit -m "feat: add SysEx protocol encoding, decoding, and checksum"
```

---

### Task 3: Controller Model Definitions and Layouts

**Files:**
- Create: `src/models.ts`
- Create: `src/models.test.ts`

Defines controller models (device IDs, bank counts, name limits) and physical switch layouts with positional aliases.

- [ ] **Step 1: Write failing tests for model definitions and layout resolution**

Create `src/models.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getModel, resolvePreset } from './models.js';

describe('getModel', () => {
  it('returns MC8 Pro model by name', () => {
    const model = getModel('MC8 Pro');
    expect(model).toBeDefined();
    expect(model!.deviceId).toBe(0x08);
    expect(model!.presets).toBe(8);
    expect(model!.banks).toBe(128);
    expect(model!.nameLength.short).toBe(32);
  });

  it('returns MC6 Pro model by name', () => {
    const model = getModel('MC6 Pro');
    expect(model).toBeDefined();
    expect(model!.deviceId).toBe(0x06);
    expect(model!.presets).toBe(6);
  });

  it('returns model by device ID', () => {
    const model = getModel(0x08);
    expect(model).toBeDefined();
    expect(model!.name).toBe('MC8 Pro');
  });

  it('returns undefined for unknown model', () => {
    expect(getModel('Unknown')).toBeUndefined();
    expect(getModel(0xFF)).toBeUndefined();
  });
});

describe('resolvePreset', () => {
  it('resolves switch letter to preset index', () => {
    expect(resolvePreset('A', 'MC8 Pro')).toBe(0);
    expect(resolvePreset('E', 'MC8 Pro')).toBe(4);
    expect(resolvePreset('H', 'MC8 Pro')).toBe(7);
  });

  it('resolves positional aliases', () => {
    expect(resolvePreset('top-left', 'MC8 Pro')).toBe(0);    // A
    expect(resolvePreset('top-right', 'MC8 Pro')).toBe(3);   // D
    expect(resolvePreset('bottom-left', 'MC8 Pro')).toBe(4); // E
    expect(resolvePreset('bottom-right', 'MC8 Pro')).toBe(7);// H
  });

  it('resolves MC6 Pro positions', () => {
    expect(resolvePreset('top-left', 'MC6 Pro')).toBe(0);    // A
    expect(resolvePreset('bottom-right', 'MC6 Pro')).toBe(5);// F
  });

  it('resolves MC3 positions', () => {
    expect(resolvePreset('left', 'MC3')).toBe(0);   // A
    expect(resolvePreset('middle', 'MC3')).toBe(1);  // B
    expect(resolvePreset('right', 'MC3')).toBe(2);   // C
  });

  it('is case-insensitive', () => {
    expect(resolvePreset('a', 'MC8 Pro')).toBe(0);
    expect(resolvePreset('Top-Left', 'MC8 Pro')).toBe(0);
  });

  it('returns undefined for invalid preset', () => {
    expect(resolvePreset('Z', 'MC8 Pro')).toBeUndefined();
    expect(resolvePreset('bottom-left', 'MC3')).toBeUndefined(); // MC3 has no bottom row
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/models.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement models and layout resolution**

Create `src/models.ts`:

```typescript
export interface ControllerModel {
  name: string;
  deviceId: number;
  presets: number;
  banks: number;
  nameLength: {
    short: number;
    toggle: number;
    long: number;
    bank: number;
  };
  layout: PresetLayout;
}

export interface PresetLayout {
  /** Map from switch letter (A-H) to preset index */
  switches: Record<string, number>;
  /** Map from positional alias to switch letter */
  aliases: Record<string, string>;
}

const MC8_LAYOUT: PresetLayout = {
  switches: { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7 },
  aliases: {
    'top-left': 'A', 'top-center-left': 'B', 'top-center-right': 'C', 'top-right': 'D',
    'bottom-left': 'E', 'bottom-center-left': 'F', 'bottom-center-right': 'G', 'bottom-right': 'H',
  },
};

const MC6_LAYOUT: PresetLayout = {
  switches: { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 },
  aliases: {
    'top-left': 'A', 'top-center': 'B', 'top-right': 'C',
    'bottom-left': 'D', 'bottom-center': 'E', 'bottom-right': 'F',
  },
};

const MC3_LAYOUT: PresetLayout = {
  switches: { A: 0, B: 1, C: 2 },
  aliases: {
    'left': 'A', 'middle': 'B', 'center': 'B', 'right': 'C',
  },
};

const MODELS: ControllerModel[] = [
  {
    name: 'MC3',
    deviceId: 0x05,
    presets: 3,
    banks: 30, // approximate, TBD
    nameLength: { short: 10, toggle: 10, long: 16, bank: 16 },
    layout: MC3_LAYOUT,
  },
  {
    name: 'MC6 MKII',
    deviceId: 0x03,
    presets: 6,
    banks: 30, // approximate, TBD
    nameLength: { short: 8, toggle: 8, long: 24, bank: 24 },
    layout: MC6_LAYOUT,
  },
  {
    name: 'MC6 Pro',
    deviceId: 0x06,
    presets: 6,
    banks: 128,
    nameLength: { short: 32, toggle: 32, long: 32, bank: 32 },
    layout: MC6_LAYOUT,
  },
  {
    name: 'MC8',
    deviceId: 0x04,
    presets: 8,
    banks: 30, // approximate, TBD
    nameLength: { short: 10, toggle: 10, long: 24, bank: 24 },
    layout: MC8_LAYOUT,
  },
  {
    name: 'MC8 Pro',
    deviceId: 0x08,
    presets: 8,
    banks: 128,
    nameLength: { short: 32, toggle: 32, long: 32, bank: 32 },
    layout: MC8_LAYOUT,
  },
];

export function getModel(nameOrId: string | number): ControllerModel | undefined {
  if (typeof nameOrId === 'number') {
    return MODELS.find((m) => m.deviceId === nameOrId);
  }
  return MODELS.find((m) => m.name.toLowerCase() === nameOrId.toLowerCase());
}

export function resolvePreset(identifier: string, modelName: string): number | undefined {
  const model = getModel(modelName);
  if (!model) return undefined;

  const normalized = identifier.toLowerCase();

  // Try direct switch letter
  for (const [letter, index] of Object.entries(model.layout.switches)) {
    if (letter.toLowerCase() === normalized) return index;
  }

  // Try positional alias
  const aliasedSwitch = model.layout.aliases[normalized];
  if (aliasedSwitch !== undefined) {
    return model.layout.switches[aliasedSwitch];
  }

  return undefined;
}

export function getAllModels(): ControllerModel[] {
  return [...MODELS];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/models.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/models.ts src/models.test.ts
git commit -m "feat: add controller model definitions and layout resolution"
```

---

## Chunk 2: Communication

### Task 4: MIDI Connection Layer

**Files:**
- Create: `src/midi.ts`
- Create: `src/midi.test.ts`

Wraps jzz for USB-MIDI communication. Since actual MIDI hardware isn't always available, we design this as a thin wrapper with an interface that can be mocked in tests.

- [ ] **Step 1: Write failing tests with a mock MIDI interface**

Create `src/midi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MidiConnection } from './midi.js';

// We test the connection logic by mocking the jzz module
// Real MIDI communication is tested manually with hardware

describe('MidiConnection', () => {
  it('can be instantiated', () => {
    const conn = new MidiConnection();
    expect(conn.isConnected()).toBe(false);
  });

  it('buildSysEx and sendSysEx require connection', async () => {
    const conn = new MidiConnection();
    await expect(conn.sendAndReceive([0xF0, 0xF7])).rejects.toThrow('Not connected');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/midi.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement MidiConnection class**

Create `src/midi.ts`:

```typescript
import JZZ from 'jzz';

export interface MidiPort {
  name: string;
  manufacturer: string;
}

export class MidiConnection {
  private output: any = null;
  private input: any = null;
  private engine: any = null;
  private connectedPortName: string | null = null;

  isConnected(): boolean {
    return this.output !== null && this.input !== null;
  }

  async listPorts(): Promise<{ inputs: MidiPort[]; outputs: MidiPort[] }> {
    const engine = await JZZ();
    const info = engine.info();
    return {
      inputs: info.inputs.map((p: any) => ({ name: p.name, manufacturer: p.manufacturer })),
      outputs: info.outputs.map((p: any) => ({ name: p.name, manufacturer: p.manufacturer })),
    };
  }

  async connect(portName?: string): Promise<string> {
    this.engine = await JZZ();
    const info = this.engine.info();

    // Find Morningstar port by name or use specified port
    const findPort = (ports: any[], name?: string) => {
      if (name) {
        return ports.find((p: any) => p.name.includes(name));
      }
      // Auto-detect: look for "Morningstar" in port name
      return ports.find((p: any) => p.name.toLowerCase().includes('morningstar'));
    };

    const outputPort = findPort(info.outputs, portName);
    const inputPort = findPort(info.inputs, portName);

    if (!outputPort || !inputPort) {
      const available = info.outputs.map((p: any) => p.name).join(', ');
      throw new Error(`Morningstar controller not found. Available ports: ${available || 'none'}`);
    }

    this.output = await this.engine.openMidiOut(outputPort.name);
    this.input = await this.engine.openMidiIn(inputPort.name);
    this.connectedPortName = outputPort.name;

    return outputPort.name;
  }

  async sendAndReceive(sysex: number[], timeoutMs: number = 2000): Promise<number[]> {
    if (!this.isConnected()) {
      throw new Error('Not connected to a MIDI device');
    }

    // Retry once on timeout per spec
    try {
      return await this.sendAndReceiveOnce(sysex, timeoutMs);
    } catch (err) {
      if (err instanceof Error && err.message.includes('timeout')) {
        return await this.sendAndReceiveOnce(sysex, timeoutMs);
      }
      throw err;
    }
  }

  private sendAndReceiveOnce(sysex: number[], timeoutMs: number): Promise<number[]> {
    return new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.input.disconnect(handler);
        reject(new Error(`SysEx timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (msg: any) => {
        const data: number[] = Array.from(msg);
        // Only accept SysEx responses (F0...F7) from Morningstar
        if (data[0] === 0xF0 && data[1] === 0x00 && data[2] === 0x21 && data[3] === 0x24) {
          clearTimeout(timer);
          this.input.disconnect(handler);
          resolve(data);
        }
      };

      this.input.connect(handler);
      this.output.send(sysex);
    });
  }

  /** Check if the MIDI port is still available */
  async checkConnection(): Promise<boolean> {
    if (!this.engine) return false;
    try {
      const info = this.engine.info();
      const portStillExists = info.outputs.some((p: any) => p.name === this.connectedPortName);
      if (!portStillExists) {
        await this.disconnect();
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async send(sysex: number[]): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to a MIDI device');
    }
    this.output.send(sysex);
  }

  async disconnect(): Promise<void> {
    if (this.output) {
      await this.output.close();
      this.output = null;
    }
    if (this.input) {
      await this.input.close();
      this.input = null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/midi.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/midi.ts src/midi.test.ts
git commit -m "feat: add MIDI connection layer with jzz"
```

---

### Task 5: High-Level Morningstar Commands

**Files:**
- Create: `src/commands.ts`
- Create: `src/commands.test.ts`

Combines protocol encoding with MIDI communication to provide high-level functions like `getControllerInfo()`, `getPresetName()`, `setPresetMessage()`.

- [ ] **Step 1: Write failing tests using a mock MidiConnection**

Create `src/commands.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MorningstarController,
  ActionType,
  ToggleType,
  MessageType,
} from './commands.js';
import { buildSysExMessage } from './protocol.js';

// Mock MidiConnection
function createMockMidi() {
  return {
    isConnected: vi.fn(() => true),
    sendAndReceive: vi.fn(),
    send: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    listPorts: vi.fn(),
  };
}

describe('MorningstarController', () => {
  let mockMidi: ReturnType<typeof createMockMidi>;
  let controller: MorningstarController;

  beforeEach(() => {
    mockMidi = createMockMidi();
    controller = new MorningstarController(mockMidi as any);
  });

  describe('getControllerInfo', () => {
    it('sends Op2=0x32 and parses the 9-byte response', async () => {
      // Mock response: MC8 Pro, firmware 3.0.2.0, 16 messages, 32/32/32 name lengths
      const responsePayload = [0x08, 0x03, 0x00, 0x02, 0x00, 0x10, 0x20, 0x20, 0x20];
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x32, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: responsePayload,
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      const info = await controller.getControllerInfo(0x08);
      expect(info.modelId).toBe(0x08);
      expect(info.modelName).toBe('MC8 Pro');
      expect(info.firmwareVersion).toBe('3.0.2.0');
      expect(info.messagesPerPreset).toBe(16);
    });
  });

  describe('getPresetName', () => {
    it('sends Op2=0x21 and returns the name', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x21, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [0x54, 0x55, 0x4E, 0x45, 0x52], // "TUNER"
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      const name = await controller.getPresetName(0x08, 0, 'short');
      expect(name).toBe('TUNER');
    });
  });

  describe('setPresetName', () => {
    it('sends Op2=0x01 with name payload and save flag', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x7F, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      await controller.setPresetName(0x08, 0, 'short', 'TUNER');

      expect(mockMidi.sendAndReceive).toHaveBeenCalledOnce();
      const sentMessage = mockMidi.sendAndReceive.mock.calls[0][0];
      expect(sentMessage[7]).toBe(0x01); // Op2 = update short name
      expect(sentMessage[8]).toBe(0x00); // Op3 = preset 0 (A)
      expect(sentMessage[9]).toBe(0x7F); // Op4 = save
    });
  });

  describe('setPresetMessage', () => {
    it('sends Op2=0x04 with CC message payload', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x7F, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      await controller.setPresetMessage(0x08, {
        preset: 4,        // Switch E
        messageSlot: 0,
        type: MessageType.CC,
        action: ActionType.LONG_PRESS,
        toggle: ToggleType.BOTH,
        ccNumber: 49,     // Tuner
        ccValue: 0,
        channel: 0,       // Channel 1
      });

      expect(mockMidi.sendAndReceive).toHaveBeenCalledOnce();
      const sentMessage = mockMidi.sendAndReceive.mock.calls[0][0];
      expect(sentMessage[7]).toBe(0x04);  // Op2 = update preset message
      expect(sentMessage[8]).toBe(4);     // Op3 = preset E
      expect(sentMessage[9]).toBe(0);     // Op4 = message slot 0
      expect(sentMessage[10]).toBe(0x02); // Op5 = CC message type
      expect(sentMessage[11]).toBe(0x7F); // Op6 = save
    });
  });

  describe('getBankName', () => {
    it('sends Op2=0x30 and returns the bank name', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x30, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [0x4C, 0x49, 0x56, 0x45], // "LIVE"
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      const name = await controller.getBankName(0x08);
      expect(name).toBe('LIVE');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/commands.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement MorningstarController**

Create `src/commands.ts`:

```typescript
import { MidiConnection } from './midi.js';
import {
  buildSysExMessage,
  parseSysExResponse,
  nameToBytes,
  bytesToName,
} from './protocol.js';
import { getModel } from './models.js';

export enum ActionType {
  NOTHING = 0x00,
  PRESS = 0x01,
  RELEASE = 0x02,
  LONG_PRESS = 0x03,
  LONG_PRESS_RELEASE = 0x04,
  DOUBLE_TAP = 0x05,
  DOUBLE_TAP_RELEASE = 0x06,
  DOUBLE_TAP_LONG = 0x07,
  DOUBLE_TAP_LONG_RELEASE = 0x08,
  RELEASE_ALL = 0x09,
  LONG_PRESS_SCROLL = 0x0A,
  ON_DISENGAGE = 0x0B,
  ON_FIRST_ENGAGE = 0x0C,
}

export enum ToggleType {
  POS_1 = 0x00,
  POS_2 = 0x01,
  BOTH = 0x02,
  SHIFT = 0x03,
}

export enum MessageType {
  PC = 0x01,
  CC = 0x02,
}

export interface ControllerInfo {
  modelId: number;
  modelName: string;
  firmwareVersion: string;
  messagesPerPreset: number;
  presetShortNameSize: number;
  presetLongNameSize: number;
  bankNameSize: number;
}

export interface PresetMessageParams {
  preset: number;
  messageSlot: number;
  type: MessageType;
  action: ActionType;
  toggle: ToggleType;
  channel: number;
  pcNumber?: number;
  ccNumber?: number;
  ccValue?: number;
}

type NameType = 'short' | 'toggle' | 'long';

const NAME_TYPE_OP2_WRITE: Record<NameType, number> = {
  short: 0x01,
  toggle: 0x02,
  long: 0x03,
};

const NAME_TYPE_OP2_READ: Record<NameType, number> = {
  short: 0x21,
  toggle: 0x22,
  long: 0x23,
};

export class MorningstarController {
  private midi: MidiConnection;
  private transactionCounter = 0;

  constructor(midi: MidiConnection) {
    this.midi = midi;
  }

  private nextTransactionId(): number {
    this.transactionCounter = (this.transactionCounter + 1) & 0x7F;
    return this.transactionCounter;
  }

  private async sendCommand(
    deviceId: number,
    op2: number,
    op3 = 0,
    op4 = 0,
    op5 = 0,
    op6 = 0,
    op7 = 0,
    payload: number[] = [],
  ) {
    const txnId = this.nextTransactionId();
    const message = buildSysExMessage({
      deviceId, op2, op3, op4, op5, op6, op7,
      transactionId: txnId,
      payload,
    });
    const responseData = await this.midi.sendAndReceive(message);
    const response = parseSysExResponse(responseData);
    if (response.error && response.error !== 'SUCCESS') {
      throw new Error(`SysEx error: ${response.error}`);
    }
    return response;
  }

  async getControllerInfo(deviceId: number): Promise<ControllerInfo> {
    const response = await this.sendCommand(deviceId, 0x32);
    const p = response.payload;
    const model = getModel(p[0]);
    return {
      modelId: p[0],
      modelName: model?.name ?? `Unknown (0x${p[0].toString(16)})`,
      firmwareVersion: `${p[1]}.${p[2]}.${p[3]}.${p[4]}`,
      messagesPerPreset: p[5],
      presetShortNameSize: p[6],
      presetLongNameSize: p[7],
      bankNameSize: p[8],
    };
  }

  async getPresetName(deviceId: number, preset: number, type: NameType): Promise<string> {
    const op2 = NAME_TYPE_OP2_READ[type];
    const response = await this.sendCommand(deviceId, op2, preset);
    return bytesToName(response.payload);
  }

  async setPresetName(deviceId: number, preset: number, type: NameType, name: string): Promise<void> {
    const model = getModel(deviceId);
    const maxLen = model?.nameLength[type];
    const payload = nameToBytes(name, maxLen);
    const op2 = NAME_TYPE_OP2_WRITE[type];
    await this.sendCommand(deviceId, op2, preset, 0x7F, 0, 0, 0, payload);
  }

  async setPresetMessage(deviceId: number, params: PresetMessageParams): Promise<void> {
    let payload: number[];

    if (params.type === MessageType.PC) {
      payload = [
        params.action,
        params.toggle,
        params.pcNumber ?? 0,
        params.channel,
      ];
    } else {
      payload = [
        params.action,
        params.toggle,
        params.ccNumber ?? 0,
        params.ccValue ?? 0,
        params.channel,
      ];
    }

    await this.sendCommand(
      deviceId,
      0x04,                // Op2: update preset message
      params.preset,       // Op3: preset index
      params.messageSlot,  // Op4: message slot (0-15)
      params.type,         // Op5: message type
      0x7F,                // Op6: save flag
      0,
      payload,
    );
  }

  async getBankName(deviceId: number): Promise<string> {
    const response = await this.sendCommand(deviceId, 0x30);
    return bytesToName(response.payload);
  }

  async setBankName(deviceId: number, name: string): Promise<void> {
    const model = getModel(deviceId);
    const maxLen = model?.nameLength.bank;
    const payload = nameToBytes(name, maxLen);
    await this.sendCommand(deviceId, 0x10, 0, 0, 0, 0, 0, payload);
  }

  async bankUp(deviceId: number): Promise<void> {
    await this.sendCommand(deviceId, 0x00, 0x00);
  }

  async bankDown(deviceId: number): Promise<void> {
    await this.sendCommand(deviceId, 0x00, 0x01);
  }

  async togglePage(deviceId: number): Promise<void> {
    await this.sendCommand(deviceId, 0x00, 0x02);
  }

  async displayMessage(deviceId: number, text: string, durationMs: number = 2000): Promise<void> {
    const duration = Math.min(Math.round(durationMs / 100), 127);
    const payload = nameToBytes(text, 20);
    await this.sendCommand(deviceId, 0x11, 0, duration, 0, 0, 0, payload);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/commands.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands.ts src/commands.test.ts
git commit -m "feat: add high-level Morningstar controller commands"
```

---

## Chunk 3: Knowledge and State

### Task 6: Setup Configuration

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`

Loads and validates the `setup.yaml` file.

- [ ] **Step 1: Write failing tests**

Create `src/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSetupConfig, SetupConfig } from './config.js';

describe('parseSetupConfig', () => {
  it('parses valid YAML config', () => {
    const yaml = `
controller: MC8 Pro
devices:
  - name: Quad Cortex Mini
    midi_channel: 1
  - name: Strymon Timeline
    midi_channel: 2
`;
    const config = parseSetupConfig(yaml);
    expect(config.controller).toBe('MC8 Pro');
    expect(config.devices).toHaveLength(2);
    expect(config.devices[0].name).toBe('Quad Cortex Mini');
    expect(config.devices[0].midi_channel).toBe(1);
  });

  it('throws on invalid config (missing controller)', () => {
    expect(() => parseSetupConfig('devices: []')).toThrow();
  });

  it('allows empty devices list', () => {
    const config = parseSetupConfig('controller: MC8 Pro\ndevices: []');
    expect(config.devices).toHaveLength(0);
  });

  it('validates midi_channel range (0-15)', () => {
    const yaml = `
controller: MC8 Pro
devices:
  - name: Test
    midi_channel: 20
`;
    expect(() => parseSetupConfig(yaml)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/config.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement config loading**

Create `src/config.ts`:

```typescript
import { parse } from 'yaml';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DeviceSchema = z.object({
  name: z.string(),
  midi_channel: z.number().int().min(0).max(15),
});

const SetupConfigSchema = z.object({
  controller: z.string(),
  devices: z.array(DeviceSchema),
});

export type SetupConfig = z.infer<typeof SetupConfigSchema>;

export function parseSetupConfig(yamlContent: string): SetupConfig {
  const raw = parse(yamlContent);
  return SetupConfigSchema.parse(raw);
}

export function loadSetupConfig(): SetupConfig | null {
  const paths = [
    join(homedir(), '.config', 'morningstar-mcp', 'setup.yaml'),
    join(process.cwd(), 'setup.yaml'),
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      return parseSetupConfig(content);
    }
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/config.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add setup.yaml configuration loading"
```

---

### Task 7: Shadow State Management

**Files:**
- Create: `src/state.ts`
- Create: `src/state.test.ts`

Tracks what preset messages have been written by this tool, since the SysEx protocol can't read them back.

- [ ] **Step 1: Write failing tests**

Create `src/state.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ShadowState } from './state.js';

describe('ShadowState', () => {
  let state: ShadowState;

  beforeEach(() => {
    state = new ShadowState(); // in-memory, no file persistence for tests
  });

  it('starts empty', () => {
    const messages = state.getPresetMessages(0, 0); // bank 0, preset 0
    expect(messages).toEqual([]);
  });

  it('records a written message', () => {
    state.recordMessage(0, 0, {
      slot: 0,
      type: 'CC',
      action: 'LONG_PRESS',
      toggle: 'BOTH',
      ccNumber: 49,
      ccValue: 0,
      channel: 0,
      description: 'Quad Cortex Mini: Tuner',
    });

    const messages = state.getPresetMessages(0, 0);
    expect(messages).toHaveLength(1);
    expect(messages[0].ccNumber).toBe(49);
    expect(messages[0].description).toBe('Quad Cortex Mini: Tuner');
  });

  it('detects conflicts on same slot', () => {
    state.recordMessage(0, 0, {
      slot: 0,
      type: 'CC',
      action: 'PRESS',
      toggle: 'BOTH',
      ccNumber: 80,
      ccValue: 127,
      channel: 0,
      description: 'Effect On',
    });

    const conflict = state.checkConflict(0, 0, 0); // bank 0, preset 0, slot 0
    expect(conflict).toBeDefined();
    expect(conflict!.ccNumber).toBe(80);
  });

  it('returns no conflict for empty slot', () => {
    const conflict = state.checkConflict(0, 0, 5);
    expect(conflict).toBeUndefined();
  });

  it('finds first unused slot', () => {
    state.recordMessage(0, 0, {
      slot: 0, type: 'CC', action: 'PRESS', toggle: 'BOTH',
      ccNumber: 80, ccValue: 127, channel: 0, description: 'Test',
    });
    state.recordMessage(0, 0, {
      slot: 1, type: 'PC', action: 'PRESS', toggle: 'BOTH',
      pcNumber: 3, channel: 0, description: 'Test 2',
    });

    expect(state.firstUnusedSlot(0, 0)).toBe(2);
  });

  it('serializes and deserializes', () => {
    state.recordMessage(0, 4, {
      slot: 0, type: 'CC', action: 'LONG_PRESS', toggle: 'BOTH',
      ccNumber: 49, ccValue: 0, channel: 0, description: 'Tuner',
    });

    const json = state.serialize();
    const restored = ShadowState.deserialize(json);
    const messages = restored.getPresetMessages(0, 4);
    expect(messages).toHaveLength(1);
    expect(messages[0].ccNumber).toBe(49);
  });

  it('clears all state', () => {
    state.recordMessage(0, 0, {
      slot: 0, type: 'CC', action: 'PRESS', toggle: 'BOTH',
      ccNumber: 80, ccValue: 127, channel: 0, description: 'Test',
    });
    state.clear();
    expect(state.getPresetMessages(0, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/state.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement ShadowState**

Create `src/state.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface StoredMessage {
  slot: number;
  type: 'CC' | 'PC';
  action: string;
  toggle: string;
  channel: number;
  ccNumber?: number;
  ccValue?: number;
  pcNumber?: number;
  description: string;
}

// Key format: "bank:preset"
type StateData = Record<string, StoredMessage[]>;

export class ShadowState {
  private data: StateData = {};

  private key(bank: number, preset: number): string {
    return `${bank}:${preset}`;
  }

  getPresetMessages(bank: number, preset: number): StoredMessage[] {
    return this.data[this.key(bank, preset)] ?? [];
  }

  recordMessage(bank: number, preset: number, message: StoredMessage): void {
    const k = this.key(bank, preset);
    if (!this.data[k]) {
      this.data[k] = [];
    }
    // Replace if same slot exists
    const existing = this.data[k].findIndex((m) => m.slot === message.slot);
    if (existing >= 0) {
      this.data[k][existing] = message;
    } else {
      this.data[k].push(message);
    }
  }

  checkConflict(bank: number, preset: number, slot: number): StoredMessage | undefined {
    const messages = this.getPresetMessages(bank, preset);
    return messages.find((m) => m.slot === slot);
  }

  firstUnusedSlot(bank: number, preset: number): number {
    const messages = this.getPresetMessages(bank, preset);
    const usedSlots = new Set(messages.map((m) => m.slot));
    for (let i = 0; i < 16; i++) {
      if (!usedSlots.has(i)) return i;
    }
    return -1; // all slots full
  }

  clear(): void {
    this.data = {};
  }

  serialize(): string {
    return JSON.stringify(this.data, null, 2);
  }

  static deserialize(json: string): ShadowState {
    const state = new ShadowState();
    state.data = JSON.parse(json);
    return state;
  }

  static load(): ShadowState {
    const path = join(homedir(), '.config', 'morningstar-mcp', 'state.json');
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      return ShadowState.deserialize(content);
    }
    return new ShadowState();
  }

  save(): void {
    const path = join(homedir(), '.config', 'morningstar-mcp', 'state.json');
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, this.serialize(), 'utf-8');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/state.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/state.test.ts
git commit -m "feat: add shadow state management for preset tracking"
```

---

### Task 8: OpenMIDI Device Lookup

**Files:**
- Create: `src/devices.ts`
- Create: `src/devices.test.ts`

Loads OpenMIDI YAML data and provides device lookup by name.

**Prerequisite:** OpenMIDI git submodule must be cloned (Task 1, Step 8).

- [ ] **Step 1: Explore OpenMIDI data structure**

```bash
ls openmidi/data/brands/ | head -20
cat openmidi/data/mapping.json | head -50
cat openmidi/data/brands/neural-dsp/*.yaml | head -50
```

**IMPORTANT:** Understand the actual YAML structure before writing tests. The parser in Step 4 assumes fields named `brand`, `device`, `cc` (array with `name`, `number`, `type`, `min`, `max`). If the real format differs (e.g., `midi_cc`, `controls`), adapt the parser and tests accordingly. Do NOT proceed without verifying the actual field names.

- [ ] **Step 2: Write failing tests**

Create `src/devices.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceDatabase } from './devices.js';

describe('DeviceDatabase', () => {
  let db: DeviceDatabase;

  // Use a small inline dataset for unit tests instead of the full OpenMIDI repo
  const testData = new Map([
    ['neural-dsp/quad-cortex', {
      brand: 'Neural DSP',
      device: 'Quad Cortex',
      cc: [
        { name: 'Tuner', number: 49, type: 'CC', min: 0, max: 127 },
        { name: 'Scene 1', number: 43, type: 'CC', min: 0, max: 0 },
        { name: 'Scene 2', number: 43, type: 'CC', min: 1, max: 1 },
      ],
    }],
    ['strymon/timeline', {
      brand: 'Strymon',
      device: 'Timeline',
      cc: [
        { name: 'Tap Tempo', number: 93, type: 'CC', min: 0, max: 127 },
        { name: 'Bypass/Engage', number: 102, type: 'CC', min: 0, max: 127 },
      ],
    }],
  ]);

  beforeEach(() => {
    db = DeviceDatabase.fromMap(testData);
  });

  it('finds device by exact name', () => {
    const results = db.search('Quad Cortex');
    expect(results).toHaveLength(1);
    expect(results[0].device).toBe('Quad Cortex');
  });

  it('finds device by partial name (case-insensitive)', () => {
    const results = db.search('quad');
    expect(results).toHaveLength(1);
    expect(results[0].device).toBe('Quad Cortex');
  });

  it('returns empty for unknown device', () => {
    const results = db.search('Unknown Device');
    expect(results).toHaveLength(0);
  });

  it('returns CC mappings for a device', () => {
    const results = db.search('Quad Cortex');
    expect(results[0].cc).toHaveLength(3);
    expect(results[0].cc[0].name).toBe('Tuner');
    expect(results[0].cc[0].number).toBe(49);
  });

  it('finds multiple matches', () => {
    const results = db.search('e'); // matches both
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/devices.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement DeviceDatabase**

Create `src/devices.ts`:

```typescript
import { parse } from 'yaml';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CCMapping {
  name: string;
  number: number;
  type: string;
  min: number;
  max: number;
}

export interface DeviceProfile {
  brand: string;
  device: string;
  cc: CCMapping[];
}

export class DeviceDatabase {
  private devices: DeviceProfile[] = [];

  static fromMap(data: Map<string, DeviceProfile>): DeviceDatabase {
    const db = new DeviceDatabase();
    db.devices = Array.from(data.values());
    return db;
  }

  static loadFromOpenMIDI(openMidiPath: string): DeviceDatabase {
    const db = new DeviceDatabase();
    const brandsPath = join(openMidiPath, 'data', 'brands');

    if (!existsSync(brandsPath)) {
      console.error(`OpenMIDI data not found at ${brandsPath}. Run: git submodule update --init`);
      return db;
    }

    const brands = readdirSync(brandsPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const brand of brands) {
      const brandPath = join(brandsPath, brand);
      const files = readdirSync(brandPath)
        .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

      for (const file of files) {
        try {
          const content = readFileSync(join(brandPath, file), 'utf-8');
          const raw = parse(content);
          if (!raw) continue;

          const profile: DeviceProfile = {
            brand: raw.brand ?? brand,
            device: raw.device ?? file.replace(/\.ya?ml$/, ''),
            cc: [],
          };

          if (Array.isArray(raw.cc)) {
            for (const entry of raw.cc) {
              if (entry.number !== undefined) {
                profile.cc.push({
                  name: entry.name ?? '',
                  number: entry.number,
                  type: entry.type ?? 'CC',
                  min: entry.min ?? 0,
                  max: entry.max ?? 127,
                });
              }
            }
          }

          if (profile.cc.length > 0) {
            db.devices.push(profile);
          }
        } catch {
          // Skip unparseable files
        }
      }
    }

    return db;
  }

  search(query: string): DeviceProfile[] {
    const q = query.toLowerCase();
    return this.devices.filter((d) => {
      const haystack = `${d.brand} ${d.device}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  getDeviceCount(): number {
    return this.devices.length;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/devices.test.ts
```

Expected: all PASS

- [ ] **Step 6: Write integration test for OpenMIDI loading (optional, requires submodule)**

Add to `src/devices.test.ts`:

```typescript
import { join } from 'node:path';
import { existsSync } from 'node:fs';

describe('DeviceDatabase.loadFromOpenMIDI', () => {
  const openMidiPath = join(process.cwd(), 'openmidi');

  it('loads devices from OpenMIDI submodule if available', () => {
    if (!existsSync(join(openMidiPath, 'data', 'brands'))) {
      console.log('Skipping: OpenMIDI submodule not initialized');
      return;
    }
    const db = DeviceDatabase.loadFromOpenMIDI(openMidiPath);
    expect(db.getDeviceCount()).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 7: Run all tests**

```bash
npx vitest run src/devices.test.ts
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/devices.ts src/devices.test.ts
git commit -m "feat: add OpenMIDI device database with search"
```

---

## Chunk 4: MCP Integration

### Task 9: MCP Tool Definitions

**Files:**
- Create: `src/tools.ts`

Registers all MCP tools that Claude can call. Each tool wraps the commands layer and adds input validation via zod schemas.

**Important:** MCP servers using stdio must NEVER use `console.log()` — it corrupts JSON-RPC on stdout. Use `console.error()` for debug logging.

- [ ] **Step 1: Implement all MCP tools**

Create `src/tools.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MidiConnection } from './midi.js';
import { MorningstarController, ActionType, ToggleType, MessageType } from './commands.js';
import { getModel, resolvePreset, getAllModels } from './models.js';
import { DeviceDatabase } from './devices.js';
import { ShadowState } from './state.js';
import { loadSetupConfig, SetupConfig } from './config.js';

const ACTION_NAMES: Record<string, ActionType> = {
  nothing: ActionType.NOTHING,
  press: ActionType.PRESS,
  release: ActionType.RELEASE,
  long_press: ActionType.LONG_PRESS,
  long_press_release: ActionType.LONG_PRESS_RELEASE,
  double_tap: ActionType.DOUBLE_TAP,
  double_tap_release: ActionType.DOUBLE_TAP_RELEASE,
  double_tap_long: ActionType.DOUBLE_TAP_LONG,
  double_tap_long_release: ActionType.DOUBLE_TAP_LONG_RELEASE,
  release_all: ActionType.RELEASE_ALL,
  long_press_scroll: ActionType.LONG_PRESS_SCROLL,
  on_disengage: ActionType.ON_DISENGAGE,
  on_first_engage: ActionType.ON_FIRST_ENGAGE,
};

const TOGGLE_NAMES: Record<string, ToggleType> = {
  pos_1: ToggleType.POS_1,
  pos_2: ToggleType.POS_2,
  both: ToggleType.BOTH,
  shift: ToggleType.SHIFT,
};

async function navigateToBank(
  controller: MorningstarController,
  deviceId: number,
  targetBank: number,
): Promise<void> {
  // Sequential bank up/down — shortest path
  // This is a simplification; full implementation would track current bank
  // For now, navigate from bank 0 using bank up
  for (let i = 0; i < targetBank; i++) {
    await controller.bankUp(deviceId);
  }
}

export function registerTools(
  server: McpServer,
  midi: MidiConnection,
  controller: MorningstarController,
  deviceDb: DeviceDatabase,
  state: ShadowState,
) {
  let connectedDeviceId: number | null = null;
  let connectedModelName: string | null = null;
  let currentBank = 0;
  const config = loadSetupConfig();

  server.tool(
    'connect',
    {
      port_name: z.string().optional().describe('MIDI port name to connect to. Auto-detects Morningstar if omitted.'),
    },
    async ({ port_name }) => {
      const portName = await midi.connect(port_name);

      // Try to identify the controller
      // We need to try all known device IDs since we don't know which one is connected
      let info = null;
      for (const model of getAllModels()) {
        try {
          info = await controller.getControllerInfo(model.deviceId);
          break;
        } catch {
          continue;
        }
      }

      if (!info) {
        return { content: [{ type: 'text' as const, text: `Connected to ${portName} but could not identify controller model.` }] };
      }

      connectedDeviceId = info.modelId;
      connectedModelName = info.modelName;
      currentBank = 0;

      return {
        content: [{
          type: 'text' as const,
          text: `Connected to ${info.modelName} (firmware ${info.firmwareVersion}) on ${portName}. ${info.messagesPerPreset} message slots per preset.`,
        }],
      };
    },
  );

  server.tool(
    'get_controller_info',
    {},
    async () => {
      if (!connectedDeviceId) {
        return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
      }
      const info = await controller.getControllerInfo(connectedDeviceId);
      const model = getModel(connectedDeviceId);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            model: info.modelName,
            firmware: info.firmwareVersion,
            messagesPerPreset: info.messagesPerPreset,
            banks: model?.banks ?? 'unknown',
            presetsPerBank: model?.presets ?? 'unknown',
            nameLength: model?.nameLength,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'get_preset',
    {
      preset: z.string().describe('Preset identifier: switch letter (A-H) or position (top-left, bottom-right, etc.)'),
    },
    async ({ preset }) => {
      if (!connectedDeviceId || !connectedModelName) {
        return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
      }

      const presetIndex = resolvePreset(preset, connectedModelName);
      if (presetIndex === undefined) {
        return { content: [{ type: 'text' as const, text: `Unknown preset "${preset}" for ${connectedModelName}. Use switch letters (A-H) or positions (top-left, bottom-right, etc.).` }] };
      }

      const [shortName, toggleName, longName] = await Promise.all([
        controller.getPresetName(connectedDeviceId, presetIndex, 'short'),
        controller.getPresetName(connectedDeviceId, presetIndex, 'toggle'),
        controller.getPresetName(connectedDeviceId, presetIndex, 'long'),
      ]);

      const localMessages = state.getPresetMessages(currentBank, presetIndex);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            preset: preset.toUpperCase(),
            index: presetIndex,
            bank: currentBank,
            shortName,
            toggleName,
            longName,
            messages: localMessages.length > 0 ? localMessages : '(no messages tracked — only messages written by this tool are visible)',
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'set_preset_message',
    {
      preset: z.string().describe('Preset identifier: switch letter (A-H) or position (top-left, bottom-right)'),
      action: z.string().describe('Action type: press, release, long_press, double_tap, etc.'),
      type: z.enum(['CC', 'PC']).describe('Message type: CC or PC'),
      cc_number: z.number().int().min(0).max(127).optional().describe('CC number (0-127). Required if type=CC.'),
      cc_value: z.number().int().min(0).max(127).optional().describe('CC value (0-127). Required if type=CC.'),
      pc_number: z.number().int().min(0).max(127).optional().describe('PC number (0-127). Required if type=PC.'),
      channel: z.number().int().min(0).max(15).describe('MIDI channel (0-15, where 0 = channel 1)'),
      toggle: z.string().optional().describe('Toggle position: pos_1, pos_2, both (default), shift'),
      slot: z.number().int().min(0).max(15).optional().describe('Message slot (0-15). Auto-assigns if omitted.'),
      description: z.string().optional().describe('Human-readable description of what this message does'),
      force: z.boolean().optional().describe('Set to true to overwrite an existing message in the slot'),
    },
    async ({ preset, action, type, cc_number, cc_value, pc_number, channel, toggle, slot, description, force }) => {
      if (!connectedDeviceId || !connectedModelName) {
        return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
      }

      const presetIndex = resolvePreset(preset, connectedModelName);
      if (presetIndex === undefined) {
        return { content: [{ type: 'text' as const, text: `Unknown preset "${preset}" for ${connectedModelName}.` }] };
      }

      const actionType = ACTION_NAMES[action.toLowerCase()];
      if (actionType === undefined) {
        return { content: [{ type: 'text' as const, text: `Unknown action "${action}". Use: ${Object.keys(ACTION_NAMES).join(', ')}` }] };
      }

      const toggleType = TOGGLE_NAMES[(toggle ?? 'both').toLowerCase()] ?? ToggleType.BOTH;
      const messageSlot = slot ?? state.firstUnusedSlot(currentBank, presetIndex);

      if (messageSlot === -1) {
        return { content: [{ type: 'text' as const, text: 'All 16 message slots are occupied for this preset.' }] };
      }

      // Check for conflicts
      if (!force) {
        const conflict = state.checkConflict(currentBank, presetIndex, messageSlot);
        if (conflict) {
          return {
            content: [{
              type: 'text' as const,
              text: `Slot ${messageSlot} on preset ${preset.toUpperCase()} already has: ${conflict.description} (${conflict.type} #${conflict.ccNumber ?? conflict.pcNumber}, ${conflict.action}). Set force=true to overwrite, or use a different slot.`,
            }],
          };
        }
      }

      const msgType = type === 'CC' ? MessageType.CC : MessageType.PC;

      await controller.setPresetMessage(connectedDeviceId, {
        preset: presetIndex,
        messageSlot,
        type: msgType,
        action: actionType,
        toggle: toggleType,
        channel,
        ccNumber: cc_number,
        ccValue: cc_value,
        pcNumber: pc_number,
      });

      const storedMessage = {
        slot: messageSlot,
        type: type as 'CC' | 'PC',
        action,
        toggle: toggle ?? 'both',
        channel,
        ccNumber: cc_number,
        ccValue: cc_value,
        pcNumber: pc_number,
        description: description ?? `${type} #${cc_number ?? pc_number}`,
      };

      state.recordMessage(currentBank, presetIndex, storedMessage);
      state.save();

      return {
        content: [{
          type: 'text' as const,
          text: `Programmed preset ${preset.toUpperCase()} slot ${messageSlot}: ${action} → ${type} #${cc_number ?? pc_number} (channel ${channel + 1}). ${description ?? ''}`,
        }],
      };
    },
  );

  server.tool(
    'set_preset_name',
    {
      preset: z.string().describe('Preset identifier: switch letter (A-H) or position'),
      name: z.string().describe('New name for the preset'),
      name_type: z.enum(['short', 'toggle', 'long']).optional().describe('Which name to set (default: short)'),
    },
    async ({ preset, name, name_type }) => {
      if (!connectedDeviceId || !connectedModelName) {
        return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
      }

      const presetIndex = resolvePreset(preset, connectedModelName);
      if (presetIndex === undefined) {
        return { content: [{ type: 'text' as const, text: `Unknown preset "${preset}" for ${connectedModelName}.` }] };
      }

      const type = name_type ?? 'short';
      const model = getModel(connectedDeviceId);
      const maxLen = model?.nameLength[type === 'long' ? 'long' : 'short'] ?? 32;
      const truncated = name.length > maxLen;

      await controller.setPresetName(connectedDeviceId, presetIndex, type, name);

      let text = `Set ${type} name of preset ${preset.toUpperCase()} to "${name.slice(0, maxLen)}"`;
      if (truncated) {
        text += ` (truncated from ${name.length} to ${maxLen} characters)`;
      }

      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.tool(
    'get_bank_name',
    {
      bank: z.number().int().min(0).optional().describe('Bank number to navigate to. Uses current bank if omitted.'),
    },
    async ({ bank }) => {
      if (!connectedDeviceId) {
        return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
      }
      if (bank !== undefined) {
        await navigateToBank(controller, connectedDeviceId, bank);
      }
      const name = await controller.getBankName(connectedDeviceId);
      return {
        content: [{
          type: 'text' as const,
          text: `Bank ${currentBank}: "${name}"`,
        }],
      };
    },
  );

  server.tool(
    'set_bank_name',
    {
      name: z.string().describe('New name for the bank'),
      bank: z.number().int().min(0).optional().describe('Bank number to navigate to. Uses current bank if omitted.'),
    },
    async ({ name, bank }) => {
      if (!connectedDeviceId) {
        return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
      }
      if (bank !== undefined) {
        await navigateToBank(controller, connectedDeviceId, bank);
      }
      await controller.setBankName(connectedDeviceId, name);
      return {
        content: [{
          type: 'text' as const,
          text: `Renamed bank ${currentBank} to "${name}"`,
        }],
      };
    },
  );

  server.tool(
    'display_message',
    {
      text: z.string().max(20).describe('Text to display on the controller LCD (max 20 chars)'),
      duration_ms: z.number().int().min(100).max(12700).optional().describe('Display duration in ms (default 2000)'),
    },
    async ({ text, duration_ms }) => {
      if (!connectedDeviceId) {
        return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
      }
      await controller.displayMessage(connectedDeviceId, text, duration_ms ?? 2000);
      return { content: [{ type: 'text' as const, text: `Displayed "${text}" on controller LCD` }] };
    },
  );

  server.tool(
    'lookup_device',
    {
      device_name: z.string().describe('Device name to search for in the MIDI database (e.g., "Quad Cortex", "Timeline", "HX Stomp")'),
    },
    async ({ device_name }) => {
      const results = deviceDb.search(device_name);

      if (results.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No device found matching "${device_name}". Try a different name or specify raw CC/PC values directly.`,
          }],
        };
      }

      const output = results.slice(0, 5).map((d) => ({
        brand: d.brand,
        device: d.device,
        cc_mappings: d.cc.map((c) => `${c.name}: CC#${c.number} (${c.min}-${c.max})`),
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(output, null, 2),
        }],
      };
    },
  );
}
```

- [ ] **Step 2: Write tests for MCP tools**

Create `src/tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';
import { MorningstarController } from './commands.js';
import { DeviceDatabase } from './devices.js';
import { ShadowState } from './state.js';
import { buildSysExMessage } from './protocol.js';

function createMockMidi() {
  return {
    isConnected: vi.fn(() => true),
    sendAndReceive: vi.fn(),
    send: vi.fn(),
    connect: vi.fn().mockResolvedValue('Morningstar MC8 Pro'),
    disconnect: vi.fn(),
    listPorts: vi.fn(),
    checkConnection: vi.fn().mockResolvedValue(true),
  };
}

// Capture registered tools by intercepting server.tool()
function createToolCapture() {
  const tools: Record<string, { schema: any; handler: Function }> = {};
  const server = {
    tool: vi.fn((name: string, schema: any, handler: Function) => {
      tools[name] = { schema, handler };
    }),
  };
  return { server: server as unknown as McpServer, tools };
}

describe('MCP Tools', () => {
  let mockMidi: ReturnType<typeof createMockMidi>;
  let controller: MorningstarController;
  let deviceDb: DeviceDatabase;
  let state: ShadowState;
  let tools: Record<string, { schema: any; handler: Function }>;

  beforeEach(() => {
    mockMidi = createMockMidi();
    controller = new MorningstarController(mockMidi as any);
    deviceDb = DeviceDatabase.fromMap(new Map([
      ['neural-dsp/quad-cortex', {
        brand: 'Neural DSP',
        device: 'Quad Cortex',
        cc: [{ name: 'Tuner', number: 49, type: 'CC', min: 0, max: 127 }],
      }],
    ]));
    state = new ShadowState();

    const capture = createToolCapture();
    registerTools(capture.server, mockMidi as any, controller, deviceDb, state);
    tools = capture.tools;
  });

  it('registers all expected tools', () => {
    const names = Object.keys(tools);
    expect(names).toContain('connect');
    expect(names).toContain('get_controller_info');
    expect(names).toContain('get_preset');
    expect(names).toContain('set_preset_message');
    expect(names).toContain('set_preset_name');
    expect(names).toContain('get_bank_name');
    expect(names).toContain('set_bank_name');
    expect(names).toContain('lookup_device');
    expect(names).toContain('display_message');
  });

  it('lookup_device returns CC mappings', async () => {
    const result = await tools['lookup_device'].handler({ device_name: 'Quad Cortex' });
    const text = result.content[0].text;
    expect(text).toContain('Tuner');
    expect(text).toContain('49');
  });

  it('lookup_device returns not found for unknown device', async () => {
    const result = await tools['lookup_device'].handler({ device_name: 'Unknown' });
    expect(result.content[0].text).toContain('No device found');
  });

  it('set_preset_message detects conflicts', async () => {
    // Simulate connected state by calling connect first
    const infoResponse = buildSysExMessage({
      deviceId: 0x08, op2: 0x32, op3: 0, op4: 0, op5: 0, op6: 0, op7: 0,
      transactionId: 0, payload: [0x08, 0x03, 0x00, 0x02, 0x00, 0x10, 0x20, 0x20, 0x20],
    });
    mockMidi.sendAndReceive.mockResolvedValue(infoResponse);
    await tools['connect'].handler({});

    // Record existing message in state
    state.recordMessage(0, 4, {
      slot: 0, type: 'CC', action: 'press', toggle: 'both',
      ccNumber: 80, ccValue: 127, channel: 0, description: 'Effect On',
    });

    const result = await tools['set_preset_message'].handler({
      preset: 'E', action: 'press', type: 'CC',
      cc_number: 49, cc_value: 0, channel: 0, slot: 0,
    });

    expect(result.content[0].text).toContain('already has');
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
npx vitest run src/tools.test.ts
```

Expected: all PASS

- [ ] **Step 4: Verify full build compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add MCP tool definitions for all MVP tools"
```

---

### Task 10: Entry Point and Wiring

**Files:**
- Modify: `src/index.ts`

Wire everything together: create MCP server, initialize MIDI, load OpenMIDI, register tools, start stdio transport.

- [ ] **Step 1: Implement the entry point**

Update `src/index.ts`:

```typescript
#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { MidiConnection } from './midi.js';
import { MorningstarController } from './commands.js';
import { DeviceDatabase } from './devices.js';
import { ShadowState } from './state.js';
import { registerTools } from './tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  // Initialize MCP server
  const server = new McpServer({
    name: 'morningstar-mcp',
    version: '0.1.0',
  });

  // Initialize layers
  const midi = new MidiConnection();
  const controller = new MorningstarController(midi);

  // Load OpenMIDI device database
  const openMidiPath = join(__dirname, '..', 'openmidi');
  const deviceDb = DeviceDatabase.loadFromOpenMIDI(openMidiPath);
  console.error(`Loaded ${deviceDb.getDeviceCount()} device profiles from OpenMIDI`);

  // Load shadow state
  const state = ShadowState.load();

  // Register all tools
  registerTools(server, midi, controller, deviceDb, state);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Morningstar MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify full build**

```bash
npx tsc
```

Expected: no errors, output in `build/`

- [ ] **Step 3: Verify the binary has correct shebang**

```bash
head -1 build/index.js
```

Expected: `#!/usr/bin/env node`

- [ ] **Step 4: Make the binary executable**

```bash
chmod +x build/index.js
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: add entry point wiring MCP server with all layers"
```

---

### Task 11: Final Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Full clean build**

```bash
rm -rf build && npx tsc
```

Expected: no errors

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 3: Test server starts without MIDI hardware**

```bash
echo '{}' | timeout 2 node build/index.js 2>&1 || true
```

Expected: server starts, logs "Morningstar MCP server running on stdio" to stderr, then exits on stdin close. Should NOT crash.

- [ ] **Step 4: Verify npm packaging**

```bash
npm pack --dry-run
```

Expected: lists all expected files, no unexpected files

- [ ] **Step 5: Add Claude Desktop config example to setup.yaml.example**

Append to `setup.yaml.example`:

```yaml
# Claude Desktop configuration (~/.claude/claude_desktop_config.json):
# {
#   "mcpServers": {
#     "morningstar": {
#       "command": "npx",
#       "args": ["morningstar-mcp"]
#     }
#   }
# }
```

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "build: verify full build and test suite"
```

---

## Post-MVP Next Steps (not part of this plan)

1. **Hardware testing:** Connect MC8 Pro, test connect/get_controller_info/set_preset_message end-to-end
2. **Checksum verification:** Confirm exact byte range against hardware responses
3. **Bank navigation:** Add navigateToBank() using sequential bank up/down
4. **Backup/restore:** Verify undocumented bulk-dump commands on hardware
5. **Expression pedal support**
6. **LED color customization** (Pro-only)
7. **npm publish** and Claude Desktop configuration example
