const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const chalk = require('chalk-template').default

const NTFY_URL = `https://ntfy.sh/${process.env.NTFY_CHANNEL}`
const PAGE_URL = 'https://warcraft.wiki.gg/wiki/Template:LatestPatchInfo'
const STATE_FILE_PATH = path.resolve(__dirname, 'state.json')

const PRIORITY_RULES = [
	{ keyword: 'beta', priority: 'low' },
	{ keyword: 'ptr',  priority: 'default' }
]
const PRIORITY_TAGS = {
	low: 'test_tube',
	default: 'beetle',
	urgent: 'video_game'
}

// Run
async function main() {
	try {
		console.log(chalk`{gray [${new Date().toISOString()}]} {cyan 🔍 Checking} {underline.cyan ${PAGE_URL}}...`)

		const html = await fetchText(PAGE_URL)
		if (!html)
			return await logError('Failed to fetch the patch info page')

		const current = parseCdnTable(html)
		if (!current)
			return await logError('Could not find the "CDNs & directories" table on the page')

		const previous = await loadState(STATE_FILE_PATH)
		if (Object.keys(previous).length === 0) {
			console.log(chalk`{cyan ℹ  No prior state found, estabilished baseline without notifying}`)
			return await saveState(STATE_FILE_PATH, current)
		}

		await notifyChanges(findChanges(previous, current))
		await saveState(STATE_FILE_PATH, current)

		console.log(chalk`{cyan ✔ Check completed}`)
	} catch (error) {
		await logError(`Exception: ${error?.message || error}`)
	}
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
				title: 'New WoW Type', priority,
				message: `${name} (${key})`,
			})
		} else if (previous['Interface'] !== current['Interface']) {
			notifications.push({
				title: `${name} WoW Updated`, priority,
				message: `${previous['Interface']} → ${current['Interface']}`,
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
async function logError(message) {
	console.error(chalk`{red.bold ✖ ${message}}`)
	await ntfy('Server Error', message, 'default', 'x')
}

async function notifyChanges(notifications) {
	if (notifications.length === 0)
		return console.log(chalk`{dim ℹ  No changes found}`)

	console.log(chalk`{magenta 🔔 Sending notifications...}`)
	for (const notification of notifications) {
		const error = await ntfy(notification.title, notification.message, notification.priority, PRIORITY_TAGS[notification.priority])
		if (error) {
			console.error(chalk`{red ✖ Notification failed:} ${notification.message} {gray (${error})}`)
		} else {
			console.log(chalk`{green     ⌯⌲ Sent notification} {gray [${notification.priority}]} ${notification.message}`)
		}
	}
}

async function ntfy(title, body, priority, tags) {
	const response = await fetch(NTFY_URL, {
		method: 'POST', body,
		headers: {
			Title: title,
			Priority: priority,
			Tags: tags,
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