import { Args, Command, Flags } from '@oclif/core'
import { ColorifyConstants } from 'vtex'
import redirectsExport from '../../modules/rewriter/export.js'

export default class RedirectsExport extends Command {
  static override description = `Exports all redirects defined in the current ${ColorifyConstants.ID(
    'account'
  )} and ${ColorifyConstants.ID('workspace')} to a CSV file.`

  static override examples = [`${ColorifyConstants.COMMAND_OR_VTEX_REF('vtex redirects export')} csvPath`]

  static override flags = {
    verbose: Flags.boolean({ description: 'Show verbose output' }),
    help: Flags.help({ char: 'h' }),
    trace: Flags.boolean({ description: 'Show stack trace on errors' }),
  }

  static override args = {
    csvPath: Args.string({ required: true, description: 'Name of the CSV file.' }),
  }

  async run() {
    const {
      args: { csvPath },
    } = await this.parse(RedirectsExport)

    await redirectsExport(csvPath)
  }
}
