import { createHash } from 'crypto'
import { readJson } from 'fs-extra'
import { createWriteStream } from 'fs'

import ora from 'ora'
import { createInterface } from 'readline'
import * as readline from 'readline'

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
  classifyError,
  sleepWithJitter,
  calculateBackoffDelay,
  DEFAULT_RETRY_CONFIG,
  retryWithBackoff,
  parseFileSystemError,
} from './utils'

const EXPORTS = 'exports'

const { account, workspace } = SessionManager.getSingleton()

const COLORS = ['cyan', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray']
const FIELDS = ['from', 'to', 'type', 'endDate', 'binding']

const askUserIfShouldResume = async (savedData: { routeCount: number; next?: string }): Promise<boolean> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    console.log(`\n📊 Found saved progress: ${savedData.routeCount} routes exported`)
    if (savedData.next) {
      console.log(`🔄 Last token: ${savedData.next.substring(0, 20)}...`)
    }

    rl.question('\nDo you want to continue from where you left off? (y/N): ', (answer) => {
      rl.close()

      const shouldResume = answer.toLowerCase().startsWith('y')

      if (shouldResume) {
        logger.info('Resuming from saved progress...')
      } else {
        logger.info('Starting fresh export...')
      }

      resolve(shouldResume)
    })
  })
}

interface ExportConfig {
  maxConcurrentRequests: number
  writeBatchSize: number
  maxRetries: number
}

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
  private batchSize: number

  constructor(writeStream: ReturnType<typeof createWriteStream>, batchSize: number) {
    this.writeStream = writeStream
    this.batchSize = batchSize
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
        const { batchSize } = this
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
        const friendlyMessage = parseFileSystemError(error)
        const enhancedError = new Error(friendlyMessage)

        enhancedError.cause = error
        reject(enhancedError)
      }
    })
  }

  getQueueSize(): number {
    return this.queue.size
  }
}

const handleExport = async (csvPath: string, config: ExportConfig) => {
  const indexHash = createHash('md5').update(`${account}_${workspace}_${csvPath}`).digest('hex')
  const metainfo = await readJson(METAINFO_FILE).catch(() => ({}))
  const exportMetainfo = metainfo[EXPORTS] || {}

  // Debug: Log hash and available progress
  logger.info(`Hash for ${csvPath}: ${indexHash}`)
  logger.info(`Available progress entries: ${Object.keys(exportMetainfo).join(', ')}`)

  // Check if our hash matches any saved progress
  const hashMatches = Object.keys(exportMetainfo).includes(indexHash)

  logger.info(`Hash matches saved progress: ${hashMatches}`)

  // Check if there's saved progress
  const hasSavedProgress = exportMetainfo[indexHash]?.data
  let { routeCount, next } = hasSavedProgress ? exportMetainfo[indexHash].data : { routeCount: 0, next: undefined }

  // Ensure routeCount is a number
  routeCount = Number(routeCount) || 0

  // Debug: Log what we found
  if (hasSavedProgress) {
    logger.info(`Found saved progress: routeCount=${routeCount}, next=${next ? 'yes' : 'no'}`)
    logger.info(
      `Condition check: hasSavedProgress=${hasSavedProgress}, routeCount > 0=${routeCount > 0}, next=${!!next}`
    )
  }

  // If there's saved progress, ask user what to do
  if (hasSavedProgress && (routeCount > 0 || next)) {
    logger.info('Showing resume prompt to user...')
    const shouldResume = await askUserIfShouldResume({ routeCount, next })

    if (shouldResume) {
      logger.info(`Resuming from token: ${next?.substring(0, 20)}... (${routeCount} routes already exported)`)
    } else {
      // User chose to start fresh - clear saved progress
      deleteMetainfo(metainfo, EXPORTS, indexHash)
      routeCount = 0
      next = undefined
    }
  } else {
    logger.info('No saved progress found or conditions not met - starting fresh')
  }

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
    fileWriteQueue = new FileWriteQueue(writeStream, config.writeBatchSize)

    const headers = FIELDS.join(DELIMITER)

    writeStream.write(`${headers}\n`)

    const rewriter = Rewriter.createClient()

    // Pipeline: Sequential fetching with concurrent processing
    let pageIndex = 0
    const pendingWrites: Array<Promise<number>> = []

    const spinner = ora('Exporting redirects....').start()

    do {
      try {
        // Fetch next page with enhanced retry logic
        const currentNext = next

        // Validate token format (should be base64 encoded) if we have a token
        if (currentNext) {
          try {
            Buffer.from(currentNext, 'base64')
          } catch (e) {
            logger.warn('Invalid token format detected. Starting fresh export...')
            next = undefined
            routeCount = 0
            continue
          }
        }

        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout after 60 seconds')), 60000)
        })

        // eslint-disable-next-line no-await-in-loop
        const result = await Promise.race([
          retryWithBackoff(
            () => rewriter.exportRedirects(currentNext),
            { nextToken: currentNext, routeCount, spinner },
            { ...DEFAULT_RETRY_CONFIG, maxRetries: config.maxRetries }
          ),
          timeoutPromise,
        ] as any)

        // Create page result for processing
        const pageResult: PageResult = {
          pageIndex: pageIndex++,
          routes: result.routes,
          nextToken: result.next,
        }

        // Process page concurrently (don't await immediately)
        const writePromise = fileWriteQueue.addPage(pageResult)

        pendingWrites.push(writePromise)

        // Update route count immediately for better user feedback
        routeCount = Number(routeCount) + Number(result.routes.length)

        // Limit concurrent processing to prevent memory buildup
        if (pendingWrites.length >= config.maxConcurrentRequests) {
          // Wait for the oldest promise to complete
          // eslint-disable-next-line no-await-in-loop
          await pendingWrites[0]

          // Remove the completed promise
          pendingWrites.shift()
        }

        spinner.color = COLORS[count % COLORS.length] as any
        spinner.text = `Exporting redirects....\t\t${String(routeCount)} Done`
        next = result.next
        count++
      } catch (e) {
        // Check for timeout errors
        if (
          e &&
          typeof e === 'object' &&
          'message' in e &&
          typeof e.message === 'string' &&
          e.message.includes('Request timeout')
        ) {
          logger.error('Request timed out. This might indicate an invalid token or API issues.')
          logger.info('Clearing saved progress and starting fresh...')
          deleteMetainfo(metainfo, EXPORTS, indexHash)
          next = undefined
          routeCount = 0
          continue
        }

        // Check if it's a file system error first
        if (
          e &&
          typeof e === 'object' &&
          'message' in e &&
          typeof e.message === 'string' &&
          (e.message.includes('No space left') ||
            e.message.includes('Permission denied') ||
            e.message.includes('File system error'))
        ) {
          logger.error(`File system error: ${e.message}`)
          cleanup()
          listener.close()
          spinner.stop()
          throw e
        }

        // Enhanced error handling with token persistence
        const errorInfo = classifyError(e)

        // For 5xx errors, save the current token for recovery
        if (errorInfo.type === 'server_error') {
          logger.warn('Server error encountered. Saving current progress for recovery...')
          saveMetainfo(metainfo, EXPORTS, indexHash, 0, { next, routeCount })
        }

        // For non-retryable errors, save progress and exit
        if (!errorInfo.retryable) {
          logger.error(`Non-retryable error: ${errorInfo.type}`)
          saveMetainfo(metainfo, EXPORTS, indexHash, 0, { next, routeCount })
          cleanup()
          listener.close()
          spinner.stop()
          throw e
        }

        // For retryable errors that exhausted retries, save progress
        saveMetainfo(metainfo, EXPORTS, indexHash, 0, { next, routeCount })
        cleanup()
        listener.close()
        spinner.stop()
        throw e
      }
    } while (next)

    // Wait for all pending writes to complete
    await Promise.all(pendingWrites)

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

