import { AnsiLogger, BLUE, CYAN, TimestampFormat, db, debugStringify, hk, idn, nf, rs, zb } from 'node-ansi-logger';
import mdns, { ResponsePacket } from 'multicast-dns';
import EventEmitter from 'events';

export interface DiscoveredDevice {
  id: string;
  host: string;
  port: number;
  gen: number;
}

export type DiscoveredDeviceListener = (data: DiscoveredDevice) => void;

export class MdnsScanner extends EventEmitter {
  private discoveredDevices = new Map<string, DiscoveredDevice>();
  private log;
  private scanner?: mdns.MulticastDNS;
  private _isScanning = false;
  private scannerTimeout?: NodeJS.Timeout;
  private queryTimeout?: NodeJS.Timeout;

  constructor(debug = false) {
    super();
    this.log = new AnsiLogger({ logName: 'mdnsShellyDiscover', logTimestampFormat: TimestampFormat.TIME_MILLIS, logDebug: debug });
  }

  get isScanning() {
    return this._isScanning;
  }

  private sendQuery() {
    this.scanner?.query([
      { name: '_http._tcp.local', type: 'PTR' },
      { name: '_shelly._tcp.local', type: 'PTR' },
    ]);
    this.log.info('Sent mDNS query for shelly devices.');
  }

  start(shutdownTimeout?: number, debug = false) {
    this.log.info('Starting mDNS query service for shelly devices...');
    this._isScanning = true;

    this.scanner = mdns();
    this.scanner.on('response', async (response: ResponsePacket) => {
      let port = 0;
      let gen = 0;
      for (const a of response.answers) {
        if (debug && a.type === 'PTR') {
          this.log.debug(`[${idn}${a.type}${rs}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'PTR' && a.name === '_http._tcp.local') {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'A' && a.name.startsWith('shelly')) {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'NSEC' && a.name.startsWith('shelly')) {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'SRV' && a.name.startsWith('shelly')) {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'TXT' && a.name.startsWith('shelly')) {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${a.data}`);
        }
        if (a.type === 'SRV' && a.name.startsWith('shelly')) {
          port = a.data.port;
        }
        if (a.type === 'A' && a.name.startsWith('shelly')) {
          if (!this.discoveredDevices.has(a.name.replace('.local', ''))) {
            this.log.info(`Discovered shelly gen: ${CYAN}1${nf} device id: ${hk}${a.name.replace('.local', '')}${nf} host: ${zb}${a.data}${nf} port: ${zb}${port}${nf}`);
            this.discoveredDevices.set(a.name.replace('.local', ''), { id: a.name.replace('.local', ''), host: a.data, port, gen: 1 });
            this.emit('discovered', { id: a.name.replace('.local', ''), host: a.data, port, gen: 1 });
          }
        }
      }
      for (const a of response.additionals) {
        if (debug && a.type === 'PTR') {
          this.log.debug(`[${idn}${a.type}${rs}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'PTR' && a.name === '_http._tcp.local') {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'A' && a.name.startsWith('shelly')) {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'NSEC' && a.name.startsWith('shelly')) {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'SRV') {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${typeof a.data === 'string' ? a.data : debugStringify(a.data)}`);
        }
        if (debug && a.type === 'TXT') {
          this.log.debug(`[${BLUE}${a.type}${db}] Name: ${CYAN}${a.name}${db} data: ${a.data}`);
        }
        if (a.type === 'SRV' && a.name.startsWith('shelly')) {
          port = a.data.port;
        }
        if (a.type === 'TXT' && a.name.startsWith('shelly')) {
          gen = parseInt(a.data.toString().replace('gen=', ''));
        }
        if (a.type === 'A' && a.name.startsWith('Shelly')) {
          if (!this.discoveredDevices.has(a.name.replace('.local', '').toLowerCase())) {
            this.log.info(
              `Discovered shelly gen: ${CYAN}${gen}${nf} device id: ${hk}${a.name.replace('.local', '').toLowerCase()}${nf} host: ${zb}${a.data}${nf} port: ${zb}${port}${nf}`,
            );
            this.discoveredDevices.set(a.name.replace('.local', '').toLowerCase(), { id: a.name.replace('.local', '').toLowerCase(), host: a.data, port, gen });
            this.emit('discovered', { id: a.name.replace('.local', '').toLowerCase(), host: a.data, port, gen });
          }
        }
      }
    });

    this.sendQuery();

    this.queryTimeout = setInterval(() => {
      this.sendQuery();
    }, 60 * 1000);

    if (shutdownTimeout && shutdownTimeout > 0) {
      this.scannerTimeout = setTimeout(() => {
        this.stop();
      }, shutdownTimeout * 1000);
    }
    this.log.info('Started mDNS query service for shelly devices.');
  }

  stop() {
    this.log.info('Stopping mDNS query service...');
    if (this.scannerTimeout) clearTimeout(this.scannerTimeout);
    if (this.queryTimeout) clearTimeout(this.queryTimeout);
    this._isScanning = false;
    this.scannerTimeout = undefined;
    this.queryTimeout = undefined;
    this.scanner?.destroy();
    this.scanner = undefined;
    this.removeAllListeners();
    this.logPeripheral();
    this.log.info('Stopped mDNS query service.');
  }

  logPeripheral() {
    this.log.info(`Discovered ${this.discoveredDevices.size} shelly devices:`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [name, { id, host, port, gen }] of this.discoveredDevices) {
      this.log.info(`- id: ${hk}${name}${nf} host: ${zb}${host}${nf} port: ${zb}${port}${nf} gen: ${CYAN}${gen}${nf}`);
    }
    return this.discoveredDevices.size;
  }
}

if (process.argv.includes('mdnsScanner')) {
  const mdnsScanner = new MdnsScanner();
  mdnsScanner.start(undefined, true);

  process.on('SIGINT', async function () {
    mdnsScanner.stop();
    // process.exit();
  });
}
