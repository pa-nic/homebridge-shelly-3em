import type { PlatformAccessory, Service, Characteristic as CharacteristicType, WithUUID, HAP } from 'homebridge';
import type { CustomScriptData, DeviceConfig, ShellyEMStatus, ShellyEMDataStatus, AccessorySuffix, PhaseConfig } from './shellyTypes.js';
import { getCustomScriptData, getEMStatus, getEMDataStatus } from './shellyAPI.js';
import type { ShellyEnergyMeterPlatform } from './platform.js';
import type { FakeGatoHistoryService } from 'fakegato-history';

const POWER_METER_SERVICE_UUID = '00000001-0000-1777-8000-775D67EC4377';
const WH_TO_KWH = 1000;
const DEFAULT_POLL_INTERVAL = 10000;

// Typings for Eve characteristics constructors
type EveCharacteristicClass = WithUUID<new () => CharacteristicType>;
type PowerMeterServiceClass = new (name: string, uuid?: string) => Service;

export class ShellyEnergyMeterPlatformAccessory {
  private service!: Service;
  private historyService!: FakeGatoHistoryService;
  private macAddress: string;

  private deviceConfig: DeviceConfig;
  private suffix: AccessorySuffix;

  private act_power = 0;
  private energy = 0; 
  private current = 0;
  private voltage = 0;

  private EvePowerConsumption!: EveCharacteristicClass;
  private EveTotalConsumption!: EveCharacteristicClass;
  private EveAmpere!: EveCharacteristicClass;
  private EveVoltage!: EveCharacteristicClass;
  private PowerMeterService!: PowerMeterServiceClass;

  private pollingInterval?: NodeJS.Timeout;
  private isUpdating = false;

  constructor(
    private readonly platform: ShellyEnergyMeterPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.macAddress = this.accessory.context.macAddress;
    this.suffix = this.accessory.context.suffix;
    this.deviceConfig = this.accessory.context.device;

    this.registerEveCharacteristics();
    this.setupAccessoryInfo();
    this.setupService();
    this.startPolling();
  }

  private registerEveCharacteristics() {
    const { EvePowerConsumption, EveTotalConsumption, EveAmpere, EveVoltage, PowerMeterService } = this.createEveCharacteristics(this.platform.api);
    this.EvePowerConsumption = EvePowerConsumption;
    this.EveTotalConsumption = EveTotalConsumption;
    this.EveAmpere = EveAmpere;
    this.EveVoltage = EveVoltage;
    this.PowerMeterService = PowerMeterService;
  }

