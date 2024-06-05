import { AnsiLogger, BLUE, CYAN, GREEN, GREY, MAGENTA, RED, RESET, TimestampFormat, db, debugStringify, er, hk, idn, nf, rs, wr, zb } from 'node-ansi-logger';
import { EventEmitter } from 'events';
import fetch, { RequestInit } from 'node-fetch';
import { getIpv4InterfaceAddress } from 'matterbridge';
import crypto from 'crypto';
import { parseDigestAuthenticateHeader, createDigestShellyAuth, createBasicShellyAuth, parseBasicAuthenticateHeader, getGen2BodyOptions, getGen1BodyOptions } from './auth.js';

import { shellydimmer2Settings, shellydimmer2Shelly, shellydimmer2Status } from './shellydimmer2.js';
import { shellyplus2pmSettings, shellyplus2pmShelly, shellyplus2pmStatus } from './shellyplus2pm.js';
import { shellyplus1pmSettings, shellyplus1pmShelly, shellyplus1pmStatus } from './shellyplus1pm.js';
import { shellypmminig3Settings, shellypmminig3Shelly, shellypmminig3Status } from './shellypmminig3.js';
import { shelly1minig3Settings, shelly1minig3Status, shelly1minig3Shelly } from './shelly1minig3.js';
import { WsClient } from './wsClient.js';
import { Shelly } from './shelly.js';
import { ShellyData } from './shellyTypes.js';
import { ShellyComponent } from './shellyComponent.js';

export class ShellyDevice extends EventEmitter {
  readonly shelly: Shelly;
  readonly log: AnsiLogger;
  readonly host: string;
  readonly username: string | undefined;
  readonly password: string | undefined;
  profile: 'relay' | 'cover' | undefined;
  id = '';
  model = '';
  mac = '';
  firmware = '';
  auth = false;
  name = '';
  online = false;
  gen = 0;
  lastseen = 0;
  hasUpdate = false;
  private lastseenInterval?: NodeJS.Timeout;

  private wsClient: WsClient | undefined;

  private readonly _components = new Map<string, ShellyComponent>();

  private constructor(shelly: Shelly, log: AnsiLogger, host: string) {
    super();
    this.shelly = shelly;
    this.log = log;
    this.host = host;
    this.username = shelly.username;
    this.password = shelly.password;
  }

  destroy() {
    if (this.lastseenInterval) clearInterval(this.lastseenInterval);
    this.lastseenInterval = undefined;
    this.lastseen = 0;
    this.wsClient?.stop();
    this.removeAllListeners();
  }

  hasComponent(id: string): boolean {
    return this._components.has(id);
  }

  getComponent(id: string): ShellyComponent | undefined {
    return this._components.get(id);
  }

  addComponent(component: ShellyComponent): ShellyComponent {
    this._components.set(component.id, component);
    return component;
  }

  updateComponent(id: string, data?: ShellyData): ShellyComponent | undefined {
    const component = this.getComponent(id);
    if (component) {
      for (const prop in data) {
        component.setValue(prop, data[prop]);
      }
      return component;
    } else this.log.error(`****Component ${id} not found in device ${GREEN}${this.id}${er} (${BLUE}${this.name}${er})`);

    return undefined;
  }

  get components(): ShellyComponent[] {
    return Array.from(this._components.values());
  }

  *[Symbol.iterator](): IterableIterator<[string, ShellyComponent]> {
    for (const [key, component] of this._components.entries()) {
      yield [key, component];
    }
  }

