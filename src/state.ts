import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface StoredMessage {
  slot: number;
  type: 'CC' | 'PC';
  action: string;
  toggle: string;
  channel: number;
  ccNumber?: number;
  ccValue?: number;
  pcNumber?: number;
  description: string;
}

type StateData = Record<string, StoredMessage[]>;

export class ShadowState {
  private data: StateData = {};

  private key(bank: number, preset: number): string {
    return `${bank}:${preset}`;
  }

  getPresetMessages(bank: number, preset: number): StoredMessage[] {
    return this.data[this.key(bank, preset)] ?? [];
  }

  recordMessage(bank: number, preset: number, message: StoredMessage): void {
    const k = this.key(bank, preset);
    if (!this.data[k]) {
      this.data[k] = [];
    }
    const existing = this.data[k].findIndex((m) => m.slot === message.slot);
    if (existing >= 0) {
      this.data[k][existing] = message;
    } else {
      this.data[k].push(message);
    }
  }

  checkConflict(bank: number, preset: number, slot: number): StoredMessage | undefined {
    const messages = this.getPresetMessages(bank, preset);
    return messages.find((m) => m.slot === slot);
  }

  firstUnusedSlot(bank: number, preset: number): number {
    const messages = this.getPresetMessages(bank, preset);
    const usedSlots = new Set(messages.map((m) => m.slot));
    for (let i = 0; i < 16; i++) {
      if (!usedSlots.has(i)) return i;
    }
    return -1;
  }

  clear(): void {
    this.data = {};
  }

  serialize(): string {
    return JSON.stringify(this.data, null, 2);
  }

  static deserialize(json: string): ShadowState {
    const state = new ShadowState();
    state.data = JSON.parse(json);
    return state;
  }

  static load(): ShadowState {
    const path = join(homedir(), '.config', 'morningstar-mcp', 'state.json');
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      return ShadowState.deserialize(content);
    }
    return new ShadowState();
  }

  save(): void {
    const path = join(homedir(), '.config', 'morningstar-mcp', 'state.json');
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, this.serialize(), 'utf-8');
  }
}
