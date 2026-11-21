# KilrunP: independent hosting

KilrunP is the self-hosted Kilrun platform and game server. The setup wizard
prepares configuration, installs dependencies, initializes a **new, empty**
MongoDB database and builds both services. It does **not** buy or configure
hosting, set up DNS or HTTPS, run the services permanently, or produce a
Windows engine installer. A real external deployment has not yet been
validated end to end; do not represent this as a finished one-click installer.

For an evaluation archive, the seller can run the Windows packaging script
`scripts/package-kilrunp.ps1` with an `-OutputPath` that does not already
exist. It uses tracked project files plus the setup files explicitly listed
in the script, excludes private configuration and user uploads except the
two built-in engine branding assets, and fails on other untracked project
files. Review all bundled assets and dependency licenses before distribution.

## What a buyer needs

1. A license and the complete Kilrun source/package from the seller. A domain
   name by itself does not include the application or hosting.
2. Hosting that runs **two persistent Node.js processes**, supports npm and
   WebSockets, and provides a writable, persistent filesystem for uploads.
   The examples below use a Linux server with SSH. Standard PHP/FTP-only hosting
   cannot run this application. FTP can transfer files but cannot start its
   services. Ask the provider whether its specific plan supports these needs.
3. Node.js **20.19 or newer**, npm, enough disk and memory to install and build
   the project, and internet access to install dependencies. A supported Node
   LTS release and a process manager are recommended.
4. A domain and DNS control. This example uses `example.com` for the website
   and `game.example.com` for the game server, both pointing to the host.
   HTTPS/TLS and WebSocket proxying are needed; a proxy such as Caddy can
   obtain certificates when DNS and ports 80/443 are configured correctly.
5. A **new, empty MongoDB database** accessible from the host, with replica-set
   transaction support, credentials and a connection string. MongoDB Atlas
   is one option. Configure the database network allowlist for the host and
   keep credentials private. MongoDB hosting may have its own costs.
6. A Steam account, its 17-digit SteamID64 and a Steam Web API key.
7. A Clerk application for the website domain, with publishable and secret
   keys, email verification configured, and a webhook pointing to
   `https://example.com/api/webhooks/clerk` for `user.created` and
   `user.updated`. Save the webhook signing secret for the wizard. For
   custom delivery through Resend, also configure `email.created` and Resend;
   otherwise configure Clerk's own email delivery. Services, domain renewal,
   hosting, email and optional code signing can cost extra.

The buyer should use their own accounts and credentials, not the seller's.
Setup generates new application and shared game-server secrets. Never put
secrets in a public web directory or distribute an existing `.env` file.

## Prepare and launch

1. Upload or extract the **complete project** to a private application
   directory on the host, for example `/srv/kilrun`. Include `server/`,
   `shared/` and both npm lockfiles; do not put the project itself inside a
   public FTP/web document root. Run the services and setup as a dedicated,
   unprivileged user who owns this directory.
2. From the project directory on that host run:

   ```sh
   node scripts/kilrunp-setup.mjs
   ```

   This initial command needs Node, but does not require the project
   dependencies to be installed first. It prints a private URL containing a
   temporary setup token. Keep the terminal and URL private.
3. The setup server listens only on `127.0.0.1:43129`. For a remote Linux
   server, open an SSH tunnel **from the buyer's computer** in another
   terminal, replacing the account and host:

   ```sh
   ssh -L 43129:127.0.0.1:43129 user@your-server
   ```

   Open the exact URL printed by setup in the buyer's browser through that
   tunnel. Do not expose port 43129 to the internet or share the URL. If the
   browser loses the URL on refresh, open the printed URL again.
4. Enter the website HTTPS origin, game `wss://` origin, connection string,
   SteamID64, Steam key and Clerk keys. URL-encode special characters in the
   database connection string. The form requires confirmation that the
   database is new and empty: schema sync and initial catalog seeding alter it.
