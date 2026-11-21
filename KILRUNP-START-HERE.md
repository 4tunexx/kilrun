# Start here: KilrunP

This package contains the Kilrun platform source, game-server source and the
private setup wizard. It is an **evaluation package**: the installation has
not yet been verified on an external host. It is not a PHP/FTP-only installer.

## Where to upload it

Choose a host that supports two persistent Node.js processes, npm, WebSockets,
SSH and writable persistent storage. Upload and extract this ZIP into a private
application directory on that host, for example `/srv/kilrun` or a private
directory under your hosting account. **Do not extract it into `public_html`
or a public web document root:** the setup creates private configuration files.

You also need your own domain and DNS, HTTPS, a new empty MongoDB database
supporting transactions, a Steam account and API key, and a Clerk application.
Your host needs internet access to install the npm dependencies. These services
are not included in the ZIP and can have separate costs.

## Start the wizard

1. Connect to the host with SSH and change into the extracted directory.
2. Run `node scripts/kilrunp-setup.mjs`.
3. Use an SSH tunnel to connect your browser to the private setup URL printed
   by that command. Follow the form to configure and build the platform.
4. Configure HTTPS and permanently start the website and multiplayer services.
   The wizard does not do those hosting-provider steps for you.

Read [the full hosting guide](docs/KILRUNP_INSTALL.md) for the tunnel command,
database and account setup, reverse-proxy example, recovery and backups.
The wizard checks your confirmation that the database is empty; it does not
independently verify that it is empty.

The package excludes existing environment files, uploaded customer content,
and the seller's built Windows executable. The Windows engine must be built
separately for your own platform URL. Review all bundled assets and dependency
licenses before selling or redistributing the package.
