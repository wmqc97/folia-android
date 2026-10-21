// src/components/rear/rearLyricsGesture.ts
// 背屏触控层的手势判定：把一次指针拖拽翻译成「唤出控制条 / 打开面板 / 上一首 / 下一首」。
//
// 抽成纯函数是为了能单独验证边界（点击与滑动的分界、底部起手的范围），
// 触摸层只负责收集起点终点再交给它。

export type RearLyricsGesture =
    | { kind: 'tap' }
    | { kind: 'openPanel' }
    | { kind: 'closePanel' }
    | { kind: 'prev' }
    | { kind: 'next' }
    | { kind: 'none' };

export interface RearLyricsGestureInput {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    /** 视口高度，用来判断这一下是不是从「底部」起手。 */
    viewportHeight: number;
}

/** 位移小于这个值算点击（唤出控制条），避免手抖被判成滑动。 */
const TAP_SLOP_PX = 12;
/** 滑动至少要走过这么远才生效，防止误触切歌。 */
const SWIPE_MIN_PX = 36;
/** 起手点落在视口下方这个比例以内，才算「底部上滑」。 */
const BOTTOM_ZONE_RATIO = 0.55;

/**
 * 一次拖拽 → 一个意图。
 *
 * 规则（背屏只有 347x212 CSS px，手势必须粗粒度）：
 *   - 位移很小 → 点击，唤出 / 保持控制条；
 *   - 竖直方向为主且向上，且从下半屏起手 → 打开面板；
 *   - 水平方向为主 → 左滑下一首、右滑上一首；
 *   - 其余（向下滑、斜着滑但不够远）→ 不处理，交给下层。
 */
export const classifyRearLyricsGesture = (input: RearLyricsGestureInput): RearLyricsGesture => {
    const dx = input.endX - input.startX;
    const dy = input.endY - input.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX < TAP_SLOP_PX && absY < TAP_SLOP_PX) {
        return { kind: 'tap' };
    }

    if (absY >= absX) {
        const fromBottom = input.startY >= input.viewportHeight * BOTTOM_ZONE_RATIO;
        if (dy <= -SWIPE_MIN_PX && fromBottom) {
            return { kind: 'openPanel' };
        }
        return dy >= SWIPE_MIN_PX ? { kind: 'closePanel' } : { kind: 'none' };
    }

    if (absX >= SWIPE_MIN_PX) {
        // 左滑下一首、右滑上一首：和主界面的滑动切歌方向保持一致。
        return { kind: dx < 0 ? 'next' : 'prev' };
    }

    return { kind: 'none' };
};
