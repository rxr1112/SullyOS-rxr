import React, { useEffect, useState } from 'react';
import Modal from '../os/Modal';
import { ImageGenChatPrefs } from '../../types';
import {
  DEFAULT_IMAGE_GEN_CHAT_PREFS,
  loadImageGenChatPrefs,
  saveImageGenChatPrefs,
} from '../../utils/imageGen';

type Props = {
  open: boolean;
  onClose: () => void;
  charId: string;
  charName: string;
  onGenerate: (prompt: string, prefs: ImageGenChatPrefs) => void;
  imageGenEnabled: boolean;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  busy?: boolean;
};

const SIZE_PRESETS = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '3:4', width: 768, height: 1024 },
  { label: '16:9', width: 1280, height: 720 },
];

const STYLE_PRESETS = [
  { label: '写实', prefix: 'photorealistic, high detail' },
  { label: '动漫', prefix: 'anime style, vibrant colors' },
  { label: '水彩', prefix: 'watercolor illustration, soft tones' },
  { label: '胶片', prefix: 'film photography, warm grain' },
];

export const ImageGenPanel: React.FC<Props> = ({
  open,
  onClose,
  charId,
  charName,
  onGenerate,
  imageGenEnabled,
  addToast,
  busy,
}) => {
  const [prefs, setPrefs] = useState<ImageGenChatPrefs>(DEFAULT_IMAGE_GEN_CHAT_PREFS);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (open && charId) {
      const loaded = loadImageGenChatPrefs(charId);
      setPrefs(loaded);
    }
  }, [open, charId]);

  const patch = (p: Partial<ImageGenChatPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    saveImageGenChatPrefs(charId, next);
  };

  const handleGenerate = () => {
    if (!imageGenEnabled) {
      addToast('请先在设置中启用发图功能', 'info');
      return;
    }
    if (!prompt.trim()) {
      addToast('请输入生图提示词', 'info');
      return;
    }
    onGenerate(prompt.trim(), prefs);
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={`发图片 · ${charName}`}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1 pb-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">图片尺寸</div>
          <div className="flex gap-2 flex-wrap">
            {SIZE_PRESETS.map(s => {
              const active = prefs.width === s.width && prefs.height === s.height;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => patch({ width: s.width, height: s.height })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${active ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">风格</div>
          <div className="flex gap-2 flex-wrap">
            {STYLE_PRESETS.map(s => {
              const active = prefs.stylePrefix === s.prefix;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => patch({ stylePrefix: s.prefix })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${active ? 'bg-primary/10 text-primary border-primary/30' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <input
            value={prefs.stylePrefix}
            onChange={e => patch({ stylePrefix: e.target.value })}
            placeholder="自定义风格前缀…"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">角色外貌锁定</label>
          <textarea
            value={prefs.charFaceLock}
            onChange={e => patch({ charFaceLock: e.target.value })}
            placeholder={`${charName} 的外貌描述，用于锁脸…`}
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs resize-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">用户外貌锁定</label>
          <textarea
            value={prefs.userFaceLock}
            onChange={e => patch({ userFaceLock: e.target.value })}
            placeholder="你的外貌描述，用于锁脸…"
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs resize-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">生图提示词</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="描述想生成的画面…"
            rows={3}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs resize-none"
          />
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-sm active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? '生成中…' : '生成并发送'}
        </button>
      </div>
    </Modal>
  );
};