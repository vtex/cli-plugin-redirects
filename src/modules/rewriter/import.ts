import { createHash } from 'crypto'
import fsExtra from 'fs-extra'

const { readFile, readJson, remove, writeFile } = fsExtra
import { Parser } from 'json2csv'
import { resolve } from 'path'
import { difference, isEmpty, length, map, pluck } from 'ramda'
import { createInterface } from 'readline'
import { Rewriter, type RedirectInput } from '../../clients/apps/Rewriter.js'
import { SessionManager, logger, isVerbose } from 'vtex'
import deleteRedirects from './delete.js'
import {
  deleteMetainfo,
  DELIMITER,
  handleReadError,
  MAX_RETRIES,
  METAINFO_FILE,
  progressBar,
  readCSV,
  RETRY_INTERVAL_S,
  saveMetainfo,
  showGraphQLErrors,
  sleep,
  splitJsonArray,
  validateInput,
} from './utils.js'

const IMPORTS = 'imports'
const { account, workspace } = SessionManager.getSingleton()

const inputSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
      },
      to: {
        type: 'string',
      },
      endDate: {
        type: 'string',
      },
      type: {
        type: 'string',
        enum: ['PERMANENT', 'TEMPORARY'],
      },
      binding: {
        type: 'string',
      },
    },
    additionalProperties: false,
    required: ['from', 'to', 'type'],
  },
}

const handleImport = async (csvPath: string) => {
  const fileHash = (await readFile(csvPath)
    .then((data) => createHash('md5').update(`${account}_${workspace}_${data}`).digest('hex'))
    .catch(handleReadError)) as string

  const metainfo = await readJson(METAINFO_FILE).catch(() => ({}))
  const importMetainfo = metainfo[IMPORTS] || {}
  let counter = importMetainfo[fileHash] ? importMetainfo[fileHash].counter : 0
  const routes = await readCSV(csvPath)

  validateInput(inputSchema, routes)

  const routesList = splitJsonArray(routes)

  const bar = progressBar('Importing routes...', counter, length(routesList))

  const listener = createInterface({ input: process.stdin, output: process.stdout }).on('SIGINT', () => {
    saveMetainfo(metainfo, IMPORTS, fileHash, counter)
    console.log('\n')
    process.exit()
  })

  const rewriter = Rewriter.createClient()

  for (const redirects of routesList.splice(counter)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await rewriter.importRedirects(redirects as RedirectInput[])
    } catch (e) {
      // eslint-disable-next-line no-await-in-loop
      await saveMetainfo(metainfo, IMPORTS, fileHash, counter)
      listener.close()
      throw e
    }

    counter++
    bar.tick()
  }

  logger.info('Finished!\n')
  listener.close()
  deleteMetainfo(metainfo, IMPORTS, fileHash)

  return pluck('from', routes ?? [])
}

let retryCount = 0

const redirectsImportFunc = async (csvPath: string, options: any): Promise<string[]> => {
  const reset = options ? options.r || options.reset : undefined
  let indexedRoutes

  let importedRoutes

  try {
    importedRoutes = await handleImport(csvPath)
  } catch (e) {
    logger.error('Error handling import')
    const maybeGraphQLErrors = showGraphQLErrors(e)

    if (isVerbose) {
      console.log(e)
    }

    if (retryCount >= MAX_RETRIES || maybeGraphQLErrors) {
      process.exit()
    }

    logger.error(`Retrying in ${RETRY_INTERVAL_S} seconds...`)
    logger.info('Press CTRL+C to abort')
    await sleep(RETRY_INTERVAL_S * 1000)
    retryCount++
    importedRoutes = await redirectsImportFunc(csvPath, options)
  }

  if (reset) {
    const routesToDelete = difference(indexedRoutes ?? [], importedRoutes || [])

    if (routesToDelete && !isEmpty(routesToDelete)) {
      const fileName = `.vtex_redirects_to_delete_${Date.now().toString()}.csv`
      const filePath = `./${fileName}`

      logger.info('Deleting old redirects...')
      logger.info(
        `In case this step fails, run 'vtex redirects delete ${resolve(fileName)}' to finish deleting old redirects.`
      )
      const json2csvParser = new Parser({ fields: ['from'], delimiter: DELIMITER, quote: '' })
      const csv = json2csvParser.parse(map((route) => ({ from: route }), routesToDelete))

      await writeFile(filePath, csv)
      await deleteRedirects(filePath)
      await remove(filePath)
    }
  }

  return importedRoutes
}

export default redirectsImportFunc
