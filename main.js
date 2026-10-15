const fs = require('fs')
const path = require('path')
const chalk = require('chalk-template').default
const cheerio = require('cheerio')

const PUBLIC_NFTY = `https://ntfy.sh/${process.env.PUBLIC_NFTY}`
const NTFY_CHANNEL = `https://ntfy.sh/${process.env.NTFY_CHANNEL}`
const SUMMARY_URL = 'https://us.version.battle.net/v2/summary'
const WIKI_BASE = 'https://warcraft.wiki.gg'
const WIKI_PAGE = WIKI_BASE + '/Template:LatestPatchInfo'
const STATE_PATH = path.resolve(__dirname, 'state.json')

const TYPE_TAGS = {
	normal: 'video_game',
	ptr: 'beetle',
	beta: 'test_tube'
}

const PRIORITIES = {
	normal: 'urgent',
	ptr: 'default',
	beta: 'low'
}

//  Run
async function main() {
	try {
		const previous = await load(STATE_PATH) ?? {}
		const products = await fetchProducts()
		const {flavors, channels} = await fetchWiki()

		const results = await Promise.all( Object.entries(channels).map(([channel, info]) => fetchChannel(products, flavors, channel, info)) )
		const current = merge(results, previous)

		if (Object.keys(previous).length === 0) {
			console.log(chalk`{cyan ℹ  No prior state found, establishing baseline without notifying}`)
			return await save(STATE_PATH, current)
		}

		await notifyChanges(findChanges(current, previous))
		await save(STATE_PATH, current)

		console.log(chalk`{cyan ✔ Check completed}`)
	} catch (error) {
		console.error(chalk`{red.bold ✖ Exception: ${error?.message || error}}`)
	}
}


// Blizzard CDN
async function fetchProducts() {
	console.log(chalk`{gray [${new Date().toISOString()}]} {cyan 🔍 Checking} {underline.cyan ${SUMMARY_URL}}...`)

	const summary = await fetchText(SUMMARY_URL)
	if (!summary)
		throw new Error('Failed to fetch the Blizzard games summary')

	const { rows } = parsePipeTable(summary) ?? {}
	if (!rows?.length)
		throw new Error('Could not parse Blizzard games summary')

	const products = new Map()
	for (const { Product, Seqn, Flags } of rows) {
		const seqn = Number(Seqn)
		if (Product && !Number.isNaN(seqn)) {
			const product = products.get(Product) ?? { live: null, latest: 0 }
			if (Flags === '')
				product.live = seqn

			product.latest = Math.max(product.latest, seqn)
			products.set(Product, product)
		}
	}

	return products
}

async function fetchChannel(products, flavors, channel, data) {
	console.log(chalk`{gray [${new Date().toISOString()}]} {cyan 🔍 Checking} {underline.cyan ${channel} for current game version}...`)

	const product = products.get(channel)
	const seqn = product?.live ?? product?.latest
	if (seqn == null)
		return { channel, entry: null, error: 'channel not found in the version summary' }

	const text = await fetchText(`https://us.version.battle.net/v2/products/${channel}/versions`)
	const parsed = text ? parseVersions(text) : null
	if (!parsed)
		return { channel, entry: null, error: 'failed to fetch or parse the product versions' }

	if (parsed.seqn !== seqn)
		console.log(chalk`{yellow ⚠  {bold ${channel}} seqn mismatch:} summary {bold ${seqn}} vs versions endpoint {bold ${parsed.seqn}}`)

	const version = parsed.version.split('.').slice(0, 3).join('.')
	const type = data?.type ?? serverType(`${data?.directory ?? ''} ${channel}`)
	const name = prettifyName(flavors.get(`${version}|${type}`) ?? data.name)

	return { channel, entry: { name, type, iconUrl: data.iconUrl, version: parsed.version, buildId: parsed.buildId, seqn } }
}

function parseVersions(text) {
	const { seqn, rows } = parsePipeTable(text) ?? {}
	const row = rows?.[0]
	const buildId = Number(row?.BuildId)
	const version = row?.VersionsName
	if (seqn !== null && version && !Number.isNaN(buildId))
		return { seqn, buildId, version }
}

