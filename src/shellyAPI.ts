import fetch, { Response as FetchResponse } from 'node-fetch';
import DigestFetch from 'digest-fetch';
import type { CustomScriptData, ShellySysConfig, DeviceConfig, ShellyEMStatus, ShellyEMDataStatus } from './shellyTypes.js';

type Logger = { debug: (message: string, ...parameters: unknown[]) => void };

/**
 * Fetches data from a Shelly device endpoint with authentication and timeout handling.
 */
async function fetchShellyDevice(url: string, deviceConfig: DeviceConfig, log?: Logger): Promise<FetchResponse> {
  const timeout = deviceConfig.timeout ?? 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  let response: FetchResponse | undefined;
  try {
    if (deviceConfig.auth) {
      const client = new DigestFetch('admin', deviceConfig.pass, { algorithm: 'SHA-256' });
      response = await client.fetch(url, { signal: controller.signal }) as FetchResponse;
      if (log) {
        log.debug(`[${deviceConfig.name}] Response status: ${response.status}`);
      }
    } else {
      response = await fetch(url, { signal: controller.signal });
    }
  } catch (err: unknown) {
    if (log) {
      const message = err instanceof Error ? err.message : String(err);
      log.debug(`[${deviceConfig.name}] Network error for ${url}: ${message}`);
    }
    // Optionally, implement retry logic here
    // For now, rethrow to be handled by caller
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  return response!;
}

/**
 * Fetches and parses JSON from a Shelly endpoint with error handling.
 */
async function fetchAndParseJSON<T>(url: string, deviceConfig: DeviceConfig, log?: Logger): Promise<T> {
  try {
    const response = await fetchShellyDevice(url, deviceConfig, log);
    if (!response.ok) {
      const headersObj: Record<string, string> = {};
      response.headers.forEach((value: string, key: string) => {
        headersObj[key] = value;
      });
      if (log) {
        log.debug(`[${deviceConfig.name}] Response headers:`, JSON.stringify(headersObj));
      }
      const text = await response.text();
      throw new Error(`[${deviceConfig.name}] HTTP ${response.status} for ${url}: ${text}`);
    }
    return response.json() as Promise<T>;
  } catch (err: unknown) {
    if (log) {
      const message = err instanceof Error ? err.message : String(err);
      log.debug(`[${deviceConfig.name}] Failed to fetch or parse JSON from ${url}: ${message}`);
    }
    // Optionally, return fallback value or rethrow
    throw err;
  }
}

/**
 * Fetches the Sys.GetConfig data for a given device.
 * @param deviceConfig - The device configuration.
 * @param log - Optional logger for debug output.
 */
export async function getSysConfig(deviceConfig: DeviceConfig, log?: Logger): Promise<ShellySysConfig> {
  const url = `http://${deviceConfig.ip}/rpc/Sys.GetConfig`;
  return fetchAndParseJSON<ShellySysConfig>(url, deviceConfig, log);
}

/**
 * Fetches the EM.GetStatus data for a given device.
 * @param deviceConfig - The device configuration.
 * @param log - Optional logger for debug output.
 */
export async function getEMStatus(deviceConfig: DeviceConfig, log?: Logger): Promise<ShellyEMStatus> {
  const url = `http://${deviceConfig.ip}/rpc/EM.GetStatus?id=0`;
  return fetchAndParseJSON<ShellyEMStatus>(url, deviceConfig, log);
}

/**
 * Fetches the EMData.GetStatus data for a given device.
 * @param deviceConfig - The device configuration.
 * @param log - Optional logger for debug output.
 */
export async function getEMDataStatus(deviceConfig: DeviceConfig, log?: Logger): Promise<ShellyEMDataStatus> {
  const url = `http://${deviceConfig.ip}/rpc/EMData.GetStatus?id=0`;
  return fetchAndParseJSON<ShellyEMDataStatus>(url, deviceConfig, log);
}

/**
 * Fetches custom script API endpoint.
 * @param deviceConfig - The device configuration.
 * @param log - Optional logger for debug output.
 */
export async function getCustomScriptData(deviceConfig: DeviceConfig, log?: Logger): Promise<CustomScriptData> {
  const url = `http://${deviceConfig.ip}/script/${deviceConfig.custom_script_id}/${deviceConfig.custom_script_endpoint}`;
  return fetchAndParseJSON<CustomScriptData>(url, deviceConfig, log);
}