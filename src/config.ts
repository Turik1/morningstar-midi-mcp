import { parse } from 'yaml';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DeviceSchema = z.object({
  name: z.string(),
  midi_channel: z.number().int().min(0).max(15),
});

const SetupConfigSchema = z.object({
  controller: z.string(),
  devices: z.array(DeviceSchema),
});

export type SetupConfig = z.infer<typeof SetupConfigSchema>;

export function parseSetupConfig(yamlContent: string): SetupConfig {
  const raw = parse(yamlContent);
  return SetupConfigSchema.parse(raw);
}

export function loadSetupConfig(): SetupConfig | null {
  const paths = [
    join(homedir(), '.config', 'morningstar-mcp', 'setup.yaml'),
    join(process.cwd(), 'setup.yaml'),
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      return parseSetupConfig(content);
    }
  }

  return null;
}
