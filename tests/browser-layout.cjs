// Check the exported UI at CSS-pixel sizes, including a live orientation change.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(process.env.BATTLE_URL || 'http://127.0.0.1:4226/', { waitUntil: 'domcontentloaded' })
    const target = (name) => page.locator('[data-harbor-control="' + name + '"]')
    await target('course').waitFor({ state: 'visible', timeout: 150000 })
    for (const [width, height] of [[1024, 768], [1366, 768], [768, 1024], [390, 844], [1680, 720]]) {
      await page.setViewportSize({ width, height })
      await page.waitForFunction(([w, h]) => {
        const canvas = document.querySelector('canvas').getBoundingClientRect()
        const last = document.querySelector('[data-harbor-control="tom"]').getBoundingClientRect()
        return Math.abs(canvas.width - w) < 2 && Math.abs(canvas.height - h) < 2 &&
          last.right >= w * .94 && last.right <= w && last.bottom >= h * .96 && last.bottom <= h
      }, [width, height])
      await page.waitForTimeout(150)
      const bounds = await page.locator('[data-harbor-control]:visible').evaluateAll(nodes =>
        Object.fromEntries(nodes.map(node => {
          const { x, y, width, height } = node.getBoundingClientRect()
          return [node.dataset.harborControl, { x, y, width, height }]
        })))
      assert.equal(Object.keys(bounds).length, 9)
      for (const [id, box] of Object.entries(bounds)) {
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 &&
          box.y + box.height <= height + 1, 'Clipped ' + id + ' at ' + width)
        assert.ok(box.height >= 43.5 && box.width >= 43.5, 'Small target ' + id)
      }
      assert.ok(bounds.guide.y + bounds.guide.height < bounds.kick.y, 'Guide covers drum pads')
      assert.ok(bounds.kick.x + bounds.kick.width < bounds.snare.x, 'Pad overlap')
      await target('action').focus()
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement.dataset.harborControl), 'tempo')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await page.keyboard.press('ArrowRight')
      assert.equal(await page.evaluate(() => document.activeElement.dataset.harborControl), 'midi')
      await page.keyboard.press('ArrowRight')
      assert.equal(await page.evaluate(() => document.activeElement.dataset.harborControl), 'action')
      if (process.env.BATTLE_LAYOUT_CAPTURES) {
        fs.mkdirSync(process.env.BATTLE_LAYOUT_CAPTURES, { recursive: true })
        await page.screenshot({ path: path.join(process.env.BATTLE_LAYOUT_CAPTURES, width + 'x' + height + '.png') })
      }
      console.log(width + 'x' + height + ' • pad ' + bounds.kick.width.toFixed(0) + '×' + bounds.kick.height.toFixed(0))
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await target('action').tap()
    await target('guide').waitFor({ state: 'hidden' })
    await page.setViewportSize({ width: 768, height: 1024 })
    await target('hat').tap()
    await target('action').tap()
    await target('guide').waitFor({ state: 'visible' })
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
