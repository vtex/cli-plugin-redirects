# VTEX CLI Plugin Redirects

Extend the `vtex` toolbelt!

## Developing

1. Clone `vtex/toolbelt` and follow the steps on the Contributing section.
2. Clone/Create a plugin with this template.
3. Change the template name under this project's `package.json`.
4. Run `yarn link` on this project.
5. Now run `vtex link @vtex/cli-plugin-template` (or the new name) on the `vtex/toolbelt` project.
6. Run `yarn watch` on the `vtex/toolbelt`
7. Test the command on a VTEX IO app with `vtex-test hello`

For more information, read [Ocliff Docs](https://oclif.io/docs/introduction).

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
![npm](https://img.shields.io/npm/v/@vtex/cli-plugin-redirects)

<!-- toc -->
* [VTEX CLI Plugin Redirects](#vtex-cli-plugin-redirects)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g @vtex/cli-plugin-redirects
$ oclif-example COMMAND
running command...
$ oclif-example (-v|--version|version)
@vtex/cli-plugin-redirects/1.0.0 linux-x64 node-v12.22.1
$ oclif-example --help [COMMAND]
USAGE
  $ oclif-example COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`oclif-example redirects:delete CSVPATH`](#oclif-example-redirectsdelete-csvpath)
* [`oclif-example redirects:export CSVPATH`](#oclif-example-redirectsexport-csvpath)
* [`oclif-example redirects:import CSVPATH`](#oclif-example-redirectsimport-csvpath)

## `oclif-example redirects:delete CSVPATH`

Deletes redirects from the current account and workspace.

```
USAGE
  $ oclif-example redirects:delete CSVPATH

ARGUMENTS
  CSVPATH  CSV file containing the URL paths to delete.

OPTIONS
  -h, --help     show CLI help
  -v, --verbose  Show debug level logs
  --trace        Ensure all requests to VTEX IO are traced

EXAMPLE
  vtex redirects delete csvPath
```

_See code: [build/commands/redirects/delete.ts](https://github.com/vtex/cli-plugin-redirects/blob/v1.0.0/build/commands/redirects/delete.ts)_

## `oclif-example redirects:export CSVPATH`

Exports all redirects defined in the current account and workspace to a CSV file.

```
USAGE
  $ oclif-example redirects:export CSVPATH

ARGUMENTS
  CSVPATH  Name of the CSV file.

OPTIONS
  -h, --help     show CLI help
  -v, --verbose  Show debug level logs
  --trace        Ensure all requests to VTEX IO are traced

EXAMPLE
  vtex redirects export csvPath
```

_See code: [build/commands/redirects/export.ts](https://github.com/vtex/cli-plugin-redirects/blob/v1.0.0/build/commands/redirects/export.ts)_

## `oclif-example redirects:import CSVPATH`

Imports redirects from a CSV file to the current account and workspace.

```
USAGE
  $ oclif-example redirects:import CSVPATH

ARGUMENTS
  CSVPATH  Name of the CSV file.

OPTIONS
  -h, --help     show CLI help
  -r, --reset    Removes all redirects previously defined.
  -v, --verbose  Show debug level logs
  --trace        Ensure all requests to VTEX IO are traced

EXAMPLE
  vtex redirects import csvPath
```

_See code: [build/commands/redirects/import.ts](https://github.com/vtex/cli-plugin-redirects/blob/v1.0.0/build/commands/redirects/import.ts)_
<!-- commandsstop -->
