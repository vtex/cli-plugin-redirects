import { createHash } from 'crypto'
import { readJson } from 'fs-extra'
import { createWriteStream } from 'fs'

import ora from 'ora'
import { createInterface } from 'readline'

import { Rewriter } from '../../clients/apps/Rewriter'
import { SessionManager, logger, isVerbose } from 'vtex'
import {
  deleteMetainfo,
  DELIMITER,
  encode,
  MAX_RETRIES,
  METAINFO_FILE,
  RETRY_INTERVAL_S,
  saveMetainfo,
  showGraphQLErrors,
  sleep,
} from './utils'

const EXPORTS = 'exports'

const { account, workspace } = SessionManager.getSingleton()

const COLORS = ['cyan', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray']
const FIELDS = ['from', 'to', 'type', 'endDate', 'binding']

const handleExport = async (csvPath: string) => {
  const indexHash = createHash('md5').update(`${account}_${workspace}_${csvPath}`).digest('hex')
  const metainfo = await readJson(METAINFO_FILE).catch(() => ({}))
  const exportMetainfo = metainfo[EXPORTS] || {}

  const spinner = ora('Exporting redirects....').start()

  let { routeCount, next } = exportMetainfo[indexHash]
    ? exportMetainfo[indexHash].data
    : { routeCount: 0, next: undefined }

  let count = 2
  let writeStream: ReturnType<typeof createWriteStream> | null = null

  const cleanup = () => {
    if (writeStream && !writeStream.destroyed) {
      writeStream.end()
    }
  }

  const listener = createInterface({ input: process.stdin, output: process.stdout }).on('SIGINT', () => {
    saveMetainfo(metainfo, EXPORTS, indexHash, 0, { next, routeCount })
    cleanup()
    console.log('\n')
    process.exit()
  })

  try {
    // Create write stream and write CSV headers
    writeStream = createWriteStream(`./${csvPath}`)

    const headers = FIELDS.join(DELIMITER)

    writeStream.write(`${headers}\n`)

    const rewriter = Rewriter.createClient()

    do {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await rewriter.exportRedirects(next)

        // Process and write each route immediately
        for (const route of result.routes) {
          const encodedRoute = {
            ...route,
            from: encode(route.from),
            to: encode(route.to),
          }

          // Manually format CSV row to avoid memory overhead of Parser

          const csvRow = FIELDS.map((field) => {
            const value = encodedRoute[field as keyof typeof encodedRoute] || ''

            return `"${String(value).replace(/"/g, '""')}"`
          }).join(DELIMITER)

          writeStream.write(`${csvRow}\n`)
          routeCount++
        }

        spinner.color = COLORS[count % COLORS.length] as any
        spinner.text = `Exporting redirects....\t\t${routeCount} Done`
        next = result.next
        count++
      } catch (e) {
        saveMetainfo(metainfo, EXPORTS, indexHash, 0, { next, routeCount })
        cleanup()
        listener.close()
        spinner.stop()
        throw e
      }
    } while (next)

    // Close the write stream
    cleanup()
    spinner.stop()

    logger.info('Finished!\n')
    listener.close()
    deleteMetainfo(metainfo, EXPORTS, indexHash)
  } catch (e) {
    cleanup()
    throw e
  }
}

let retryCount = 0

export default async (csvPath: string) => {
  try {
    await handleExport(csvPath)
  } catch (e) {
    logger.error('Error handling export\n')
    showGraphQLErrors(e)
    if (isVerbose) {
      console.log(e)
    }

    if (retryCount >= MAX_RETRIES) {
      process.exit()
    }

    logger.error(`Retrying in ${RETRY_INTERVAL_S} seconds...`)
    logger.info('Press CTRL+C to abort')
    await sleep(RETRY_INTERVAL_S * 1000)
    retryCount++
    await module.exports.default(csvPath)
  }
}