  private createEveCharacteristics(api: { hap: HAP }) {
    const { Characteristic, Service, Perms } = api.hap;

    class EvePowerConsumption extends Characteristic {
      static readonly UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
      constructor() {
        super('Consumption', EvePowerConsumption.UUID, {
          format: 'uint16',
          unit: 'W',
          maxValue: 1000000000,
          minValue: 0,
          minStep: 0.001,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
      }
    }

    class EveTotalConsumption extends Characteristic {
      static readonly UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';
      constructor() {
        super('Energy', EveTotalConsumption.UUID, {
          format: 'uint16',
          unit: 'kWh',
          maxValue: 1000000000,
          minValue: 0,
          minStep: 0.001,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
      }
    }

    class EveAmpere extends Characteristic {
      static readonly UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';
      constructor() {
        super('Ampere', EveAmpere.UUID, {
          format: 'float',
          unit: 'A',
          maxValue: 1000000000,
          minValue: 0,
          minStep: 0.001,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
      }
    }

    class EveVoltage extends Characteristic {
      static readonly UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';
      constructor() {
        super('Volt', EveVoltage.UUID, {
          format: 'float',
          unit: 'V',
          maxValue: 1000000000,
          minValue: 0,
          minStep: 0.001,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
      }
    }

    class PowerMeterService extends Service {
      constructor(name: string) {
        super(name, POWER_METER_SERVICE_UUID);
        this.addCharacteristic(EvePowerConsumption);
        this.addOptionalCharacteristic(EveTotalConsumption);
        this.addOptionalCharacteristic(EveAmpere);
        this.addOptionalCharacteristic(EveVoltage);
      }
    }

    return { EvePowerConsumption, EveTotalConsumption, EveAmpere, EveVoltage, PowerMeterService };
  }

  private setupAccessoryInfo() {
    const info = this.accessory.getService(this.platform.api.hap.Service.AccessoryInformation) 
      ?? this.accessory.addService(this.platform.api.hap.Service.AccessoryInformation);

    info
      .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, 'Shelly')
      .setCharacteristic(this.platform.api.hap.Characteristic.Model, '3EM')
      .setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, `${this.macAddress}${this.suffix || ''}`);
  }

  private setupService() {
    // Setup consumption power service using only UUID
    let existingConsumptionService = this.accessory.services.find(service => service.UUID === POWER_METER_SERVICE_UUID);

    if (!existingConsumptionService) {
      const service = new this.PowerMeterService(this.accessory.displayName, POWER_METER_SERVICE_UUID);
      existingConsumptionService = this.accessory.addService(service);
    }
    this.service = existingConsumptionService;

    this.service.getCharacteristic(this.EvePowerConsumption).onGet(() => this.act_power);
    this.service.getCharacteristic(this.EveTotalConsumption).onGet(() => this.energy);
    if (this.deviceConfig.display_current_values && this.suffix !== '-return') {
      this.service.getCharacteristic(this.EveAmpere).onGet(() => this.current);
    }
    if (this.deviceConfig.display_voltage_values && this.suffix !== '-return') {
      this.service.getCharacteristic(this.EveVoltage).onGet(() => this.voltage);
    }

    this.historyService = new this.platform.FakeGatoHistoryService(
      'energy',
      this.accessory,
      {
        log: this.platform.log,
        storage: 'fs',
      },
    );
  }

  private startPolling() {
    void this.updateFromDevice();
    this.pollingInterval = setInterval(() => void this.updateFromDevice(), this.deviceConfig.update_interval ?? DEFAULT_POLL_INTERVAL);
  }

  stopPolling(): void {
    clearInterval(this.pollingInterval);
    this.pollingInterval = undefined;
    this.platform.log.debug(`[${this.accessory.displayName}] Data polling stopped.`);
  }

  private async updateFromDevice(): Promise<void> {
    if (this.isUpdating) {
      this.platform.log.debug(`[${this.accessory.displayName}] Skipping update - previous update still in progress`);
      return;
    }

    this.isUpdating = true;
    try {
      // Run both requests in parallel
      const [statusResult, dataResult] = await Promise.allSettled([
        getEMStatus(this.deviceConfig, this.platform.log),
        this.deviceConfig.custom_script === true
          ? getCustomScriptData(this.deviceConfig, this.platform.log)
          : getEMDataStatus(this.deviceConfig, this.platform.log),
      ]);

      // Process results (updates internal state)
      this.handleStatusResult(statusResult);
      if (this.deviceConfig.custom_script === true) {
        this.handleCustomScriptDataResult(dataResult as PromiseSettledResult<CustomScriptData>);
      } else {
        this.handleDataStatusResult(dataResult as PromiseSettledResult<ShellyEMDataStatus>);
      }
      // Update all characteristics and history with consistent data
      this.updateAllCharacteristics();
    } catch (err) {
      // Catches unexpected errors in handlers (not API calls)
      const message = err instanceof Error ? err.message : String(err);
      this.platform.log.error(`[${this.accessory.displayName}] Unexpected error:`, message);
    } finally {
      this.isUpdating = false;
    }
  }

  private handleStatusResult(result: PromiseSettledResult<ShellyEMStatus>): void {
    if (result.status === 'fulfilled') {
      const data = result.value;

      const phaseMap: Record<string, { current?: number; voltage?: number; power?: number }> = {
        '-phaseA': { current: data.a_current, voltage: data.a_voltage, power: data.a_act_power },
        '-phaseB': { current: data.b_current, voltage: data.b_voltage, power: data.b_act_power },
        '-phaseC': { current: data.c_current, voltage: data.c_voltage, power: data.c_act_power },
      };

      if (phaseMap[this.suffix]) {
        const phase = phaseMap[this.suffix];
        if (this.deviceConfig.display_current_values) {
          this.current = phase.current ?? 0;
        }
        if (this.deviceConfig.display_voltage_values) {
          this.voltage = phase.voltage ?? 0;
        }
        this.act_power = phase.power && phase.power > 0 ? phase.power : 0;
      } else if (this.suffix === '-return') {
        this.act_power = data.total_act_power && data.total_act_power < 0 ? Math.abs(data.total_act_power) : 0;
      } else {
        // Main triphase accessory (suffix === '')
        if (this.deviceConfig.display_current_values) {
          this.current = data.total_current ?? 0;
        }
        if (this.deviceConfig.display_voltage_values) {
          this.voltage = this.calculateAverageVoltage(data);
        }
        this.act_power = data.total_act_power && data.total_act_power > 0 ? data.total_act_power : 0;
      }
    } else {
      this.platform.log.error(`[${this.accessory.displayName}] Request failed (status):`, this.formatError(result.reason));
      this.current = 0;
      this.voltage = 0;
      this.act_power = 0;
    }
  }

  private handleDataStatusResult(result: PromiseSettledResult<ShellyEMDataStatus>): void {
    if (result.status === 'fulfilled') {
      const data = result.value;

      const phaseConfigs: Record<string, PhaseConfig> = {
        '-phaseA': { 
          energy: data.a_total_act_energy ?? 0, 
          returnEnergy: data.a_total_act_ret_energy ?? 0,
          returnEnabled: this.deviceConfig.enable_phaseA_return,
        },
        '-phaseB': { 
          energy: data.b_total_act_energy ?? 0, 
          returnEnergy: data.b_total_act_ret_energy ?? 0,
          returnEnabled: this.deviceConfig.enable_phaseB_return,
        },
        '-phaseC': { 
          energy: data.c_total_act_energy ?? 0, 
          returnEnergy: data.c_total_act_ret_energy ?? 0,
          returnEnabled: this.deviceConfig.enable_phaseC_return,
        },
      };

      if (phaseConfigs[this.suffix]) {
        const config = phaseConfigs[this.suffix];
        this.energy = (config.returnEnabled ? config.returnEnergy : config.energy) / WH_TO_KWH;
      } else if (this.suffix === '-return') {
        this.energy = (data.total_act_ret ?? 0) / WH_TO_KWH;
      } else {
        // Main triphase accessory (suffix === '')  
        this.energy = (data.total_act ?? 0) / WH_TO_KWH;
      }
    } else {
      this.platform.log.error(`[${this.accessory.displayName}] Request failed (data):`, this.formatError(result.reason));
      this.energy = 0;
    }
  }

  // Handle custom script data result
  private handleCustomScriptDataResult(result: PromiseSettledResult<CustomScriptData>): void {
    if (result.status === 'fulfilled') {
      const data = result.value;
      // Use keys from config
      const energyKey = this.deviceConfig.custom_script_energy_key;
      const retEnergyKey = this.deviceConfig.custom_script_ret_energy_key;
      if (this.suffix === '-return') {
        this.energy = retEnergyKey && typeof data[retEnergyKey] === 'number' ? data[retEnergyKey] : 0;
      } else {
        this.energy = energyKey && typeof data[energyKey] === 'number' ? data[energyKey] : 0;
      }
    } else {
      this.platform.log.error(`[${this.accessory.displayName}] Request failed (custom script data):`, this.formatError(result.reason));
      this.energy = 0;
    }
  }

  private calculateAverageVoltage(data: ShellyEMStatus): number {
    const voltages = [data.a_voltage, data.b_voltage, data.c_voltage];
    const valid = voltages.filter((v): v is number => typeof v === 'number' && v > 0);
    return valid.length > 0 ? valid.reduce((sum, v) => sum + v, 0) / valid.length : 0;
  }

  private formatError(err: unknown): string {
    if (err instanceof Error && err.name === 'AbortError') {
      return 'Request timeout';
    }
    return err instanceof Error ? err.message : String(err);
  }

  private updateAllCharacteristics(): void {
    // Update all status characteristics
    this.service.getCharacteristic(this.EvePowerConsumption).updateValue(this.act_power);
    if (this.deviceConfig.display_current_values && this.suffix !== '-return') {
      this.service.getCharacteristic(this.EveAmpere).updateValue(this.current);
    }
    if (this.deviceConfig.display_voltage_values && this.suffix !== '-return') {
      this.service.getCharacteristic(this.EveVoltage).updateValue(this.voltage);
    }
    this.service.getCharacteristic(this.EveTotalConsumption).updateValue(this.energy);

    // Add history entry
    this.historyService.addEntry({ 
      time: Math.floor(Date.now() / 1000), 
      power: this.act_power,
      totalEnergy: this.energy,
    });
  }
}