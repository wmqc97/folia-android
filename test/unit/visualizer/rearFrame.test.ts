import { describe, expect, it } from 'vitest';
import {
    DEFAULT_REAR_LYRICS_FRAME,
    REAR_LYRICS_SAFE_LEFT_MAX,
    REAR_LYRICS_SAFE_LEFT_MIN,
    clampRearLyricsSafeLeftCss,
    REAR_LYRICS_FRAME_CANVAS_X_MAX,
    REAR_LYRICS_FRAME_CANVAS_X_MIN,
    REAR_LYRICS_FRAME_CANVAS_Y_MAX,
    REAR_LYRICS_FRAME_CANVAS_Y_MIN,
    REAR_LYRICS_FRAME_CENTER_OFFSET_MAX,
    REAR_LYRICS_FRAME_CENTER_OFFSET_MIN,
    REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MAX,
    REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MIN,
    REAR_LYRICS_FRAME_EFFECT_SCALE_MAX,
    REAR_LYRICS_FRAME_EFFECT_SCALE_MIN,
    clampRearLyricsFrame,
    resolveRearLyricsFrame,
} from '@/stores/useTypographySettingsStore';
import { resolveRearContentFrame } from '@/components/playbackStage/rearFrameGeometry';

// test/unit/visualizer/rearFrame.test.ts
// 背屏构图的取值边界与几何换算。
//
// v4 模型：画布位置（canvasX/Y）与内容渲染中心（centerOffsetX/Y）严格分开。
//   - canvasX/Y 是画布位置，默认 0 = 屏幕左/上缘（含左侧摄像头区域），负数继续往左/上；
//   - centerOffsetX/Y 是内容中心相对画布中心的偏移，0 = 画布中心，负数 = 左/上；
//   - 不再有任何 safeLeft 自动偏移：画布和内容都从屏幕 0 开始。

const STAGE_WIDTH = 347;
const STAGE_HEIGHT = 212;

const baseFrame = {
    canvasX: 0,
    canvasY: 0,
    centerOffsetX: 0,
    centerOffsetY: 0,
    effectScaleX: 1,
    effectScaleY: 1,
};

