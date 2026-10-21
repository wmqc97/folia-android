import React from 'react';
import { useTranslation } from 'react-i18next';
import { Music4, ChevronRight } from 'lucide-react';
import { openSettings } from '../../../stores/useSettingsModalStore';

// src/components/modal/settings/RearLyricsStyleEntrySetting.tsx
// 「背屏歌词样式」入口：主屏设置里通往背屏专用歌词样式窗口的一行按钮。

type RearLyricsStyleEntrySettingProps = {
    settingsCardClass: string;
};

/** 背屏的构图与效果参数都在独立窗口里调，这一行只负责把用户送过去。 */
const RearLyricsStyleEntrySetting: React.FC<RearLyricsStyleEntrySettingProps> = ({ settingsCardClass }) => {
    const { t } = useTranslation();

    return (
        <button
            type="button"
            onClick={() => openSettings('options', 'rearLyricsStyle')}
            className={`flex w-full items-center justify-between gap-4 rounded-lg border p-3 text-left transition-colors hover:opacity-80 ${settingsCardClass}`}
            data-rear-lyrics-style-open="options"
        >
            <div className="space-y-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Music4 size={14} />
                    {t('options.rearLyricsStyleTitle')}
                </div>
                <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('options.rearLyricsStyleDesc')}
                </div>
            </div>
            <ChevronRight size={18} className="shrink-0 opacity-60" style={{ color: 'var(--text-primary)' }} />
        </button>
    );
};

export default RearLyricsStyleEntrySetting;
