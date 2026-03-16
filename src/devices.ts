import { parse } from 'yaml';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CCMapping {
  name: string;
  value: number;  // CC number
  min: number;
  max: number;
}

export interface DeviceProfile {
  brand: string;
  device: string;
  cc: CCMapping[];
}

interface MappingBrand {
  name: string;
  value: string;
  models: { name: string; value: string }[];
}

interface MappingJson {
  brands: MappingBrand[];
}

export class DeviceDatabase {
  private devices: DeviceProfile[] = [];

  static fromMap(data: Map<string, DeviceProfile>): DeviceDatabase {
    const db = new DeviceDatabase();
    db.devices = Array.from(data.values());
    return db;
  }

  static loadFromOpenMIDI(openMidiPath: string): DeviceDatabase {
    const db = new DeviceDatabase();
    const brandsPath = join(openMidiPath, 'data', 'brands');
    const mappingPath = join(openMidiPath, 'data', 'mapping.json');

    if (!existsSync(brandsPath) || !existsSync(mappingPath)) {
      console.error(`OpenMIDI data not found at ${brandsPath}. Run: git submodule update --init`);
      return db;
    }

    // Load mapping.json for human-readable brand/device names
    const mapping: MappingJson = JSON.parse(readFileSync(mappingPath, 'utf-8'));

    for (const brand of mapping.brands) {
      const brandPath = join(brandsPath, brand.value);
      if (!existsSync(brandPath)) continue;

      for (const model of brand.models) {
        const yamlPath = join(brandPath, `${model.value}.yaml`);
        const ymlPath = join(brandPath, `${model.value}.yml`);

        const filePath = existsSync(yamlPath) ? yamlPath : existsSync(ymlPath) ? ymlPath : null;
        if (!filePath) continue;

        try {
          const content = readFileSync(filePath, 'utf-8');
          const raw = parse(content);
          if (!raw || !Array.isArray(raw.cc)) continue;

          const profile: DeviceProfile = {
            brand: brand.name,
            device: model.name,
            cc: [],
          };

          for (const entry of raw.cc) {
            if (entry.value !== undefined && entry.name) {
              profile.cc.push({
                name: entry.name,
                value: entry.value,
                min: entry.min ?? 0,
                max: entry.max ?? 127,
              });
            }
          }

          if (profile.cc.length > 0) {
            db.devices.push(profile);
          }
        } catch {
          // Skip unparseable files
        }
      }
    }

    return db;
  }

  search(query: string): DeviceProfile[] {
    const q = query.toLowerCase();
    return this.devices.filter((d) => {
      const haystack = `${d.brand} ${d.device}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  getDeviceCount(): number {
    return this.devices.length;
  }
}
