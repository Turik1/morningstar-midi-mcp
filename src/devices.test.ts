import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceDatabase } from './devices.js';

describe('DeviceDatabase', () => {
  let db: DeviceDatabase;

  const testData = new Map([
    ['neural-dsp/quad-cortex', {
      brand: 'Neural DSP',
      device: 'Quad Cortex',
      cc: [
        { name: 'Tuner', value: 49, min: 0, max: 127 },
        { name: 'Scene 1', value: 43, min: 0, max: 0 },
      ],
    }],
    ['strymon/timeline', {
      brand: 'Strymon',
      device: 'Timeline',
      cc: [
        { name: 'Tap Tempo', value: 93, min: 0, max: 127 },
        { name: 'Bypass/Engage', value: 102, min: 0, max: 127 },
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
  });

  it('returns empty for unknown device', () => {
    expect(db.search('Unknown Device')).toHaveLength(0);
  });

  it('returns CC mappings for a device', () => {
    const results = db.search('Quad Cortex');
    expect(results[0].cc).toHaveLength(2);
    expect(results[0].cc[0].name).toBe('Tuner');
    expect(results[0].cc[0].value).toBe(49);
  });

  it('reports device count', () => {
    expect(db.getDeviceCount()).toBe(2);
  });
});

// Integration test — only runs if OpenMIDI submodule is present
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

    // Verify a known device exists
    const qc = db.search('Quad Cortex');
    expect(qc.length).toBeGreaterThanOrEqual(1);
  });
});
