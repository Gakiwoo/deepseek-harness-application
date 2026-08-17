import { expect, it } from 'vitest'
import { createDesktopShutdown } from '../src/lifecycle.ts'
import {
  handleDesktopWindowClose,
  showDesktopWindow,
  type DesktopWindowFace,
} from '../src/window.ts'

function traceWindow(trace: string[]): DesktopWindowFace {
  return {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => { trace.push('window.restore') },
    show: () => { trace.push('window.show') },
    hide: () => { trace.push('window.hide') },
    focus: () => { trace.push('window.focus') },
  }
}

it('records hide, restore, and orderly quit', async () => {
  const trace: string[] = ['boot']
  const window = traceWindow(trace)
  handleDesktopWindowClose(window, { preventDefault: () => { trace.push('close.prevent') } }, false)
  showDesktopWindow(window)
  const shutdown = createDesktopShutdown(async () => {
    trace.push('pump.dispose')
    trace.push('host.dispose')
    trace.push('tray.dispose')
    trace.push('window.dispose')
  }, (code) => { trace.push(`app.exit:${String(code)}`) })
  await shutdown.request(0)
  expect(trace.join('\n')).toMatchInlineSnapshot(`
    "boot
    close.prevent
    window.hide
    window.restore
    window.show
    window.focus
    pump.dispose
    host.dispose
    tray.dispose
    window.dispose
    app.exit:0"
  `)
})
