import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const setupHtml = await readFile(new URL('./kilrunp-setup.html', import.meta.url), 'utf8');
const environmentFiles = ['.env', '.env.local', '.env.production', '.env.production.local', 'server/.env'];
const configuredFile = '.kilrunp-configured';
const installedFile = '.kilrunp-installed';
const lockFile = '.kilrunp-setup.lock';

function value(input, name) {
  const raw = input[name];
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`${name} is required.`);
  }
  const result = raw.trim();
  if (/[\x00-\x1f\x7f"\\$]/.test(result)) {
    throw new Error(`${name} contains unsupported characters. URL-encode special characters in connection strings.`);
  }
  return result;
}

function origin(input, name, protocol) {
  let url;
  try {
    url = new URL(value(input, name));
  } catch {
    throw new Error(`${name} must be a valid ${protocol} origin.`);
  }
  if (url.protocol !== protocol || !url.hostname || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be a ${protocol} origin without a path, credentials, query, or fragment.`);
  }
  return url.origin;
}

export function makeConfiguration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid setup input.');
  if (input.confirmFreshDatabase !== true) throw new Error('Confirm that the database is new, empty and dedicated to this installation.');
  const site = origin(input, 'siteUrl', 'https:');
  const game = origin(input, 'gameUrl', 'wss:');
  if (site.replace(/^https:/, 'wss:') === game) {
    throw new Error('The website and game server need different public origins.');
  }
  const database = value(input, 'databaseUrl');
  if (!/^mongodb(?:\+srv)?:\/\/\S+$/i.test(database)) throw new Error('databaseUrl must be a MongoDB connection string.');
  const admin = value(input, 'adminSteamId');
  if (!/^\d{17}$/.test(admin)) throw new Error('adminSteamId must be a 17-digit SteamID64.');
  const steamKey = value(input, 'steamApiKey');
  const clerkPublic = value(input, 'clerkPublishableKey');
  const clerkSecret = value(input, 'clerkSecretKey');
  const webhook = value(input, 'clerkWebhookSecret');
  if (!/^pk_(live|test)_/.test(clerkPublic) || !/^sk_(live|test)_/.test(clerkSecret) || !webhook.startsWith('whsec_')) {
    throw new Error('Check the Clerk publishable key, secret key, and webhook signing secret.');
  }
  if (clerkPublic.split('_')[1] !== clerkSecret.split('_')[1]) {
    throw new Error('The Clerk publishable and secret keys must use the same environment.');
  }
  const secret = () => randomBytes(32).toString('hex');
  const joinSecret = secret();
  const adminSecret = secret();
  const web = {
    DATABASE_URL: database,
    STEAM_API_KEY: steamKey,
    AUTH_SECRET: secret(),
    NEXTAUTH_URL: site,
    NEXT_PUBLIC_SITE_URL: site,
    KILRUN_PLATFORM_URL: site,
    NEXT_PUBLIC_GAME_SERVER_URL: game,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkPublic,
    CLERK_SECRET_KEY: clerkSecret,
    CLERK_WEBHOOK_SECRET: webhook,
    GAME_JOIN_TOKEN_SECRET: joinSecret,
    GAME_SERVER_ADMIN_SECRET: adminSecret,
    SITE_SECRETS_ENCRYPTION_KEY: secret(),
    CRON_SECRET: secret(),
    KILRUN_SELF_HOSTED: '1',
    ADMIN_STEAM_IDS: admin,
  };
  const gameServer = {
    NODE_ENV: 'production',
    PORT: '2567',
    GAME_SERVER_HOST: '127.0.0.1',
    CLIENT_ORIGIN: site,
    WEB_APP_URL: site,
    GAME_JOIN_TOKEN_SECRET: joinSecret,
    GAME_SERVER_ADMIN_SECRET: adminSecret,
  };
  return { web, gameServer };
}

function serializeEnv(values) {
  return Object.entries(values).map(([key, val]) => `${key}=${JSON.stringify(val)}\n`).join('');
}

function parseEnv(contents) {
  const result = {};
  for (const line of contents.split('\n')) {
    if (!line) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error('Installer configuration has an invalid line.');
    const parsed = JSON.parse(match[2]);
    if (typeof parsed !== 'string') throw new Error('Installer configuration has an invalid value.');
    result[match[1]] = parsed;
  }
  return result;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function runCommand(root, directory, args, env) {
  // npm.cmd is a batch file on Windows; the arguments here are fixed by the installer.
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', ...args] : args;
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: path.join(root, directory), env, stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(' ')} failed (${signal || `exit ${code}`}). See the setup terminal for details.`));
    });
  });
}

export async function runInstallation(root, onStep) {
  const web = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
  const env = { ...process.env };
  for (const key of Object.keys(web)) delete env[key];
  delete env.NODE_ENV;
  delete env.npm_config_production;
  delete env.npm_config_omit;
  Object.assign(env, web);
  const steps = [
    ['Installing website dependencies', '', ['ci']],
    ['Installing game-server dependencies', 'server', ['ci']],
    ['Building the game server', 'server', ['run', 'build']],
    ['Preparing the database schema', '', ['run', 'db:push']],
    ['Loading the initial platform catalog', '', ['run', 'db:seed']],
    ['Building the website', '', ['run', 'build']],
  ];
  for (const [label, directory, args] of steps) {
    onStep(label);
    await runCommand(root, directory, args, env);
  }
}

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new Error('Setup request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid setup request.');
  }
}

