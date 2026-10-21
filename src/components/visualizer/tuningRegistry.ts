import type {
    CappellaTuning,
    CadenzaTuning,
    ClassicTuning,
    CladdaghTuning,
    DioramaTuning,
    FumeTuning,
    LumiereTuning,
    MonetTuning,
    PartitaTuning,
    PendoloTuning,
    SonnetTuning,
    TemperaTuning,
    TiltTuning,
    VisualizerMode,
} from '../../types';
import type { VisualizerSharedProps } from './definition';

// src/components/visualizer/tuningRegistry.ts
// Pure-data registry for transporting heterogeneous visualizer tuning without importing renderers.
export interface VisualizerTuningMap {
    classic: ClassicTuning;
    cadenza: CadenzaTuning;
    partita: PartitaTuning;
    fume: FumeTuning;
    claddagh: CladdaghTuning;
    cappella: CappellaTuning;
    tilt: TiltTuning;
    diorama: DioramaTuning;
    monet: MonetTuning;
    pendolo: PendoloTuning;
    sonnet: SonnetTuning;
    tempera: TemperaTuning;
    lumiere: LumiereTuning;
}

export type VisualizerTuningMode = keyof VisualizerTuningMap;
export type VisualizerTuningBundle = Partial<VisualizerTuningMap>;

export interface VisualizerTuningAdapter<M extends VisualizerTuningMode = VisualizerTuningMode> {
    mode: M;
    settingsKey: string;
    settingsSetterKey: string;
    apply: (props: VisualizerSharedProps, tuning: VisualizerTuningMap[M]) => VisualizerSharedProps;
}

interface VisualizerTuningModule {
    default: VisualizerTuningAdapter;
}

export function defineVisualizerTuning<M extends VisualizerTuningMode>(adapter: VisualizerTuningAdapter<M>) {
    return adapter;
}

const tuningModules = import.meta.glob<VisualizerTuningModule>('./*/tuning.ts', { eager: true });
const adapters = Object.values(tuningModules).map(module => module.default);
const adaptersByMode = new Map<VisualizerTuningMode, VisualizerTuningAdapter>();

adapters.forEach(adapter => {
    if (adaptersByMode.has(adapter.mode)) {
        throw new Error(`[VisualizerTuningRegistry] Duplicate adapter for "${adapter.mode}"`);
    }
    adaptersByMode.set(adapter.mode, adapter);
});

export const applyVisualizerTuning = (
    mode: VisualizerMode,
    props: VisualizerSharedProps,
    bundle?: VisualizerTuningBundle,
): VisualizerSharedProps => {
    const adapter = adaptersByMode.get(mode as VisualizerTuningMode);
    const tuning = bundle?.[mode as VisualizerTuningMode];
    return adapter && tuning ? adapter.apply(props, tuning as never) : props;
};

export const getVisualizerTuningModes = (): VisualizerTuningMode[] => [...adaptersByMode.keys()];

export const collectVisualizerTunings = (settings: Record<string, unknown>): VisualizerTuningBundle => {
    const bundle: VisualizerTuningBundle = {};
    adapters.forEach(adapter => {
        const value = settings[adapter.settingsKey];
        if (value !== undefined) {
            (bundle as Record<string, unknown>)[adapter.mode] = value;
        }
    });
    return bundle;
};

export const applyVisualizerTuningsToSettings = (
    settings: Record<string, unknown>,
    bundle: VisualizerTuningBundle,
) => {
    adapters.forEach(adapter => {
        const value = bundle[adapter.mode];
        const setter = settings[adapter.settingsSetterKey];
        if (value !== undefined && typeof setter === 'function') {
            setter(value);
        }
    });
};

/**
 * 背屏设置用：把某个模式的部分 tuning 合并回 settings。
 *
 * <p>走的是该模式自己注册的 setter（和主屏「歌词效果」面板改参数是同一条路径），
 * 所以背屏调参会直接落到同一个 store 字段上，不会出现两套改法。返回是否命中该模式。
 */
export const applyVisualizerTuningPatch = (
    settings: Record<string, unknown>,
    mode: string,
    patch: Record<string, unknown>,
): boolean => {
    const adapter = adaptersByMode.get(mode as VisualizerTuningMode);
    if (!adapter) {
        return false;
    }
    const setter = settings[adapter.settingsSetterKey];
    if (typeof setter !== 'function') {
        return false;
    }
    (setter as (value: unknown) => void)(patch);
    return true;
};

/**
 * 背屏设置用：把某个模式的 tuning 还原成出厂值。

 * <p>reset setter 只是把 setter 名字里的 Set 换成 Reset（registry 的命名约定），
 * 找不到就返回 false，让调用方自己决定要不要提示。
 */
export const resetVisualizerTuning = (
    settings: Record<string, unknown>,
    mode: string,
): boolean => {
    const adapter = adaptersByMode.get(mode as VisualizerTuningMode);
    if (!adapter) {
        return false;
    }
    const resetKey = adapter.settingsSetterKey.replace('handleSet', 'handleReset');
    const resetter = settings[resetKey];
    if (typeof resetter !== 'function') {
        return false;
    }
    (resetter as () => void)();
    return true;
};
