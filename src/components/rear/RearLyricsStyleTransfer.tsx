import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, ArrowUpFromLine, Check, Clipboard, X } from 'lucide-react';
import type { Theme } from '../../types';
import type { RearLyricsVisualOverride } from '../../types/obsBrowserSource';
import {
    clampRearLyricsFrame,
    REAR_LYRICS_FONT_SCALE_MAX,
    REAR_LYRICS_FONT_SCALE_MIN,
    type RearLyricsFrameValue,
} from '../../stores/useTypographySettingsStore';
import { sanitizeRearLyricsVisualOverride } from '../../utils/rearLyricsVisualSettings';
import { RearSectionCard } from './RearLyricsPanelControls';

// src/components/rear/RearLyricsStyleTransfer.tsx
// 背屏歌词样式的整包导入 / 导出。
//
// 导出内容 = 所有效果的画布/渲染中心/字号（rearLyricsFrames）+ 背屏全局字号
// + 背屏视觉覆盖（模式、tuning、背景、字幕字体等）。换机、备份、调试时复制一段 JSON 即可。
// 导入只认本组件导出的格式；所有字段都走 clamp / sanitize，脏数据不会进 store。

const BUNDLE_KIND = 'folia-rear-lyrics-styles';
const BUNDLE_VERSION = 1;

export interface RearLyricsStyleBundle {
    kind: typeof BUNDLE_KIND;
    version: number;
    exportedAt: string;
    fontScale: number;
    frames: Record<string, RearLyricsFrameValue>;
    visual: RearLyricsVisualOverride;
}

interface RearLyricsStyleTransferProps {
    fontScale: number;
    frames: Record<string, RearLyricsFrameValue>;
    visual: RearLyricsVisualOverride;
    onApply: (bundle: Pick<RearLyricsStyleBundle, 'fontScale' | 'frames' | 'visual'>) => void;
    theme: Theme;
    isDaylight: boolean;
}

type TransferMode = 'export' | 'import' | null;

const clampFontScale = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(REAR_LYRICS_FONT_SCALE_MAX, Math.max(REAR_LYRICS_FONT_SCALE_MIN, parsed));
};

const parseBundle = (text: string): Pick<RearLyricsStyleBundle, 'fontScale' | 'frames' | 'visual'> => {
    const parsed = JSON.parse(text) as Partial<RearLyricsStyleBundle> | null;
    if (!parsed || parsed.kind !== BUNDLE_KIND) {
        throw new Error('invalid-bundle');
    }
    const frames: Record<string, RearLyricsFrameValue> = {};
    if (parsed.frames && typeof parsed.frames === 'object') {
        for (const [mode, value] of Object.entries(parsed.frames)) {
            const key = mode?.trim();
            if (!key || !value || typeof value !== 'object') continue;
            frames[key] = clampRearLyricsFrame(value);
        }
    }
    return {
        fontScale: clampFontScale(parsed.fontScale),
        frames,
        visual: sanitizeRearLyricsVisualOverride(parsed.visual),
    };
};