export default async (
  csvPath: string,
  config: ExportConfig = { maxConcurrentRequests: 5, writeBatchSize: 100, maxRetries: 5 }
) => {
  try {
    await handleExport(csvPath, config)
  } catch (e) {
    // Check if it's a file system error first
    if (
      e &&
      typeof e === 'object' &&
      'message' in e &&
      typeof e.message === 'string' &&
      (e.message.includes('No space left') ||
        e.message.includes('Permission denied') ||
        e.message.includes('File system error'))
    ) {
      logger.error(`Export failed due to file system error: ${e.message}`)
      process.exit(1)
    }

    const errorInfo = classifyError(e)

    logger.error(`Export failed with error type: ${errorInfo.type}`)
    showGraphQLErrors(e)

    if (isVerbose) {
      console.log('Full error details:', e)
    }

    // For non-retryable errors, exit immediately
    if (!errorInfo.retryable) {
      logger.error('Non-retryable error encountered. Exiting.')
      process.exit(1)
    }

    // For retryable errors, use enhanced retry logic
    if (retryCount >= MAX_RETRIES) {
      logger.error(`Maximum retries (${MAX_RETRIES}) exceeded. Exiting.`)
      logger.info('You can resume the export by running the same command again.')
      process.exit(1)
    }

    // Calculate delay based on error type
    let delay: number

    if (errorInfo.type === 'rate_limit' && errorInfo.retryAfter) {
      delay = errorInfo.retryAfter
      logger.info(`Rate limited. Waiting ${Math.ceil(delay / 1000)}s as specified by Retry-After header`)
    } else {
      delay = calculateBackoffDelay(retryCount + 1, RETRY_INTERVAL_S * 1000, 60000) // Max 60s
      logger.info(`Retrying in ${Math.ceil(delay / 1000)}s (attempt ${retryCount + 1}/${MAX_RETRIES})`)
    }

    logger.info('Press CTRL+C to abort')
    await sleepWithJitter(delay)
    retryCount++
    await module.exports.default(csvPath, config)
  }
}
