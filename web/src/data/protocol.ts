// Messages between the page and the Web Worker that runs the simulator and the platform.
import type { Command, CommandResult, Snapshot } from '@voltify/shared';

export interface Focus {
  driverId: string | null;
  detailId: string | null;
}

export type ToWorker = { type: 'focus'; focus: Focus } | { type: 'command'; id: number; cmd: Command };

export type FromWorker = { type: 'snapshot'; snapshot: Snapshot } | { type: 'result'; id: number; result: CommandResult };
