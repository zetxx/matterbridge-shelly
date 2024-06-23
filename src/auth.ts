/**
 * This file contains the auth functions.
 *
 * @file src\auth.ts
 * @author Luca Liguori
 * @date 2024-05-01
 * @version 1.0.0
 *
 * Copyright 2024, 2025 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. *
 */

import crypto from 'crypto';

export interface AuthParams {
  realm: string; // device_id
  username: string; // admin
  nonce: number; // generated by device
  cnonce: number; // random number
  response: string; // hash <<user>:<realm>:<password>> + ":" + <nonce> + ":" + <nc> + ":" + <cnonce> + ":" + "auth" + ":" + <dummy_method:dummy_uri>
  algorithm: string; // SHA-256
}

export function parseBasicAuthenticateHeader(authHeader: string): Record<string, string> {
  // 'Digest qop="auth", realm="shelly1minig3-543204547478", nonce="1716556501", algorithm=SHA-256'
  authHeader = authHeader.replace('Basic ', '');
  const authParams: Record<string, string> = {};
  authHeader.split(', ').forEach((param) => {
    const [key, value] = param.split('=');
    authParams[key.trim()] = value.replace(/"/g, '');
  });
  return authParams;
}

export function parseDigestAuthenticateHeader(authHeader: string): Record<string, string> {
  // 'Digest qop="auth", realm="shelly1minig3-543204547478", nonce="1716556501", algorithm=SHA-256'
  authHeader = authHeader.replace('Digest ', '');
  const authParams: Record<string, string> = {};
  authHeader.split(', ').forEach((param) => {
    const [key, value] = param.split('=');
    authParams[key.trim()] = value.replace(/"/g, '');
  });
  return authParams;
}

export function createBasicShellyAuth(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`).toString('base64');
}

export function createDigestShellyAuth(username: string, password: string, nonce: number, cnonce: number, realm: string, nc = 1): AuthParams {
  const auth: AuthParams = { realm, username, nonce, cnonce, response: '', algorithm: 'SHA-256' };
  const ha1 = crypto.createHash('sha256').update(`admin:${auth.realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('sha256').update('dummy_method:dummy_uri').digest('hex');
  auth.response = crypto.createHash('sha256').update(`${ha1}:${auth.nonce}:${nc}:${cnonce}:auth:${ha2}`).digest('hex');
  return auth;
}

export function getGen1BodyOptions(params?: Record<string, string | number | boolean>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new URLSearchParams(params as any).toString();
}

export function getGen2BodyOptions(jsonrpc: string, id: number, src: string, method: string, params?: Record<string, string | number | boolean>, auth?: AuthParams): string {
  const body: Record<string, string | number | boolean | object | AuthParams> = {};
  body.jsonrpc = '2.0';
  body.id = 10;
  body.src = 'Matterbridge';
  body.method = method;
  if (params) body.params = params;
  if (auth) body.auth = auth;
  return JSON.stringify(body);
}

/*
// node dist/auth.js startAuth debug
if (process.argv.includes('startAuth')) {
  const log = new AnsiLogger({ logName: 'shellyDevice', logTimestampFormat: TimestampFormat.TIME_MILLIS, logDebug: process.argv.includes('debug') ? true : false });
  const shelly = new Shelly(log, 'admin', 'tango', process.argv.includes('debug') ? true : false);

  const myRealDevices: { host: string; desc: string }[] = [
    { host: '192.168.1.219', desc: 'Gen 1 Shelly Dimmer 2' },
    { host: '192.168.1.222', desc: 'Gen 1 Shelly Switch 2.5' },
    { host: '192.168.1.217', desc: 'Gen 2 Shelly Plus 1 PM' },
    { host: '192.168.1.218', desc: 'Gen 2 Shelly Plus 2 PM' },
    { host: '192.168.1.220', desc: 'Gen 3 Shelly PM mini' },
    { host: '192.168.1.221', desc: 'Gen 3 Shelly 1 mini' },
    { host: '192.168.1.224', desc: 'Gen 2 Shelly i4' },
    { host: '192.168.1.225', desc: 'Gen 3 Shelly 1PM mini' },
  ];

  for (const device of myRealDevices) {
    log.info(`Creating Shelly device ${idn}${device.desc}${rs}${db} host ${zb}${device.host}${db}`);
    const shellyDevice = await ShellyDevice.create(shelly, log, device.host);
    if (shellyDevice) {
      shellyDevice.logDevice();
      shellyDevice.destroy();
    }
  }

  process.on('SIGINT', function () {
    shelly.destroy();
    // process.exit();
  });
}
*/
