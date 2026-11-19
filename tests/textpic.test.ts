import { expect, test } from 'claude-code/testing'

import { halfBlocks, isTextTerminal } from '../hooks/textpic'

test('half-blocks: the top pixel is the foreground, the bottom the background, repeats merged', () => {
  // 2 x 2: red over blue in both columns.
  const px = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255])
  expect(halfBlocks(px, 2, 2, 2, 1)).toEqual([[{ fg: '#ff0000', bg: '#0000ff', n: 2 }]])
})

test('half-blocks: a big picture shrinks to the box, one line per row', () => {
  const px = new Uint8Array(40 * 20 * 3).fill(128)
  const lines = halfBlocks(px, 40, 20, 10, 5)
  expect(lines.length).toBe(5)
  for (const runs of lines) expect(runs).toEqual([{ fg: '#808080', bg: '#808080', n: 10 }])
})

test('text mode is for every terminal that cannot paint kitty placeholders', () => {
  for (const t of ['ghostty', 'kitty', 'iterm2', 'rex', 'herdr_app']) expect(isTextTerminal(t)).toBe(false)
  for (const t of ['other', 'foot', 'wezterm', 'warp', 'konsole', 'alacritty']) expect(isTextTerminal(t)).toBe(true)
})
