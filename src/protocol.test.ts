import { describe, it, expect } from 'vitest';
import { calculateChecksum, buildSysExMessage, parseSysExResponse, nameToBytes, bytesToName, SYSEX_START, SYSEX_END } from './protocol.js';

describe('calculateChecksum', () => {
  it('XORs bytes from index 1 to end and masks with 0x7F', () => {
    const messageWithoutChecksumAndF7 = [
      0xF0, 0x00, 0x21, 0x24, 0x08, 0x00, 0x70, 0x32,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    const result = calculateChecksum(messageWithoutChecksumAndF7);
    // 00^21=21, 21^24=05, 05^08=0D, 0D^00=0D, 0D^70=7D, 7D^32=4F, rest 00 → 4F & 7F = 4F
    expect(result).toBe(0x4F);
  });

  it('result is always <= 0x7F', () => {
    const message = [0xF0, 0x7F, 0x7F];
    const result = calculateChecksum(message);
    expect(result).toBeLessThanOrEqual(0x7F);
  });
});

describe('buildSysExMessage', () => {
  it('builds a complete SysEx message with correct structure', () => {
    const msg = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x32,
      op3: 0x00, op4: 0x00, op5: 0x00, op6: 0x00, op7: 0x00,
      transactionId: 0x01,
      payload: [],
    });
    expect(msg[0]).toBe(SYSEX_START);
    expect(msg[1]).toBe(0x00);
    expect(msg[2]).toBe(0x21);
    expect(msg[3]).toBe(0x24);
    expect(msg[4]).toBe(0x08);
    expect(msg[5]).toBe(0x00);
    expect(msg[6]).toBe(0x70);
    expect(msg[7]).toBe(0x32);
    expect(msg[13]).toBe(0x01);
    expect(msg[msg.length - 1]).toBe(SYSEX_END);
  });

  it('includes payload bytes', () => {
    const msg = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x01, op3: 0x00, op4: 0x7F, op5: 0x00, op6: 0x00, op7: 0x00,
      transactionId: 0x00,
      payload: [0x54, 0x55, 0x4E, 0x45, 0x52], // "TUNER"
    });
    expect(msg[16]).toBe(0x54);
    expect(msg[17]).toBe(0x55);
    expect(msg[20]).toBe(0x52);
  });

  it('calculates correct checksum', () => {
    const msg = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x32,
      op3: 0x00, op4: 0x00, op5: 0x00, op6: 0x00, op7: 0x00,
      transactionId: 0x00,
      payload: [],
    });
    const bytesForChecksum = msg.slice(0, -2);
    const expectedChecksum = calculateChecksum(bytesForChecksum);
    expect(msg[msg.length - 2]).toBe(expectedChecksum);
  });
});

describe('parseSysExResponse', () => {
  it('parses a valid response', () => {
    const response = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x32, op3: 0x00, op4: 0x00, op5: 0x00, op6: 0x00, op7: 0x00,
      transactionId: 0x01,
      payload: [0x08, 0x03, 0x00, 0x02, 0x00, 0x10, 0x20, 0x20, 0x20],
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
      op2: 0x7F, op3: 0x01, op4: 0x00, op5: 0x00, op6: 0x00, op7: 0x00,
      transactionId: 0x01,
      payload: [],
    });
    const parsed = parseSysExResponse(response);
    expect(parsed.error).toBe('WRONG_MODEL_ID');
  });

  it('detects invalid checksum', () => {
    const response = buildSysExMessage({
      deviceId: 0x08,
      op2: 0x32, op3: 0x00, op4: 0x00, op5: 0x00, op6: 0x00, op7: 0x00,
      transactionId: 0x00,
      payload: [],
    });
    response[response.length - 2] = 0x00; // corrupt
    const parsed = parseSysExResponse(response);
    expect(parsed.error).toBe('INVALID_CHECKSUM');
  });

  it('detects non-Morningstar messages', () => {
    const response = [0xF0, 0x7E, 0x00, 0x00, 0xF7];
    const parsed = parseSysExResponse(response);
    expect(parsed.error).toBe('NOT_MORNINGSTAR');
  });
});

describe('nameToBytes / bytesToName', () => {
  it('converts ASCII string to byte array', () => {
    expect(nameToBytes('TUNER')).toEqual([0x54, 0x55, 0x4E, 0x45, 0x52]);
  });

  it('converts byte array to ASCII string', () => {
    expect(bytesToName([0x54, 0x55, 0x4E, 0x45, 0x52])).toBe('TUNER');
  });

  it('strips trailing null bytes', () => {
    expect(bytesToName([0x54, 0x55, 0x4E, 0x00, 0x00])).toBe('TUN');
  });

  it('truncates name to maxLength', () => {
    expect(nameToBytes('THIS IS A VERY LONG NAME', 8)).toHaveLength(8);
  });
});
