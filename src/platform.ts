import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { ShellyEnergyMeterPlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { DeviceConfig } from './shellyTypes.js';
import { getSysConfig } from './shellyAPI.js';
import fakegato from 'fakegato-history';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ShellyEnergyMeterPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // This is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];
  
  public readonly FakeGatoHistoryService;

  // Track accessory handlers to stop polling on shutdown/removal
  private accessoryHandlers: Map<string, ShellyEnergyMeterPlatformAccessory> = new Map();

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.FakeGatoHistoryService = fakegato(this.api);

    this.log.debug('Finished initializing platform: Shelly 3EM plugin');

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });

    // Stop polling for all accessories on shutdown
    this.api.on('shutdown', () => {
      this.log.info('Homebridge shutdown: stopping all accessory polling');
      for (const handler of this.accessoryHandlers.values()) {
        handler.stopPolling?.();
      }
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    // Add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.set(accessory.UUID, accessory);
  }

  /**
   * Discover and configure devices from config
   */
  async discoverDevices() {
    const devices = this.config.devices ?? [];
    
    if (devices.length === 0) {
      this.log.warn('No devices configured. Please add at least one device in the plugin settings.');
      return;
    }

    for (const device of devices) {
      // Validate required parameters
      if (!device.name || typeof device.name !== 'string') {
        this.log.error('Device configuration missing required "name" parameter. Skipping device.');
        continue;
      }
      if (!device.ip || typeof device.ip !== 'string') {
        this.log.error(`Device "${device.name}" is missing required "ip" parameter. Skipping device.`);
        continue;
      }
      if (
        typeof device.update_interval !== 'number' ||
        typeof device.timeout !== 'number' ||
        device.update_interval <= device.timeout
      ) {
        this.log.error(`[${device.name}] update_interval should be a number greater than timeout (ms). Skipping device.`);
        continue;
      }

      if (device.auth === true && (!device.pass || typeof device.pass !== 'string' || device.pass.trim() === '')) {
        this.log.error(`Device "${device.name}" (${device.ip}) has authentication enabled but no password provided. Skipping device.`);
        continue;
      }

      if (device.custom_script === true) {
        const missingCustomScriptFields = [];
        if (typeof device.custom_script_id !== 'number' || isNaN(device.custom_script_id)) {
          missingCustomScriptFields.push('custom_script_id');
        }
        if (!device.custom_script_endpoint || typeof device.custom_script_endpoint !== 'string' || device.custom_script_endpoint.trim() === '') {
          missingCustomScriptFields.push('custom_script_endpoint');
        }
        if (!device.custom_script_energy_key || typeof device.custom_script_energy_key !== 'string' || device.custom_script_energy_key.trim() === '') {
          missingCustomScriptFields.push('custom_script_energy_key');
        }
        if (!device.custom_script_ret_energy_key || typeof device.custom_script_ret_energy_key !== 'string' || 
            device.custom_script_ret_energy_key.trim() === '') {
          missingCustomScriptFields.push('custom_script_ret_energy_key');
        }
        if (missingCustomScriptFields.length > 0) {
          this.log.error(
            `Device "${device.name}" (${device.ip}) has custom_script enabled but is missing required field(s): ` +
            `${missingCustomScriptFields.join(', ')}. Skipping device.`,
          );
          continue;
        }
      }

      // Validate device connection and authentication
      let profile: string | undefined;
      let macAddress: string | undefined;
      try {
        const sysConfig = await getSysConfig(device, this.log);
        profile = sysConfig.device.profile;
        macAddress = sysConfig.device.mac;
        this.log.debug(`Device "${device.name}" (${device.ip}) profile: ${profile || 'not set'}`);

        if (!macAddress) {
          this.log.error(`Device "${device.name}" (${device.ip}) does not provide a MAC address. Skipping device.`);
          continue;
        }
        // Compare plugin config with Shelly config
        if (typeof device.monophase === 'boolean' && typeof sysConfig.device.profile === 'string') {
          const isMonophase = device.monophase === true && sysConfig.device.profile === 'monophase';
          const isTriphase = device.monophase === false && sysConfig.device.profile === 'triphase';
          const match = isMonophase || isTriphase;
          if (!match) {
            this.log.error(
              `Device "${device.name}" config mismatch: Plugin:${device.monophase}, Shelly:${sysConfig.device.profile}. Skipping device.`,
            );
            continue;
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.includes('status: 401')) {
          this.log.error(
            `Device "${device.name}" (${device.ip}) authentication failed. ` +
            'Please enable authentication and provide correct password in config. Skipping device.',
          );
          continue;
        }
        // Log other errors but don't skip the device - it might be temporarily unreachable
        this.log.warn(`Device "${device.name}" (${device.ip}) validation warning: ${errorMessage}. Will retry during polling.`);
      }

      // Create accessories based on config
      const accessoriesToCreate = this.determineAccessories(device);
      for (const { suffix, name } of accessoriesToCreate) {
        this.createOrRestoreAccessory(macAddress + suffix, device, name, macAddress, suffix);
      }
    }

    this.removeStaleAccessories();
  }

  private determineAccessories(device: DeviceConfig): Array<{ suffix: string; name: string }> {
    const accessories: Array<{ suffix: string; name: string }> = [];
    
    if (device.monophase === false) {
      // Triphase
      accessories.push({ suffix: '', name: device.name });
      
      // Triphase + return enabled
      if (device.enable_triphase_return === true) {
        accessories.push({ suffix: '-return', name: `${device.name} Return` });
      }
    } else if (device.monophase === true) {
      // Monophase: three accessories for A, B, C
      for (const phase of ['A', 'B', 'C']) {
        accessories.push({ suffix: `-phase${phase}`, name: `${device.name} Phase ${phase}` });
      }
    }
    
    return accessories;
  }

  private createOrRestoreAccessory(
    identifier: string,
    device: DeviceConfig,
    displayName: string,
    macAddress?: string,
    suffix?: string,
  ) {
    const uuid = this.api.hap.uuid.generate(identifier);
    const existingAccessory = this.accessories.get(uuid);
    
    if (existingAccessory) {
      this.restoreAccessory(existingAccessory, device);
    } else {
      this.addAccessory(uuid, device, displayName, macAddress, suffix);
    }
    
    this.discoveredCacheUUIDs.push(uuid);
  }

  private restoreAccessory(accessory: PlatformAccessory, device: DeviceConfig) {
    this.log.info('Restoring existing accessory from cache:', accessory.displayName);
    // Update device config in case user changed settings
    accessory.context.device = device;
    this.api.updatePlatformAccessories([accessory]);
    const handler = new ShellyEnergyMeterPlatformAccessory(this, accessory);
    this.accessoryHandlers.set(accessory.UUID, handler);
  }

  private addAccessory(uuid: string, device: DeviceConfig, displayName: string, macAddress?: string, suffix?: string) {
    this.log.info('Adding new accessory:', displayName);
    const accessory = new this.api.platformAccessory(displayName, uuid);
    accessory.context.device = device;
    if (macAddress) {
      accessory.context.macAddress = macAddress;
    }
    if (suffix !== undefined) {
      accessory.context.suffix = suffix;
    }
    const handler = new ShellyEnergyMeterPlatformAccessory(this, accessory);
    this.accessories.set(uuid, accessory);
    this.accessoryHandlers.set(uuid, handler);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }

  private removeStaleAccessories() {
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        // Stop polling for this accessory before removal
        const handler = this.accessoryHandlers.get(uuid);
        handler?.stopPolling?.();
        this.accessoryHandlers.delete(uuid);
        this.accessories.delete(uuid);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
