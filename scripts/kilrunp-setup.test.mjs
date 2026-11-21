import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { makeConfiguration, runInstallation, startSetup } from './kilrunp-setup.mjs';

const valid = {
  siteUrl: 'https://example.com',
  gameUrl: 'wss://game.example.com',
  databaseUrl: 'mongodb+srv://user:pass@cluster.example.com/kilrun',
  adminSteamId: '12345678901234567',
  steamApiKey: 'steam-key',
  clerkPublishableKey: 'pk_test_example',
  clerkSecretKey: 'sk_test_example',
  clerkWebhookSecret: 'whsec_example',
  confirmFreshDatabase: true,
};

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kilrunp-setup-test-'));
  await mkdir(path.join(root, 'server'));
  const servers = [];
  t.after(async () => {
    for (const { server, beforeClose } of servers) {
      if (beforeClose) beforeClose();
      if (server.listening) await close(server, root);
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, track: (server, beforeClose) => servers.push({ server, beforeClose }) };
}

async function close(server, root) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  for (let i = 0; i < 100; i++) {
    try {
      await stat(path.join(root, '.kilrunp-setup.lock'));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Setup did not release its lock.');
}

test('configuration validates origins, credentials and dedicated database consent', () => {
  const result = makeConfiguration(valid);
  assert.equal(result.web.KILRUN_SELF_HOSTED, '1');
  assert.equal(result.web.ADMIN_STEAM_IDS, valid.adminSteamId);
  assert.equal(result.web.GAME_JOIN_TOKEN_SECRET, result.gameServer.GAME_JOIN_TOKEN_SECRET);
  assert.equal(result.web.GAME_SERVER_ADMIN_SECRET, result.gameServer.GAME_SERVER_ADMIN_SECRET);
  assert.notEqual(result.web.GAME_JOIN_TOKEN_SECRET, result.web.GAME_SERVER_ADMIN_SECRET);
  assert.throws(() => makeConfiguration({ ...valid, siteUrl: 'http://example.com' }), /https:/);
  assert.throws(() => makeConfiguration({ ...valid, gameUrl: 'wss://example.com/path' }), /without a path/);
  assert.throws(() => makeConfiguration({ ...valid, gameUrl: 'wss://example.com' }), /different public origins/);
  assert.throws(() => makeConfiguration({ ...valid, clerkSecretKey: 'sk_live_example' }), /same environment/);
  assert.throws(() => makeConfiguration({ ...valid, databaseUrl: 'mongodb://host/$unsafe' }), /URL-encode/);
  assert.throws(() => makeConfiguration({ ...valid, confirmFreshDatabase: false }), /dedicated/);
  assert.throws(() => makeConfiguration({ ...valid, adminSteamId: '123' }), /17-digit/);
});

test('private wizard rejects unauthorized requests and creates configuration once', async (t) => {
  const { root, track } = await fixture(t);
  let release;
  const running = new Promise((resolve) => { release = resolve; });
  let callCount = 0;
  const setup = await startSetup({
    root, port: 0,
    install: async (_root, step) => {
      callCount++;
      step('Building test installation');
      await running;
    },
  });
  track(setup.server, () => release());
  await assert.rejects(startSetup({ root, port: 0 }), { code: 'EEXIST' });
  const base = `http://127.0.0.1:${setup.port}`;
  const auth = { 'x-kilrunp-token': setup.token, 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/status`)).status, 401);
  assert.equal((await fetch(`${base}/status`, { headers: { ...auth, origin: 'https://evil.example' } })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = request(`${base}/status`, { headers: { ...auth, host: `evil.example:${setup.port}` } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(badHostStatus, 403);
  const invalid = await fetch(`${base}/install`, {
    method: 'POST', headers: auth, body: JSON.stringify({ ...valid, adminSteamId: 'bad' }),
  });
  assert.equal(invalid.status, 400);
  await assert.rejects(readFile(path.join(root, '.env')), { code: 'ENOENT' });
  const started = await fetch(`${base}/install`, { method: 'POST', headers: auth, body: JSON.stringify(valid) });
  assert.equal(started.status, 202);
  const again = await fetch(`${base}/install`, { method: 'POST', headers: auth, body: '{}' });
  assert.equal(again.status, 409);
  assert.equal(callCount, 1);
  assert.equal(setup.stop(), false);
  const web = await readFile(path.join(root, '.env'), 'utf8');
  const game = await readFile(path.join(root, 'server', '.env'), 'utf8');
  assert.match(web, /KILRUN_SELF_HOSTED="1"/);
  assert.match(web, /ADMIN_STEAM_IDS="12345678901234567"/);
  const webJoin = /^GAME_JOIN_TOKEN_SECRET="(.*)"$/m.exec(web)[1];
  assert.match(game, new RegExp(`GAME_JOIN_TOKEN_SECRET="${webJoin}"`));
  const childEnv = { ...process.env };
  delete childEnv.GAME_JOIN_TOKEN_SECRET;
  assert.equal(execFileSync(process.execPath, [
    `--env-file=${path.join(root, 'server', '.env')}`, '-p', 'process.env.GAME_JOIN_TOKEN_SECRET',
  ], { env: childEnv, encoding: 'utf8' }).trim(), webJoin);
  release();
  for (let i = 0; i < 50; i++) {
    const data = await (await fetch(`${base}/status`, { headers: auth })).json();
    if (data.phase === 'complete') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.match(await readFile(path.join(root, '.kilrunp-installed'), 'utf8'), /completed/);
  assert.equal((await fetch(`${base}/install`, { method: 'POST', headers: auth, body: '{}' })).status, 409);
});

test('installation executes the expected commands in order with the generated configuration', async (t) => {
  const { root } = await fixture(t);
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  const log = path.join(root, 'commands.log');
  const executable = path.join(bin, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const script = process.platform === 'win32'
    ? '@echo off\r\necho %* ^| %KILRUN_SELF_HOSTED% >>"%KILRUNP_TEST_LOG%"\r\nif "%*"=="%KILRUNP_FAIL_COMMAND%" exit /b 9\r\nexit /b 0\r\n'
    : '#!/bin/sh\nprintf "%s | %s\\n" "$*" "$KILRUN_SELF_HOSTED" >> "$KILRUNP_TEST_LOG"\nif [ "$*" = "$KILRUNP_FAIL_COMMAND" ]; then exit 9; fi\n';
  await writeFile(executable, script, { mode: 0o755 });
  await writeFile(path.join(root, '.env'), 'KILRUN_SELF_HOSTED="1"\n');
  const oldPath = process.env.PATH;
  const oldLog = process.env.KILRUNP_TEST_LOG;
  const oldFail = process.env.KILRUNP_FAIL_COMMAND;
  process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
  process.env.KILRUNP_TEST_LOG = log;
  delete process.env.KILRUNP_FAIL_COMMAND;
  try {
    const steps = [];
    await runInstallation(root, (step) => steps.push(step));
    assert.deepEqual((await readFile(log, 'utf8')).trim().split(/\r?\n/).map((line) => line.trim()), [
      'ci | 1', 'ci | 1', 'run build | 1', 'run db:push | 1', 'run db:seed | 1', 'run build | 1',
    ]);
    assert.equal(steps.length, 6);
    await writeFile(log, '');
    process.env.KILRUNP_FAIL_COMMAND = 'run db:push';
    await assert.rejects(runInstallation(root, () => {}), /npm run db:push failed \(exit 9\)/);
    assert.equal((await readFile(log, 'utf8')).trim().split(/\r?\n/).length, 4);
  } finally {
    process.env.PATH = oldPath;
    if (oldLog === undefined) delete process.env.KILRUNP_TEST_LOG;
    else process.env.KILRUNP_TEST_LOG = oldLog;
    if (oldFail === undefined) delete process.env.KILRUNP_FAIL_COMMAND;
    else process.env.KILRUNP_FAIL_COMMAND = oldFail;
  }
});

test('existing configuration and completed installs cannot be overwritten', async (t) => {
  const { root } = await fixture(t);
  await writeFile(path.join(root, '.env.local'), 'existing');
  await assert.rejects(startSetup({ root, port: 0 }), /already exists/);
  assert.equal(await readFile(path.join(root, '.env.local'), 'utf8'), 'existing');
  await writeFile(path.join(root, '.kilrunp-installed'), 'complete');
  await assert.rejects(startSetup({ root, port: 0, resume: true }), /already marked complete/);
});

test('failed installation can resume without changing existing secrets', async (t) => {
  const { root, track } = await fixture(t);
  const first = await startSetup({ root, port: 0, install: async () => { throw new Error('test failure'); } });
  track(first.server);
  const base = `http://127.0.0.1:${first.port}`;
  const headers = { 'x-kilrunp-token': first.token, 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/install`, { method: 'POST', headers, body: JSON.stringify(valid) })).status, 202);
  for (let i = 0; i < 50; i++) {
    const state = await (await fetch(`${base}/status`, { headers })).json();
    if (state.phase === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const before = await readFile(path.join(root, '.env'), 'utf8');
  await close(first.server, root);
  const second = await startSetup({ root, port: 0, resume: true, install: async () => {} });
  track(second.server);
  const resumed = await fetch(`http://127.0.0.1:${second.port}/install`, {
    method: 'POST', headers: { 'x-kilrunp-token': second.token }, body: '{}',
  });
  assert.equal(resumed.status, 202);
  assert.equal(await readFile(path.join(root, '.env'), 'utf8'), before);
  for (let i = 0; i < 50; i++) {
    const data = await (await fetch(`http://127.0.0.1:${second.port}/status`, {
      headers: { 'x-kilrunp-token': second.token },
    })).json();
    if (data.phase === 'complete') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.match(await readFile(path.join(root, '.kilrunp-installed'), 'utf8'), /completed/);
});
