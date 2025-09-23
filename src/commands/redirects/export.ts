import { flags as oclifFlags } from '@oclif/command'

import { CustomCommand, ColorifyConstants } from 'vtex'
import redirectsExport from '../../modules/rewriter/export'

export default class RedirectsExport extends CustomCommand {
  static description = `Exports all redirects defined in the current ${ColorifyConstants.ID(
    'account'
  )} and ${ColorifyConstants.ID('workspace')} to a CSV file.`

  static examples = [`${ColorifyConstants.COMMAND_OR_VTEX_REF('vtex redirects export')} csvPath`]

  static flags = {
    ...CustomCommand.globalFlags,
    concurrency: oclifFlags.integer({
      char: 'c',
      default: 5,
      description: 'Maximum number of concurrent requests (default: 5)',
    }),
    batchSize: oclifFlags.integer({
      char: 'b',
      default: 100,
      description: 'Batch size for writing to file (default: 100)',
    }),
    maxRetries: oclifFlags.integer({
      char: 'r',
      default: 5,
      description: 'Maximum number of retries for failed requests (default: 5)',
    }),
  }

  static args = [{ name: 'csvPath', required: true, description: 'Name of the CSV file.' }]

  async run() {
    const {
      args: { csvPath },
      flags: { concurrency, batchSize, maxRetries },
    } = this.parse(RedirectsExport)

    await redirectsExport(csvPath, {
      maxConcurrentRequests: concurrency as number,
      writeBatchSize: batchSize as number,
      maxRetries: maxRetries as number,
    })
  }
}
