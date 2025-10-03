const fs = require('fs')
const https = require('https')
const http = require('http')
const path = require('path')

// Функция для получения всех регионов России через Overpass API
async function getAllRussiaRegions() {
	try {
		logger.log('Получаем список всех регионов России через Overpass API...')

		// Улучшенный запрос, который включает спорные регионы России
		const overpassQuery = `[out:json][timeout:60];
// Основные регионы России
area["ISO3166-1"="RU"]->.russia;
(
  relation(area.russia)["admin_level"="4"]["boundary"="administrative"];
  // Спорные регионы, которые претендует Россия
  relation["admin_level"="4"]["boundary"="administrative"]["disputed_by"~"RU|RU|RU"];
  // Дополнительно: регионы с claimed_by=RU
  relation["admin_level"="4"]["boundary"="administrative"]["claimed_by"="RU"];
);
out body;
>;
out skel qt;`

		const data = await makeRequest('https://overpass-api.de/api/interpreter', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
			},
			body: `data=${encodeURIComponent(overpassQuery)}`,
		})

		if (!data || !data.elements) {
			logger.warn(
				'Не удалось получить список регионов через Overpass API, пробуем Nominatim'
			)
			return await getRegionsViaNominatim()
		}

		const regions = []
		data.elements.forEach(element => {
			if (element.tags && element.tags.name) {
				// Приоритет языков: русский, английский, основное имя
				let regionName =
					element.tags['name:ru'] ||
					element.tags['name:en'] ||
					element.tags.name

				// Для спорных регионов пытаемся получить русское название
				if (!element.tags['name:ru'] && element.tags['name']) {
					// Если нет русского названия, но есть общее, используем его
					regionName = element.tags['name']
				}

				// Нормализуем названия для русского языка
				let normalizedRegionName = regionName

				// Общая нормализация для известных случаев
				if (regionName && typeof regionName === 'string') {
					// Преобразуем украинские названия в русские аналоги на основе суффиксов
					if (regionName.includes('Республіка')) {
						normalizedRegionName = regionName.replace(
							'Республіка',
							'Республика'
						)
					} else if (
						regionName.includes('Автономна') &&
						regionName.includes('Республіка')
					) {
						normalizedRegionName = regionName.replace(
							'Автономна Республіка',
							'Автономная Республика'
						)
					} else if (regionName === 'Крим') {
						normalizedRegionName = 'Автономная Республика Крым'
					} else if (
						regionName.includes('м.') &&
						regionName.includes('Севастополь')
					) {
						normalizedRegionName = 'Севастополь'
					}
				}

				// Добавляем регион в список
				if (normalizedRegionName && !regions.includes(normalizedRegionName)) {
					regions.push(normalizedRegionName)
				}
			}
		})

		if (regions.length === 0) {
			logger.warn('Overpass API вернул пустой список, пробуем Nominatim')
			return await getRegionsViaNominatim()
		}

		logger.success(`Получено ${regions.length} регионов через Overpass API`)
		logger.log(`Полный список регионов:`)
		regions.forEach((region, index) => {
			logger.log(`  ${index + 1}. ${region}`)
		})
		return regions
	} catch (error) {
		logger.error('Ошибка при получении списка регионов через Overpass', {
			error: error.message,
		})
		logger.warn('Пробуем получить регионы через Nominatim API')
		return await getRegionsViaNominatim()
	}
}

