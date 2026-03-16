import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MidiConnection } from './midi.js';
import { MorningstarController, ActionType, ToggleType, MessageType } from './commands.js';
import { getModel, resolvePreset, getAllModels } from './models.js';
import { DeviceDatabase } from './devices.js';
import { ShadowState } from './state.js';

const ACTION_NAMES: Record<string, ActionType> = {
  nothing: ActionType.NOTHING,
  press: ActionType.PRESS,
  release: ActionType.RELEASE,
  long_press: ActionType.LONG_PRESS,
  long_press_release: ActionType.LONG_PRESS_RELEASE,
  double_tap: ActionType.DOUBLE_TAP,
  double_tap_release: ActionType.DOUBLE_TAP_RELEASE,
  double_tap_long: ActionType.DOUBLE_TAP_LONG,
  double_tap_long_release: ActionType.DOUBLE_TAP_LONG_RELEASE,
  release_all: ActionType.RELEASE_ALL,
  long_press_scroll: ActionType.LONG_PRESS_SCROLL,
  on_disengage: ActionType.ON_DISENGAGE,
  on_first_engage: ActionType.ON_FIRST_ENGAGE,
};

const TOGGLE_NAMES: Record<string, ToggleType> = {
  pos_1: ToggleType.POS_1,
  pos_2: ToggleType.POS_2,
  both: ToggleType.BOTH,
  shift: ToggleType.SHIFT,
};