describe('clampRearLyricsFrame', () => {
    it('falls back to the factory values for junk input', () => {
        expect(clampRearLyricsFrame(null)).toEqual(DEFAULT_REAR_LYRICS_FRAME);
        expect(clampRearLyricsFrame(undefined)).toEqual(DEFAULT_REAR_LYRICS_FRAME);
        expect(clampRearLyricsFrame({})).toEqual(DEFAULT_REAR_LYRICS_FRAME);
        expect(clampRearLyricsFrame({
            canvasX: Number.NaN,
            canvasY: Number.NaN,
            centerOffsetX: Number.NaN,
            centerOffsetY: Number.NaN,
            effectScaleX: Number.NaN,
            effectScaleY: Number.NaN,
        })).toEqual(DEFAULT_REAR_LYRICS_FRAME);
    });

    it('keeps values inside the adjustable range', () => {
        expect(clampRearLyricsFrame({ canvasX: -9999 }).canvasX).toBe(REAR_LYRICS_FRAME_CANVAS_X_MIN);
        expect(clampRearLyricsFrame({ canvasX: 9999 }).canvasX).toBe(REAR_LYRICS_FRAME_CANVAS_X_MAX);
        expect(clampRearLyricsFrame({ canvasY: -9999 }).canvasY).toBe(REAR_LYRICS_FRAME_CANVAS_Y_MIN);
        expect(clampRearLyricsFrame({ canvasY: 9999 }).canvasY).toBe(REAR_LYRICS_FRAME_CANVAS_Y_MAX);
        expect(clampRearLyricsFrame({ effectScaleX: 0.01 }).effectScaleX).toBe(REAR_LYRICS_FRAME_EFFECT_SCALE_MIN);
        expect(clampRearLyricsFrame({ effectScaleX: 99 }).effectScaleX).toBe(REAR_LYRICS_FRAME_EFFECT_SCALE_MAX);
        expect(clampRearLyricsFrame({ effectScaleY: 0.01 }).effectScaleY).toBe(REAR_LYRICS_FRAME_EFFECT_SCALE_MIN);
        expect(clampRearLyricsFrame({ effectScaleY: 99 }).effectScaleY).toBe(REAR_LYRICS_FRAME_EFFECT_SCALE_MAX);
        expect(clampRearLyricsFrame({ centerOffsetX: -9999 }).centerOffsetX).toBe(REAR_LYRICS_FRAME_CENTER_OFFSET_MIN);
        expect(clampRearLyricsFrame({ centerOffsetX: 9999 }).centerOffsetX).toBe(REAR_LYRICS_FRAME_CENTER_OFFSET_MAX);
        expect(clampRearLyricsFrame({ centerOffsetY: -9999 }).centerOffsetY).toBe(REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MIN);
        expect(clampRearLyricsFrame({ centerOffsetY: 9999 }).centerOffsetY).toBe(REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MAX);
    });

    it('rounds canvas origin and center offsets to whole pixels', () => {
        expect(clampRearLyricsFrame({ canvasX: 97.4 }).canvasX).toBe(97);
        expect(clampRearLyricsFrame({ canvasX: 97.6 }).canvasX).toBe(98);
        expect(clampRearLyricsFrame({ canvasX: -97.4 }).canvasX).toBe(-97);
        expect(clampRearLyricsFrame({ centerOffsetX: 12.4 }).centerOffsetX).toBe(12);
        expect(clampRearLyricsFrame({ centerOffsetX: -12.6 }).centerOffsetX).toBe(-13);
        expect(clampRearLyricsFrame({ centerOffsetY: 30.5 }).centerOffsetY).toBe(31);
    });

    // 面板上的滑杆是分开的，改一个不该把另外几个冲掉。
    it('does not force the other fields when only one is given', () => {
        const onlyCanvasX = clampRearLyricsFrame({ canvasX: -40 });
        expect(onlyCanvasX.canvasY).toBe(DEFAULT_REAR_LYRICS_FRAME.canvasY);
        expect(onlyCanvasX.centerOffsetX).toBe(DEFAULT_REAR_LYRICS_FRAME.centerOffsetX);
        expect(onlyCanvasX.effectScaleX).toBe(DEFAULT_REAR_LYRICS_FRAME.effectScaleX);

        const onlyCenter = clampRearLyricsFrame({ centerOffsetX: -10, centerOffsetY: -20 });
        expect(onlyCenter.canvasX).toBe(DEFAULT_REAR_LYRICS_FRAME.canvasX);
        expect(onlyCenter.effectScaleX).toBe(DEFAULT_REAR_LYRICS_FRAME.effectScaleX);
    });

    // 旧版本存的是 scaleX / offsetX；升级后不能把用户调过的值丢掉。
    it('migrates the legacy scale / offset fields', () => {
        const migrated = clampRearLyricsFrame({
            scaleX: 0.8,
            scaleY: 0.7,
            offsetX: 12,
            offsetY: -8,
        } as unknown as Parameters<typeof clampRearLyricsFrame>[0]);
        expect(migrated.effectScaleX).toBe(0.8);
        expect(migrated.effectScaleY).toBe(0.7);
        expect(migrated.centerOffsetX).toBe(12);
        expect(migrated.centerOffsetY).toBe(-8);
    });

    // 没有存过时用调用方给的 canvasX，而不是写死某个值。
    it('uses the caller-provided canvasX when the stored frame has none', () => {
        expect(clampRearLyricsFrame({}, 120).canvasX).toBe(120);
        expect(resolveRearLyricsFrame('classic', null, 120).canvasX).toBe(120);
        expect(resolveRearLyricsFrame('classic', { canvasX: -80 }, 120).canvasX).toBe(-80);
    });
});

