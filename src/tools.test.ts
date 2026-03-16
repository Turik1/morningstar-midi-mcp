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
        cc: [{ name: 'Tuner', value: 49, min: 0, max: 127 }],
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

  it('tools require connection before use', async () => {
    const result = await tools['get_controller_info'].handler({});
    expect(result.content[0].text).toContain('Not connected');
  });

  it('set_preset_message detects conflicts from shadow state', async () => {
    // First, simulate connection by calling connect
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
