import { describe, it, expect } from 'vitest';
import { MidiConnection } from './midi.js';

describe('MidiConnection', () => {
  it('can be instantiated', () => {
    const conn = new MidiConnection();
    expect(conn.isConnected()).toBe(false);
  });

  it('sendAndReceive requires connection', async () => {
    const conn = new MidiConnection();
    await expect(conn.sendAndReceive([0xF0, 0xF7])).rejects.toThrow('Not connected');
  });

  it('send requires connection', async () => {
    const conn = new MidiConnection();
    await expect(conn.send([0xF0, 0xF7])).rejects.toThrow('Not connected');
  });
});