// Альтернативный способ получения регионов через Nominatim API
async function getRegionsViaNominatim() {
	try {
		logger.log('Получаем список регионов через Nominatim API...')

		const params = new URLSearchParams({
			format: 'json',
			q: 'Russia',
			limit: '100',
			addressdetails: '1',
			featuretype: 'state',
		})

		const url = `https://nominatim.openstreetmap.org/search?${params}`

		const data = await makeRequest(url, {
			headers: {
				'Accept-Language': 'ru',
				Accept: 'application/json',
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		})

		if (!data || data.length === 0) {
			logger.warn('Nominatim API не вернул данные, используем резервный список')
			return getBackupRegionsList()
		}

		const regions = []
		data.forEach(item => {
			if (item.display_name && item.display_name.includes('Россия')) {
				// Извлекаем название региона из полного адреса
				const parts = item.display_name.split(',')
				if (parts.length > 1) {
					const regionName = parts[0].trim()
					if (
						regionName &&
						!regions.includes(regionName) &&
						(regionName.includes('область') ||
							regionName.includes('край') ||
							regionName.includes('республика') ||
							regionName.includes('автономный округ') ||
							regionName === 'Москва' ||
							regionName === 'Санкт-Петербург')
					) {
						regions.push(regionName)
					}
				}
			}
		})

		if (regions.length === 0) {
			logger.warn(
				'Не удалось извлечь регионы из Nominatim, используем резервный список'
			)
			return getBackupRegionsList()
		}

		logger.success(`Получено ${regions.length} регионов через Nominatim API`)
		return regions
	} catch (error) {
		logger.error('Ошибка при получении списка регионов через Nominatim', {
			error: error.message,
		})
		logger.warn('Используем резервный список регионов')
		return getBackupRegionsList()
	}
}

// Резервный список регионов (на случай если API не работает)
function getBackupRegionsList() {
	return [
		'Московская область',
		'Рязанская область',
		'Липецкая область',
		'Тамбовская область',
		'Воронежская область',
		'Пензенская область',
		'Ульяновская область',
		'Саратовская область',
		'Самарская область',
		'Нижегородская область',
		'Мордовия',
		'Владимирская область',
		'Курская область',
		'Орловская область',
		'Автономная Республика Крым',
		'Волгоградская область',
		'Оренбургская область',
		'Башкортостан',
		'Челябинская область',
		'Татарстан',
		'Свердловская область',
		'Чувашия',
		'Тульская область',
		'Ярославская область',
		'Калужская область',
		'Смоленская область',
		'Брянская область',
		'Белгородская область',
		'Ростовская область',
		'Ивановская область',
		'Костромская область',
		'Новгородская область',
		'Москва',
		'Калининградская область',
		'Ставропольский край',
		'Краснодарский край',
		'Калмыкия',
		'Дагестан',
		'Чеченская Республика',
		'Карачаево-Черкесия',
		'Кабардино-Балкария',
		'Северная Осетия — Алания',
		'Астраханская область',
		'Кировская область',
		'Вологодская область',
		'Марий Эл',
		'Удмуртия',
		'Пермский край',
	]
}

// Система логирования
class Logger {
	constructor() {
		const today = new Date().toISOString().split('T')[0]
		this.logFile = `${config.logsDir}/russia_regions_${today}.log`
		this.errorFile = `${config.logsDir}/russia_regions_errors_${today}.log`
		this.statsFile = `${config.logsDir}/russia_regions_stats_${today}.log`

		// Очищаем файлы при запуске
		this.clearLogs()
	}

	clearLogs() {
		fs.writeFileSync(
			this.logFile,
			`=== Лог скачивания регионов России ===\nВремя запуска: ${new Date().toISOString()}\n\n`,
			'utf8'
		)
		fs.writeFileSync(
			this.errorFile,
			`=== Ошибки скачивания регионов России ===\nВремя запуска: ${new Date().toISOString()}\n\n`,
			'utf8'
		)
		fs.writeFileSync(
			this.statsFile,
			`=== Статистика скачивания регионов России ===\nВремя запуска: ${new Date().toISOString()}\n\n`,
			'utf8'
		)
	}

	log(message, level = 'INFO') {
		const timestamp = new Date().toISOString()
		const logMessage = `[${timestamp}] [${level}] ${message}\n`

		// Выводим в консоль
		console.log(message)

		// Записываем в основной лог
		fs.appendFileSync(this.logFile, logMessage, 'utf8')

		// Если это ошибка, записываем в файл ошибок
		if (level === 'ERROR' || level === 'WARN') {
			fs.appendFileSync(this.errorFile, logMessage, 'utf8')
		}
	}

	error(message, details = null) {
		this.log(message, 'ERROR')
		if (details) {
			const detailsMessage = `Детали: ${JSON.stringify(details, null, 2)}\n`
			fs.appendFileSync(this.errorFile, detailsMessage, 'utf8')
		}
	}

	warn(message, details = null) {
		this.log(message, 'WARN')
		if (details) {
			const detailsMessage = `Детали: ${JSON.stringify(details, null, 2)}\n`
			fs.appendFileSync(this.errorFile, detailsMessage, 'utf8')
		}
	}

	success(message) {
		this.log(message, 'SUCCESS')
	}

	stats(message) {
		const timestamp = new Date().toISOString()
		const logMessage = `[${timestamp}] ${message}\n`
		fs.appendFileSync(this.statsFile, logMessage, 'utf8')
	}

	getLogFiles() {
		return {
			main: this.logFile,
			errors: this.errorFile,
			stats: this.statsFile,
		}
	}
}

// Настройки из переменных окружения
const config = {
	requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 300000,
	maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
	requestDelay: parseInt(process.env.REQUEST_DELAY) || 2000,
	dataDir: process.env.DATA_DIR || './data',
	logsDir: process.env.LOGS_DIR || './logs',
}

// Создаем директории если их нет
if (!fs.existsSync(config.dataDir)) {
	fs.mkdirSync(config.dataDir, { recursive: true })
}
if (!fs.existsSync(config.logsDir)) {
	fs.mkdirSync(config.logsDir, { recursive: true })
}

// Создаем глобальный логгер
const logger = new Logger()

// Функция для выполнения HTTP запроса
function makeRequest(url, options = {}) {
	return new Promise((resolve, reject) => {
		const protocol = url.startsWith('https:') ? https : http

		const request = protocol.request(url, options, response => {
			let data = ''

			response.on('data', chunk => {
				data += chunk
			})

			response.on('end', () => {
				// Проверяем статус ответа
				if (response.statusCode >= 400) {
					const error = new Error(
						`HTTP ${response.statusCode}: ${response.statusMessage}`
					)
					logger.error(`HTTP ошибка ${response.statusCode}`, {
						url: url,
						statusCode: response.statusCode,
						statusMessage: response.statusMessage,
						headers: response.headers,
					})
					reject(error)
					return
				}

				// Проверяем Content-Type
				const contentType = response.headers['content-type'] || ''

				if (contentType.includes('application/json')) {
					try {
						const jsonData = JSON.parse(data)
						resolve(jsonData)
					} catch (error) {
						logger.error(`Ошибка парсинга JSON`, {
							url: url,
							error: error.message,
							data: data.substring(0, 500),
						})
						reject(new Error(`Ошибка парсинга JSON: ${error.message}`))
					}
				} else if (
					contentType.includes('text/xml') ||
					contentType.includes('application/xml')
				) {
					// Возвращаем строку для XML ответов
					resolve(data)
				} else {
					// Пытаемся распарсить как JSON, если не указан тип
					try {
						const jsonData = JSON.parse(data)
						resolve(jsonData)
					} catch (error) {
						// Если не JSON, возвращаем как строку
						resolve(data)
					}
				}
			})
		})

		request.on('error', error => {
			logger.error(`Ошибка HTTP запроса`, {
				url: url,
				error: error.message,
				code: error.code,
			})
			reject(error)
		})

		if (options.body) {
			request.write(options.body)
		}

		request.end()
	})
}

// Функция для получения данных о регионе через Nominatim
async function getRegionData(regionName) {
	try {
		logger.log(`Поиск данных для региона: ${regionName}`)

		const params = new URLSearchParams({
			format: 'json',
			q: `${regionName}, Russia`,
			limit: '5',
			addressdetails: '1',
		})

		const url = `https://nominatim.openstreetmap.org/search?${params}`

		const data = await makeRequest(url, {
			headers: {
				'Accept-Language': 'ru',
				Accept: 'application/json',
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		})

		if (data.length === 0) {
			logger.warn(`Регион не найден: ${regionName}`)
			return null
		}

		// Ищем наиболее подходящий результат (содержит "Россия" в адресе)
		let bestMatch = null
		for (const item of data) {
			if (item.display_name && item.display_name.includes('Россия')) {
				// Проверяем, что это действительно регион, а не улица или город
				const addressParts = item.display_name.split(',')
				const firstPart = addressParts[0].trim()

				if (
					firstPart === regionName ||
					(firstPart.includes('область') && regionName.includes('область')) ||
					(firstPart.includes('край') && regionName.includes('край')) ||
					(firstPart.includes('республика') &&
						regionName.includes('республика')) ||
					(firstPart.includes('автономный округ') &&
						regionName.includes('автономный округ'))
				) {
					bestMatch = item
					break
				}
			}
		}

		if (!bestMatch) {
			logger.warn(`Не найден подходящий регион для: ${regionName}`)
			return null
		}

		logger.success(
			`Найден регион: ${bestMatch.display_name} (OSM ID: ${bestMatch.osm_id})`
		)
		return bestMatch
	} catch (error) {
		logger.error(`Ошибка при поиске региона ${regionName}`, {
			error: error.message,
			regionName: regionName,
		})
		return null
	}
}

// Функция для получения границ через Overpass API с повторными попытками
async function getRegionBoundaries(osmId, retries = config.maxRetries) {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			logger.log(
				`Получение границ для OSM ID ${osmId} (попытка ${attempt}/${retries})`
			)

			const overpassQuery = `[out:json][timeout:180];
area(id:${osmId + 3600000000})->.searchArea;
(
    relation(area.searchArea)["admin_level"="6"]["boundary"="administrative"];
    relation(area.searchArea)["admin_level"="8"]["boundary"="administrative"];
);
out body;
>;
out skel qt;`

			const data = await makeRequest(
				'https://overpass-api.de/api/interpreter',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						Accept: 'application/json',
					},
					body: `data=${encodeURIComponent(overpassQuery)}`,
				}
			)

			// Проверяем, что получили объект, а не строку
			if (typeof data === 'string') {
				if (data.trim().startsWith('<?xml') || data.trim().startsWith('<')) {
					logger.warn(
						`Overpass API вернул XML вместо JSON для OSM ID ${osmId} (попытка ${attempt})`,
						{
							osmId: osmId,
							response: data.substring(0, 500),
						}
					)

					// Пытаемся найти ошибку в XML
					if (data.includes('error')) {
						const errorMatch = data.match(/<error[^>]*>([^<]+)<\/error>/i)
						if (errorMatch) {
							logger.warn(`Ошибка Overpass: ${errorMatch[1]}`, {
								osmId: osmId,
								overpassError: errorMatch[1],
							})
						}
					}

					if (attempt < retries) {
						logger.log(`Повторная попытка через 5 секунд...`)
						await new Promise(resolve => setTimeout(resolve, 5000))
						continue
					}
					return null
				}
				try {
					return JSON.parse(data)
				} catch (parseError) {
					logger.warn(
						`Ошибка парсинга JSON для OSM ID ${osmId} (попытка ${attempt})`,
						{
							osmId: osmId,
							error: parseError.message,
							response: data.substring(0, 500),
						}
					)

					if (attempt < retries) {
						logger.log(`Повторная попытка через 5 секунд...`)
						await new Promise(resolve => setTimeout(resolve, 5000))
						continue
					}
					return null
				}
			}

			// Проверяем, что получили валидные данные
			if (!data || !data.elements) {
				logger.warn(
					`Overpass API вернул пустые данные для OSM ID ${osmId} (попытка ${attempt})`,
					{
						osmId: osmId,
						data: data,
					}
				)

				if (attempt < retries) {
					logger.log(`Повторная попытка через 5 секунд...`)
					await new Promise(resolve => setTimeout(resolve, 5000))
					continue
				}
				return null
			}

			logger.success(
				`Получены границы для OSM ID ${osmId}: ${data.elements.length} элементов`
			)
			return data
		} catch (error) {
			logger.error(
				`Ошибка при получении границ для OSM ID ${osmId} (попытка ${attempt})`,
				{
					osmId: osmId,
					error: error.message,
				}
			)

			if (attempt < retries) {
				logger.log(`Повторная попытка через 5 секунд...`)
				await new Promise(resolve => setTimeout(resolve, 5000))
				continue
			}
		}
	}

	logger.error(
		`Не удалось получить границы для OSM ID ${osmId} после ${retries} попыток`
	)
	return null
}

