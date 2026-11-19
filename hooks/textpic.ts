// Text mode: a picture drawn as coloured half-block cells, for terminals that
// can't paint Claude Code's kitty pictures (foot, Alacritty, WezTerm, Warp,
// Konsole, xterm, tmux without passthrough). Each cell is '▀' with the upper
// pixel as the foreground colour and the lower as the background, so a box of
// C x R cells shows C x 2R pixels. It's plain text with 24-bit colour, so
// Claude Code redraws it like any other row and nothing depends on a graphics
// protocol. Low resolution by nature: View opens the full picture.
import type { EngineInterface } from 'claude-code'
import { state } from './state'
import { keyOf, rawSizeOf } from './media'

// Terminals that draw Claude Code's own pictures; every other one gets text.
const DRAWS_IMAGES = new Set(['ghostty', 'kitty', 'iterm2', 'rex', 'herdr_app'])
export const isTextTerminal = (name: string) => !DRAWS_IMAGES.has(name)

// The rows last drawn, by file and box: a redraw of an unchanged frame reads
// and samples nothing.
const textRowsCache = new Map<string, TextRow[]>()
const TEXT_KEEP = 32

// One row of half-blocks, as runs of cells that share both colours. Claude
// Code refuses escape sequences inside Text, so each run becomes a Text with
// its own color and backgroundColor.
export type TextRun = { fg: string; bg: string; n: number }
export type TextRow = TextRun[]

// Pixels (RGB, width x height) to `rows` rows of `cols` half-blocks. Each
// cell's two colours are the average of the source block under it, sampled at
// most 4 x 4 so a big frame costs no more than a small one, and rounded to
// steps of 8 per channel so flat areas merge into one run.
export function halfBlocks(px: Uint8Array, width: number, height: number, cols: number, rows: number): TextRow[] {
  const hex = (v: number) => Math.min(255, Math.round(v / 8) * 8).toString(16).padStart(2, '0')
  const avg = (x0: number, x1: number, y0: number, y1: number) => {
    const sx = Math.max(1, Math.floor((x1 - x0) / 4))
    const sy = Math.max(1, Math.floor((y1 - y0) / 4))
    let r = 0, g = 0, b = 0, n = 0
    for (let y = y0; y < y1; y += sy) for (let x = x0; x < x1; x += sx) {
      const i = (y * width + x) * 3
      r += px[i] ?? 0; g += px[i + 1] ?? 0; b += px[i + 2] ?? 0; n++
    }
    return `#${hex(r / n)}${hex(g / n)}${hex(b / n)}`
  }
  const span = (i: number, of: number, size: number): [number, number] => {
    const a = Math.min(size - 1, Math.floor((i * size) / of))
    return [a, Math.max(a + 1, Math.min(size, Math.floor(((i + 1) * size) / of)))]
  }
  const out: TextRow[] = []
  for (let row = 0; row < rows; row++) {
    const [t0, t1] = span(row * 2, rows * 2, height)
    const [b0, b1] = span(row * 2 + 1, rows * 2, height)
    const runs: TextRow = []
    for (let col = 0; col < cols; col++) {
      const [x0, x1] = span(col, cols, width)
      const fg = avg(x0, x1, t0, t1)
      const bg = avg(x0, x1, b0, b1)
      const last = runs.at(-1)
      if (last && last.fg === fg && last.bg === bg) last.n++
      else runs.push({ fg, bg, n: 1 })
    }
    out.push(runs)
  }
  return out
}

// A picture or frame file as text rows for a box, or null when it can't be
// read. A raw video frame is sampled as it is; a PNG (or any picture) is first
// scaled by ffmpeg to exactly the box's pixels.
export async function textRowsOf($: EngineInterface, file: string, columns: number, rows: number): Promise<TextRow[] | null> {
  const cols = Math.max(1, Math.round(columns))
  const lineCount = Math.max(1, Math.round(rows))
  const raw = rawSizeOf(file)
  const st = raw ? null : await Promise.resolve().then(() => $.fs.stat(file)).catch(() => null)
  if (!raw && !st) return null
  const key = `${file}|${cols}x${lineCount}|${st ? `${st.size}|${st.mtimeMs}` : ''}`
  const known = textRowsCache.get(key)
  if (known) return known
  let pixels = file
  const pxWide = raw?.width ?? cols
  const pxHigh = raw?.height ?? lineCount * 2
  if (!raw) {
    pixels = `${state.TMP}/t-${keyOf(key)}.rgb`
    const r = await Promise.resolve()
      .then(() => $.process.run([state.ffmpeg, '-v', 'error', '-y', '-i', file, '-frames:v', '1', '-vf', `scale=${pxWide}:${pxHigh}:flags=area,format=rgb24`, '-f', 'rawvideo', pixels]))
      .catch(() => null)
    if (!r || r.exitCode !== 0) return null
  }
  const loaded = await Promise.resolve().then(() => $.fs.read(pixels, { as: 'bytes' })).catch(() => null)
  if (!loaded?.base64) return null
  const px = Uint8Array.from(atob(loaded.base64), c => c.charCodeAt(0))
  if (px.length < pxWide * pxHigh * 3) return null
  const lines = halfBlocks(px, pxWide, pxHigh, cols, lineCount)
  textRowsCache.set(key, lines)
  if (textRowsCache.size > TEXT_KEEP) textRowsCache.delete(textRowsCache.keys().next().value!)
  return lines
}
