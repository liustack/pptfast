/**
 * Lecture and luxe motifs currently draw their outer frame at y=624
 * (luxe inner line at 614). Content rects must sit inside that floor
 * without a theme-id branch. 12px of air covers inner inset plus stroke.
 */
export const MOTIF_FRAME_BOTTOM = 624
export const FRAMED_CONTENT_BOTTOM = MOTIF_FRAME_BOTTOM - 12
