# Text mode

Claude Code's `Image` draws pictures only with kitty Unicode placeholders (Ghostty, kitty) or iTerm2 inline images. Every other terminal used to get a notice instead of the picture. Text mode draws the picture itself, as text: each cell is `▀` with the upper pixel as its foreground colour and the lower pixel as its background, so a box of C x R cells shows C x 2R pixels. It's ordinary coloured text, so Claude Code lays it out and redraws it like any other row, scrolling and resizing included, and no graphics protocol is involved.

## When it's on

`register.tsx` turns it on at session start (`state.textMode`) when:

- `SHOW_YOUR_WORK_TEXT=1` is set, or
- outside tmux, the terminal isn't one that paints Claude Code's pictures (`isTextTerminal` in `textpic.ts`: anything but Ghostty, kitty, iTerm2, Rex and the Herdr app). That covers foot, Alacritty, xterm, GNOME Terminal, WezTerm, Warp and Konsole, or
- inside tmux, pictures aren't being forwarded (`forwardPictures` returned false).

It's never on in the desktop app, which keeps its notice. In text mode `canImage` stays true, so the player, controls, history and QA sidebar are unchanged. Only the picture inside them is different.

## How a picture becomes text (`textpic.ts`)

- **A still or a PNG frame:** ffmpeg scales it to exactly the box's pixels (`cols x rows*2`, `flags=area`) as raw RGB in the temp folder (`t-<key>.rgb`), which is then read with `$.fs.read(..., { as: 'bytes' })`.
- **A raw video frame:** `usesRaw()` is true in text mode, so every video is cut to raw `.rgb` frames. The frame is read as it is and block-averaged in JS, with at most 4 x 4 samples per cell, so no process is started per frame.
- **Rows:** `halfBlocks` gives each row as runs of cells that share both colours. Colours are rounded to steps of 8 per channel so that flat areas merge into longer runs.
- **Drawing:** `TextPicture` (`player.tsx`) renders one `Text` per row, with one nested `Text color backgroundColor` per run. **Claude Code refuses escape sequences inside `Text`** ("a text child holds a control character (an escape sequence)"), so pre-built SGR strings don't work.
- The last 32 results are cached by file, box and (for stills) size and mtime.

## What changes elsewhere in text mode

- `picFor` returns `text` (the rows) next to `src`. `Picture` and `SplitView` draw `TextPicture` instead of `Image`.
- `blit` (a video's frame swap) makes the frame's rows outside the render, then calls `redraw`. Nothing is sent to the terminal.
- `probe` is skipped, because there's no `Image` to ask about. `fitCopy` is skipped, because sharper copies make no difference at 2 pixels per cell.
- `resized` schedules no resend. The render for the new box draws its rows, and a resend started from a render was cancelled (`resend_cancelled`).

## Limits

- The resolution is 2 pixels per cell, so text in screenshots isn't readable. **View** opens the full picture.
- A playing video redraws the whole player at 12 fps. In the harness the playhead kept up but `owed` (seconds behind) slowly rose to ~0.7 s over 25 s.

## Testing

`tools/pty-harness.py` takes `--foot` (TERM=foot, no TERM_PROGRAM, no kitty answers) and `--png out.png`, which saves pyte's final screen with its colours and half-blocks. Set `SYW_HARNESS_CWD` to a scratch folder so the session's `.show-your-work/` history doesn't land in the repo. The harness accepts the trust prompt itself.

    SYW_HARNESS_CWD=/tmp/syw uv run --with pyte --with pillow python tools/pty-harness.py image --foot --png /tmp/foot.png
