import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Heart, Pause, Play, Power, Repeat, Repeat1, RepeatOff, SkipBack, SkipForward } from 'lucide-react';
import { PlayerState } from '../../types';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import type { RearLyricsCommand } from '../../services/rearLyricsBridge';
import RearLyricsPanel from './RearLyricsPanel';
import { classifyRearLyricsGesture } from './rearLyricsGesture';

// src/components/rear/RearLyricsControls.tsx
// 背屏的触控层：手势 + 切歌控制条 + 上滑唤出的面板。
//
// 背屏只有 347x212 CSS px 且左侧一条竖带不可触摸，所以这里刻意做得很小：
// 默认只有底部一条细控制栏，6 秒无操作自动隐藏，点屏幕任意位置唤回；
// 手势（见 rearLyricsGesture.ts）：底部上滑打开面板、左右滑动切歌。
// 所有操作都不改背屏本地状态，一律发指令回主屏，由主屏的 store 改完再推回来。

/** 控制栏自动隐藏延时（毫秒）。 */
const AUTO_HIDE_MS = 6000;

interface RearLyricsControlsProps {
    config: ObsBrowserSourceConfig | null;
    playbackState: PlayerState;
    currentLineIndex: number;
    /** 右侧安全区宽度（CSS px），控制栏与面板都要避开左侧摄像头竖带。 */
    safeLeftCss: number;
    onCommand: (command: RearLyricsCommand) => void;
}

