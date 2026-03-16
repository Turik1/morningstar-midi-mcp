import { describe, it, expect } from 'vitest';
import { parseSetupConfig } from './config.js';

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
