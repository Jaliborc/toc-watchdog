# WoW TOC Changes

Watches the Warcraft Wiki [Template:LatestPatchInfo](https://warcraft.wiki.gg/wiki/Template:LatestPatchInfo) page's CDNs & directories table multiple times a day. Sends a push notification via ntfy.sh when a new game type appears, or an existing game type's `TOC` number changes.

## Install

```bash
pnpm install
```

## Run

```bash
# Check for updates immediately
pnpm start --now

# Internally sets up a cron job schedule
pnpm start --cron

# Start a web service that listens to job requests (default behaviour)
pnpm start
```

The first run has no prior state, so no entry trigers a notification. Last seen versions are kept in `state.json` next to the script.