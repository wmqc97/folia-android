import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ListEnd, ListPlus, Shuffle, Trash2 } from 'lucide-react';
import type { ObsBrowserSourceQueueItem } from '../../types/obsBrowserSource';
import type { RearLyricsCommand } from '../../services/rearLyricsBridge';

// src/components/rear/RearLyricsPanelQueue.tsx
// 背屏面板「列表」页：主屏播放页面板里那个播放队列（QueueTab）的背屏版。
//
// 条目与主屏那条队列逐条对应：表头「播放队列 (n)」+ 右侧打乱按钮，行 = 高亮竖条 +
// 歌名 / 歌手 + 下一首播放 / 移到队尾 / 删除三个操作，当前播放那一行整行高亮。
// 三处按背屏调整，都只动交互不动款式：
//   1) 主屏那三个操作按钮靠 group-hover 才显形；背屏没有悬停态，所以常显（尺寸一致）；
//   2) 不做拖拽排序：小屏上拖不动，排序留给主屏；
//   3) 不用虚拟列表：队列几十首时普通滚动足够，还省掉一个按高度布局的依赖。
// 队列内容来自主屏推下来的 config.queue（只读快照），点行 / 点按钮都只发下标回主屏。

interface RearLyricsPanelQueueProps {
    items: ObsBrowserSourceQueueItem[];
    /** 当前播放那首在队列里的下标；-1 表示不在队列里（比如 FM 或单曲播放）。 */
    currentIndex: number;
    onCommand: (command: RearLyricsCommand) => void;
}

const RearLyricsPanelQueue: React.FC<RearLyricsPanelQueueProps> = ({
    items,
    currentIndex,
    onCommand,
}) => {
    const { t } = useTranslation();
    const activeRowRef = useRef<HTMLDivElement | null>(null);

    // 当前歌换了（或列表长度变了）就把高亮行滚到可视区中间，和「歌词」页同一套做法。
    useEffect(() => {
        activeRowRef.current?.scrollIntoView({ block: 'center' });
    }, [currentIndex, items.length]);

    const rowActions = [
        { key: 'playNext', label: t('queue.playNext'), icon: ListPlus, type: 'moveQueueSongToNext' as const },
        { key: 'moveToEnd', label: t('queue.moveToEnd'), icon: ListEnd, type: 'moveQueueSongToEnd' as const },
        { key: 'remove', label: t('queue.remove'), icon: Trash2, type: 'removeQueueSong' as const },
    ];

    if (items.length === 0) {
        return (
            <div
                className="flex-1 min-h-0 grid place-items-center text-[10px]"
                style={{ color: 'var(--text-secondary)' }}
                data-rear-queue-empty
            >
                {t('queue.empty')}
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-2 pb-1">
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {t('queue.title')} ({items.length})
                </span>
                <button
                    type="button"
                    className="p-1 rounded-md opacity-60 active:opacity-100"
                    style={{ color: 'var(--text-primary)' }}
                    title={t('queue.shuffle')}
                    aria-label={t('queue.shuffle')}
                    data-rear-queue-shuffle
                    onClick={() => onCommand({ type: 'shuffleQueue' })}
                >
                    <Shuffle size={13} />
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-1" data-rear-queue-list>
                {items.map((item, index) => {
                    const isActive = index === currentIndex;
                    return (
                        <div
                            key={`${item.id}-${index}`}
                            ref={isActive ? activeRowRef : null}
                            data-rear-queue-row={index}
                            data-active={isActive ? 'true' : undefined}
                            onClick={() => onCommand({ type: 'playQueueIndex', index })}
                            className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg cursor-pointer ${
                                isActive ? 'bg-white/15' : ''
                            } ${item.unavailable ? 'opacity-55' : ''}`}
                        >
                            <div className={`w-1 h-6 rounded-full shrink-0 ${isActive ? 'bg-white' : 'bg-transparent'}`} />
                            <div className="min-w-0 flex-1">
                                <div
                                    className={`text-[11px] leading-tight truncate ${isActive ? 'font-medium' : ''}`}
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {item.name}
                                    {item.unavailable && (
                                        <span className="ml-1.5 text-[9px] opacity-70">
                                            {t('status.songUnavailableTag')}
                                        </span>
                                    )}
                                </div>
                                {item.artist && (
                                    <div className="text-[9px] truncate" style={{ color: 'var(--text-secondary)' }}>
                                        {item.artist}
                                    </div>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                                {rowActions.map(({ key, label, icon: Icon, type }) => (
                                    <button
                                        key={key}
                                        type="button"
                                        title={label}
                                        aria-label={label}
                                        className="p-1 rounded-md opacity-55 active:opacity-100"
                                        style={{ color: 'var(--text-primary)' }}
                                        data-rear-queue-action={key}
                                        onClick={event => {
                                            event.stopPropagation();
                                            onCommand({ type, index });
                                        }}
                                    >
                                        <Icon size={12} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RearLyricsPanelQueue;
