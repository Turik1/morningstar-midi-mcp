import { describe, it, expect } from 'vitest';
import { getModel, resolvePreset, getAllModels } from './models.js';

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

  it('getAllModels returns all 5 models', () => {
    expect(getAllModels()).toHaveLength(5);
  });
});

describe('resolvePreset', () => {
  it('resolves switch letter to preset index', () => {
    expect(resolvePreset('A', 'MC8 Pro')).toBe(0);
    expect(resolvePreset('E', 'MC8 Pro')).toBe(4);
    expect(resolvePreset('H', 'MC8 Pro')).toBe(7);
  });

  it('resolves positional aliases for MC8 Pro', () => {
    expect(resolvePreset('top-left', 'MC8 Pro')).toBe(0);
    expect(resolvePreset('top-right', 'MC8 Pro')).toBe(3);
    expect(resolvePreset('bottom-left', 'MC8 Pro')).toBe(4);
    expect(resolvePreset('bottom-right', 'MC8 Pro')).toBe(7);
  });

  it('resolves MC6 Pro positions', () => {
    expect(resolvePreset('top-left', 'MC6 Pro')).toBe(0);
    expect(resolvePreset('bottom-right', 'MC6 Pro')).toBe(5);
  });

  it('resolves MC3 positions', () => {
    expect(resolvePreset('left', 'MC3')).toBe(0);
    expect(resolvePreset('middle', 'MC3')).toBe(1);
    expect(resolvePreset('right', 'MC3')).toBe(2);
  });

  it('is case-insensitive', () => {
    expect(resolvePreset('a', 'MC8 Pro')).toBe(0);
    expect(resolvePreset('Top-Left', 'MC8 Pro')).toBe(0);
  });

  it('returns undefined for invalid preset', () => {
    expect(resolvePreset('Z', 'MC8 Pro')).toBeUndefined();
    expect(resolvePreset('bottom-left', 'MC3')).toBeUndefined();
  });
});
