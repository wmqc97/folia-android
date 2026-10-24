// src/utils/rearRenderSurface.ts
// 背屏版式开关：判断当前 visualizer 该按「主屏版式」还是「背屏版式」渲染。

/**
 * 是否按背屏版式渲染（三行歌词窗口、右侧可读区、强制横排、圈径收缩等）。
 *
 * <p>背屏（原生 RearLyricsActivity 的 {@code ?rear=1} WebView）和主屏共用同一套 visualizer，
 * 所以「背屏版式」必须显式开启，不能靠全局标记推断：{@code bootstrap.tsx} 会把
 * {@code RearLyricsApp} 一起打进主屏 bundle，模块级赋值会让主屏也变成背屏版式。
 *
 * <p>优先级：调用方显式传入（{@code rearLayout} prop，背屏舞台 / 背屏样式预览会传）
 * 高于 URL 判定（{@code ?rear=1}）。主屏 / OBS 两者都拿不到 → false。
 */
export const resolveRearRenderSurface = (explicit?: boolean): boolean => {
    if (typeof explicit === 'boolean') {
        return explicit;
    }
    if (typeof window === 'undefined') {
        return false;
    }
    return new URLSearchParams(window.location.search).get('rear') === '1';
};
