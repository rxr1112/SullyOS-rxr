import React, { useState, useEffect } from 'react';
import { ImageGenConfig, ApiPreset } from '../../types';
import {
  resolveImageGenConfig,
  testImageGenConnection,
  fetchImageGenModels,
  ImageGenModel,
  testImageLlmConnection,
  fetchImageLlmModels,
} from '../../utils/imageGen';
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

  const [llmTesting, setLlmTesting] = useState(false);
  const [llmLoadingModels, setLlmLoadingModels] = useState(false);
  const [llmModels, setLlmModels] = useState<{ id: string; name: string }[]>([]);
  const [showLlmModelModal, setShowLlmModelModal] = useState(false);
  const [llmModelFilter, setLlmModelFilter] = useState('');
  const [llmStatusMsg, setLlmStatusMsg] = useState('');
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    const model = cfg.model;
    if (model) {
      setModels(prev => {
        if (prev.find(m => m.id === model)) return prev;
        return [...prev, { id: model, name: model }];
      });
    }
  }, [cfg.model]);

  useEffect(() => {
    const model = cfg.llmApi?.model;
    if (model) {
      setLlmModels(prev => {
        if (prev.find(m => m.id === model)) return prev;
        return [...prev, { id: model, name: model }];
      });
    }
  }, [cfg.llmApi?.model]);

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

  const handleLlmTest = async () => {
    setLlmTesting(true);
    setLlmStatusMsg('测试中…');
    try {
      const result = await testImageLlmConnection(cfg);
      addToast(result.message, result.ok ? 'success' : 'error');
      setLlmStatusMsg(result.ok ? '连接成功' : '连接失败');
    } finally {
      setLlmTesting(false);
      setTimeout(() => setLlmStatusMsg(''), 2000);
    }
  };

  const handleLlmFetchModels = async () => {
    if (!cfg.llmApi?.baseUrl || !cfg.llmApi?.apiKey) {
      addToast('请先填写 LLM API 地址和密钥', 'error');
      return;
    }
    setLlmLoadingModels(true);
    try {
      const fetchedModels = await fetchImageLlmModels(cfg);
      if (fetchedModels.length > 0) {
        setLlmModels(fetchedModels);
        addToast(`成功加载 ${fetchedModels.length} 个模型`, 'success');
      } else {
        addToast('未找到可用模型', 'info');
      }
    } catch {
      addToast('加载模型失败', 'error');
    } finally {
      setLlmLoadingModels(false);
    }
  };

  const savePreset = () => {
    if (!presetName.trim()) {
      addToast('请输入预设名称', 'error');
      return;
    }
    const newPreset: ApiPreset = {
      id: `img_llm_${Date.now()}`,
      name: presetName.trim(),
      config: {
        baseUrl: cfg.llmApi?.baseUrl || '',
        apiKey: cfg.llmApi?.apiKey || '',
        model: cfg.llmApi?.model || '',
        stream: false,
        temperature: 0.4,
        minimaxApiKey: '',
        minimaxGroupId: '',
        minimaxRegion: 'domestic',
      },
    };
    const presets = [...(cfg.llmPresets || []), newPreset];
    patch({ llmPresets: presets });
    setPresetName('');
    setShowPresetModal(false);
    addToast(`已保存预设: ${newPreset.name}`, 'success');
  };

  const loadPreset = (preset: ApiPreset) => {
    patch({
      llmApi: {
        enabled: cfg.llmApi?.enabled || false,
        baseUrl: preset.config.baseUrl,
        apiKey: preset.config.apiKey,
        model: preset.config.model,
      },
      currentLlmPresetId: preset.id,
    });
    addToast(`已加载预设: ${preset.name}`, 'info');
  };

  const deletePreset = (id: string) => {
    const presets = (cfg.llmPresets || []).filter(p => p.id !== id);
    patch({ llmPresets: presets });
    addToast('已删除预设', 'info');
  };

  const filteredModels = models.filter(m =>
    m.id.toLowerCase().includes(modelFilter.toLowerCase()) ||
    m.name.toLowerCase().includes(modelFilter.toLowerCase())
  );

  const filteredLlmModels = llmModels.filter(m =>
    m.id.toLowerCase().includes(llmModelFilter.toLowerCase()) ||
    m.name.toLowerCase().includes(llmModelFilter.toLowerCase())
  );

  const llmEnabled = cfg.llmApi?.enabled || false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-slate-600 mb-3 px-1">发图 API</h2>
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
        </div>
      </div>

      <div className="border-t border-slate-200 pt-5">
        <h2 className="text-sm font-bold text-slate-600 mb-3 px-1">后处理 LLM</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-700">独立 LLM</div>
              <div className="mt-0.5 text-[11px] text-slate-400">使用独立的 LLM 处理图片摘要与记忆（节省主模型 token）</div>
            </div>
            <Toggle on={llmEnabled} onToggle={() => patch({ llmApi: { ...(cfg.llmApi || { baseUrl: '', apiKey: '', model: '' }), enabled: !llmEnabled } })} />
          </div>

          {llmEnabled && (
            <>
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">我的预设</label>
                <button
                  onClick={() => setShowPresetModal(true)}
                  className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform"
                >
                  保存为预设
                </button>
              </div>

              {cfg.llmPresets && cfg.llmPresets.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {cfg.llmPresets.map(preset => (
                    <div key={preset.id} className="flex items-center bg-white border border-slate-200 rounded-lg pl-3 pr-1 py-1 shadow-sm">
                      <span
                        onClick={() => loadPreset(preset)}
                        className="text-xs font-medium text-slate-600 cursor-pointer hover:text-primary mr-2"
                      >
                        {preset.name}
                      </span>
                      <button
                        onClick={() => deletePreset(preset.id)}
                        className="p-1 rounded-full text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="group">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">LLM API 地址</label>
                <input
                  type="url"
                  value={cfg.llmApi?.baseUrl || ''}
                  onChange={e => patch({ llmApi: { ...(cfg.llmApi || { enabled: false, baseUrl: '', apiKey: '', model: '' }), baseUrl: e.target.value } })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                />
              </div>

              <div className="group">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">LLM API 密钥</label>
                <input
                  type="password"
                  value={cfg.llmApi?.apiKey || ''}
                  onChange={e => patch({ llmApi: { ...(cfg.llmApi || { enabled: false, baseUrl: '', apiKey: '', model: '' }), apiKey: e.target.value } })}
                  placeholder="sk-..."
                  className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                />
              </div>

              <div className="pt-2">
                <div className="flex justify-between items-center mb-1.5 pl-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">LLM 模型</label>
                  <button onClick={handleLlmFetchModels} disabled={llmLoadingModels} className="text-[10px] text-primary font-bold">
                    {llmLoadingModels ? 'Fetching...' : '刷新模型列表'}
                  </button>
                </div>

                <button
                  onClick={() => { setLlmModelFilter(''); setShowLlmModelModal(true); }}
                  title={cfg.llmApi?.model || 'Select Model...'}
                  className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-3 text-sm text-slate-700 flex justify-between items-center gap-2 active:bg-white transition-all shadow-sm"
                >
                  <span
                    className="font-mono overflow-hidden whitespace-nowrap min-w-0 flex-1 text-left"
                    style={{ direction: 'rtl', textOverflow: 'ellipsis' }}
                  >
                    <bdi style={{ direction: 'ltr' }}>{cfg.llmApi?.model || 'Select Model...'}</bdi>
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 flex-shrink-0">
                    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              <button
                onClick={() => void handleLlmTest()}
                disabled={llmTesting}
                className="w-full py-3 rounded-2xl font-bold text-white shadow-lg shadow-primary/20 bg-primary active:scale-95 transition-all mt-2"
              >
                {llmStatusMsg || (llmTesting ? '测试中…' : '测试连接')}
              </button>
            </>
          )}
        </div>
      </div>

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

      <Modal isOpen={showLlmModelModal} title="选择 LLM 模型" onClose={() => setShowLlmModelModal(false)}>
        <div className="space-y-3">
          <div className="relative">
            <input
              autoFocus
              value={llmModelFilter}
              onChange={e => setLlmModelFilter(e.target.value)}
              placeholder="搜索模型…"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm pl-9 bg-slate-50"
            />
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.421 9.807l3.136 3.136a.75.75 0 1 0 1.06-1.06l-3.136-3.136A5.5 5.5 0 0 0 9 3.5Zm-4 5.5a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
            </svg>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
            {filteredLlmModels.length > 0 ? (
              filteredLlmModels.map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    patch({ llmApi: { ...(cfg.llmApi || { enabled: false, baseUrl: '', apiKey: '', model: '' }), model: m.id } });
                    setShowLlmModelModal(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                    cfg.llmApi?.model === m.id
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
                {llmModels.length === 0
                  ? '列表为空，可手动输入或点击"刷新模型列表"拉取'
                  : `没有匹配 "${llmModelFilter}" 的模型`}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal isOpen={showPresetModal} title="保存为预设" onClose={() => setShowPresetModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">预设名称</label>
            <input
              autoFocus
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              placeholder="例如：GPT-4o-mini"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-50"
              onKeyDown={e => {
                if (e.key === 'Enter') savePreset();
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPresetModal(false)}
              className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 active:scale-95 transition-all"
            >
              取消
            </button>
            <button
              onClick={savePreset}
              className="flex-1 py-2.5 rounded-xl font-bold text-white bg-primary shadow-lg shadow-primary/20 active:scale-95 transition-all"
            >
              保存
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