5. Select **Install KilrunP** and keep the setup terminal open. The wizard
   creates private `.env` and `server/.env` files, installs both sets of npm
   dependencies, builds the game server, pushes the schema, seeds initial
   content, then builds the website. Watch the terminal for detailed errors.
   It does not overwrite existing configuration or re-run a completed setup.
   Do not start using the site until setup has succeeded.

If a build or database step fails, correct the underlying problem and retry
in the wizard. After restarting the setup process, use:

```sh
node scripts/kilrunp-setup.mjs --resume
```

Resume reuses the saved secrets and repeats the steps, including schema sync
and seed. It is intended for an unfinished installation, not an upgrade or
an active database. If configuration creation itself was interrupted,
inspect the files and resolve the partial configuration manually; the wizard
will not overwrite them. An interrupted or forcibly killed process can leave
`.kilrunp-setup.lock`: verify no setup or child installation process is still
running before an operator removes that **specific** lock file. Back up
configuration, the database and uploads before any manual recovery.

## Start the services and connect the domain

Configure the hosting provider's process manager to start both processes on
boot and restart them on failure, as the same unprivileged installation user:

```sh
# Website, working directory: /srv/kilrun
./node_modules/.bin/next start --hostname 127.0.0.1 --port 3000

# Game server, working directory: /srv/kilrun/server
node --env-file=.env dist/server/src/index.js
```

The website reads its root `.env`; the game server explicitly loads
`server/.env`. The generated game server configuration binds to
`127.0.0.1:2567`; do not expose internal ports directly. Do not set conflicting
environment variables in the process manager. Configure the HTTPS proxy to
forward the website hostname to `127.0.0.1:3000` and the game hostname to
`127.0.0.1:2567`, including WebSocket upgrades.
After starting the game service, check `http://127.0.0.1:2567/healthz` from
the host and inspect both services' logs if either process fails.

For example, after installing Caddy and setting DNS, a Caddyfile can contain
the following. Replace both hostnames and the absolute path. This example
assumes a single server and should be adapted to the provider's setup:

```caddyfile
example.com {
    handle /uploads/* {
        root * /srv/kilrun/public
        header Access-Control-Allow-Origin *
        file_server
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
game.example.com {
    reverse_proxy 127.0.0.1:2567
}
```

Serve `/uploads/` from the persistent public directory: the Next.js
production server indexes public files at startup, so files uploaded later
may otherwise be unavailable until restart. Allow the application user to
write `public/uploads`, and the proxy user to read that directory and
traverse its parents. Do not grant the proxy access to `.env` or other source
files. Keep ports 80/443 reachable for public access and certificate renewal.

Visit the HTTPS website, sign in with the configured Steam account, and check
the admin panel. Configure the Clerk webhook and test email verification.
From the admin dashboard, check database status and active maps; verify a real
multiplayer session through the game domain. Site settings, maps and assets
may require further administrator setup.

## Operations and limitations

- Back up MongoDB, `public/uploads`, and the private configuration files.
  Keep the generated `SITE_SECRETS_ENCRYPTION_KEY` safe: losing it prevents
  decryption of secrets stored in the site's vault. Protect backups as secrets.
- Public `NEXT_PUBLIC_*` settings are embedded at website build time.
  Changing the domain or game URL requires a rebuild and service restart;
  update the game server's `WEB_APP_URL` and `CLIENT_ORIGIN` as well. This
  setup wizard is not an update or domain-change tool.
- The Windows engine installer must be built separately for the buyer's
  platform URL on a Windows build machine; the seller's existing executable
  may point to the seller's site. See [`desktop/README.md`](../desktop/README.md).
- Configure a secure scheduler for the daily VIP-expiry endpoint using the
  generated `CRON_SECRET`; the wizard does not install a scheduler.
- Setup tokens protect the local wizard, not the host itself. Restrict SSH
  access, use OS file permissions and keep dependencies and the host updated.
  `.env` permissions created by setup are `0600` on systems that support them.
- This guide describes a supported architecture, not a guarantee that every
  host or shared plan can run it. Test the actual host, services, email,
  uploads, backup/restore and gameplay before offering it to buyers.
