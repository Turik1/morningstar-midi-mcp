import { MidiConnection } from './midi.js';
import { buildSysExMessage, parseSysExResponse, nameToBytes, bytesToName } from './protocol.js';
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

const NAME_TYPE_OP2_WRITE: Record<NameType, number> = { short: 0x01, toggle: 0x02, long: 0x03 };
const NAME_TYPE_OP2_READ: Record<NameType, number> = { short: 0x21, toggle: 0x22, long: 0x23 };

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
    deviceId: number, op2: number, op3 = 0, op4 = 0, op5 = 0, op6 = 0, op7 = 0, payload: number[] = [],
  ) {
    const txnId = this.nextTransactionId();
    const message = buildSysExMessage({ deviceId, op2, op3, op4, op5, op6, op7, transactionId: txnId, payload });
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
      payload = [params.action, params.toggle, params.pcNumber ?? 0, params.channel];
    } else {
      payload = [params.action, params.toggle, params.ccNumber ?? 0, params.ccValue ?? 0, params.channel];
    }
    await this.sendCommand(deviceId, 0x04, params.preset, params.messageSlot, params.type, 0x7F, 0, payload);
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
