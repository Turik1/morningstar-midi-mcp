#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MidiConnection } from './midi.js';
import { MorningstarController } from './commands.js';
import { DeviceDatabase } from './devices.js';
import { ShadowState } from './state.js';
import { registerTools } from './tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const server = new McpServer({
    name: 'morningstar-mcp',
    version: '0.1.0',
  });

  const midi = new MidiConnection();
  const controller = new MorningstarController(midi);

  const openMidiPath = join(__dirname, '..', 'openmidi');
  const deviceDb = DeviceDatabase.loadFromOpenMIDI(openMidiPath);
  console.error(`Loaded ${deviceDb.getDeviceCount()} device profiles from OpenMIDI`);

  const state = ShadowState.load();

  registerTools(server, midi, controller, deviceDb, state);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Morningstar MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
