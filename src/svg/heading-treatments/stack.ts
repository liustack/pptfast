import React from "react"

export interface StackCharsOpts {
  x: number
  y: number
  fontSize: number
  fill: string
  fontFamily: string
}

/**
 * One `<text>` per character, stepped by `fontSize + 6`. Call only when
 * `stacksVertically` is true. Never `writing-mode`.
 */
export function stackChars(text: string, opts: StackCharsOpts): React.ReactElement[] {
  const step = opts.fontSize + 6
  return Array.from(text).map((ch, i) =>
    React.createElement(
      "text",
      {
        key: i,
        x: opts.x,
        y: opts.y + i * step,
        fontSize: opts.fontSize,
        fill: opts.fill,
        fontFamily: opts.fontFamily,
        dominantBaseline: "alphabetic",
      },
      ch,
    ),
  )
}
