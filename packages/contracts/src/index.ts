/** C2: executable local prototype contract, not an upstream or real-device guarantee. */
export const SCHEMA_VERSION = '0.1' as const;
export type Connection = 'connecting' | 'syncing' | 'online' | 'offline' | 'error';
export type Lifecycle = 'unknown' | 'idle' | 'preparing' | 'printing' | 'paused' | 'finished' | 'error';
export interface Tray {
  id: string;
  present: boolean | null;
  material: string | null;
  color: string | null;
  remainingPercent: number | null;
}
export interface AmsUnit {
  id: string;
  humidityPercent: number | null;
  temperatureC: number | null;
  trays: Tray[];
}
export interface Cover {
  taskId: string | null;
  state: 'loading' | 'available' | 'unavailable' | 'error';
  url: string | null;
}
export interface PrinterSnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  printerId: string;
  name: string;
  model: string;
  provenance: 'synthetic' | 'cloud';
  connection: Connection;
  lifecycle: Lifecycle;
  stage: string | null;
  taskId: string | null;
  jobName: string | null;
  progressPercent: number | null;
  remainingSeconds: number | null;
  currentLayer: number | null;
  totalLayers: number | null;
  nozzleC: number | null;
  bedC: number | null;
  chamberC: number | null;
  lastReportAt: string | null;
  fieldUpdatedAt: Record<string, string>;
  freshness: 'fresh' | 'stale' | 'unknown';
  source: 'cloud';
  capabilities: { ams: boolean; cover: boolean; controls: false; camera: false };
  errors: { code: string; message: string; severity: 'warning' | 'error' }[];
  ams: AmsUnit[];
  activeTray: { unitId: string; trayId: string } | 'external' | null;
  externalTray: Tray | null;
  cover: Cover;
}
export interface SnapshotEvent {
  type: 'snapshot';
  sessionId: string;
  sequence: number;
  snapshot: PrinterSnapshot;
}
export function emptySnapshot(printerId = 'h2c-demo', provenance: PrinterSnapshot['provenance'] = 'synthetic'): PrinterSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION, printerId, name: 'H2C', model: 'H2C', provenance,
    connection: 'connecting', lifecycle: 'unknown', stage: null, taskId: null, jobName: null,
    progressPercent: null, remainingSeconds: null, currentLayer: null, totalLayers: null,
    nozzleC: null, bedC: null, chamberC: null, lastReportAt: null, fieldUpdatedAt: {}, freshness: 'unknown', source: 'cloud',
    capabilities: { ams: true, cover: true, controls: false, camera: false },
    errors: [], ams: [], activeTray: null, externalTray: null,
    cover: { taskId: null, state: 'unavailable', url: null }
  };
}
