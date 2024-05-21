# <img src="https://github.com/Luligu/matterbridge/blob/main/frontend/public/matterbridge%2064x64.png" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge shelly plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-shelly.svg)](https://www.npmjs.com/package/matterbridge-shelly)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-shelly.svg)](https://www.npmjs.com/package/matterbridge-shelly)
![Node.js CI](https://github.com/Luligu/matterbridge-shelly/actions/workflows/build%20matterbridge%20plugin.yml/badge.svg)

[![power by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![power by](https://img.shields.io/badge/powered%20by-matter--history-blue)](https://www.npmjs.com/package/matter-history)
[![power by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![power by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

This plugin allows to expose the shelly gen 1 and gen 2+ devices .

## Prerequisites

### Matterbridge

Follow these steps to install or update Matterbridge if it is not already installed and up to date:

on Windows:

```
npm install -g matterbridge
```

on Linux (you need the necessary permissions):

```
sudo npm install -g matterbridge
```

See the complete guidelines on [Matterbridge](https://github.com/Luligu/matterbridge/blob/main/README.md) for more information.

### Any shelly device

A working shelly device gen. 1 or 2 or 3.

For Gen. 1 devices:

- CoIoT: the CoIoT (coap) service must be enabled and the CoIoT peer must be mcast. If mcast is not working on your network put in the peer the Matterbridge ipv4Address an d port 5683 (e.g. 192.168.1.100:5683). Multicast may not work for all networks due to router or access poit configuration or network topology. If CoIoT is not configured correctly you will not receive any update from the device.

## How to install

On windows:

```
cd $HOME\Matterbridge
npm install -g matterbridge-shelly
matterbridge -add matterbridge-shelly
```

On linux:

```
cd ~/Matterbridge
sudo npm install -g matterbridge-shelly
matterbridge -add matterbridge-shelly
```

Then start Matterbridge

```
matterbridge -bridge
```

## How to use it

If the whiteList is defined only the devices included are exposed to Matter.

If the blackList is defined the devices included will not be exposed to Matter.

If any device creates issues put it in the blackList.

These are the config values:

```
{
  "name": "matterbridge-shelly",
  "type": "DynamicPlatform",
  "username": "<USERNAME>",
  "password": "<PASSWORD>",
  "blackList": [],
  "whiteList": [],
  "ip": {
    "<DEVICENAME1>": x.x.x.x,
    "<DEVICENAME2>": x.x.x.x
  }
}
```

You can edit the config file from the frontend or

On windows:

```
cd $HOME\.matterbridge
notepad matterbridge-somfy-tahoma.config.json
```

On linux:

```
cd ~/.matterbridge
nano matterbridge-somfy-tahoma.config.json
```

Restart Matterbridge for the changes to take effect.
