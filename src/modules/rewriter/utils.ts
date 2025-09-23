import Ajv from 'ajv'
import { createHash } from 'crypto'
import csv from 'csvtojson'
import { writeJsonSync } from 'fs-extra'
import jsonSplit from 'json-array-split'
import ProgressBar from 'progress'
import { compose, join, keys, map, match, pluck, prop, replace, sortBy, toLower } from 'ramda'
import type { Redirect } from '../../clients/apps/Rewriter'
import { logger, isVerbose } from 'vtex'

export const DELIMITER = ';'
export const MAX_ENTRIES_PER_REQUEST = 10
export const METAINFO_FILE = '.vtex_redirects_metainfo.json'
export const MAX_RETRIES = 10
export const RETRY_INTERVAL_S = 5

export const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export const showGraphQLErrors = (e: any) => {
  if (e.graphQLErrors) {
    logger.error(join('\n', pluck('message', e.graphQLErrors as any[])))

    return true
  }
}

export const handleReadError = (path: string) => (error: any) => {
  console.log(JSON.stringify(error))
  logger.error(`Error reading file: ${path}`)
  logger.error(`${error.message}`)
  process.exit()
}

const normalizePath = (path: string) => {
  try {
    return compose(replace(/\/+$/, ''), toLower, decodeURI)(path)
  } catch (err) {
    logger.error(`Error in URI: ${path}`)
    throw err
  }
}

const sortFunction = (redirect: Redirect) =>
  `${createHash('md5')
    .update(normalizePath(prop('from', redirect)))
    .digest('hex')}`

export const readCSV = async (path: string) => {
  try {
    const result = (await csv({ delimiter: DELIMITER, ignoreEmpty: true, checkType: true }).fromFile(
      path
    )) as Redirect[]

    return sortBy(sortFunction, result)
  } catch (e) {
    handleReadError(path)(e)
  }
}

export const splitJsonArray = (data: any) => jsonSplit(data, MAX_ENTRIES_PER_REQUEST)

export const progressBar = (message: string, curr: number, total: number) =>
  new ProgressBar(`${message} [:bar] :current/:total :percent`, {
    complete: '=',
    incomplete: ' ',
    width: 50,
    curr,
    total,
  })

const parseErrorDataPath = (dataPath: string) => {
  return [match(/\[(.*?)\]/, dataPath)[1], match(/\.(.*?)$/, dataPath)[1]]
}

export const validateInput = (schema: any, routes: any) => {
  const validate = new Ajv().compile(schema)
  const isValid = validate(routes)

  if (isValid) {
    return
  }

  logger.error('Errors validating input:')
  map(({ message, params, dataPath }) => {
    const [errorObjIndex, errorProp] = parseErrorDataPath(dataPath)

    console.error('-----')
    console.error(`${message} - in ${errorObjIndex} (${errorProp})`)
    console.error(params)
    console.error(
      `JSON content: \n ${JSON.stringify(routes[(keys(routes) as { [key: string]: any })[errorObjIndex]], null, 2)}`
    )
    console.error('-----')
  }, validate.errors ?? [])
  process.exit()
}

export const saveMetainfo = (metainfo: any, metainfoType: string, fileHash: string, counter: number, data = {}) => {
  if (!metainfo[metainfoType]) {
    metainfo[metainfoType] = {}
  }

  metainfo[metainfoType][fileHash] = { counter, data }
  writeJsonSync(METAINFO_FILE, metainfo, { spaces: 2 })
}

export const deleteMetainfo = (metainfo: any, metainfoType: string, fileHash: string) => {
  if (!metainfo[metainfoType]) {
    return
  }

  delete metainfo[metainfoType][fileHash]
  writeJsonSync(METAINFO_FILE, metainfo, { spaces: 2 })
}

const createEncoder = (delimiter: string) => {
  const encoded = encodeURIComponent(delimiter)

  return (x: string) => x.replace(delimiter, encoded)
}

export const encode = createEncoder(DELIMITER)

// Function to parse file system errors into user-friendly messages
export const parseFileSystemError = (error: any): string => {
  if (!error) return 'Unknown file system error'

  const errorCode = error.code || error.errno
  const errorMessage = error.message || ''

  // Map of error codes to user-friendly messages
  const errorCodeMap: Record<string, string> = {
    ENOSPC: 'No space left on device. Please free up disk space and try again.',
    EMFILE: 'Too many open files. Please close other applications and try again.',
    ENFILE: 'Too many open files. Please close other applications and try again.',
    EACCES: 'Permission denied. Please check file permissions and try again.',
    ENOENT: 'File or directory not found. Please check the file path.',
    EISDIR: 'Expected a file but found a directory. Please specify a file path.',
    EEXIST: 'File already exists and cannot be overwritten.',
    ENOTDIR: 'Path component is not a directory. Please check the file path.',
    EROFS: 'Read-only file system. Cannot write to this location.',
    EPERM: 'Operation not permitted. Please check your permissions.',
  }

  // Check if error code exists in the map
  if (errorCode && errorCodeMap[errorCode]) {
    return errorCodeMap[errorCode]
  }

  // Fallback checks for error message patterns
  if (errorMessage.includes('stream')) {
    return 'File stream error. The file may be corrupted or inaccessible.'
  }

  if (errorMessage.includes('write')) {
    return 'Failed to write to file. Please check disk space and permissions.'
  }

  return `File system error: ${errorMessage || 'Unknown error'}`
}

