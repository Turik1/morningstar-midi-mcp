import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MorningstarController, ActionType, ToggleType, MessageType } from './commands.js';
import { buildSysExMessage } from './protocol.js';

function createMockMidi() {
  return {
    isConnected: vi.fn(() => true),
    sendAndReceive: vi.fn(),
    send: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    listPorts: vi.fn(),
    checkConnection: vi.fn(),
  };
}

describe('MorningstarController', () => {
  let mockMidi: ReturnType<typeof createMockMidi>;
  let controller: MorningstarController;

  beforeEach(() => {
    mockMidi = createMockMidi();
    controller = new MorningstarController(mockMidi as any);
  });

  describe('getControllerInfo', () => {
    it('sends Op2=0x32 and parses the 9-byte response', async () => {
      const responsePayload = [0x08, 0x03, 0x00, 0x02, 0x00, 0x10, 0x20, 0x20, 0x20];
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x32, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: responsePayload,
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      const info = await controller.getControllerInfo(0x08);
      expect(info.modelId).toBe(0x08);
      expect(info.modelName).toBe('MC8 Pro');
      expect(info.firmwareVersion).toBe('3.0.2.0');
      expect(info.messagesPerPreset).toBe(16);
    });
  });

  describe('getPresetName', () => {
    it('sends Op2=0x21 and returns the name', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x21, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [0x54, 0x55, 0x4E, 0x45, 0x52],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      const name = await controller.getPresetName(0x08, 0, 'short');
      expect(name).toBe('TUNER');
    });
  });

  describe('setPresetName', () => {
    it('sends Op2=0x01 with name payload and save flag', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x7F, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      await controller.setPresetName(0x08, 0, 'short', 'TUNER');

      expect(mockMidi.sendAndReceive).toHaveBeenCalledOnce();
      const sentMessage = mockMidi.sendAndReceive.mock.calls[0][0];
      expect(sentMessage[7]).toBe(0x01); // Op2 = update short name
      expect(sentMessage[8]).toBe(0x00); // Op3 = preset 0 (A)
      expect(sentMessage[9]).toBe(0x7F); // Op4 = save
    });
  });

  describe('setPresetMessage', () => {
    it('sends Op2=0x04 with CC message payload', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x7F, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      await controller.setPresetMessage(0x08, {
        preset: 4,
        messageSlot: 0,
        type: MessageType.CC,
        action: ActionType.LONG_PRESS,
        toggle: ToggleType.BOTH,
        ccNumber: 49,
        ccValue: 0,
        channel: 0,
      });

      expect(mockMidi.sendAndReceive).toHaveBeenCalledOnce();
      const sentMessage = mockMidi.sendAndReceive.mock.calls[0][0];
      expect(sentMessage[7]).toBe(0x04);  // Op2
      expect(sentMessage[8]).toBe(4);     // Op3 = preset E
      expect(sentMessage[9]).toBe(0);     // Op4 = message slot 0
      expect(sentMessage[10]).toBe(0x02); // Op5 = CC type
      expect(sentMessage[11]).toBe(0x7F); // Op6 = save
    });

    it('sends PC message with correct payload', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x7F, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      await controller.setPresetMessage(0x08, {
        preset: 0,
        messageSlot: 0,
        type: MessageType.PC,
        action: ActionType.PRESS,
        toggle: ToggleType.BOTH,
        pcNumber: 3,
        channel: 1,
      });

      const sentMessage = mockMidi.sendAndReceive.mock.calls[0][0];
      expect(sentMessage[10]).toBe(0x01); // Op5 = PC type
    });
  });

  describe('getBankName', () => {
    it('sends Op2=0x30 and returns the bank name', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x30, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [0x4C, 0x49, 0x56, 0x45],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      const name = await controller.getBankName(0x08);
      expect(name).toBe('LIVE');
    });
  });

  describe('bankUp / bankDown / togglePage', () => {
    it('bankUp sends Op2=0x00, Op3=0x00', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x7F, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      await controller.bankUp(0x08);
      const sent = mockMidi.sendAndReceive.mock.calls[0][0];
      expect(sent[7]).toBe(0x00);
      expect(sent[8]).toBe(0x00);
    });

    it('bankDown sends Op3=0x01', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x7F, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      await controller.bankDown(0x08);
      const sent = mockMidi.sendAndReceive.mock.calls[0][0];
      expect(sent[8]).toBe(0x01);
    });

    it('togglePage sends Op3=0x02', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x7F, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      await controller.togglePage(0x08);
      const sent = mockMidi.sendAndReceive.mock.calls[0][0];
      expect(sent[8]).toBe(0x02);
    });
  });

  describe('displayMessage', () => {
    it('sends Op2=0x11 with text payload', async () => {
      const response = buildSysExMessage({
        deviceId: 0x08, op2: 0x7F, op3: 0x00, op4: 0x00,
        op5: 0x00, op6: 0x00, op7: 0x00, transactionId: 0x00,
        payload: [],
      });
      mockMidi.sendAndReceive.mockResolvedValue(response);

      await controller.displayMessage(0x08, 'Config saved', 2000);
      const sent = mockMidi.sendAndReceive.mock.calls[0][0];
      expect(sent[7]).toBe(0x11);
    });
  });
});
