import { createHash } from 'crypto'
import fsExtra from 'fs-extra'
import { createWriteStream } from 'fs'

const { readJson } = fsExtra

import ora from 'ora'
import { createInterface } from 'readline'

import { Rewriter } from '../../clients/apps/Rewriter.js'
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
} from './utils.js'

const EXPORTS = 'exports'
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.EXPORT_CONCURRENCY ?? '5', 10) // Configurable concurrency limit
const WRITE_BATCH_SIZE = parseInt(process.env.EXPORT_BATCH_SIZE ?? '100', 10) // Configurable batch size

const { account, workspace } = SessionManager.getSingleton()

const COLORS = ['cyan', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray']
const FIELDS = ['from', 'to', 'type', 'endDate', 'binding']

interface PageResult {
  pageIndex: number
  routes: any[]
  nextToken?: string
}

class FileWriteQueue {
  private queue = new Map<number, PageResult>()
  private nextExpectedPage = 0
  private writeStream: ReturnType<typeof createWriteStream>
  private isWriting = false

  constructor(writeStream: ReturnType<typeof createWriteStream>) {
    this.writeStream = writeStream
  }

  async addPage(pageResult: PageResult): Promise<number> {
    this.queue.set(pageResult.pageIndex, pageResult)

    return this.processQueue()
  }

  private async processQueue(): Promise<number> {
    if (this.isWriting) return 0

    this.isWriting = true
    let processedCount = 0

    try {
      while (this.queue.has(this.nextExpectedPage)) {
        const pageResult = this.queue.get(this.nextExpectedPage)

        if (!pageResult) break

        // eslint-disable-next-line no-await-in-loop
        await this.writePageToFile(pageResult)
        this.queue.delete(this.nextExpectedPage)
        this.nextExpectedPage++
        processedCount += pageResult.routes.length
      }
    } finally {
      this.isWriting = false
    }

    return processedCount
  }

  private async writePageToFile(pageResult: PageResult): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Process routes in batches for better performance
        const batchSize = WRITE_BATCH_SIZE
        let csvBatch = ''

        for (let i = 0; i < pageResult.routes.length; i++) {
          const route = pageResult.routes[i]
          const encodedRoute = {
            ...route,
            from: encode(route.from),
            to: encode(route.to),
          }

          const csvRow = FIELDS.map((field) => {
            const value = encodedRoute[field as keyof typeof encodedRoute] || ''

            return `"${String(value).replace(/"/g, '""')}"`
          }).join(DELIMITER)

          csvBatch += `${csvRow}\n`

          // Write batch when it reaches batchSize or when we're at the end
          if ((i + 1) % batchSize === 0 || i === pageResult.routes.length - 1) {
            this.writeStream.write(csvBatch)
            csvBatch = ''
          }
        }

        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  getQueueSize(): number {
    return this.queue.size
  }
}

const handleExport = async (csvPath: string) => {
  const indexHash = createHash('md5').update(`${account}_${workspace}_${csvPath}`).digest('hex')
  const metainfo = await readJson(METAINFO_FILE).catch(() => ({}))
  const exportMetainfo = metainfo[EXPORTS] || {}

  const spinner = ora('Exporting redirects....').start()

  let { routeCount, next } = exportMetainfo[indexHash]
    ? exportMetainfo[indexHash].data
    : { routeCount: 0, next: undefined }

  // Ensure routeCount is a number
  routeCount = Number(routeCount) || 0

  let count = 2
  let writeStream: ReturnType<typeof createWriteStream> | null = null
  let fileWriteQueue: FileWriteQueue | null = null

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
    fileWriteQueue = new FileWriteQueue(writeStream)

    const headers = FIELDS.join(DELIMITER)

    writeStream.write(`${headers}\n`)

    const rewriter = Rewriter.createClient()

    // Pipeline: Sequential fetching with concurrent processing
    let pageIndex = 0
    const pendingWrites: Array<Promise<number>> = []

    do {
      try {
        // Fetch next page (this must be sequential due to pagination tokens)
        // eslint-disable-next-line no-await-in-loop
        const result = await rewriter.exportRedirects(next)

        // Create page result for processing
        const pageResult: PageResult = {
          pageIndex: pageIndex++,
          routes: result.routes,
          nextToken: result.next,
        }

        // Process page concurrently (don't await immediately)
        const writePromise = fileWriteQueue.addPage(pageResult)

        pendingWrites.push(writePromise)

        // Limit concurrent processing to prevent memory buildup
        if (pendingWrites.length >= MAX_CONCURRENT_REQUESTS) {
          // Wait for the oldest promise to complete
          // eslint-disable-next-line no-await-in-loop
          const completedCount: number = await pendingWrites[0]

          routeCount = Number(routeCount) + completedCount

          // Remove the completed promise
          pendingWrites.shift()
        }

        spinner.color = COLORS[count % COLORS.length] as any
        spinner.text = `Exporting redirects....\t\t${String(routeCount)} Done (Queue: ${fileWriteQueue.getQueueSize()})`
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

    // Wait for all pending writes to complete

    const remainingCounts = await Promise.all(pendingWrites)

    const totalRemainingCount: number = remainingCounts.reduce((sum, routeCountFromPage) => sum + routeCountFromPage, 0)

    routeCount = Number(routeCount) + totalRemainingCount

    // Ensure all queued data is written
    while (fileWriteQueue.getQueueSize() > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(50)
    }

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

const redirectsExportFunc = async (csvPath: string) => {
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
    await redirectsExportFunc(csvPath)
  }
}

export default redirectsExportFunc
