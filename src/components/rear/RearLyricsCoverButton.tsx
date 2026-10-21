import React, { useEffect } from 'react';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { isCapacitorAndroid } from '../../platform/runtime';
import { useRearLyricsStore } from '../../stores/useRearLyricsStore';
import { setStatusMessage } from '../../stores/useStatusMessageStore';

// src/components/rear/RearLyricsCoverButton.tsx
// 播放页封面正中的「背屏投屏」按钮（封面四角按钮之外的第五个入口）。
//
// 和设置卡片共用 useRearLyricsStore，状态永远一致；这里只做一件事：开 / 关背屏投屏。
// 视觉上完全对齐封面四角的按钮（同样的尺寸、边框、毛玻璃底色和显隐动效），
// 只是收放在封面正中，用缩放代替四角的平移。非安卓容器不渲染。

interface RearLyricsCoverButtonProps {
    /** 封面操作区是否展开（触摸端要先点封面，四个角按钮才出现）。 */
    active: boolean;
    /** 指针设备：显隐交给 group-hover，和四个角按钮走同一条动效。 */
    supportsHover: boolean;
}

const RearLyricsCoverButton: React.FC<RearLyricsCoverButtonProps> = ({ active, supportsHover }) => {
    const { t } = useTranslation();
    const {
        supported,
        privileged,
        projecting,
        busy,
        refresh,
        start,
        stop,
    } = useRearLyricsStore(useShallow(state => ({
        supported: state.supported,
        privileged: state.privileged,
        projecting: state.projecting,
        busy: state.busy,
        refresh: state.refresh,
        start: state.start,
        stop: state.stop,
    })));

    // 面板是懒挂载的：每次打开都重新问一次原生状态，用户可能在背屏或命令面板里改过投屏。
    useEffect(() => {
        if (isCapacitorAndroid()) {
            void refresh();
        }
    }, [refresh]);

    if (!isCapacitorAndroid() || !supported) {
        return null;
    }

    // 开关投屏，并把 store 里刚写下的那条结果提示透传到全局 toast。
    const handleToggleProjection = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (busy) {
            return;
        }
        if (!projecting && !privileged) {
            setStatusMessage({ type: 'info', text: t('options.rearLyricsQuickPrivilegeHint') });
            return;
        }
        void (projecting ? stop() : start()).then(() => {
            const { message, messageKind } = useRearLyricsStore.getState();
            if (message) {
                setStatusMessage({ type: messageKind, text: message });
            }
        });
    };

    const title = projecting ? t('options.rearLyricsStop') : t('options.rearLyricsStart');

    return (
        <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${
            supportsHover
                ? 'pointer-events-none group-hover:pointer-events-auto opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100'
                : (active ? 'pointer-events-auto opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-75')
        }`}>
            <button
                type="button"
                onClick={handleToggleProjection}
                disabled={busy}
                data-rear-cover-button={projecting ? 'stop' : 'start'}
                className={`w-11 h-11 rounded-full border backdrop-blur-md flex items-center justify-center transition-all disabled:cursor-not-allowed ${
                    projecting
                        ? 'border-white/30 bg-white/85 text-zinc-900 hover:bg-white'
                        : 'border-white/15 bg-black/25 text-white/90 hover:bg-black/40 hover:text-white'
                }`}
                title={title}
                aria-label={title}
                aria-pressed={projecting}
            >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <MonitorSmartphone size={18} />}
            </button>
        </div>
    );
};

export default RearLyricsCoverButton;
