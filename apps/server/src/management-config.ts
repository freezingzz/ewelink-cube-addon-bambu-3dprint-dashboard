import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export async function readManagementConfig(dataDir: string) {
  let { SETUP_PUBLIC_ORIGIN: origin, SETUP_ACCESS_KEY: accessKey } = process.env;
  if (!origin && !accessKey) {
    // CUBE can mount a volume even when its Run dialog has no environment fields.
    let contents: string;
    try {
      contents = await readFile(join(dataDir, 'management.env'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new Error('Cannot read management.env from the data volume');
    }
    // Read only the two management settings. Never import the file into process.env.
    const settings = parseEnv(contents);
    origin = settings.SETUP_PUBLIC_ORIGIN;
    accessKey = settings.SETUP_ACCESS_KEY;
  }
  if (!origin || !accessKey) throw new Error('Both remote management settings are required');
  return { origin, accessKey };
}