function parsePipeTable(text) {
	const lines = text.split(/\r?\n/)
	const header = lines[0]?.split('|').map(col => col.split('!')[0].trim())
	if (!header?.length)
		return

	const rows = []
	let seqn = null

	for (const line of lines.slice(1)) {
		const match = line.match(/^## seqn = (\d+)/)
		if (match) {
			seqn = Number(match[1])
		} else {
			const values = line.split('|')
			if (values.length === header.length)
				rows.push(Object.fromEntries(header.map((col, i) => [col, values[i].trim()])))
		}
	}

	return { seqn, rows }
}


// Wiki
async function fetchWiki() {
	const html = await fetchText(WIKI_PAGE)
	const $ = html && cheerio.load(html)
	if (!$)
		throw new Error('Failed to fetch wiki page')

	const flavors = parseFlavorsTable($)
	const channels = parseCDNTable($)

	if (Object.keys(channels).length === 0)
		throw new Error('Failed to parse wiki channels')
	if (flavors.size === 0)
		throw new Error('Failed to parse wiki game flavors')

	return { flavors, channels }
}

function parseCDNTable($) {
	const header = $('h2, h3, .mw-headline').filter((_, el) => $(el).text().trim().includes('CDNs & directories')).first()
	const channels = {}

	if (header.length > 0)
		header.nextAll('table').first().find('tr').each((_, row) => {
			const $row = $(row)
			const codes = $row.find('code').map((_, c) => $(c).text().trim()).get()
			const tds = $row.find('td').map((_, td) => $(td).text().trim()).get()
			if (codes.length < 2 || tds.length < 3)
				return

			const img = $row.find('img').first()
			const src = img.attr('src')
			const iconUrl = src ? (src.startsWith('http') ? src : `${WIKI_BASE}${src}`) : null

			channels[codes[0]] = { name: tds[2], directory: codes[1], iconUrl }
		})

	return channels
}


function parseFlavorsTable($) {
	const header = $('h2, h3, .mw-headline').filter((_, el) => $(el).text().trim().includes('Game types')).first()
	const gameFlavors = new Map()

	if (header.length > 0)
		header.nextAll('table').first().find('tr').each((_, row) => {
			const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get()
			if (cells.length >= 5) {
				const name = cells[1]
				const version = cells[4].match(/\d+\.\d+\.\d+/)?.[0]
				if (name && version)
					gameFlavors.set(`${version}|${serverType(name)}`, name)
			}
		})

	return gameFlavors
}


// Nfty.sh
function findChanges(current, previous) {
	const notifications = []
	for (const [channel, entry] of Object.entries(current)) {
		const prev = previous[channel]
		if (prev?.buildId !== entry.buildId)
			notifications.push({
				body: prev ? `${prev.version} → ${entry.version}` : `${entry.name} (${channel})`,
				headers: {
					Title: prev ? `${entry.name} WoW Updated` : 'New WoW Type',
					Tags: TYPE_TAGS[entry.type] ?? 'video_game',
					Priority: PRIORITIES[entry.type] ?? 'default',
					Attach: entry.iconUrl,
				}
			})
	}

	return notifications
}

async function notifyChanges(notifications) {
	if (notifications.length === 0)
		return console.log(chalk`{dim ℹ  No changes found}`)

	console.log(chalk`{magenta 🔔 Sending notifications...}`)
	for (const { body, headers } of notifications) {
		const error = await ntfy(body, headers)
		if (error)
			console.error(chalk`{red ✖ Notification failed:} ${body} {gray (${error})}`)
		else
			console.log(chalk`{green     ⌯⌲ Sent notification} {gray [${headers.Priority}]} ${body}`)
	}
}

async function ntfy(body, headers) {
	let private = await fetch(NTFY_CHANNEL, { method: 'POST', body, headers }).catch(() => null)
	if (!private?.ok)
		return private ? `private ntfy responded with status ${private.status}` : 'Failed to reach ntfy server' 

	if (PUBLIC_NFTY) {
		let public = await fetch('https://ntfy.sh/toc-watchdog', { method: 'POST', body, headers }).catch(() => null)
		if (!public?.ok)
			return public ? `public ntfy responded with status ${public.status}` : 'Failed to reach ntfy server'
	}
}


// Helpers
async function fetchText(url) {
	const response = await fetch(url).catch(() => null)
	return response?.ok ? response.text() : null
}

function prettifyName(name) {
	return name
		.replace(/\bClassic\b/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\bVanilla\b/g, 'Classic')
		.replace(/\bStandard\b/g, 'Retail')
		.trim() || name
}

function serverType(name) {
	const lower = name.toLowerCase()
	if (lower.includes('beta'))
		return 'beta'
	if (lower.includes('test') || lower.includes('ptr'))
		return 'ptr'
	return 'normal'
}


// Data
async function load(file) {
	const raw = await fs.promises.readFile(file, 'utf8').catch(() => null)
	try {
		return JSON.parse(raw ?? '{}')
	} catch {
		return {}
	}
}

function merge(results, previous) {
	const current = {}
	for (const { channel, entry } of results) {
		const value = entry ?? previous[channel]
		if (value)
			current[channel] = value
	}
	return current
}

async function save(file, state) {
	await fs.promises.writeFile(file, JSON.stringify(state, null, 2), 'utf8')
}

main()