  static async create(shelly: Shelly, log: AnsiLogger, host: string): Promise<ShellyDevice | undefined> {
    const shellyPayload = await ShellyDevice.fetch(log, host, 'shelly');
    let statusPayload: ShellyData | null = null;
    let settingsPayload: ShellyData | null = null;

    if (!shellyPayload) {
      log.error(`Error creating device from host ${host}. No shelly data found.`);
      return undefined;
    }
    // console.log('Shelly:', shelly);
    const device = new ShellyDevice(shelly, log, host.replace('mock.', ''));
    device.mac = shellyPayload.mac as string;
    device.lastseen = Date.now();

    if (shellyPayload.mode) device.profile = shellyPayload.mode as 'relay' | 'cover';
    if (shellyPayload.profile) device.profile = shellyPayload.profile as 'relay' | 'cover';

    // Gen 1 Shelly device
    if (!shellyPayload.gen) {
      statusPayload = await ShellyDevice.fetch(log, host, 'status');
      settingsPayload = await ShellyDevice.fetch(log, host, 'settings');
      if (!statusPayload || !settingsPayload) {
        log.error(`Error creating device gen 1 from host ${host}. No data found.`);
        return undefined;
      }
      device.model = shellyPayload.type as string;
      device.id = (settingsPayload.device as ShellyData).hostname as string;
      device.firmware = (shellyPayload.fw as string).split('/')[1];
      device.auth = shellyPayload.auth as boolean;
      device.name = settingsPayload.name ? (settingsPayload.name as string) : device.id;
      device.gen = 1;
      device.hasUpdate = statusPayload.has_update as boolean;
      for (const key in settingsPayload) {
        if (key === 'wifi_ap') device.addComponent(new ShellyComponent(device, key, 'WiFi', settingsPayload[key] as ShellyData));
        if (key === 'wifi_sta') device.addComponent(new ShellyComponent(device, key, 'WiFi', settingsPayload[key] as ShellyData));
        if (key === 'wifi_sta1') device.addComponent(new ShellyComponent(device, key, 'WiFi', settingsPayload[key] as ShellyData));
        if (key === 'mqtt') device.addComponent(new ShellyComponent(device, key, 'MQTT', settingsPayload[key] as ShellyData));
        if (key === 'coiot') device.addComponent(new ShellyComponent(device, key, 'CoIoT', settingsPayload[key] as ShellyData));
        if (key === 'sntp') device.addComponent(new ShellyComponent(device, key, 'Sntp', settingsPayload[key] as ShellyData));
        if (key === 'cloud') device.addComponent(new ShellyComponent(device, key, 'Cloud', settingsPayload[key] as ShellyData));
        if (key === 'lights') {
          let index = 0;
          for (const light of settingsPayload[key] as ShellyData[]) {
            device.addComponent(new ShellyComponent(device, `light:${index++}`, 'Light', light as ShellyData));
          }
        }
        if (key === 'relays' && device.profile !== 'cover') {
          let index = 0;
          for (const relay of settingsPayload[key] as ShellyData[]) {
            device.addComponent(new ShellyComponent(device, `relay:${index++}`, 'Relay', relay as ShellyData));
          }
        }
        if (key === 'rollers' && device.profile !== 'relay') {
          let index = 0;
          for (const roller of settingsPayload[key] as ShellyData[]) {
            device.addComponent(new ShellyComponent(device, `roller:${index++}`, 'Roller', roller as ShellyData));
          }
        }
      }
    }

    // Gen 2 Shelly device
    if (shellyPayload.gen === 2 || shellyPayload.gen === 3) {
      statusPayload = await ShellyDevice.fetch(log, host, 'Shelly.GetStatus');
      settingsPayload = await ShellyDevice.fetch(log, host, 'Shelly.GetConfig');
      if (!statusPayload || !settingsPayload) {
        log.error(`Error creating device gen 2 from host ${host}. No data found.`);
        return undefined;
      }
      device.model = shellyPayload.model as string;
      device.id = shellyPayload.id as string;
      device.firmware = (shellyPayload.fw_id as string).split('/')[1];
      device.auth = shellyPayload.auth_en as boolean;
      device.gen = shellyPayload.gen;
      // TODO device.hasUpdate = statusPayload.has_update as boolean;
      for (const key in settingsPayload) {
        if (key === 'wifi') {
          const wifi = settingsPayload[key] as ShellyData;
          if (wifi.ap) device.addComponent(new ShellyComponent(device, 'wifi_ap', 'WiFi', wifi.ap as ShellyData)); // Ok
          if (wifi.sta) device.addComponent(new ShellyComponent(device, 'wifi_sta', 'WiFi', wifi.sta as ShellyData)); // Ok
          if (wifi.sta1) device.addComponent(new ShellyComponent(device, 'wifi_sta1', 'WiFi', wifi.sta1 as ShellyData)); // Ok
        }
        if (key === 'sys') {
          device.addComponent(new ShellyComponent(device, 'sys', 'Sys', settingsPayload[key] as ShellyData)); // Ok
          const sys = settingsPayload[key] as ShellyData;
          if (sys.sntp) {
            device.addComponent(new ShellyComponent(device, 'sntp', 'Sntp', sys.sntp as ShellyData)); // Ok
          }
          const dev = sys.device as ShellyData;
          device.name = dev.name ? (dev.name as string) : device.id;
        }
        if (key === 'mqtt') device.addComponent(new ShellyComponent(device, key, 'MQTT', settingsPayload[key] as ShellyData)); // Ok
        if (key === 'ws') device.addComponent(new ShellyComponent(device, key, 'WS', settingsPayload[key] as ShellyData)); // Ok
        if (key === 'cloud') device.addComponent(new ShellyComponent(device, key, 'Cloud', settingsPayload[key] as ShellyData)); // Ok
        if (key === 'ble') device.addComponent(new ShellyComponent(device, key, 'Ble', settingsPayload[key] as ShellyData)); // Ok
        if (key.startsWith('switch:')) device.addComponent(new ShellyComponent(device, key, 'Switch', settingsPayload[key] as ShellyData));
        if (key.startsWith('cover:')) device.addComponent(new ShellyComponent(device, key, 'Cover', settingsPayload[key] as ShellyData));
        if (key.startsWith('light:')) device.addComponent(new ShellyComponent(device, key, 'Light', settingsPayload[key] as ShellyData));
        if (key.startsWith('pm1:')) device.addComponent(new ShellyComponent(device, key, 'PowerMeter', settingsPayload[key] as ShellyData));
      }
    }

    if (statusPayload) device.update(statusPayload);

    // For gen 1 devices check if CoIoT is enabled and peer is set correctly
    if (device.gen === 1) {
      const CoIoT = device.getComponent('coiot');
      if (CoIoT) {
        if (!CoIoT.getValue('enabled')) log.error(`CoIoT is not enabled for device ${device.id}. Enable it in the settings to receive updates from the device.`);
        if (!CoIoT.getValue('peer')) {
          log.error(`CoIoT peer for device ${device.id} is not set.`);
        } else {
          const peer = CoIoT.getValue('peer') as string;
          const ipv4 = getIpv4InterfaceAddress() + ':5683';
          if (peer !== 'mcast' && peer !== ipv4)
            log.error(`CoIoT peer for device ${device.id} is not mcast or ${ipv4}. Set it in the settings to receive updates from the device.`);
        }
      } else {
        log.error(`CoIoT service not found for device ${device.id}.`);
      }
    }

    // Start lastseen interval
    device.lastseenInterval = setInterval(() => {
      const lastSeenDate = new Date(device.lastseen);
      const lastSeenDateString = lastSeenDate.toLocaleString();
      if (Date.now() - device.lastseen > 9 * 60 * 1000) device.fetchUpdate();

      if (Date.now() - device.lastseen > 10 * 60 * 1000)
        log.warn(`Device ${hk}${device.id}${wr} host ${zb}${device.host}${wr} has not been seen for 10 minutes (last time: ${lastSeenDateString}). Check the device connection.`);
      else log.info(`Device ${hk}${device.id}${nf} host ${zb}${device.host}${nf} has been seen the last time: ${lastSeenDateString}.`);
    }, 60 * 1000);

    // Start WebSocket client for gen 2 and 3 devices
    if (device.gen === 2 || device.gen === 3) {
      device.wsClient = new WsClient(host, 'tango');
      setTimeout(() => {
        device.wsClient?.start(false);
      }, 10 * 1000);

      device.wsClient.on('update', (message) => {
        if (shelly.debug) log.info(`WebSocket update from device ${hk}${device.id}${nf} host ${zb}${device.host}${nf}`);
        device.update(message);
        device.lastseen = Date.now();
      });
    }

    return device;
  }

