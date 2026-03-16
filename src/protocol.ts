export const MANUFACTURER_ID = [0x00, 0x21, 0x24] as const;
export const SYSEX_START = 0xF0;
export const SYSEX_END = 0xF7;
export const OPCODE_1 = 0x70;

export function calculateChecksum(messageWithoutChecksumAndEnd: number[]): number {
  let checksum = 0;
  for (let i = 1; i < messageWithoutChecksumAndEnd.length; i++) {
    checksum ^= messageWithoutChecksumAndEnd[i];
  }
  return checksum & 0x7F;
}

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
    0x00,
    OPCODE_1,
    params.op2,
    params.op3,
    params.op4,
    params.op5,
    params.op6,
    params.op7,
    params.transactionId,
    0x00,
    0x00,
    ...params.payload,
  ];
  const checksum = calculateChecksum(message);
  message.push(checksum);
  message.push(SYSEX_END);
  return message;
}

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
  if (data[0] !== SYSEX_START || data[data.length - 1] !== SYSEX_END) {
    return { deviceId: 0, op2: 0, op3: 0, op4: 0, op5: 0, op6: 0, op7: 0, transactionId: 0, payload: [], error: 'INVALID_SYSEX' };
  }
  if (data[1] !== MANUFACTURER_ID[0] || data[2] !== MANUFACTURER_ID[1] || data[3] !== MANUFACTURER_ID[2]) {
    return { deviceId: 0, op2: 0, op3: 0, op4: 0, op5: 0, op6: 0, op7: 0, transactionId: 0, payload: [], error: 'NOT_MORNINGSTAR' };
  }
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
    payload: data.slice(16, -2),
  };
  if (response.op2 === 0x7F && response.op3 !== 0x00) {
    response.error = ERROR_CODES[response.op3] ?? `UNKNOWN_ERROR_${response.op3}`;
  }
  return response;
}

export function nameToBytes(name: string, maxLength?: number): number[] {
  const bytes = Array.from(name).map((c) => c.charCodeAt(0) & 0x7F);
  if (maxLength !== undefined && bytes.length > maxLength) {
    return bytes.slice(0, maxLength);
  }
  return bytes;
}

export function bytesToName(bytes: number[]): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end--;
  }
  return String.fromCharCode(...bytes.slice(0, end));
}
