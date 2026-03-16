export interface ControllerModel {
  name: string;
  deviceId: number;
  presets: number;
  banks: number;
  nameLength: {
    short: number;
    toggle: number;
    long: number;
    bank: number;
  };
  layout: PresetLayout;
}

export interface PresetLayout {
  switches: Record<string, number>;
  aliases: Record<string, string>;
}

const MC8_LAYOUT: PresetLayout = {
  switches: { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7 },
  aliases: {
    'top-left': 'A', 'top-center-left': 'B', 'top-center-right': 'C', 'top-right': 'D',
    'bottom-left': 'E', 'bottom-center-left': 'F', 'bottom-center-right': 'G', 'bottom-right': 'H',
  },
};

const MC6_LAYOUT: PresetLayout = {
  switches: { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 },
  aliases: {
    'top-left': 'A', 'top-center': 'B', 'top-right': 'C',
    'bottom-left': 'D', 'bottom-center': 'E', 'bottom-right': 'F',
  },
};

const MC3_LAYOUT: PresetLayout = {
  switches: { A: 0, B: 1, C: 2 },
  aliases: { 'left': 'A', 'middle': 'B', 'center': 'B', 'right': 'C' },
};

const MODELS: ControllerModel[] = [
  { name: 'MC3', deviceId: 0x05, presets: 3, banks: 30, nameLength: { short: 10, toggle: 10, long: 16, bank: 16 }, layout: MC3_LAYOUT },
  { name: 'MC6 MKII', deviceId: 0x03, presets: 6, banks: 30, nameLength: { short: 8, toggle: 8, long: 24, bank: 24 }, layout: MC6_LAYOUT },
  { name: 'MC6 Pro', deviceId: 0x06, presets: 6, banks: 128, nameLength: { short: 32, toggle: 32, long: 32, bank: 32 }, layout: MC6_LAYOUT },
  { name: 'MC8', deviceId: 0x04, presets: 8, banks: 30, nameLength: { short: 10, toggle: 10, long: 24, bank: 24 }, layout: MC8_LAYOUT },
  { name: 'MC8 Pro', deviceId: 0x08, presets: 8, banks: 128, nameLength: { short: 32, toggle: 32, long: 32, bank: 32 }, layout: MC8_LAYOUT },
];

export function getModel(nameOrId: string | number): ControllerModel | undefined {
  if (typeof nameOrId === 'number') {
    return MODELS.find((m) => m.deviceId === nameOrId);
  }
  return MODELS.find((m) => m.name.toLowerCase() === nameOrId.toLowerCase());
}

export function resolvePreset(identifier: string, modelName: string): number | undefined {
  const model = getModel(modelName);
  if (!model) return undefined;
  const normalized = identifier.toLowerCase();
  for (const [letter, index] of Object.entries(model.layout.switches)) {
    if (letter.toLowerCase() === normalized) return index;
  }
  const aliasedSwitch = model.layout.aliases[normalized];
  if (aliasedSwitch !== undefined) {
    return model.layout.switches[aliasedSwitch];
  }
  return undefined;
}

export function getAllModels(): ControllerModel[] {
  return [...MODELS];
}
