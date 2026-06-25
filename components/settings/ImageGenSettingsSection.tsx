import React, { useState, useEffect } from 'react';
import { ImageGenConfig } from '../../types';
import { resolveImageGenConfig, testImageGenConnection, fetchImageGenModels, ImageGenModel } from '../../utils/imageGen';
import Modal from '../os/Modal';

type Props = {
  imageGen?: ImageGenConfig;
  onUpdate: (patch: Partial<ImageGenConfig>) => void;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
};

const Toggle: React.FC<{ on: boolean; onToggle: () => void }> = ({ on, onToggle }) => (
  <button
    onClick={onToggle}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-slate-300'}`}
    aria-pressed={on}
  >
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

export const ImageGenSettingsSection: React.FC<Props> = ({ imageGen, onUpdate, addToast }) => {
  const cfg = resolveImageGenConfig(imageGen);
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [models, setModels] = useState<ImageGenModel[]>([]);
  const [showModelModal, setShowModelModal] = useState(false);
  const [modelFilter, setModelFilter] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (cfg.model) {
      setModels(prev => {
        if (prev.find(m => m.id === cfg.model)) return prev;
        return [...prev, { id: cfg.model, name: cfg.model }];
      });
    }
  }, [cfg.model]);

  const patch = (p: Partial<ImageGenConfig>) => {
    onUpdate({ ...cfg, ...p });
  };

  const handleTest = async () => {
    setTesting(true);
    setStatusMsg('测试中…');
    try {
      const result = await testImageGenConnection(cfg);
      addToast(result.message, result.ok ? 'success' : 'error');
      setStatusMsg(result.ok ? '连接成功' : '连接失败');
    } finally {
      setTesting(false);
      setTimeout(() => setStatusMsg(''), 2000);
    }
  };

  const handleFetchModels = async () => {
    if (!cfg.apiUrl || !cfg.apiKey) {
      addToast('请先填写 API 地址和密钥', 'error');
      return;
    }
    setLoadingModels(true);
    try {
      const fetchedModels = await fetchImageGenModels(cfg);
      if (fetchedModels.length > 0) {
        setModels(fetchedModels);
        addToast(`成功加载 ${fetchedModels.length} 个模型`, 'success');
      } else {
        addToast('未找到可用模型', 'info');
      }
    } catch {
      addToast('加载模型失败', 'error');
    } finally {
      setLoadingModels(false);
    }
  };

  const filteredModels = models.filter(m =>
    m.id.toLowerCase().includes(modelFilter.toLowerCase()) ||
    m.name.toLowerCase().includes(modelFilter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">启用发图</div>
          <div className="mt-0.5 text-[11px] text-slate-400">关闭后手动与自动发图均不可用</div>
        </div>
        <Toggle on={cfg.enabled} onToggle={() => patch({ enabled: !cfg.enabled })} />
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">自动发图</div>
          <div className="mt-0.5 text-[11px] text-slate-400">角色回复时自行判断是否发图（每轮最多 1 张）</div>
        </div>
        <Toggle on={cfg.autoTrigger} onToggle={() => patch({ autoTrigger: !cfg.autoTrigger })} />
      </div>

      <div className="group">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">发图 API 地址</label>
        <input
          type="url"
          value={cfg.apiUrl}
          onChange={e => patch({ apiUrl: e.target.value })}
          placeholder="https://api.openai.com/v1"
          className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
        />
      </div>

      <div className="group">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">发图 API 密钥</label>
        <input
          type="password"
          value={cfg.apiKey}
          onChange={e => patch({ apiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
        />
      </div>

      <div className="pt-2">
        <div className="flex justify-between items-center mb-1.5 pl-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">生成模型</label>
          <button onClick={handleFetchModels} disabled={loadingModels} className="text-[10px] text-primary font-bold">
            {loadingModels ? 'Fetching...' : '刷新模型列表'}
          </button>
        </div>

        <button
          onClick={() => { setModelFilter(''); setShowModelModal(true); }}
          title={cfg.model || 'Select Model...'}
          className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-3 text-sm text-slate-700 flex justify-between items-center gap-2 active:bg-white transition-all shadow-sm"
        >
          <span
            className="font-mono overflow-hidden whitespace-nowrap min-w-0 flex-1 text-left"
            style={{ direction: 'rtl', textOverflow: 'ellipsis' }}
          >
            <bdi style={{ direction: 'ltr' }}>{cfg.model || 'Select Model...'}</bdi>
          </span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 flex-shrink-0">
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <button
        onClick={() => void handleTest()}
        disabled={testing}
        className="w-full py-3 rounded-2xl font-bold text-white shadow-lg shadow-primary/20 bg-primary active:scale-95 transition-all mt-2"
      >
        {statusMsg || (testing ? '测试中…' : '测试连接')}
      </button>

      <Modal isOpen={showModelModal} title="选择生图模型" onClose={() => setShowModelModal(false)}>
        <div className="space-y-3">
          <div className="relative">
            <input
              autoFocus
              value={modelFilter}
              onChange={e => setModelFilter(e.target.value)}
              placeholder="搜索模型…"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm pl-9 bg-slate-50"
            />
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.421 9.807l3.136 3.136a.75.75 0 1 0 1.06-1.06l-3.136-3.136A5.5 5.5 0 0 0 9 3.5Zm-4 5.5a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
            </svg>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
            {filteredModels.length > 0 ? (
              filteredModels.map(m => (
                <button
                  key={m.id}
                  onClick={() => { patch({ model: m.id }); setShowModelModal(false); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                    cfg.model === m.id
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-mono truncate">{m.id}</div>
                  {m.name !== m.id && <div className="text-xs text-slate-400 mt-0.5 truncate">{m.name}</div>}
                </button>
              ))
            ) : (
              <div className="text-center text-slate-400 py-8 text-xs">
                {models.length === 0
                  ? '列表为空，可手动输入或点击"刷新模型列表"拉取'
                  : `没有匹配 "${modelFilter}" 的模型`}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