  update(data: ShellyData) {
    if (this.gen === 1) {
      // Update active components
      for (const key in data) {
        if (key === 'lights') {
          let index = 0;
          for (const light of data[key] as ShellyData[]) {
            this.updateComponent(`light:${index++}`, light as ShellyData);
          }
        }
        if (key === 'relays') {
          let index = 0;
          for (const relay of data[key] as ShellyData[]) {
            this.updateComponent(`relay:${index++}`, relay as ShellyData);
          }
        }
        if (key === 'rollers') {
          let index = 0;
          for (const roller of data[key] as ShellyData[]) {
            this.updateComponent(`roller:${index++}`, roller as ShellyData);
          }
        }
      }
      // Update state for active components with ison
      for (const key in data) {
        if (key === 'lights' || key === 'relays') {
          let index = 0;
          for (const light of data[key] as ShellyData[]) {
            const component = this.getComponent(`${key.slice(0, 5)}:${index++}`);
            if (component && light.ison !== undefined) component.setValue('state', light.ison as boolean);
          }
        }
      }
    } else if (this.gen === 2 || this.gen === 3) {
      // Update passive components
      for (const key in data) {
        if (key === 'sys') this.updateComponent(key, data[key] as ShellyData);
      }
      // Update active components
      for (const key in data) {
        if (key.startsWith('switch:')) this.updateComponent(key, data[key] as ShellyData);
        if (key.startsWith('cover:')) this.updateComponent(key, data[key] as ShellyData);
        if (key.startsWith('light:')) this.updateComponent(key, data[key] as ShellyData);
        if (key.startsWith('pm1:')) this.updateComponent(key, data[key] as ShellyData);
      }
      // Update state for active components with output
      for (const key in data) {
        if (key.startsWith('light:') || key.startsWith('switch:')) {
          const componentData = data[key] as ShellyData;
          const component = this.getComponent(key);
          if (component && componentData.output !== undefined) component.setValue('state', componentData.output as boolean);
        }
      }
    }

    this.lastseen = Date.now();
  }

