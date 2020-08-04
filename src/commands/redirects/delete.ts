import redirectsDelete from '../../modules/rewriter/delete'
import { CustomCommand } from 'vtex'

export default class RedirectsDelete extends CustomCommand {
  static description = 'Delete redirects in the current account and workspace'

  static examples = ['vtex redirects delete csvPath']

  static flags = {
    ...CustomCommand.globalFlags,
  }

  static args = [{ name: 'csvPath', required: true }]

  async run() {
    const {
      args: { csvPath },
    } = this.parse(RedirectsDelete)

    await redirectsDelete(csvPath)
  }
}