describe('resolveRearContentFrame', () => {
    const resolve = (frame: typeof baseFrame) => resolveRearContentFrame({
        stageWidth: STAGE_WIDTH,
        stageHeight: STAGE_HEIGHT,
        frame,
    });
    const OVERSCAN = 120;

    it('keeps the visible canvas 347x212 and builds a larger camera surface', () => {
        const resolved = resolve(baseFrame);
        expect(resolved.canvasLeft).toBe(0);
        expect(resolved.canvasTop).toBe(0);
        expect(resolved.canvasWidth).toBe(STAGE_WIDTH);
        expect(resolved.canvasHeight).toBe(STAGE_HEIGHT);
        // 可视区域不变，渲染面四周各多出 overscan。
        expect(resolved.surfaceWidth).toBe(STAGE_WIDTH + OVERSCAN * 2);
        expect(resolved.surfaceHeight).toBe(STAGE_HEIGHT + OVERSCAN * 2);
        expect(resolved.surfaceLeft).toBe(-OVERSCAN);
        expect(resolved.surfaceTop).toBe(-OVERSCAN);
        expect(resolved.scaleX).toBeCloseTo(1, 5);
        expect(resolved.scaleY).toBeCloseTo(1, 5);
        expect(resolved.cameraTranslateX).toBeCloseTo(0, 5);
        expect(resolved.cameraTranslateY).toBeCloseTo(0, 5);
        expect(resolved.centerX).toBeCloseTo(173.5, 5);
        expect(resolved.centerY).toBeCloseTo(106, 5);
    });

    it('applies the effect scale directly', () => {
        const resolved = resolve({ ...baseFrame, effectScaleX: 1.2, effectScaleY: 0.8 });
        expect(resolved.scaleX).toBeCloseTo(1.2, 5);
        expect(resolved.scaleY).toBeCloseTo(0.8, 5);
    });

    it('pans the camera without changing the visible canvas', () => {
        const resolved = resolve({ ...baseFrame, centerOffsetX: 20, centerOffsetY: -10 });
        expect(resolved.canvasLeft).toBe(0);
        expect(resolved.canvasWidth).toBe(STAGE_WIDTH);
        // 画布层不含相机偏移；相机层单独平移。
        expect(resolved.cameraTranslateX).toBeCloseTo(20, 5);
        expect(resolved.cameraTranslateY).toBeCloseTo(-10, 5);
        expect(resolved.centerX).toBeCloseTo(193.5, 5);
        expect(resolved.centerY).toBeCloseTo(96, 5);
    });

    it('compensates the camera pan for the effect scale', () => {
        const resolved = resolve({
            ...baseFrame,
            effectScaleX: 2,
            effectScaleY: 4,
            centerOffsetX: 20,
            centerOffsetY: -10,
        });
        // 相机层在画布 scale 里面，除以 scale 后视觉位移仍是 20 / -10。
        expect(resolved.cameraTranslateX).toBeCloseTo(10, 5);
        expect(resolved.cameraTranslateY).toBeCloseTo(-2.5, 5);
    });

    it('moves the canvas with canvasX/Y without touching the camera surface size', () => {
        const resolved = resolve({ ...baseFrame, canvasX: -100, canvasY: 40 });
        expect(resolved.canvasLeft).toBe(-100);
        expect(resolved.canvasTop).toBe(40);
        expect(resolved.surfaceWidth).toBe(STAGE_WIDTH + OVERSCAN * 2);
        expect(resolved.surfaceHeight).toBe(STAGE_HEIGHT + OVERSCAN * 2);
        expect(resolved.centerX).toBeCloseTo(73.5, 5);
        expect(resolved.centerY).toBeCloseTo(146, 5);
    });
});

// 全局左侧避让已不再参与歌词排版，但字段还保留给旧配置，夹取逻辑仍然要稳。
describe('clampRearLyricsSafeLeftCss', () => {
    it('follows the measured camera strip when there is no override', () => {
        expect(clampRearLyricsSafeLeftCss(null)).toBeNull();
        expect(clampRearLyricsSafeLeftCss(undefined)).toBeNull();
    });

    it('rejects junk instead of writing NaN into the stage inset', () => {
        expect(clampRearLyricsSafeLeftCss(Number.NaN)).toBeNull();
        expect(clampRearLyricsSafeLeftCss('abc')).toBeNull();
        expect(clampRearLyricsSafeLeftCss({})).toBeNull();
    });

    it('keeps the override inside the adjustable range', () => {
        expect(clampRearLyricsSafeLeftCss(-50)).toBe(REAR_LYRICS_SAFE_LEFT_MIN);
        expect(clampRearLyricsSafeLeftCss(9999)).toBe(REAR_LYRICS_SAFE_LEFT_MAX);
    });

    it('rounds to whole pixels so the DOM does not shimmer', () => {
        expect(clampRearLyricsSafeLeftCss(103.4)).toBe(103);
        expect(clampRearLyricsSafeLeftCss(103.6)).toBe(104);
    });

    it('accepts an explicit zero', () => {
        expect(clampRearLyricsSafeLeftCss(0)).toBe(0);
    });
});
