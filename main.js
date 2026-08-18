const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const cron = require('node-cron')

const PAGE_URL = 'https://warcraft.wiki.gg/wiki/Template:LatestPatchInfo'
const NTFY_URL = 'https://ntfy.sh/wow-toc-changes-testing123'
const STATE_FILE_PATH = path.resolve(__dirname, 'state.json')
const CRON_SCHEDULE = '0 11,15,19,23 * * *'
const PRIORITY_RULES = [
    { keyword: 'beta', priority: 'low' },
    { keyword: 'ptr',  priority: 'default' }
]

// Run
function main() {
	if (process.argv.includes('--now'))
		checkForUpdates()

	console.log(`Scheduling check with cron expression "${CRON_SCHEDULE}"`)
	cron.schedule(CRON_SCHEDULE, checkForUpdates)
}

async function checkForUpdates() {
	console.log(`[${new Date().toISOString()}] Checking ${PAGE_URL}...`)

	const html = await fetchText(PAGE_URL)
	if (!html)
		return console.error('Failed to fetch the patch info page')

	const current = parseCdnTable(html)
	if (!current)
		return console.error('Could not find the "CDNs & directories" table on the page')

	const previous = await loadState(STATE_FILE_PATH)
	if (Object.keys(previous).length === 0) {
		console.log('No prior state found, establishing baseline without notifying')
		return saveState(STATE_FILE_PATH, current)
	}

	await notifyChanges(findChanges(previous, current))
	await saveState(STATE_FILE_PATH, current)

	console.log(`Completed check.`)
}

// Parsing
async function fetchText(url) {
	const response = await fetch(url, { headers: { 'User-Agent': 'wow-toc-changes/1.0' } }).catch(() => null)
	return response?.ok && response.text()
}

function parseCdnTable(html) {
	const $ = cheerio.load(html)
	const headline = $('span.mw-headline').filter((i, el) => $(el).text().trim() === 'CDNs & directories').first()
	if (!headline.length) return

	const heading = headline.closest('h2')
	const table = heading.length ? heading.nextAll('table').first() : $()
	if (!table.length) return

	const headerCells = table.find('tr').first().find('th')
	const headers = headerCells.map((i, el) => $(el).text().trim()).get()
	const entries = {}

	for (const row of table.find('tr').slice(1).get()) {
		const cells = $(row).find('td')
		if (!cells.length)
			continue

		const values = cells.map((_, c) => $(c).text().trim()).get()
		const record = {}

		for (const [idx, header] of headers.entries()) {
			record[header] = values[idx] ?? ''
		}

		const cdnValue = record['CDN value']
		if (cdnValue)
			entries[cdnValue] = record
	}

	return entries
}

function findChanges(previousEntries, currentEntries) {
	const notifications = []

	for (const [key, current] of Object.entries(currentEntries)) {
		const previous = previousEntries[key]
		const name = current.Name || key
		const build = current.Build || 'unknown'
		const priority = getPriority(current)

		if (!previous) {
			notifications.push({
				title: 'World of Warcraft Updated', priority,
				message: `New game type: ${name} () — interface ${current['Interface']}`,
			})
		} else if (previous['Interface'] !== current['Interface']) {
			notifications.push({
				title: 'World of Warcraft Updated', priority,
				message: `${name} updated ${previous['Interface']} → ${current['Interface']}`,
			})
		}
	}

	return notifications
}

function getPriority(version) {
    const name = version.Name?.toLowerCase() ?? ''
    return PRIORITY_RULES.find(rule => name.includes(rule.keyword))?.priority ?? 'urgent'
}

// Ntfy.sh
async function notifyChanges(notifications) {
	console.log(notifications)
	for (const notification of notifications) {
		const error = await ntfy(notification.title, notification.message, notification.priority)
		if (error)
			console.error(`Notification failed: ${error}`)
		else
			console.log(`Notified ntfy.sh (${notification.priority}): ${notification.message}`)
	}
}

async function ntfy(title, message, priority) {
	const response = await fetch(NTFY_URL, {
		method: 'POST',
		body: message,
		headers: {
			Title: title,
			Priority: priority,
			Tags: 'video_game',
		},
	}).catch(() => null)

	if (!response?.ok)
		return response ? `ntfy responded with status ${response.status}` : 'Failed to reach ntfy server'
}

// IO
async function loadState(stateFilePath) {
	const raw = await fs.promises.readFile(stateFilePath, 'utf8').catch(() => null)
	return raw ? JSON.parse(raw) : {}
}

async function saveState(stateFilePath, entries) {
	await fs.promises.writeFile(stateFilePath, JSON.stringify(entries, null, 2), 'utf8')
}

main()