function matchesToken(provided, expected) {
  if (typeof provided !== 'string') return false;
  const actual = Buffer.from(provided);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

/**
 * Bind only to loopback; a remote operator must use an authenticated SSH tunnel.
 * The token is passed in the URL fragment and authenticated on every API request.
 */
export async function startSetup({ root, port = 43129, resume = false, install = runInstallation }) {
  const lockPath = path.join(root, lockFile);
  const lock = await open(lockPath, 'wx', 0o600);
  let server;
  try {
    if (await exists(path.join(root, installedFile))) {
      throw new Error('This installation is already marked complete. Setup will not overwrite it.');
    }
    if (resume) {
      if (!(await exists(path.join(root, configuredFile))) ||
          !(await exists(path.join(root, '.env'))) ||
          !(await exists(path.join(root, 'server/.env')))) {
        throw new Error('No complete KilrunP configuration was found to resume.');
      }
      for (const name of environmentFiles.slice(1, -1)) {
        if (await exists(path.join(root, name))) throw new Error(`${name} conflicts with the installer configuration.`);
      }
      const saved = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
      if (saved.KILRUN_SELF_HOSTED !== '1') throw new Error('The saved configuration is not in self-hosted mode.');
    } else {
      for (const name of [...environmentFiles, configuredFile]) {
        if (await exists(path.join(root, name))) {
          throw new Error(`${name} already exists. Setup will not overwrite existing configuration.`);
        }
      }
    }

    const token = randomBytes(32).toString('hex');
    let state = { phase: 'ready', message: resume ? 'Ready to resume the existing configuration.' : 'Ready to install.' };
    let configured = resume;
    server = createServer(async (req, res) => {
      const address = server.address();
      const allowedHosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
      if (!allowedHosts.includes(req.headers.host)) return send(res, 403, { error: 'Invalid host.' });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
        return send(res, 403, { error: 'Invalid origin.' });
      }
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        });
        return res.end(setupHtml);
      }
      if (!matchesToken(req.headers['x-kilrunp-token'], token)) return send(res, 401, { error: 'Invalid setup token.' });
      if (req.method === 'GET' && req.url === '/status') return send(res, 200, { ...state, configured });
      if (req.method !== 'POST' || req.url !== '/install') return send(res, 404, { error: 'Not found.' });
      if (state.phase === 'running' || state.phase === 'complete') return send(res, 409, { error: 'Setup is already running or complete.' });
      state = { phase: 'running', message: 'Validating configuration' };
      try {
        if (!configured) {
          const config = makeConfiguration(await body(req));
          // Exclusive creation refuses to replace an existing configuration, even if it appeared after startup.
          await writeFile(path.join(root, '.env'), serializeEnv(config.web), { flag: 'wx', mode: 0o600 });
          await writeFile(path.join(root, 'server/.env'), serializeEnv(config.gameServer), { flag: 'wx', mode: 0o600 });
          await writeFile(path.join(root, configuredFile), 'KilrunP configuration created\n', { flag: 'wx', mode: 0o600 });
          configured = true;
        }
        send(res, 202, { message: 'Installation started.' });
        try {
          await install(root, (message) => { state = { phase: 'running', message }; });
          await writeFile(path.join(root, installedFile), 'KilrunP build and database setup completed\n', { flag: 'wx', mode: 0o600 });
          state = { phase: 'complete', message: 'Build and database setup complete. Follow the hosting instructions to start the services and configure HTTPS.' };
        } catch (error) {
          console.error('[KilrunP setup]', error);
          state = { phase: 'failed', message: 'Installation failed. Check the setup terminal for details; retry here or restart with --resume.' };
        }
      } catch (error) {
        console.error('[KilrunP setup]', error);
        state = { phase: 'failed', message: error instanceof Error ? error.message : 'Setup failed. Check the setup terminal.' };
        return send(res, 400, { error: state.message });
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    server.once('close', () => {
      lock.close().then(() => unlink(lockPath)).catch((error) => console.error('[KilrunP setup] Could not release lock:', error));
    });
    function stop() {
      if (state.phase === 'running') {
        console.error('Installation is still running. Wait for it to finish before stopping setup.');
        return false;
      }
      server.close();
      return true;
    }
    return { server, token, port: server.address().port, stop };
  } catch (error) {
    await lock.close();
    await unlink(lockPath);
    throw error;
  }
}

const entry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (entry) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--resume')) {
    console.error('Usage: node scripts/kilrunp-setup.mjs [--resume]');
    process.exitCode = 1;
  } else {
    try {
      const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
      const setup = await startSetup({ root, resume: args.includes('--resume') });
      console.log(`KilrunP setup is private to this computer: http://127.0.0.1:${setup.port}/#${setup.token}`);
      console.log('For a remote host, forward port 43129 over SSH. Do not share the setup URL.');
      console.log('Press Ctrl+C after setup. Installation command output appears in this terminal.');
      process.on('SIGINT', () => setup.stop());
      process.on('SIGTERM', () => setup.stop());
    } catch (error) {
      console.error('[KilrunP setup]', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