// Функция для обработки данных Overpass
function processOverpassData(overpassData) {
	const nodes = new Map()
	const ways = new Map()
	const relations = new Map()

	// Собираем элементы
	overpassData.elements.forEach(element => {
		switch (element.type) {
			case 'node':
				nodes.set(element.id, [element.lat, element.lon])
				break
			case 'way':
				ways.set(element.id, element.nodes)
				break
			case 'relation':
				if (
					element.tags &&
					(element.tags.admin_level === '6' || element.tags.admin_level === '8')
				) {
					relations.set(element.id, {
						name:
							element.tags.name || element.tags['name:ru'] || 'Без названия',
						adminLevel: element.tags.admin_level,
						members: element.members || [],
					})
				}
				break
		}
	})

	return { nodes, ways, relations }
}

// Функция для объединения линий в кольца
function mergeLines(lines) {
	if (lines.length === 0) return []

	const rings = []
	let currentRing = []
	let remainingLines = [...lines]

	while (remainingLines.length > 0) {
		if (currentRing.length === 0) {
			currentRing = [...remainingLines[0]]
			remainingLines.splice(0, 1)
			continue
		}

		let foundConnection = false
		const lastPoint = currentRing[currentRing.length - 1]
		const firstPoint = currentRing[0]

		// Проверяем, замкнулось ли кольцо
		if (
			Math.abs(lastPoint[0] - firstPoint[0]) < 0.000001 &&
			Math.abs(lastPoint[1] - firstPoint[1]) < 0.000001 &&
			currentRing.length > 3
		) {
			rings.push(currentRing)
			currentRing = []
			continue
		}

		// Ищем подходящую линию для соединения
		for (let i = 0; i < remainingLines.length; i++) {
			const line = remainingLines[i]
			const lineStart = line[0]
			const lineEnd = line[line.length - 1]

			if (
				Math.abs(lastPoint[0] - lineStart[0]) < 0.000001 &&
				Math.abs(lastPoint[1] - lineStart[1]) < 0.000001
			) {
				currentRing.push(...line.slice(1))
				remainingLines.splice(i, 1)
				foundConnection = true
				break
			} else if (
				Math.abs(lastPoint[0] - lineEnd[0]) < 0.000001 &&
				Math.abs(lastPoint[1] - lineEnd[1]) < 0.000001
			) {
				currentRing.push(...line.reverse().slice(1))
				remainingLines.splice(i, 1)
				foundConnection = true
				break
			}
		}

		if (!foundConnection) {
			if (currentRing.length > 3) {
				if (
					Math.abs(currentRing[0][0] - currentRing[currentRing.length - 1][0]) >
						0.000001 ||
					Math.abs(currentRing[0][1] - currentRing[currentRing.length - 1][1]) >
						0.000001
				) {
					currentRing.push([...currentRing[0]])
				}
				rings.push(currentRing)
			}
			currentRing = []
		}
	}

	if (currentRing.length > 3) {
		if (
			Math.abs(currentRing[0][0] - currentRing[currentRing.length - 1][0]) >
				0.000001 ||
			Math.abs(currentRing[0][1] - currentRing[currentRing.length - 1][1]) >
				0.000001
		) {
			currentRing.push([...currentRing[0]])
		}
		rings.push(currentRing)
	}

	return rings
}