const RearLyricsStyleTransfer: React.FC<RearLyricsStyleTransferProps> = ({
    fontScale,
    frames,
    visual,
    onApply,
    theme,
    isDaylight,
}) => {
    const { t } = useTranslation();
    const [mode, setMode] = useState<TransferMode>(null);
    const [text, setText] = useState('');
    const [status, setStatus] = useState<'idle' | 'copied' | 'imported' | 'invalid'>('idle');
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const exportText = useMemo(() => {
        const bundle: RearLyricsStyleBundle = {
            kind: BUNDLE_KIND,
            version: BUNDLE_VERSION,
            exportedAt: new Date().toISOString(),
            fontScale,
            frames,
            visual,
        };
        return JSON.stringify(bundle, null, 2);
    }, [fontScale, frames, visual]);

    const openExport = () => {
        setText(exportText);
        setStatus('idle');
        setMode('export');
    };

    const openImport = () => {
        setText('');
        setStatus('idle');
        setMode('import');
    };

    const copyText = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setStatus('copied');
            return;
        } catch {
            // WebView 没有剪贴板权限时退回 execCommand。
        }
        const element = textareaRef.current;
        if (!element) return;
        element.focus();
        element.select();
        try {
            document.execCommand('copy');
            setStatus('copied');
        } catch {
            setStatus('invalid');
        }
    };

    const applyImport = () => {
        try {
            const bundle = parseBundle(text);
            onApply(bundle);
            setStatus('imported');
            setMode(null);
        } catch {
            setStatus('invalid');
        }
    };

    const buttonClass = 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors';
    const buttonStyle = {
        color: theme.primaryColor,
        borderColor: isDaylight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.14)',
        backgroundColor: isDaylight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
    };

    return (
        <>
            <RearSectionCard
                title={t('options.rearLyricsStyleTransferTitle', '背屏样式导入导出')}
                description={t(
                    'options.rearLyricsStyleTransferDesc',
                    '导出所有背屏效果的画布、渲染中心、字号与视觉覆盖；换机或调试时粘贴 JSON 即可恢复。',
                )}
                theme={theme}
                isDaylight={isDaylight}
            >
                <div className="flex gap-2">
                    <button type="button" className={buttonClass} style={buttonStyle} onClick={openExport}>
                        <ArrowDownToLine size={14} />
                        {t('options.rearLyricsStyleExport', '导出全部样式')}
                    </button>
                    <button type="button" className={buttonClass} style={buttonStyle} onClick={openImport}>
                        <ArrowUpFromLine size={14} />
                        {t('options.rearLyricsStyleImport', '导入全部样式')}
                    </button>
                </div>
            </RearSectionCard>

            {mode && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-3" onClick={() => setMode(null)}>
                    <div
                        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border p-4"
                        style={{
                            color: theme.primaryColor,
                            borderColor: isDaylight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)',
                            backgroundColor: isDaylight ? 'rgba(250,250,252,0.98)' : 'rgba(18,18,22,0.98)',
                        }}
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">
                                {mode === 'export'
                                    ? t('options.rearLyricsStyleExport', '导出全部样式')
                                    : t('options.rearLyricsStyleImport', '导入全部样式')}
                            </div>
                            <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-full border"
                                style={buttonStyle}
                                onClick={() => setMode(null)}
                                aria-label={t('ui.close', '关闭')}
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <textarea
                            ref={textareaRef}
                            className="custom-scrollbar min-h-[240px] flex-1 resize-none rounded-xl border bg-black/30 p-3 font-mono text-[11px] leading-relaxed outline-none"
                            style={{
                                color: theme.primaryColor,
                                borderColor: isDaylight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)',
                            }}
                            value={text}
                            readOnly={mode === 'export'}
                            placeholder={t('options.rearLyricsStyleImportPlaceholder', '粘贴之前导出的 JSON…')}
                            onChange={event => {
                                setText(event.target.value);
                                setStatus('idle');
                            }}
                        />
                        <div className="mt-3 flex items-center gap-2">
                            {mode === 'export' ? (
                                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => void copyText()}>
                                    {status === 'copied' ? <Check size={14} /> : <Clipboard size={14} />}
                                    {status === 'copied'
                                        ? t('options.rearLyricsStyleCopied', '已复制')
                                        : t('options.rearLyricsStyleCopy', '复制')}
                                </button>
                            ) : (
                                <button type="button" className={buttonClass} style={buttonStyle} onClick={applyImport}>
                                    <ArrowUpFromLine size={14} />
                                    {t('options.rearLyricsStyleImportApply', '导入')}
                                </button>
                            )}
                        </div>
                        {status === 'invalid' && (
                            <div className="mt-2 text-[11px] text-red-400">
                                {t('options.rearLyricsStyleImportInvalid', 'JSON 格式不正确，或不是背屏样式包。')}
                            </div>
                        )}
                        {status === 'imported' && (
                            <div className="mt-2 text-[11px] text-emerald-400">
                                {t('options.rearLyricsStyleImportSuccess', '已导入，背屏会立即同步。')}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default RearLyricsStyleTransfer;