const RearLyricsControls: React.FC<RearLyricsControlsProps> = ({
    config,
    playbackState,
    currentLineIndex,
    safeLeftCss,
    onCommand,
}) => {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(true);
    const [panelOpen, setPanelOpen] = useState(false);
    const [feedback, setFeedback] = useState<{
        id: number;
        kind: 'next' | 'prev' | 'play' | 'pause' | 'liked' | 'unliked';
    } | null>(null);
    const hideTimerRef = useRef<number | null>(null);
    const feedbackTimerRef = useRef<number | null>(null);
    const gestureStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
    const longPressTimerRef = useRef<number | null>(null);
    const longPressTriggeredRef = useRef(false);
    const lastTapTimeRef = useRef(0);
    const singleTapTimerRef = useRef<number | null>(null);
    // 滑动结束后浏览器还会补一个 click；用这个标记把那次 click 吃掉，
    // 否则「从暂停键上往上滑」会顺手把歌暂停掉。
    const suppressClickRef = useRef(false);

    const isPlaying = playbackState === PlayerState.PLAYING;
    const loopMode = config?.loopMode ?? 'off';

    const clearHideTimer = useCallback(() => {
        if (hideTimerRef.current !== null) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const clearFeedback = useCallback(() => {
        if (feedbackTimerRef.current !== null) {
            window.clearTimeout(feedbackTimerRef.current);
            feedbackTimerRef.current = null;
        }
    }, []);

    const sendFeedback = useCallback((kind: NonNullable<typeof feedback>['kind']) => {
        clearFeedback();
        setFeedback({ id: Date.now(), kind });
        feedbackTimerRef.current = window.setTimeout(() => {
            setFeedback(null);
        }, 900);
    }, [clearFeedback]);

    const clearLongPress = useCallback(() => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const clearSingleTap = useCallback(() => {
        if (singleTapTimerRef.current !== null) {
            window.clearTimeout(singleTapTimerRef.current);
            singleTapTimerRef.current = null;
        }
    }, []);

    // 面板打开时锁住不隐藏，避免用户正在看歌词列表时控制栏自己跑掉。
    const scheduleHide = useCallback(() => {
        clearHideTimer();
        if (panelOpen) {
            return;
        }
        hideTimerRef.current = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    }, [clearHideTimer, panelOpen]);

    useEffect(() => {
        scheduleHide();
        return clearHideTimer;
    }, [scheduleHide, clearHideTimer]);

    useEffect(() => () => {
        clearFeedback();
        clearLongPress();
        clearSingleTap();
    }, [clearFeedback, clearLongPress, clearSingleTap]);

    const reveal = useCallback(() => {
        setVisible(true);
        scheduleHide();
    }, [scheduleHide]);

    const openPanel = useCallback(() => {
        setPanelOpen(true);
        setVisible(false);
        clearHideTimer();
    }, [clearHideTimer]);

    const closePanel = useCallback(() => {
        setPanelOpen(false);
        setVisible(false);
    }, []);

    const handleCommand = useCallback((command: RearLyricsCommand) => {
        onCommand(command);
        reveal();
    }, [onCommand, reveal]);

    const handleSingleTap = useCallback(() => {
        setVisible(previous => {
            const next = !previous;
            if (next) {
                scheduleHide();
            } else {
                clearHideTimer();
            }
            return next;
        });
    }, [clearHideTimer, scheduleHide]);

    const handleDoubleTap = useCallback(() => {
        onCommand({ type: 'togglePlay' });
        // 反馈图标显示「切换之后的状态」：正在播放 → 双击后暂停，显示 Play；
        // 暂停 → 双击后播放，显示 Pause。控制栏那颗小按钮显示的是「点击要执行的动作」，
        // 语义不同，不要共用同一个判断。
        sendFeedback(isPlaying ? 'play' : 'pause');
    }, [isPlaying, onCommand, sendFeedback]);

    const handleLongPressLike = useCallback(() => {
        const willLike = !(config?.isLiked ?? false);
        onCommand({ type: 'toggleLike' });
        sendFeedback(willLike ? 'liked' : 'unliked');
    }, [config?.isLiked, onCommand, sendFeedback]);

    const handlePointerDown = useCallback((event: React.PointerEvent) => {
        suppressClickRef.current = false;
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('[data-rear-control]')) {
            gestureStartRef.current = null;
            return;
        }
        const isPanelHeader = Boolean(target?.closest?.('[data-rear-panel-header]'));
        if (!isPanelHeader && target?.closest?.('[data-rear-panel]')) {
            gestureStartRef.current = null;
            return;
        }
        gestureStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        longPressTriggeredRef.current = false;
        clearLongPress();
        if (!isPanelHeader) {
            longPressTimerRef.current = window.setTimeout(() => {
                longPressTriggeredRef.current = true;
                gestureStartRef.current = null;
                handleLongPressLike();
            }, 650);
        }
    }, []);

    /**
     * 抬起时把这一下判成点击 / 上滑 / 左右滑。
     * 只做一次性判定，不做拖拽跟手动画：背屏是块小屏，跟手动画反而看不清。
     */
    const handlePointerUp = useCallback((event: React.PointerEvent) => {
        clearLongPress();
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }
        const start = gestureStartRef.current;
        gestureStartRef.current = null;
        if (!start || start.pointerId !== event.pointerId) {
            return;
        }
        const gesture = classifyRearLyricsGesture({
            startX: start.x,
            startY: start.y,
            endX: event.clientX,
            endY: event.clientY,
            viewportHeight: window.innerHeight,
        });
        if (gesture.kind !== 'tap' && gesture.kind !== 'none') {
            suppressClickRef.current = true;
            window.setTimeout(() => {
                suppressClickRef.current = false;
            }, 350);
        }
        switch (gesture.kind) {
            case 'tap':
                const now = Date.now();
                if (now - lastTapTimeRef.current < 320) {
                    clearSingleTap();
                    lastTapTimeRef.current = 0;
                    handleDoubleTap();
                    break;
                }
                lastTapTimeRef.current = now;
                singleTapTimerRef.current = window.setTimeout(() => {
                    handleSingleTap();
                }, 320);
                break;
            case 'openPanel':
                openPanel();
                break;
            case 'closePanel':
                closePanel();
                break;
            case 'next':
                onCommand({ type: 'next' });
                sendFeedback('next');
                break;
            case 'prev':
                onCommand({ type: 'prev' });
                sendFeedback('prev');
                break;
            default:
                break;
        }
    }, [
        clearLongPress,
        clearSingleTap,
        closePanel,
        handleDoubleTap,
        handleSingleTap,
        onCommand,
        openPanel,
        sendFeedback,
    ]);

    const buttonClass = 'h-7 min-w-0 flex-1 rounded-md flex items-center justify-center text-white/85 active:bg-white/20 bg-white/5';

    return (
        /*
         * 手势层：整块可见区都是手势面。控制栏（z-20）与面板（z-30）是它的子节点，
         * 事件从按钮冒泡上来，所以「从底部控制栏起手往上滑」也能被识别；
         * 滑动判定成立时用 capture 阶段的 click 拦截把按钮点击吃掉。
         * 面板内部的拖动（滚歌词列表）在 handlePointerDown 里被排除。
         *
         * 这一层必须盖在歌词舞台之上，而歌词层是个 z:auto 的普通定位块（不是层叠上下文），
         * 舞台内部的 z-10 / z-20 / z-30（歌词行、字幕、和声等）都会逃逸到根层叠上下文里
         * 和这一层同场竞争，所以在根部按 z-10 排会被它们反盖住（面板被歌词糊住）。
         * 这里取 z-50：高于舞台当前用到的最高层级（30），给未来的新效果留出余量。
         */
        <div
            className="absolute inset-0 z-50 touch-none"
            data-rear-gesture-layer
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
                gestureStartRef.current = null;
            }}
            onClickCapture={event => {
                if (suppressClickRef.current) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }}
        >
            <AnimatePresence>
                {feedback && (
                    <motion.div
                        key={feedback.id}
                        initial={{ opacity: 0, x: 18, scale: 0.82 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 14, scale: 0.86 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className="pointer-events-none absolute inset-y-0 z-40 flex items-center justify-center"
                        style={{ left: safeLeftCss, right: 20 }}
                    >
                        <div className={`flex h-16 w-16 items-center justify-center rounded-full border shadow-lg backdrop-blur-md ${
                            feedback.kind === 'liked' || feedback.kind === 'unliked'
                                ? 'border-red-400/30 bg-red-950/55 text-red-400'
                                : 'border-white/10 bg-black/50 text-white'
                        }`}>
                            {feedback.kind === 'next' ? <SkipForward size={24} />
                                : feedback.kind === 'prev' ? <SkipBack size={24} />
                                : feedback.kind === 'play' ? <Play size={24} />
                                : feedback.kind === 'pause' ? <Pause size={24} />
                                : <Heart size={24} fill={feedback.kind === 'liked' ? 'currentColor' : 'none'} />}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {visible && !panelOpen && (
                <div
                    className="absolute bottom-0 z-20 flex items-center gap-1 px-1.5 py-1 rounded-t-lg bg-black/45 backdrop-blur-sm"
                    style={{ left: safeLeftCss, right: 20 }}
                >
                    <button
                        type="button"
                        className={buttonClass}
                        aria-label={t('player.previousTrack', '上一首')}
                        data-rear-control="prev"
                        onClick={() => handleCommand({ type: 'prev' })}
                    >
                        <SkipBack size={13} />
                    </button>
                    <button
                        type="button"
                        className={buttonClass}
                        aria-label={isPlaying ? t('player.pause', '暂停') : t('player.play', '播放')}
                        data-rear-control="toggle"
                        onClick={() => handleCommand({ type: 'togglePlay' })}
                    >
                        {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button
                        type="button"
                        className={buttonClass}
                        aria-label={t('player.nextTrack', '下一首')}
                        data-rear-control="next"
                        onClick={() => handleCommand({ type: 'next' })}
                    >
                        <SkipForward size={13} />
                    </button>

                    <button
                        type="button"
                        className={`${buttonClass} ${loopMode !== 'off' ? 'bg-white/20 text-white' : ''}`}
                        aria-label={
                            loopMode === 'off'
                                ? t('player.loopOff')
                                : loopMode === 'one'
                                    ? t('player.loopOne')
                                    : t('player.loopAll')
                        }
                        title={
                            loopMode === 'off'
                                ? t('player.loopOff')
                                : loopMode === 'one'
                                    ? t('player.loopOne')
                                    : t('player.loopAll')
                        }
                        data-rear-control="loop"
                        onClick={() => handleCommand({ type: 'toggleLoopMode' })}
                    >
                        {loopMode === 'off' ? <RepeatOff size={13} /> : loopMode === 'one' ? <Repeat1 size={13} /> : <Repeat size={13} />}
                    </button>

                    <button
                        type="button"
                        className={buttonClass}
                        aria-label={t('ui.exit', '退出背屏歌词')}
                        data-rear-control="exit"
                        onClick={() => handleCommand({ type: 'exit' })}
                    >
                        <Power size={13} />
                    </button>
                </div>
            )}

            {panelOpen && (
                <RearLyricsPanel
                    config={config}
                    safeLeftCss={safeLeftCss}
                    currentLineIndex={currentLineIndex}
                    onCommand={handleCommand}
                    onClose={closePanel}
                />
            )}
        </div>
    );
};

export default RearLyricsControls;
