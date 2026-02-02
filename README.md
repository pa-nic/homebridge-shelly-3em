<p align="center">

<img src="https://github.com/pa-nic/homebridge-shelly-3em-plugin/blob/main/images/logo-shelly-hb.png" width="320">

</p>

# Homebridge Platform Plugin for Shelly (Pro) 3EM energy meters

This is a [Homebridge](https://homebridge.io) platform plugin for the [Shelly](https://www.shelly.com) three-phase energy meters. 

Supporting all Gen2+ **3EM** energy meters like:
- Shelly 3EM
- Shelly Pro 3EM
- etc.

# Features

Display Shelly energy meter data in you [Eve App](https://www.evehome.com) or any other app supporting Eve/fakegato energy data.

- Authentication support

### Triphase Mode

- Overall power/energy stats
- Return power/energy stats for solar system setups (2nd accessory)
- Configure custom balancing script (saldieren)

### Monophase Mode

- Power/energy stats for individual phases (A/B/C) - three independent accessories
- Configure consumed **or** returned power/energy for each phase

# Configuration Options

The following configurations are available through the Hombridge UI-X web interface:

| Option| Available in Mode | Type| Description | 
| --- | --- | --- | --- |
| Device Name | | string | Name displayed in your Eve app |
| Device IP Address | | string | IP of your Shelly energy meter |
| Monophase Mode | | boolean | Enable Monophase Mode (default is Triphase). This needs to match your Shelly energy meter configuration. Creates three accessories named `Device Name-phaseA`, `Device Name-phaseB`, `Device Name-phaseC` |
| Authentication | | boolean | Enable if you've set a password for your Shelly energy meter. |
| Password | Authentication | string | Provide your Shelly energy meter password. |
| Polling Interval | | number | Set the interval for polling new data from you Shelly energy meter in milliseconds. |
| Request Timeout | | number | Maximum time to wait for a device response in milliseconds. Must be lower than the polling interval. |
| Enable Return Power/Energy monitoring | Triphase | boolean | Adds additional accessory (`Device Name-return`) to display return power/energy in triphase mode.|
| Enable custom script for energy values | Triphase | boolean | Use custom Shelly script for consumed and returned energy values in triphase mode. For correct balancing (saldieren). **Values MUST be provided in kWh.** |
| ID | Custom Script | number | ID of your Shelly script. View the ID in the script overview of your Shelly energy meter web interface (e.g. script:**1** -> ID = **1**) or check the URL when editing the script in the web interface (e.g. http://*YOUR_IP*/#/script/**1**) |
| Endpoint | Custom Script | string | The endpoint your Shelly script exposes (http://*YOUR_IP*/script/1/**endpoint**). |
| Energy Key | Custom Script | string | JSON key for energy values in the custom script. **Values MUST be provided in kWh.** (e.g. {"**energyConsumed**":2508.191, "energyReturned":197.029}) |
| Return Energy Key | Custom Script | string | JSON key for return energy values in the custom script. **Values MUST be provided in kWh.** (e.g. {"energyConsumed":2508.191, "**energyReturned**":197.029}) |
| Enable Return Power/Energy on phaseA | Monophase | boolean | Displays return power/energy on phaseA (instead of consumed values). |
| Enable Return Power/Energy on phaseB | Monophase | boolean | Displays return power/energy on phaseB (instead of consumed values). |
| Enable Return Power/Energy on phaseC | Monophase | boolean | Displays return power/energy on phaseC (instead of consumed values). |

Add as many devices as you like.

# Additional information

- Current is always the overall current
- Voltage is either the average voltage (triphase) or the phase specific voltage (monophase)

> [!TIP]
> If you change the configuration/switch the mode of a device, the accessory is (re)created or additional accessories are created/removed. Sometimes you need to re-add the device to HomeKit to see the changes. Put the plugin in homebridge child-bridge for better convenience.

## Example Balancing Script

Gist: [Shelly Pro 3EM Energy Counter Script](https://gist.github.com/pa-nic/7e3b0390e06d65aac40039384f2b6754)

> [!WARNING]
> If you use your own script, make sure it returns a JSON with two values in kWh.
>
> `{"energyConsumed":2508.191, "energyReturned":197.029}`


<p align="center" style="margin-top:20px">And that's just about it!</p>
