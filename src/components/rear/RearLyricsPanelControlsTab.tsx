import React, { useEffect, useRef, useState } from 'react';
import { Blend, Heart, Repeat, Repeat1, RepeatOff, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../types';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import type { RearLyricsCommand } from '../../services/rearLyricsBridge';

// src/components/rear/RearLyricsPanelControlsTab.tsx
// 背屏面板「控制」页：主屏播放页「控制」页签的背屏版。
//
// 款式与主屏那一页逐条对齐，共用的部分不是「看起来像」而是同一套数值：
//   - 上面一行三颗大按钮 = SongActionRow 的 grid-cols-3 gap-3 + h-12 rounded-xl，
//     底色 bg-white/5（日间 bg-black/5）、选中态 bg-red-500/20 text-red-500 也一样；
//   - 下面一条音量行 = VolumeRow 的 bg-black/20 rounded-xl px-2.5 py-2，静音键 + 滑杆 + 百分比；
//   - 滑杆拖动用「本地草稿 + 预览 + 落定提交」三段式，和主屏 VolumeRow 完全一致，
//     所以拖的时候主屏音量条同步动，松手才写 store 与本地存储。
//
// 和主屏那一页刻意不同的只有两处，都是背屏上做不到的：
//   1) 均衡器按钮不搬：它弹的是主窗口里的对话框，背屏点开什么也看不到；
//   2) 「生成 AI 主题」按钮不搬：生成结果是一整套主题，要回主屏看效果，背屏上按了没反馈。
// 智能过渡（Automix）是个纯开关、效果就在播放里，所以从音量行挪到上面那排按钮里，仍然保留。
//
// 本页不持有可写业务状态：显示值全部来自主屏推下来的 config，操作一律发指令回主屏。

interface RearLyricsPanelControlsTabProps {
    config: ObsBrowserSourceConfig;
    theme: Theme;
    isDaylight: boolean;
    onCommand: (command: RearLyricsCommand) => void;
}

const RearLyricsPanelControlsTab: React.FC<RearLyricsPanelControlsTabProps> = ({
    config,
    theme,
    isDaylight,
    onCommand,
}) => {
    const { t } = useTranslation();
    const volume = config.volume ?? 1;
    const isMuted = config.isMuted ?? false;
    const loopMode = config.loopMode ?? 'off';
    const isLiked = config.isLiked ?? false;
    const likeDisabled = config.likeDisabled ?? false;
    const automixEnabled = config.automixEnabled ?? false;

    // 拖动中的草稿：主屏回推的值不能盖掉手指正按着的那一格，和主屏 VolumeRow 同一套做法。
    const [sliderVolume, setSliderVolume] = useState(isMuted ? 0 : volume);
    const isDraggingRef = useRef(false);
    const pendingVolumeRef = useRef(sliderVolume);

    useEffect(() => {
        if (!isDraggingRef.current) {
            const nextVolume = isMuted ? 0 : volume;
            setSliderVolume(nextVolume);
            pendingVolumeRef.current = nextVolume;
        }
    }, [volume, isMuted]);

    /** 拖动中：只发预览，主屏按 rAF 节流改增益，不写 store 也不落本地存储。 */
    const handleSliderInput = (nextVolume: number) => {
        isDraggingRef.current = true;
        pendingVolumeRef.current = nextVolume;
        setSliderVolume(nextVolume);
        onCommand({ type: 'previewVolume', value: nextVolume });
    };

    /** 松手 / 失焦：这一下才算真正的音量改动，落回主屏 store。 */
    const commitVolumeChange = () => {
        if (!isDraggingRef.current) {
            return;
        }
        isDraggingRef.current = false;
        onCommand({ type: 'setVolume', value: pendingVolumeRef.current });
    };

    const buttonBg = isDaylight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10';
    const wellBg = isDaylight ? 'bg-black/5' : 'bg-black/20';
    const buttonClass = `h-12 rounded-xl flex items-center justify-center transition-colors ${buttonBg}`;
    const loopTitle = loopMode === 'off'
        ? t('player.loopOff')
        : loopMode === 'one' ? t('player.loopOne') : t('player.loopAll');
    const likeTitle = isLiked ? t('player.unlike') : t('player.like');

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3">
                <button
                    type="button"
                    data-rear-control="loop"
                    onClick={() => onCommand({ type: 'toggleLoopMode' })}
                    title={loopTitle}
                    aria-label={loopTitle}
                    className={buttonClass}
                >
                    {loopMode === 'off' ? <RepeatOff size={20} /> : loopMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
                </button>

                <button
                    type="button"
                    data-rear-control="like"
                    disabled={likeDisabled}
                    onClick={() => onCommand({ type: 'toggleLike' })}
                    title={likeTitle}
                    aria-label={likeTitle}
                    className={`h-12 rounded-xl flex items-center justify-center transition-colors ${
                        isLiked ? 'bg-red-500/20 text-red-500' : buttonBg
                    } ${likeDisabled ? 'opacity-35 cursor-not-allowed' : ''}`}
                >
                    <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} />
                </button>

                <button
                    type="button"
                    data-rear-control="automix"
                    onClick={() => onCommand({ type: 'toggleAutomix' })}
                    title={t('ui.automix')}
                    aria-label={t('ui.automix')}
                    aria-pressed={automixEnabled}
                    className={`${buttonClass} ${automixEnabled ? '' : 'opacity-40'}`}
                    style={automixEnabled ? { color: theme.accentColor } : undefined}
                >
                    <Blend size={20} />
                </button>
            </div>

            <div className={`flex items-center gap-2.5 ${wellBg} px-2.5 py-2 rounded-xl`}>
                <button
                    type="button"
                    data-rear-control="mute"
                    onClick={() => onCommand({ type: 'toggleMute' })}
                    className="shrink-0 opacity-40 transition-opacity hover:opacity-100"
                    title={t('ui.volume')}
                    aria-label={t('ui.volume')}
                >
                    {isMuted || sliderVolume === 0 ? <VolumeX size={16} /> : sliderVolume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
                </button>

                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={sliderVolume}
                    data-rear-control="volume"
                    onInput={(e) => handleSliderInput(parseFloat(e.currentTarget.value))}
                    onChange={(e) => handleSliderInput(parseFloat(e.currentTarget.value))}
                    onMouseUp={commitVolumeChange}
                    onTouchEnd={commitVolumeChange}
                    onKeyUp={commitVolumeChange}
                    onBlur={commitVolumeChange}
                    className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-(--text-primary)"
                    style={{ accentColor: theme.primaryColor }}
                    aria-label={t('ui.volume')}
                />

                <span className="w-8 shrink-0 text-right text-[10px] font-bold opacity-60 tabular-nums">
                    {Math.round(sliderVolume * 100)}%
                </span>
            </div>
        </div>
    );
};

export default RearLyricsPanelControlsTab;