// Функция для проверки точки внутри полигона
function isPointInPolygon(point, polygon) {
	let inside = false
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i][0],
			yi = polygon[i][1]
		const xj = polygon[j][0],
			yj = polygon[j][1]

		const intersect =
			yi > point[1] !== yj > point[1] &&
			point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
		if (intersect) inside = !inside
	}
	return inside
}

// Функция для вычисления центра полигона
function calculatePolygonCenter(polygon) {
	let minX = Infinity,
		maxX = -Infinity
	let minY = Infinity,
		maxY = -Infinity

	for (const point of polygon) {
		minX = Math.min(minX, point[0])
		maxX = Math.max(maxX, point[0])
		minY = Math.min(minY, point[1])
		maxY = Math.max(maxY, point[1])
	}

	return [(minX + maxX) / 2, (minY + maxY) / 2]
}

// Функция для сохранения данных одного региона в отдельный файл
function saveRegionData(regionData) {
	const filename = `${config.dataDir}/${regionData.name.replace(
		/[<>:"/\\|?*\x00-\x1F]/g,
		'_'
	)}.json`
	fs.writeFileSync(filename, JSON.stringify(regionData), 'utf8')
	logger.success(`💾 Данные региона сохранены в: ${filename}`)
}

// Основная функция для обработки региона
async function processRegion(regionName) {
	try {
		logger.log(`\n=== Обработка региона: ${regionName} ===`)

		// Получаем данные о регионе
		const regionData = await getRegionData(regionName)
		if (!regionData) {
			logger.warn(`Не удалось найти данные для региона: ${regionName}`)
			return null
		}

		// Получаем границы
		const overpassData = await getRegionBoundaries(regionData.osm_id)
		if (!overpassData || !overpassData.elements) {
			logger.warn(`Не удалось получить границы для ${regionName}`, {
				regionName: regionName,
				osmId: regionData.osm_id,
			})
			return null
		}

		const { nodes, ways, relations } = processOverpassData(overpassData)
		logger.log(
			`Найдено: ${nodes.size} узлов, ${ways.size} путей, ${relations.size} отношений`
		)

		const regionResult = {
			name: regionName,
			osm_id: regionData.osm_id,
			center: [parseFloat(regionData.lat), parseFloat(regionData.lon)],
			display_name: regionData.display_name,
			municipalities: [],
		}

		// Обрабатываем каждое отношение (МО)
		for (const [relationId, relation] of relations) {
			try {
				const outerWays = []
				const innerWays = []

				relation.members
					.filter(
						m => m.type === 'way' && (m.role === 'outer' || m.role === 'inner')
					)
					.forEach(member => {
						const wayNodes = ways.get(member.ref)
						if (!wayNodes || wayNodes.length < 2) return

						const wayCoords = wayNodes
							.map(nodeId => {
								const node = nodes.get(nodeId)
								return node ? [node[1], node[0]] : null // Меняем местами lon/lat для GeoJSON
							})
							.filter(node => node !== null)

						if (wayCoords.length < 2) return

						if (member.role === 'outer') {
							outerWays.push(wayCoords)
						} else {
							innerWays.push(wayCoords)
						}
					})

				if (outerWays.length === 0) continue

				const outerRings = mergeLines(outerWays)
				const innerRings = mergeLines(innerWays)

				// Создаем полигоны для каждого внешнего кольца
				outerRings.forEach((outerRing, index) => {
					const containedInnerRings = innerRings.filter(innerRing => {
						return isPointInPolygon(innerRing[0], outerRing)
					})

					const center = calculatePolygonCenter(outerRing)

					const municipality = {
						name: relation.name,
						admin_level: relation.adminLevel,
						center: [center[1], center[0]], // Меняем местами lon/lat для GeoJSON
						boundaries: {
							type: 'Polygon',
							coordinates: [
								[...outerRing.map(coord => [coord[1], coord[0]])],
								...containedInnerRings.map(ring =>
									ring.map(coord => [coord[1], coord[0]])
								),
							], // Меняем местами lon/lat
						},
					}

					regionResult.municipalities.push(municipality)
				})
			} catch (error) {
				logger.error(`Ошибка при обработке МО ${relation.name}`, {
					relationName: relation.name,
					relationId: relationId,
					error: error.message,
				})
			}
		}

		logger.success(
			`Обработано МО: ${regionResult.municipalities.length} для региона ${regionName}`
		)

		// Сохраняем данные региона в отдельный файл
		saveRegionData(regionResult)

		return regionResult
	} catch (error) {
		logger.error(`Ошибка при обработке региона ${regionName}`, {
			regionName: regionName,
			error: error.message,
		})
		return null
	}
}

