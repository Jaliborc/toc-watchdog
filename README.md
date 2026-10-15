# TOC Watchdog 📡

Monitors [Blizzard's CDN](https://us.version.battle.net/v2/summary) for World of Warcraft build changes. When a channel ships a new build (or a new channel shows up), it dispatches a push notification via [ntfy.sh](https://ntfy.sh), with the game type's version icon attached.

> 💬 Now in human speak: you can install ntfy on your phone or PC, to get notifications when World of Warcraft updates.

## Just Use

Install the Ntfy app on any of your devices. Then, listen to the public channel `toc-watchdog`.  
If you'd prefer your own private channel, see the instructions below.

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

The first run has no prior state, so no entry triggers a notification. Last seen builds are kept in a persistent `state.json` file.
