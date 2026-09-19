// electron-builder beforePack hook. koffi's native binary comes in a package
// per platform and architecture, and npm installs only the one for the machine
// it runs on. Building for another architecture (arm64 on an x64 machine, say)
// needs that one too, or the app would ship without it.
const { execFileSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

// electron-builder's Arch enum, by value.
const ARCH_NAMES = ['ia32', 'x64', 'armv7l', 'arm64', 'universal']

module.exports = function beforePack(context) {
  const platform = context.electronPlatformName
  const arch = ARCH_NAMES[context.arch]
  const name = `@koromix/koffi-${platform}-${arch}`
  const modules = join(context.packager.projectDir, 'node_modules')
  if (existsSync(join(modules, name))) return

  // koffi doesn't export its package.json, so it's read off the disk.
  const { version } = JSON.parse(readFileSync(join(modules, 'koffi', 'package.json'), 'utf8'))
  console.log(`  • adding ${name}@${version} for this build`)
  // --force past the cpu and os checks, --no-save to leave package.json and
  // the lockfile alone, and no install scripts: the package is just the binary.
  execFileSync(
    'npm',
    ['install', '--no-save', '--force', '--ignore-scripts', `${name}@${version}`],
    { cwd: context.packager.projectDir, stdio: 'inherit', shell: process.platform === 'win32' }
  )
}
