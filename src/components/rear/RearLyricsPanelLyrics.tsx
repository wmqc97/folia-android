import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Line } from '../../types';

// src/components/rear/RearLyricsPanelLyrics.tsx
// 背屏面板的「歌词」页：歌曲信息 + 可滚动歌词列表。
//
// 这是主屏歌词页的背屏精简版——去掉了封面（背屏只有 242x212 的可见区，放封面就挤没了），
// 只留歌名 / 歌手 / 专辑和列表本身。列表跟着主屏推下来的 currentLineIndex 高亮并自动滚动，
// 点某一行发 seek 指令回主屏，背屏自己不保存任何播放状态。

interface RearLyricsPanelLyricsProps {
    lines: Line[];
    currentLineIndex: number;
    songTitle?: string;
    songArtist?: string;
    songAlbum?: string;
    onSeek: (timeSec: number) => void;
}

const RearLyricsPanelLyrics: React.FC<RearLyricsPanelLyricsProps> = ({
    lines,
    currentLineIndex,
    songTitle,
    songArtist,
    songAlbum,
    onSeek,
}) => {
    const { t } = useTranslation();
    const activeRowRef = useRef<HTMLButtonElement | null>(null);

    const meta = useMemo(() => {
        const parts = [songArtist, songAlbum].filter(Boolean) as string[];
        return parts.join(' · ');
    }, [songArtist, songAlbum]);

    // 当前行变化时把它滚到可视区中间。只在行号真的变了才动，避免每帧重排。
    useEffect(() => {
        activeRowRef.current?.scrollIntoView({ block: 'center' });
    }, [currentLineIndex]);

    return (
        // 颜色走面板根节点注入的主题变量（--text-primary / --text-secondary），
        // 和 registry 调参面板同一条取色路径；写死白色在浅色主题下会看不见。
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 px-2 pb-1">
                <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {songTitle || t('player.unknownTrack', '未知歌曲')}
                </div>
                {meta && (
                    <div className="text-[9px] truncate" style={{ color: 'var(--text-secondary)' }}>
                        {meta}
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-1" data-rear-lyric-list>
                {lines.length === 0 ? (
                    <div
                        className="h-full grid place-items-center text-[10px]"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('options.rearLyricsPanelNoLyrics', '暂无歌词')}
                    </div>
                ) : lines.map((line, index) => {
                    const isActive = index === currentLineIndex;
                    return (
                        <button
                            key={`${line.startTime}-${index}`}
                            ref={isActive ? activeRowRef : null}
                            type="button"
                            data-rear-lyric-line={index}
                            data-active={isActive ? 'true' : undefined}
                            onClick={() => onSeek(line.startTime)}
                            className={`block w-full text-left px-1.5 py-[3px] rounded text-[10px] leading-tight truncate ${
                                isActive ? 'bg-white/15 font-medium' : ''
                            }`}
                            style={{
                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            }}
                        >
                            {line.fullText || '···'}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default RearLyricsPanelLyrics;
