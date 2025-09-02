import { Args, Command, Flags } from '@oclif/core'
import redirectsDelete from '../../modules/rewriter/delete.js'
import { ColorifyConstants } from 'vtex'

export default class RedirectsDelete extends Command {
  static override description = `Deletes redirects from the current ${ColorifyConstants.ID(
    'account'
  )} and ${ColorifyConstants.ID('workspace')}.`

  static override examples = [`${ColorifyConstants.COMMAND_OR_VTEX_REF('vtex redirects delete')} csvPath`]

  static override flags = {
    verbose: Flags.boolean({ description: 'Show verbose output' }),
    help: Flags.help({ char: 'h' }),
    trace: Flags.boolean({ description: 'Show stack trace on errors' }),
  }

  static override args = {
    csvPath: Args.string({ required: true, description: `CSV file containing the URL paths to delete.` }),
  }

  async run() {
    const {
      args: { csvPath },
    } = await this.parse(RedirectsDelete)

    await redirectsDelete(csvPath)
  }
}