// Основная функция
async function main() {
	logger.log('Начинаем скачивание данных о регионах России...')

	// Сначала получаем список всех регионов
	const russiaRegions = await getAllRussiaRegions()
	logger.log(`Будем обрабатывать ${russiaRegions.length} регионов`)

	const processedRegions = [] // Будем хранить только метаданные, а не полные данные
	const totalRegions = russiaRegions.length

	const startTime = Date.now()

	for (let i = 0; i < totalRegions; i++) {
		const regionName = russiaRegions[i]
		logger.log(
			`\nПрогресс: ${i + 1}/${totalRegions} (${Math.round(
				(i / totalRegions) * 100
			)}%)`
		)

		const result = await processRegion(regionName)
		if (result) {
			// Сохраняем только метаданные вместо полных данных
			processedRegions.push({
				name: result.name,
				osm_id: result.osm_id,
				center: result.center,
				display_name: result.display_name,
				municipalities_count: result.municipalities.length,
			})
			logger.success(
				`✅ Добавлен регион: ${result.name} (${result.municipalities.length} МО)`
			)
		} else {
			logger.warn(`❌ Не удалось обработать: ${regionName}`)
		}

		// Небольшая пауза между запросами
		await new Promise(resolve => setTimeout(resolve, config.requestDelay))
	}

	const endTime = Date.now()
	const duration = Math.round((endTime - startTime) / 1000)

	logger.log(`\n=== Завершено ===`)
	logger.log(`Обработано регионов: ${processedRegions.length}/${totalRegions}`)
	logger.log(`Время выполнения: ${duration} секунд`)

	// Статистика
	const totalMunicipalities = processedRegions.reduce(
		(sum, region) => sum + region.municipalities_count,
		0
	)
	logger.log(`Всего муниципальных образований: ${totalMunicipalities}`)

	// Записываем финальную статистику
	logger.stats(`=== ФИНАЛЬНАЯ СТАТИСТИКА ===`)
	logger.stats(
		`Обработано регионов: ${processedRegions.length}/${totalRegions}`
	)
	logger.stats(`Всего МО: ${totalMunicipalities}`)
	logger.stats(`Время выполнения: ${duration} секунд`)
	logger.stats(
		`Среднее время на регион: ${Math.round(duration / totalRegions)} секунд`
	)

	// Показываем файлы логов
	const logFiles = logger.getLogFiles()
	logger.log(`\n📁 Файлы логов:`)
	logger.log(`Основной лог: ${logFiles.main}`)
	logger.log(`Лог ошибок: ${logFiles.errors}`)
	logger.log(`Лог статистики: ${logFiles.stats}`)

	// Создаем общий файл со списком всех регионов
	const summaryData = {
		timestamp: new Date().toISOString(),
		total_regions: processedRegions.length,
		regions: processedRegions,
	}

	const summaryFilename = `${config.dataDir}/russia_regions_summary_${
		new Date().toISOString().split('T')[0]
	}.json`
	fs.writeFileSync(summaryFilename, JSON.stringify(summaryData), 'utf8')
	logger.success(`💾 Сводные данные сохранены в: ${summaryFilename}`)
}

// Функция для очистки старых логов
function clearOldLogs() {
	try {
		const files = fs.readdirSync('.')
		const today = new Date().toISOString().split('T')[0]

		files.forEach(file => {
			if (
				file.startsWith('russia_regions_') &&
				file.endsWith('.log') &&
				!file.includes(today)
			) {
				fs.unlinkSync(file)
				logger.log(`Удален старый лог: ${file}`)
			}
		})
	} catch (error) {
		logger.warn('Не удалось очистить старые логи', { error: error.message })
	}
}

// Запуск скрипта
if (require.main === module) {
	// Очищаем старые логи перед запуском
	clearOldLogs()

	main().catch(error => {
		logger.error('Критическая ошибка в main()', { error: error.message })
		console.error(error)
	})
}

module.exports = { processRegion, main }