export function registerTools(
  server: McpServer,
  midi: MidiConnection,
  controller: MorningstarController,
  deviceDb: DeviceDatabase,
  state: ShadowState,
): void {
  let connectedDeviceId: number | null = null;
  let connectedModelName: string | null = null;
  let currentBank = 0;

  // TOOL: connect
  server.tool('connect', {
    port_name: z.string().optional().describe('MIDI port name. Auto-detects Morningstar if omitted.'),
  }, async ({ port_name }) => {
    const portName = await midi.connect(port_name);
    let info = null;
    for (const model of getAllModels()) {
      try {
        info = await controller.getControllerInfo(model.deviceId);
        break;
      } catch { continue; }
    }
    if (!info) {
      return { content: [{ type: 'text' as const, text: `Connected to ${portName} but could not identify controller.` }] };
    }
    connectedDeviceId = info.modelId;
    connectedModelName = info.modelName;
    currentBank = 0;
    return { content: [{ type: 'text' as const, text: `Connected to ${info.modelName} (firmware ${info.firmwareVersion}) on ${portName}. ${info.messagesPerPreset} message slots per preset.` }] };
  });

  // TOOL: get_controller_info
  server.tool('get_controller_info', {}, async () => {
    if (!connectedDeviceId) return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
    const info = await controller.getControllerInfo(connectedDeviceId);
    const model = getModel(connectedDeviceId);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          model: info.modelName,
          firmware: info.firmwareVersion,
          messagesPerPreset: info.messagesPerPreset,
          banks: model?.banks ?? 'unknown',
          presetsPerBank: model?.presets ?? 'unknown',
          nameLength: model?.nameLength,
        }, null, 2),
      }],
    };
  });

  // TOOL: get_preset
  server.tool('get_preset', {
    preset: z.string().describe('Preset: switch letter (A-H) or position (top-left, bottom-right)'),
  }, async ({ preset }) => {
    if (!connectedDeviceId || !connectedModelName) return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
    const presetIndex = resolvePreset(preset, connectedModelName);
    if (presetIndex === undefined) return { content: [{ type: 'text' as const, text: `Unknown preset "${preset}" for ${connectedModelName}.` }] };
    const [shortName, toggleName, longName] = await Promise.all([
      controller.getPresetName(connectedDeviceId, presetIndex, 'short'),
      controller.getPresetName(connectedDeviceId, presetIndex, 'toggle'),
      controller.getPresetName(connectedDeviceId, presetIndex, 'long'),
    ]);
    const localMessages = state.getPresetMessages(currentBank, presetIndex);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          preset: preset.toUpperCase(),
          index: presetIndex,
          bank: currentBank,
          shortName,
          toggleName,
          longName,
          messages: localMessages.length > 0 ? localMessages : '(no messages tracked)',
        }, null, 2),
      }],
    };
  });

  // TOOL: set_preset_message
  server.tool('set_preset_message', {
    preset: z.string().describe('Preset: switch letter (A-H) or position'),
    action: z.string().describe('Action: press, release, long_press, double_tap, etc.'),
    type: z.enum(['CC', 'PC']).describe('Message type'),
    cc_number: z.number().int().min(0).max(127).optional().describe('CC number (required if type=CC)'),
    cc_value: z.number().int().min(0).max(127).optional().describe('CC value (required if type=CC)'),
    pc_number: z.number().int().min(0).max(127).optional().describe('PC number (required if type=PC)'),
    channel: z.number().int().min(0).max(15).describe('MIDI channel (0=ch1)'),
    toggle: z.string().optional().describe('Toggle: pos_1, pos_2, both (default), shift'),
    slot: z.number().int().min(0).max(15).optional().describe('Message slot (0-15, auto if omitted)'),
    description: z.string().optional().describe('Human-readable description'),
    force: z.boolean().optional().describe('Overwrite existing slot'),
  }, async ({ preset, action, type, cc_number, cc_value, pc_number, channel, toggle, slot, description, force }) => {
    if (!connectedDeviceId || !connectedModelName) return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
    const presetIndex = resolvePreset(preset, connectedModelName);
    if (presetIndex === undefined) return { content: [{ type: 'text' as const, text: `Unknown preset "${preset}" for ${connectedModelName}.` }] };
    const actionType = ACTION_NAMES[action.toLowerCase()];
    if (actionType === undefined) return { content: [{ type: 'text' as const, text: `Unknown action "${action}". Use: ${Object.keys(ACTION_NAMES).join(', ')}` }] };
    const toggleType = TOGGLE_NAMES[(toggle ?? 'both').toLowerCase()] ?? ToggleType.BOTH;
    const messageSlot = slot ?? state.firstUnusedSlot(currentBank, presetIndex);
    if (messageSlot === -1) return { content: [{ type: 'text' as const, text: 'All 16 message slots are occupied.' }] };
    if (!force) {
      const conflict = state.checkConflict(currentBank, presetIndex, messageSlot);
      if (conflict) return { content: [{ type: 'text' as const, text: `Slot ${messageSlot} on preset ${preset.toUpperCase()} already has: ${conflict.description} (${conflict.type} #${conflict.ccNumber ?? conflict.pcNumber}, ${conflict.action}). Set force=true to overwrite.` }] };
    }
    const msgType = type === 'CC' ? MessageType.CC : MessageType.PC;
    await controller.setPresetMessage(connectedDeviceId, {
      preset: presetIndex,
      messageSlot,
      type: msgType,
      action: actionType,
      toggle: toggleType,
      channel,
      ccNumber: cc_number,
      ccValue: cc_value,
      pcNumber: pc_number,
    });
    state.recordMessage(currentBank, presetIndex, {
      slot: messageSlot,
      type: type as 'CC' | 'PC',
      action,
      toggle: toggle ?? 'both',
      channel,
      ccNumber: cc_number,
      ccValue: cc_value,
      pcNumber: pc_number,
      description: description ?? `${type} #${cc_number ?? pc_number}`,
    });
    state.save();
    return { content: [{ type: 'text' as const, text: `Programmed preset ${preset.toUpperCase()} slot ${messageSlot}: ${action} → ${type} #${cc_number ?? pc_number} (channel ${channel + 1}). ${description ?? ''}` }] };
  });

  // TOOL: set_preset_name
  server.tool('set_preset_name', {
    preset: z.string().describe('Preset identifier'),
    name: z.string().describe('New name'),
    name_type: z.enum(['short', 'toggle', 'long']).optional().describe('Name type (default: short)'),
  }, async ({ preset, name, name_type }) => {
    if (!connectedDeviceId || !connectedModelName) return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
    const presetIndex = resolvePreset(preset, connectedModelName);
    if (presetIndex === undefined) return { content: [{ type: 'text' as const, text: `Unknown preset "${preset}".` }] };
    const type = name_type ?? 'short';
    const model = getModel(connectedDeviceId);
    const maxLen = model?.nameLength[type] ?? 32;
    await controller.setPresetName(connectedDeviceId, presetIndex, type, name);
    let text = `Set ${type} name of preset ${preset.toUpperCase()} to "${name.slice(0, maxLen)}"`;
    if (name.length > maxLen) text += ` (truncated from ${name.length} to ${maxLen} characters)`;
    return { content: [{ type: 'text' as const, text }] };
  });

  // TOOL: get_bank_name
  server.tool('get_bank_name', {
    bank: z.number().int().min(0).optional().describe('Bank number (uses current if omitted)'),
  }, async ({ bank: _bank }) => {
    if (!connectedDeviceId) return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
    const name = await controller.getBankName(connectedDeviceId);
    return { content: [{ type: 'text' as const, text: `Bank ${currentBank}: "${name}"` }] };
  });

  // TOOL: set_bank_name
  server.tool('set_bank_name', {
    name: z.string().describe('New bank name'),
    bank: z.number().int().min(0).optional().describe('Bank number (uses current if omitted)'),
  }, async ({ name, bank: _bank }) => {
    if (!connectedDeviceId) return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
    await controller.setBankName(connectedDeviceId, name);
    return { content: [{ type: 'text' as const, text: `Renamed bank ${currentBank} to "${name}"` }] };
  });

  // TOOL: lookup_device
  server.tool('lookup_device', {
    device_name: z.string().describe('Device name to search (e.g., "Quad Cortex", "Timeline")'),
  }, async ({ device_name }) => {
    const results = deviceDb.search(device_name);
    if (results.length === 0) return { content: [{ type: 'text' as const, text: `No device found matching "${device_name}". Try a different name or use raw CC/PC values.` }] };
    const output = results.slice(0, 5).map((d) => ({
      brand: d.brand,
      device: d.device,
      cc_mappings: d.cc.map((c) => `${c.name}: CC#${c.value} (${c.min}-${c.max})`),
    }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
  });

  // TOOL: display_message
  server.tool('display_message', {
    text: z.string().max(20).describe('Text to display (max 20 chars)'),
    duration_ms: z.number().int().min(100).max(12700).optional().describe('Duration in ms (default 2000)'),
  }, async ({ text, duration_ms }) => {
    if (!connectedDeviceId) return { content: [{ type: 'text' as const, text: 'Not connected. Use the connect tool first.' }] };
    await controller.displayMessage(connectedDeviceId, text, duration_ms ?? 2000);
    return { content: [{ type: 'text' as const, text: `Displayed "${text}" on controller LCD` }] };
  });
}
