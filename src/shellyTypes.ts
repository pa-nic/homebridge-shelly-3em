export type CustomScriptData = Record<string, number>;
export type AccessorySuffix = '' | '-return' | '-phaseA' | '-phaseB' | '-phaseC';

export type PhaseConfig = {
  energy: number;
  returnEnergy: number;
  returnEnabled?: boolean;
};

export interface DeviceConfig {
  name: string;
  ip: string;
  monophase: boolean;
  auth: boolean;
  pass?: string;
  update_interval: number;
  timeout: number;
  enable_triphase_return?: boolean;
  custom_script?: boolean;
  custom_script_id?: number;
  custom_script_endpoint?: string;
  custom_script_energy_key?: string;
  custom_script_ret_energy_key?: string;
  enable_phaseA_return?: boolean;
  enable_phaseB_return?: boolean;
  enable_phaseC_return?: boolean;
}

export interface ShellyEMStatus {
  id?: number;
  // Phase A
  a_current?: number;
  a_voltage?: number;
  a_act_power?: number;
  a_aprt_power?: number;
  a_pf?: number;
  a_freq?: number;
  // Phase B
  b_current?: number;
  b_voltage?: number;
  b_act_power?: number;
  b_aprt_power?: number;
  b_pf?: number;
  b_freq?: number;
  // Phase C
  c_current?: number;
  c_voltage?: number;
  c_act_power?: number;
  c_aprt_power?: number;
  c_pf?: number;
  c_freq?: number;
  // Neutral and totals
  n_current?: number;
  total_current?: number;
  total_act_power?: number;
  total_aprt_power?: number;
  // Calibration and errors
  user_calibrated_phase?: string[];
  errors?: string[];
}

export interface ShellyEMDataStatus {
  id?: number;
  // Phase A energy
  a_total_act_energy?: number;
  a_total_act_ret_energy?: number;
  // Phase B energy
  b_total_act_energy?: number;
  b_total_act_ret_energy?: number;
  // Phase C energy
  c_total_act_energy?: number;
  c_total_act_ret_energy?: number;
  // Total energy
  total_act?: number;
  total_act_ret?: number;
}

export interface ShellySysConfig {
  device: {
    name: string | null;
    mac: string;
    fw_id: string;
    eco_mode?: boolean;
    profile?: string;
    discoverable?: boolean;
  };
  location?: {
    tz: string;
    lat: number;
    lon: number;
  };
  debug?: {
    mqtt?: {
      enable: boolean;
    };
    websocket?: {
      enable: boolean;
    };
    udp?: {
      addr: string | null;
    };
  };
  ui_data?: Record<string, unknown>;
  rpc_udp?: {
    dst_addr: string | null;
    listen_port: number | null;
  };
  sntp?: {
    server: string;
  };
  cfg_rev: number;
}