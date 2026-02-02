declare module 'fakegato-history' {
  import type { Logging, PlatformAccessory } from 'homebridge';

  /** Storage backend options */
  export type FakeGatoStorage = 'fs' | 'memory';

  /** Supported service types */
  export type FakeGatoServiceType = 'energy';

  /** Generic entry for any service */
  export interface FakeGatoEntryBase {
    /** Unix timestamp (seconds) */
    time: number;
  }

  /** Energy service entry */
  export interface FakeGatoEnergyEntry extends FakeGatoEntryBase {
    /** Instantaneous power in watts */
    power?: number;
    /** Cumulative energy in kWh (optional) */
    totalEnergy?: number;
  }

  /** Union of all possible entries (extendable) */
  export type FakeGatoEntry = FakeGatoEnergyEntry;

  /** Options passed to the constructor */
  export interface FakeGatoOptions {
    storage?: 'fs' | 'memory';
    path?: string;
    log?: Logging;
  }

  /** FakeGato History Service interface */
  export interface FakeGatoHistoryService {
    /** Add an entry to the history */
    addEntry(entry: FakeGatoEntry): void;
  }

  /**
   * Factory function for TypeScript usage:
   * `const FakeGatoHistoryService = fakegato(api)`
   * Then: `new FakeGatoHistoryService(type, accessory, options)`
   */
  function fakegato(api: { hap: unknown }): {
    new (type: FakeGatoServiceType, accessory: PlatformAccessory, options?: FakeGatoOptions): FakeGatoHistoryService;
  };

  export default fakegato;
}