// Enhanced error handling types
export interface ApiError extends Error {
  status?: number
  headers?: Record<string, string>
  response?: any
}

export interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  retryAfterHeader?: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
}

// Parse Retry-After header (supports both seconds and HTTP date)
export const parseRetryAfterHeader = (retryAfter: string | undefined): number => {
  if (!retryAfter) return 0

  // If it's a number (seconds), return it
  const seconds = parseInt(retryAfter, 10)

  if (!Number.isNaN(seconds)) {
    return seconds * 1000 // Convert to milliseconds
  }

  // If it's an HTTP date, calculate the difference
  try {
    const retryDate = new Date(retryAfter)
    const now = new Date()
    const diff = retryDate.getTime() - now.getTime()

    return Math.max(0, diff)
  } catch {
    return 0
  }
}

// Error classification
export const classifyError = (
  error: any
): {
  type: 'rate_limit' | 'server_error' | 'client_error' | 'network_error' | 'unknown'
  retryable: boolean
  retryAfter?: number
} => {
  if (!error) {
    return { type: 'unknown', retryable: false }
  }

  const status = error.status || error.response?.status || error.statusCode
  const headers = error.headers || error.response?.headers || {}

  // Rate limiting (429)
  if (status === 429) {
    const retryAfter = parseRetryAfterHeader(headers['retry-after'] || headers['Retry-After'])

    return {
      type: 'rate_limit',
      retryable: true,
      retryAfter,
    }
  }

  // Server errors (5xx)
  if (status >= 500 && status < 600) {
    return { type: 'server_error', retryable: true }
  }

  // Client errors (4xx) - generally not retryable
  if (status >= 400 && status < 500) {
    return { type: 'client_error', retryable: false }
  }

  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return { type: 'network_error', retryable: true }
  }

  return { type: 'unknown', retryable: false }
}

// Enhanced sleep with jitter to avoid thundering herd
export const sleepWithJitter = async (baseDelay: number, jitterPercent = 0.1): Promise<void> => {
  const jitter = baseDelay * jitterPercent * Math.random()
  const delay = Math.floor(baseDelay + jitter)

  await sleep(delay)
}

// Exponential backoff with jitter
export const calculateBackoffDelay = (attempt: number, baseDelay: number, maxDelay: number): number => {
  const exponentialDelay = baseDelay * 2 ** (attempt - 1)
  const jitter = exponentialDelay * 0.1 * Math.random()

  return Math.min(exponentialDelay + jitter, maxDelay)
}

// Enhanced retry wrapper with intelligent error handling
export const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  context: { nextToken?: string; routeCount: number; spinner: any },
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> => {
  let lastError: any
  let attempt = 0

  while (attempt <= retryConfig.maxRetries) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await operation()
    } catch (error) {
      lastError = error
      attempt++

      const errorInfo = classifyError(error)

      // Log the error with context
      logger.warn(`Attempt ${attempt}/${retryConfig.maxRetries + 1} failed: ${errorInfo.type}`)

      if (isVerbose) {
        logger.warn(`Error details: ${error instanceof Error ? error.message : String(error)}`)
      }

      // Don't retry if error is not retryable
      if (!errorInfo.retryable) {
        logger.error(`Non-retryable error: ${errorInfo.type}`)
        throw error
      }

      // If we've exhausted retries, throw the last error
      if (attempt > retryConfig.maxRetries) {
        logger.error(`Max retries (${retryConfig.maxRetries}) exceeded`)
        throw lastError
      }

      // Calculate delay based on error type
      let delay: number

      if (errorInfo.type === 'rate_limit' && errorInfo.retryAfter) {
        // Use Retry-After header value for rate limiting
        delay = errorInfo.retryAfter
        logger.info(`Rate limited. Waiting ${Math.ceil(delay / 1000)}s as specified by Retry-After header`)
      } else {
        // Use exponential backoff for other retryable errors
        delay = calculateBackoffDelay(attempt, retryConfig.baseDelay, retryConfig.maxDelay)
        logger.info(`Retrying in ${Math.ceil(delay / 1000)}s (attempt ${attempt}/${retryConfig.maxRetries})`)
      }

      // Update spinner with retry information
      if (context.spinner) {
        context.spinner.text = `Retrying export... (${errorInfo.type}, attempt ${attempt}/${
          retryConfig.maxRetries + 1
        })`
      }

      // Sleep with jitter to avoid thundering herd
      // eslint-disable-next-line no-await-in-loop
      await sleepWithJitter(delay)
    }
  }

  throw lastError
}
