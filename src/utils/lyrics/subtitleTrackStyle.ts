// src/utils/lyrics/subtitleTrackStyle.ts
// Shared visual step between the rows of a dual subtitle stack (romanization + translation), so the
// shared bottom overlay and the modes that lay subtitles out inside their own lyric animation
// (Monet, Pendolo) read the same way.

// Second row of the 'both' stack is a step quieter than the first, so romanization (what you sing along to)
// leads and the translation reads as its gloss. Both rows keep the user's subtitle font, weight and scale;
// this only trims size and opacity relative to them.
export const SECONDARY_TRACK_SIZE_FACTOR = 0.88;
export const SECONDARY_TRACK_OPACITY = 0.82;
/** Fallback weight for the second row when the theme sets none; the first row falls back to 500. */
export const SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = 400;
/** Gap above the second row, in em of that row's own font size. */
export const SECONDARY_TRACK_GAP_EM = 0.25;

/**
 * 「下一句」预览行的 alpha。
 *
 * <p>下一句不是当前在唱的内容，它的职责只是让用户提前知道歌词走向。但它和主歌词共用屏幕下方
 * 同一块视觉区域，实心渲染时会在主歌词换行的间隙里形成明显的第二层文字，把主歌词的轮廓打散
 * （实测亮像素均值 69 vs 主歌词 124，已经到 56%）。压到 0.4 之后它退成「背景提示」，
 * 主歌词重新成为唯一视觉重心。
 */
export const UPCOMING_LYRICS_OPACITY = 0.4;
