import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Fork: guards the forkpty child fd sweep in config/patches/node-pty@1.1.0.patch (src/unix/pty.cc).
const describeOnLinux = process.platform === 'linux' ? describe : describe.skip

const O_CLOEXEC = 0o2000000

describeOnLinux('node-pty Linux forkpty inherited fds', () => {
  it('closes descriptors the host inherited without close-on-exec before the shell starts', () => {
    // Why fd 104: Node marks the low inherited fds close-on-exec at startup but leaves a high one
    // inheritable, like the Electron sockets and GPU cache files the daemon holds.
    const inheritedFd = 104
    const dir = mkdtempSync(join(tmpdir(), 'pty-inherited-fd-'))
    const marker = join(dir, 'inherited-marker')
    writeFileSync(marker, '')
    const inherited = openSync(marker, 'r')
    const host = `
      const { readFileSync, readlinkSync } = require('node:fs')
      const flags = /flags:\\s*(\\d+)/.exec(readFileSync('/proc/self/fdinfo/${inheritedFd}', 'utf8'))[1]
      const inheritable = (Number.parseInt(flags, 8) & ${O_CLOEXEC}) === 0
      process.stdout.write('host ' + inheritable + ' ' + readlinkSync('/proc/self/fd/${inheritedFd}') + '\\n')
      const pty = require(${JSON.stringify(createRequire(import.meta.url).resolve('node-pty'))})
      const term = pty.spawn('/bin/sh', ['-c', 'ls -l /proc/self/fd'], { cols: 200, rows: 24, cwd: '/', env: process.env })
      let listing = ''
      term.onData((data) => { listing += data })
      term.onExit(() => setTimeout(() => { process.stdout.write(listing); process.exit(0) }, 100))
    `
    const stdio: ('ignore' | 'pipe' | number)[] = Array.from(
      { length: inheritedFd },
      () => 'ignore'
    )
    stdio[1] = 'pipe'
    stdio[2] = 'pipe'
    stdio.push(inherited)
    try {
      const result = spawnSync(process.execPath, ['-e', host], {
        stdio,
        encoding: 'utf8',
        timeout: 10_000
      })
      // The host must really hold an inheritable copy, or a clean listing would prove nothing.
      expect(result.stdout).toContain(`host true ${marker}`)
      const listing = result.stdout.slice(result.stdout.indexOf('\n') + 1)
      expect(listing).toMatch(/\d+ -> \/dev\/pts\//)
      expect(listing).not.toContain(marker)
    } finally {
      closeSync(inherited)
      rmSync(dir, { recursive: true, force: true })
    }
  }, 15000)
})