  async fetchUpdate(): Promise<void> {
    const service = this.gen === 1 ? 'status' : 'Shelly.GetStatus';
    const status = await ShellyDevice.fetch(this.log, this.host, service);
    if (!status) {
      this.log.error(`Error fetching device ${this.id} status. No data found.`);
      return;
    }
    this.update(status);
  }

  // Gen 1
  // http://192.168.1.219/light/0
  // http://192.168.1.219/light/0?turn=on
  // http://192.168.1.219/light/0?turn=off
  // http://192.168.1.219/light/0?turn=toggle

  // Gen 2 and 3 legacy
  // http://192.168.1.217/relay/0
  // http://192.168.1.217/relay/0?turn=on
  // http://192.168.1.217/relay/0?turn=off
  // http://192.168.1.217/relay/0?turn=toggle

  // http://192.168.1.218/roller/0
  // http://192.168.1.218/roller/0?go=open
  // http://192.168.1.218/roller/0?go=close
  // http://192.168.1.218/roller/0?go=stop

  // Gen 2 and 3 rpc
  // http://192.168.1.218/rpc/Switch.GetStatus?id=0
  // http://192.168.1.218/rpc/Switch.Set?id=0&on=true
  // http://192.168.1.218/rpc/Switch.Set?id=0&on=false
  // http://192.168.1.218/rpc/Switch.Toggle?id=0

