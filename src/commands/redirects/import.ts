import { Args, Flags, Command } from '@oclif/core'
import { ColorifyConstants } from 'vtex'
import redirectsImport from '../../modules/rewriter/import.js'

export default class RedirectsImport extends Command {
  static override description = `Imports redirects from a CSV file to the current ${ColorifyConstants.ID(
    'account'
  )} and ${ColorifyConstants.ID('workspace')}.`

  static override examples = [`${ColorifyConstants.COMMAND_OR_VTEX_REF('vtex redirects import')} csvPath`]

  static override flags = {
    verbose: Flags.boolean({ description: 'Show verbose output' }),
    help: Flags.help({ char: 'h' }),
    trace: Flags.boolean({ description: 'Show stack trace on errors' }),
    reset: Flags.boolean({ char: 'r', description: 'Removes all redirects previously defined.', default: false }),
  }

  static override args = {
    csvPath: Args.string({ required: true, description: 'Name of the CSV file.' }),
  }

  async run() {
    const {
      args: { csvPath },
      flags: { reset },
    } = await this.parse(RedirectsImport)

    await redirectsImport(csvPath, { reset })
  }
}
