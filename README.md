# TOC Watchdog

Monitors the Warcraft Wiki [Template:LatestPatchInfo](https://warcraft.wiki.gg/wiki/Template:LatestPatchInfo) page's **CDNs & directories** table for updates. When a new game version is detected or an existing version's `Interface` number changes, it dispatches push notifications via [ntfy.sh](https://ntfy.sh).

> 💬 Now in human speak: you can install ntfy on your phone or PC, to get notifications when World of Warcraft updates.


## Run on GitHub Actions

1.  Fork repository.
2.  Navigate to repository __Settings > Secrets and variables > Actions__, and create a `NTFY_CHANNEL` repository secret, which is a (secret) ntfy topic of your choice.


## Run Locally

1. Create a `.env` file in the project root with your ntfy channel name:
	```env
	NTFY_CHANNEL=your_ntfy_channel_name
	```

2. Install dependencies:
	```bash
	pnpm install
	```

3. Start the program:
	```bash
	pnpm start
	```

The first run has no prior state, so no entry trigers a notification. Last seen versions are kept in a persistent `state.json` file.