// src/components/visualizer/backgrounds/tuningHandlers.ts
// 背屏设置用：按背景模式名把 tuning 补丁 / 重置落到视觉设置 store 的 handler 上。
//
// 歌词模式有一张 tuning 适配器表（tuningRegistry），背景模式没有，所以这里显式列出
// 四个带参数的背景模式各自一对 set / reset handler。新增带参数的背景模式时在这里补一行，
// registry 那边仍然只负责渲染与设置面板。

interface BackgroundTuningHandlerKeys {
    setterKey: string;
    resetterKey: string;
}

const BACKGROUND_TUNING_HANDLER_KEYS: Record<string, BackgroundTuningHandlerKeys> = {
    monet: { setterKey: 'handleSetMonetBackgroundTuning', resetterKey: 'handleResetMonetBackgroundTuning' },
    nomand: { setterKey: 'handleSetNomandBackgroundTuning', resetterKey: 'handleResetNomandBackgroundTuning' },
    latent: { setterKey: 'handleSetLatentBackgroundTuning', resetterKey: 'handleResetLatentBackgroundTuning' },
    sora: { setterKey: 'handleSetSoraBackgroundTuning', resetterKey: 'handleResetSoraBackgroundTuning' },
};

/** 判断某个背景模式是否带可调参数（带参数的才需要生成设置控件）。 */
export const isBackgroundTuningMode = (mode: string): boolean => Boolean(BACKGROUND_TUNING_HANDLER_KEYS[mode]);

/** 合并某个背景模式的部分 tuning；返回是否命中该模式。 */
export const applyBackgroundTuningPatch = (
    settings: Record<string, unknown>,
    mode: string,
    patch: Record<string, unknown>,
): boolean => {
    const keys = BACKGROUND_TUNING_HANDLER_KEYS[mode];
    const setter = keys ? settings[keys.setterKey] : undefined;
    if (typeof setter !== 'function') {
        return false;
    }
    (setter as (value: unknown) => void)(patch);
    return true;
};

/** 还原某个背景模式的 tuning；返回是否命中该模式。 */
export const resetBackgroundTuning = (settings: Record<string, unknown>, mode: string): boolean => {
    const keys = BACKGROUND_TUNING_HANDLER_KEYS[mode];
    const resetter = keys ? settings[keys.resetterKey] : undefined;
    if (typeof resetter !== 'function') {
        return false;
    }
    (resetter as () => void)();
    return true;
};