  // await ShellyDevice.fetch('192.168.1.217', 'rpc/Switch.Toggle', { id: 0 });
  static async fetch(log: AnsiLogger, host: string, service: string, params: Record<string, string | number | boolean> = {}): Promise<ShellyData | null> {
    if (host === 'mock.192.168.1.217') {
      if (service === 'shelly') return shellyplus1pmShelly;
      if (service === 'Shelly.GetStatus') return shellyplus1pmStatus;
      if (service === 'Shelly.GetConfig') return shellyplus1pmSettings;
    }
    if (host === 'mock.192.168.1.218') {
      if (service === 'shelly') return shellyplus2pmShelly;
      if (service === 'Shelly.GetStatus') return shellyplus2pmStatus;
      if (service === 'Shelly.GetConfig') return shellyplus2pmSettings;
    }
    if (host === 'mock.192.168.1.219') {
      if (service === 'shelly') return shellydimmer2Shelly;
      if (service === 'status') return shellydimmer2Status;
      if (service === 'settings') return shellydimmer2Settings;
    }
    if (host === 'mock.192.168.1.220') {
      if (service === 'shelly') return shellypmminig3Shelly;
      if (service === 'Shelly.GetStatus') return shellypmminig3Status;
      if (service === 'Shelly.GetConfig') return shellypmminig3Settings;
    }
    if (host === 'mock.192.168.1.221') {
      if (service === 'shelly') return shelly1minig3Shelly;
      if (service === 'Shelly.GetStatus') return shelly1minig3Status;
      if (service === 'Shelly.GetConfig') return shelly1minig3Settings;
    }
    const gen = /^[^A-Z]*$/.test(service) ? 1 : 2;
    const url = gen === 1 ? `http://${host}/${service}` : `http://${host}/rpc`;
    try {
      const options: RequestInit = {
        method: 'POST',
        headers: gen === 1 ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/json' },
        body: gen === 1 ? getGen1BodyOptions(params) : getGen2BodyOptions('2.0', 10, 'Matterbridge', service, params),
      };
      const headers = options.headers as Record<string, string>;
      log.debug(
        `${GREY}Fetching shelly gen ${CYAN}${gen}${GREY} host ${CYAN}${host}${GREY} service ${CYAN}${service}${GREY}` +
          `${params ? ` with ${CYAN}` + JSON.stringify(params) + `${GREY}` : ''} url ${BLUE}${url}${RESET}`,
      );
      log.debug(`${GREY}options: ${JSON.stringify(options)}${RESET}`);
      let response;
      if (service === 'shelly') response = await fetch(`http://${host}/${service}`);
      else response = await fetch(url, options);
      log.debug(`${GREY}response ok: ${response.ok}${RESET}`);
      if (!response.ok) {
        // Try with authentication
        if (response.status === 401) {
          const authHeader = response.headers.get('www-authenticate');
          log.debug(`${GREY}authHeader: ${authHeader}${RESET}`);
          if (authHeader === null) throw new Error('No www-authenticate header found');
          if (authHeader.startsWith('Basic')) {
            // Gen 1 devices require basic authentication
            const authParams = parseBasicAuthenticateHeader(authHeader); // Get nonce and realm
            log.debug(`${GREY}authparams: ${JSON.stringify(authParams)}${RESET}`);
            if (!authParams.realm) throw new Error('No authenticate realm parameter found in header');
            const auth = createBasicShellyAuth('admin', 'tango');
            headers.Authorization = `Basic ${auth}`;
          } else if (authHeader.startsWith('Digest')) {
            // Gen 2 and 3 devices require digest authentication
            const authParams = parseDigestAuthenticateHeader(authHeader); // Get nonce and realm
            log.debug(`${GREY}authparams: ${JSON.stringify(authParams)}${RESET}`);
            if (!authParams.nonce) throw new Error('No authenticate nonce parameter found in header');
            if (!authParams.realm) throw new Error('No authenticate realm parameter found in header');
            const auth = createDigestShellyAuth('admin', 'tango', parseInt(authParams.nonce), crypto.randomInt(0, 999999999), authParams.realm);
            options.body = getGen2BodyOptions('2.0', 10, 'Matterbridge', service, params, auth);
          }
          log.debug(`${GREY}options: ${JSON.stringify(options)}${RESET}`);
          response = await fetch(url, options);
          if (response.ok) {
            const data = await response.json();
            const reponse = gen === 1 ? data : (data as ShellyData).result;
            // console.log(`${GREY}Response from shelly gen ${CYAN}${gen}${GREY} host ${CYAN}${host}${GREY} service ${CYAN}${service}${GREY}:${RESET}`, reponse);
            return reponse as ShellyData;
          }
        }
        log.error(
          `${RED}Response error fetching shelly gen ${gen} host ${host} service ${service}${params ? ' with ' + JSON.stringify(params) : ''} url ${url}:` +
            ` ${response.status} (${response.statusText})${RESET}`,
        );
        return null;
      }
      const data = await response.json();
      const reponse = gen === 1 ? data : (data as ShellyData).result;
      // console.log(`${GREY}Response from shelly gen ${CYAN}${gen}${GREY} host ${CYAN}${host}${GREY} service ${CYAN}${service}${GREY}:${RESET}`, reponse);
      return reponse as ShellyData;
    } catch (error) {
      log.error(`${RED}Error fetching shelly gen ${gen} host ${host} service ${service}${params ? ' with ' + JSON.stringify(params) : ''} url ${url}:`, error);
      return null;
    }
  }

  logDevice() {
    // Log the device
    this.log.debug(
      `Shelly device ${MAGENTA}${this.id}${db} (${this.model}) gen ${BLUE}${this.gen}${db} name ${BLUE}${this.name}${db} mac ${BLUE}${this.mac}${db} host ${BLUE}${this.host}${db} profile ${BLUE}${this.profile}${db} firmware ${BLUE}${this.firmware}${db} auth ${BLUE}${this.auth}${db} online ${BLUE}${this.online}${db} lastseen ${BLUE}${this.lastseen}${db}`,
    );
    for (const [key, component] of this) {
      this.log.debug(`- ${GREEN}${component.name}${db} (${BLUE}${key}${db})`);
      for (const [key, property] of component) {
        this.log.debug(`  - ${key}: ${property.value && typeof property.value === 'object' ? debugStringify(property.value) : property.value}`);
      }
    }
  }
}

