import { describe, it, expect, beforeEach } from 'vitest';
import { ShadowState } from './state.js';

describe('ShadowState', () => {
  let state: ShadowState;

  beforeEach(() => {
    state = new ShadowState();
  });

  it('starts empty', () => {
    const messages = state.getPresetMessages(0, 0);
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
      slot: 0, type: 'CC', action: 'PRESS', toggle: 'BOTH',
      ccNumber: 80, ccValue: 127, channel: 0, description: 'Effect On',
    });
    const conflict = state.checkConflict(0, 0, 0);
    expect(conflict).toBeDefined();
    expect(conflict!.ccNumber).toBe(80);
  });

  it('returns no conflict for empty slot', () => {
    expect(state.checkConflict(0, 0, 5)).toBeUndefined();
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

  it('replaces message in same slot', () => {
    state.recordMessage(0, 0, {
      slot: 0, type: 'CC', action: 'PRESS', toggle: 'BOTH',
      ccNumber: 80, ccValue: 127, channel: 0, description: 'Old',
    });
    state.recordMessage(0, 0, {
      slot: 0, type: 'CC', action: 'PRESS', toggle: 'BOTH',
      ccNumber: 49, ccValue: 0, channel: 0, description: 'New',
    });
    const messages = state.getPresetMessages(0, 0);
    expect(messages).toHaveLength(1);
    expect(messages[0].description).toBe('New');
  });
});