if (process.argv.includes('startShelly')) {
  const log = new AnsiLogger({ logName: 'shellyDevice', logTimestampFormat: TimestampFormat.TIME_MILLIS, logDebug: true });
  const shelly = new Shelly(log, 'admin', 'tango');

  const myRealDevices: { host: string; desc: string }[] = [
    /*
    { host: '192.168.1.219', desc: 'Gen 1 Shelly Dimmer 2' },
    { host: '192.168.1.222', desc: 'Gen 1 Shelly Switch 2.5' },
    { host: '192.168.1.217', desc: 'Gen 2 Shelly Plus 1 PM' },
    { host: '192.168.1.218', desc: 'Gen 2 Shelly Plus 2 PM' },
    { host: '192.168.1.220', desc: 'Gen 3 Shelly PM mini' },
    */
    { host: '192.168.1.221', desc: 'Gen 3 Shelly 1 mini' },
  ];

  for (const device of myRealDevices) {
    log.info(`Creating Shelly device ${idn}${device.desc}${rs}${db} host ${zb}${device.host}${db}`);
    const shellyDevice = await ShellyDevice.create(shelly, log, device.host);
    if (shellyDevice) {
      shellyDevice.logDevice();
      shellyDevice.destroy();
    }
  }
  /*
  // Gen 1 devices
  await ShellyDevice.fetch(log, '192.168.1.219', 'shelly'); // Password protected
  await ShellyDevice.fetch(log, '192.168.1.219', 'light/0', { turn: 'toggle' }); // Password protected

  await ShellyDevice.fetch(log, '192.168.1.222', 'shelly'); // No auth required
  await ShellyDevice.fetch(log, '192.168.1.222', 'relay/0', { turn: 'toggle' }); // No auth required

  // Gen 2 devices
  await ShellyDevice.fetch(log, '192.168.1.221', 'shelly'); // // Password protected but no auth required for shelly
  await ShellyDevice.fetch(log, '192.168.1.221', 'Switch.Toggle', { id: 0 }); // Password protected
  await ShellyDevice.fetch(log, '192.168.1.221', 'Switch.Set', { id: 0, on: true }); // Password protected
  await ShellyDevice.fetch(log, '192.168.1.221', 'Switch.Set', { id: 0, on: false }); // Password protected
  await ShellyDevice.fetch(log, '192.168.1.221', 'Shelly.GetStatus'); // Password protected

  await ShellyDevice.fetch(log, '192.168.1.217', 'shelly'); // No auth required for shelly
  await ShellyDevice.fetch(log, '192.168.1.217', 'Switch.Toggle', { id: 0 }); // No auth required
  await ShellyDevice.fetch(log, '192.168.1.217', 'Switch.Set', { id: 0, on: true }); // Password protected
  await ShellyDevice.fetch(log, '192.168.1.217', 'Switch.Set', { id: 0, on: false }); // Password protected
  await ShellyDevice.fetch(log, '192.168.1.217', 'Shelly.GetStatus'); // No auth required
  */

  /*
  const device = await ShellyDevice.create(shelly, log, '192.168.1.217');
  if (device) device.logDevice();

  const switchComponent = device?.getComponent('switch:0');
  switchComponent?.logComponent();
  device?.update({ 'switch:0': { output: true }, 'switch:1': { output: false } });
  switchComponent?.logComponent();
  await device?.fetchUpdate();
  // console.log(shelly);
  */

  /*
  shelly = await ShellyDevice.create(log, '192.168.1.218');
  if (shelly) shelly.logDevice();
  if (shelly) {
    const component = shelly.getComponent('switch:0');
    await component?.fetchUpdate();
    component?.logComponent();
  }
  if (shelly) {
    const component = shelly.getComponent('switch:1');
    await component?.fetchUpdate();
    component?.logComponent();
  }

  shelly = await ShellyDevice.create(log, '192.168.1.219');
  if (shelly) shelly.logDevice();
  if (shelly) {
    const component = shelly.getComponent('light:0');
    await component?.fetchUpdate();
    component?.logComponent();
  }

  shelly = await ShellyDevice.create(log, '192.168.1.220');
  if (shelly) shelly.logDevice();

  shelly = await ShellyDevice.create(log, '192.168.1.221');
  if (shelly) shelly.logDevice();
*/

  process.on('SIGINT', function () {
    // device?.destroy();
    shelly.destroy();
    process.exit();
  });
  // await ShellyDevice.sendCommand('192.168.1.219', 'light', 0, 'turn=on');
}
