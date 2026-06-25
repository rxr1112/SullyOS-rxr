import {
  APIConfig,
  CharacterProfile,
  ImageGenChatPrefs,
  ImageGenConfig,
  ImageWithVoiceMetadata,
  MemoryFragment,
  Message,
  UserProfile,
} from '../types';
import { DB } from './db';
import { safeResponseJson, extractContent } from './safeApi';

export interface ImageGenModel {
  id: string;
  name: string;
}

export const DEFAULT_IMAGE_GEN_CONFIG: ImageGenConfig = {
  enabled: false,
  apiUrl: 'https://api.openai.com/v1/images/generations',
  apiKey: '',
  model: 'dall-e-3',
  autoTrigger: false,
};

export const DEFAULT_IMAGE_GEN_CHAT_PREFS: ImageGenChatPrefs = {
  width: 1024,
  height: 1024,
  stylePrefix: '',
  negativePrompt: '',
  charFaceLock: '',
  userFaceLock: '',
};

const CHAT_PREFS_KEY = (charId: string) => `imageGen_prefs_${charId}`;

export function resolveImageGenConfig(config?: Partial<ImageGenConfig>): ImageGenConfig {
  return { ...DEFAULT_IMAGE_GEN_CONFIG, ...config };
}

export function loadImageGenChatPrefs(charId: string): ImageGenChatPrefs {
  try {
    const raw = localStorage.getItem(CHAT_PREFS_KEY(charId));
    if (raw) return { ...DEFAULT_IMAGE_GEN_CHAT_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_IMAGE_GEN_CHAT_PREFS };
}

export function saveImageGenChatPrefs(charId: string, prefs: ImageGenChatPrefs): void {
  localStorage.setItem(CHAT_PREFS_KEY(charId), JSON.stringify(prefs));
}

/** 从旧版 OSTheme.imageGenConfig 迁移字段 */
export function migrateLegacyImageGenConfig(legacy?: Record<string, unknown>): Partial<ImageGenConfig> | undefined {
  if (!legacy || typeof legacy !== 'object') return undefined;
  return {
    enabled: !!legacy.enabled,
    apiUrl: typeof legacy.apiUrl === 'string' ? legacy.apiUrl : DEFAULT_IMAGE_GEN_CONFIG.apiUrl,
    apiKey: typeof legacy.apiKey === 'string' ? legacy.apiKey : '',
    model: typeof legacy.model === 'string' ? legacy.model : DEFAULT_IMAGE_GEN_CONFIG.model,
    autoTrigger: !!legacy.autoTrigger,
  };
}

const originalFetch = (window as any).originalFetch || window.fetch.bind(window);

async function persistImageUrl(urlOrB64: string): Promise<string> {
  if (urlOrB64.startsWith('data:')) return urlOrB64;
  if (urlOrB64.startsWith('http://') || urlOrB64.startsWith('https://')) {
    try {
      const res = await originalFetch(urlOrB64);
      if (!res.ok) return urlOrB64;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(blob);
      });
    } catch {
      return urlOrB64;
    }
  }
  return `data:image/png;base64,${urlOrB64}`;
}

function chatCompletionsUrl(apiConfig: APIConfig): string {
  const base = apiConfig.baseUrl.replace(/\/+$/, '');
  return base.includes('/chat/completions') ? base : `${base}/chat/completions`;
}

async function callChatLlm(
  apiConfig: APIConfig,
  system: string,
  user: string,
  maxTokens = 200,
  temperature = 0.4,
): Promise<string> {
  if (!apiConfig.baseUrl?.trim() || !apiConfig.apiKey?.trim()) return '';
  const res = await fetch(chatCompletionsUrl(apiConfig), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) return '';
  const data = await safeResponseJson(res);
  return extractContent(data).trim();
}

export function buildImagePrompt(opts: {
  scenePrompt: string;
  prefs: ImageGenChatPrefs;
  char?: CharacterProfile;
  userProfile?: UserProfile;
}): string {
  const parts: string[] = [];
  
  if (opts.prefs.stylePrefix.trim()) {
    parts.push(opts.prefs.stylePrefix.trim());
  }

  const charFace = opts.prefs.charFaceLock.trim() || opts.char?.description?.slice(0, 200) || '';
  const userFace = opts.prefs.userFaceLock.trim() || opts.userProfile?.bio?.slice(0, 150) || '';

  if (charFace) {
    parts.push(`the character ${opts.char?.name || 'character'}: ${charFace}`);
  }
  if (userFace) {
    parts.push(`the user: ${userFace}`);
  }

  parts.push(`scene: ${opts.scenePrompt.trim()}`);

  const full = parts.filter(Boolean).join('. ');
  return full + '. high quality, detailed';
}

export async function testImageGenConnection(config: ImageGenConfig): Promise<{ ok: boolean; message: string }> {
  const apiUrl = config.apiUrl.trim();
  const apiKey = config.apiKey.trim();
  if (!apiUrl || !apiKey) return { ok: false, message: '请填写 API 地址与密钥' };
  if (!config.model) return { ok: false, message: '请先选择生图模型' };
  
  const baseUrl = apiUrl.replace(/\/+$/, '');
  const targetUrl = `${baseUrl}/images/generations`;
  console.log(`Testing image gen connection: ${targetUrl} (model: ${config.model})`);
  
  try {
    const res = await originalFetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        prompt: 'test connection, simple blue circle on white background',
        n: 1,
        size: '256x256',
        response_format: 'url',
      }),
    });
    
    if (res.ok) {
      return { ok: true, message: `连接成功，API 可用 (模型: ${config.model})` };
    }
    
    const errText = await res.text().catch(() => '');
    console.error(`Test with model ${config.model} failed: ${res.status} - ${errText}`);
    
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `API 返回 ${res.status}: 认证失败，请检查密钥` };
    }
    
    if (errText.toLowerCase().includes('imagen')) {
      console.log('Server requires imagen model, testing with imagen to verify API...');
      const imagenRes = await originalFetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'imagen',
          prompt: 'test connection, simple blue circle on white background',
          n: 1,
          size: '256x256',
          response_format: 'url',
        }),
      });
      
      if (imagenRes.ok) {
        return { ok: true, message: `API 可用！但您选择的模型 "${config.model}" 不被服务器支持。服务器仅支持 imagen 模型，请更换模型后再试。` };
      }
      
      const imagenErr = await imagenRes.text().catch(() => '');
      return { ok: false, message: `API 返回 ${res.status}: ${errText.slice(0, 200)}。尝试 imagen 模型也失败: ${imagenErr.slice(0, 100)}` };
    }
    
    return { ok: false, message: `API 返回 ${res.status}: ${errText.slice(0, 200) || res.statusText}` };
    
  } catch (e: any) {
    console.error(`Test connection error: ${e?.message}`);
    return { ok: false, message: e?.message || '网络请求失败' };
  }
}

export interface GenerateImageResult {
  url: string;
  prompt: string;
}

export async function generateImage(
  scenePrompt: string,
  config: ImageGenConfig,
  prefs: ImageGenChatPrefs,
  char?: CharacterProfile,
  userProfile?: UserProfile,
): Promise<GenerateImageResult> {
  const fullPrompt = buildImagePrompt({ scenePrompt, prefs, char, userProfile });
  const apiUrl = config.apiUrl.trim();
  const apiKey = config.apiKey.trim();
  if (!apiUrl || !apiKey) throw new Error('请先在设置中配置生图 API');
  if (!config.model) throw new Error('请先在设置中选择生图模型');

  const size = `${prefs.width || 1024}x${prefs.height || 1024}`;
  const baseUrl = apiUrl.replace(/\/+$/, '');
  const targetUrl = `${baseUrl}/images/generations`;
  
  console.log(`Generating image with model: ${config.model}`);

  const body: Record<string, unknown> = {
    model: config.model,
    prompt: fullPrompt,
    n: 1,
    size,
    response_format: 'url',
  };
  if (prefs.negativePrompt?.trim()) {
    body.negative_prompt = prefs.negativePrompt.trim();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600000); // 10分钟超时
  
  const res = await originalFetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  
  clearTimeout(timeout);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`生图 API 错误 (${res.status}): ${errText.slice(0, 200) || res.statusText}`);
  }

  const data = await safeResponseJson(res);
  console.log('Image generation response:', JSON.stringify(data, null, 2));
  
  function extractImageUrl(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.url === 'string' && (obj.url.startsWith('http') || obj.url.startsWith('data:'))) return obj.url;
    if (typeof obj.b64_json === 'string') return obj.b64_json;
    if (typeof obj.image_url === 'string' && (obj.image_url.startsWith('http') || obj.image_url.startsWith('data:'))) return obj.image_url;
    return null;
  }

  let rawUrl = '';

  const firstItem = Array.isArray(data?.data) ? data.data[0] : data?.data;
  if (firstItem) {
    const u = extractImageUrl(firstItem);
    if (u) rawUrl = u;
  }

  if (!rawUrl && Array.isArray(data?.images) && data.images[0]) {
    const u = extractImageUrl(data.images[0]);
    if (u) rawUrl = u;
  }

  if (!rawUrl && Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (typeof item === 'string' && (item.startsWith('http') || item.startsWith('data:'))) {
        rawUrl = item;
        break;
      }
      if (typeof item === 'object') {
        const u = extractImageUrl(item);
        if (u) { rawUrl = u; break; }
      }
    }
  }

  if (!rawUrl) {
    const u = extractImageUrl(data);
    if (u) rawUrl = u;
  }

  if (!rawUrl && typeof data?.output === 'string' && (data.output.startsWith('http') || data.output.startsWith('data:'))) {
    rawUrl = data.output;
  }

  if (!rawUrl && typeof data === 'string' && (data.startsWith('http') || data.startsWith('data:'))) {
    rawUrl = data;
  }
  
  if (!rawUrl) {
    console.error('No image URL found in response:', data);
    throw new Error('生图 API 未返回图片，请检查控制台日志查看返回数据格式');
  }

  const url = await persistImageUrl(rawUrl);
  return { url, prompt: fullPrompt };
}

export async function fetchImageGenModels(config: ImageGenConfig): Promise<ImageGenModel[]> {
  const apiUrl = config.apiUrl.trim();
  const apiKey = config.apiKey.trim();
  if (!apiUrl || !apiKey) return [];
  
  try {
    const parsedUrl = new URL(apiUrl);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
    const modelsUrl = `${baseUrl.replace(/\/+$/, '')}/models`;
    
    console.log(`Fetching models from: ${modelsUrl}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const res = await originalFetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      mode: 'cors' as RequestMode,
      cache: 'no-cache' as RequestCache,
    });
    
    clearTimeout(timeout);
    
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`Failed to fetch models: ${res.status} ${res.statusText} - ${errText}`);
      return [];
    }
    
    const data = await safeResponseJson(res);
    const models = data?.data || [];
    return models
      .filter((m: any) => m.id)
      .map((m: any) => ({ id: m.id, name: m.name || m.id }));
  } catch (e) {
    console.error(`Failed to fetch models: ${(e as Error).message}`);
    return [];
  }
}

export async function generateImageVoiceCaption(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  scenePrompt: string;
  summary: string;
  source: 'manual' | 'auto';
  style?: string;
}): Promise<string> {
  const char = opts.char;
  let personality = '';
  if ((char as any).personality) {
    personality = `\n角色性格：${(char as any).personality.slice(0, 100)}`;
  }
  if (char.description) {
    personality += `\n角色描述：${char.description.slice(0, 100)}`;
  }
  if (char.systemPrompt) {
    personality += `\n角色设定：${char.systemPrompt.slice(0, 100)}`;
  }
  
  // 分析图片风格
  let styleDesc = '';
  if (opts.style) {
    const styleKeywords = opts.style.toLowerCase();
    if (styleKeywords.includes('写实') || styleKeywords.includes('photorealistic')) {
      styleDesc = '（写实风格）';
    } else if (styleKeywords.includes('动漫') || styleKeywords.includes('anime')) {
      styleDesc = '（动漫风格）';
    } else if (styleKeywords.includes('水彩') || styleKeywords.includes('watercolor')) {
      styleDesc = '（水彩风格）';
    } else if (styleKeywords.includes('胶片') || styleKeywords.includes('film')) {
      styleDesc = '（胶片风格）';
    }
  }
  
  // 根据来源生成不同的系统提示
  const contextHint = opts.source === 'manual' 
    ? '用户要求你生成这张图片，你需要根据图片内容进行解说。' 
    : '你主动发送了这张图片，需要根据图片内容进行解说。';
  
  const system = `你是${char.name}，请用第一人称说话，语气自然亲切，就像在和朋友聊天一样。${personality}

${contextHint}根据即将发送的图片，写一段 10-30 字的口语化解说，要具体描述图片内容，不要说"我画了这个"之类的通用话。只输出解说词，不要引号或前缀。`;
  
  const user = `图片主题：${opts.scenePrompt.slice(0, 200)}${styleDesc}\n画面描述：${opts.summary.slice(0, 150)}`;
  const text = await callChatLlm(opts.apiConfig, system, user, 80, 0.85);
  if (text) {
    const trimmed = text.replace(/^["「『]|["」』]$/g, '').trim();
    if (trimmed.length >= 4) return trimmed.slice(0, 35);
  }
  
  // 根据主题生成更合适的默认回复
  const prompt = opts.scenePrompt.toLowerCase();
  if (prompt.includes('女生') || prompt.includes('女孩') || prompt.includes('自拍')) {
    return '看这张自拍怎么样？'.slice(0, 35);
  } else if (prompt.includes('风景') || prompt.includes('景色')) {
    return '好美的风景呀～'.slice(0, 35);
  } else if (prompt.includes('可爱') || prompt.includes('萌')) {
    return '好可爱的画面！'.slice(0, 35);
  } else if (prompt.includes('插画') || prompt.includes('绘画')) {
    return '这是我画的插画～'.slice(0, 35);
  }
  
  return '你看这张图怎么样？'.slice(0, 35);
}

export async function generateImageMemoryText(opts: {
  apiConfig: APIConfig;
  charName: string;
  summary: string;
  source: 'manual' | 'auto';
  prompt?: string;
}): Promise<string> {
  const actionText = opts.source === 'manual' ? '被要求发送' : '主动发送';
  const system = `你是图片内容摘要专家。请根据生图提示词和画面描述，生成一段详细、准确的图片记忆摘要（80-120字）。

要求：
1. 明确说明是谁发的图片，发送方式（主动/被动）
2. 详细描述图片中的人物、场景、动作、物品
3. 区分角色和用户，不要混淆
4. 客观描述，不要脑补不存在的内容
5. 格式：【角色名】发送了一张图片，[画面详细描述]

只输出摘要，不要引号或前缀。`;
  const user = `角色名：${opts.charName}
发送方式：${opts.source === 'manual' ? '用户要求发送' : '主动发送'}
生图提示词：${(opts.prompt || '').slice(0, 300)}
画面描述：${opts.summary.slice(0, 300)}`;
  const text = await callChatLlm(opts.apiConfig, system, user, 200, 0.3);
  if (text) {
    const trimmed = text.replace(/^["「『]|["」』]$/g, '').trim();
    if (trimmed.length >= 20) return trimmed.slice(0, 150);
  }
  const desc = opts.summary.slice(0, 60) || '图片';
  return `【${opts.charName}】${actionText}了一张图片，内容是：${desc}`;
}

export async function summarizeImageForContext(
  apiConfig: APIConfig,
  prompt: string,
): Promise<string> {
  const text = await callChatLlm(
    apiConfig,
    '根据生图提示词，详细描述图片内容（60-100字）。要求：客观准确，不要脑补，区分画面中的不同人物，说明场景、动作、物品。用于对话记忆，让AI知道图片里有什么。',
    `生图提示词：${prompt.slice(0, 400)}`,
    150,
    0.3,
  );
  return text || prompt.slice(0, 80);
}

export interface AutoImageDecision {
  shouldSend: boolean;
  prompt: string;
  reason: string;
}

export async function evaluateAutoImageDecision(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  recentMessages: Message[];
  assistantReply: string;
}): Promise<AutoImageDecision> {
  const history = opts.recentMessages.slice(-20).map(m => {
    const role = m.role === 'user' ? '用户' : opts.char.name;
    const body = m.type === 'image_with_voice'
      ? (m.metadata?.memoryText || '[图片]')
      : m.type === 'image'
        ? '[图片]'
        : (m.content || '').slice(0, 200);
    return `${role}: ${body}`;
  }).join('\n');

  const charInfo = `角色名：${opts.char.name}
人设描述：${opts.char.description?.slice(0, 300) || '无'}
系统提示：${opts.char.systemPrompt?.slice(0, 300) || '无'}`;

  const system = `你是角色「${opts.char.name}」的潜意识决策模块，负责判断角色是否应该在当前回复后主动发送一张图片。

## 角色信息
${charInfo}

## 决策原则
完全以角色的人设和性格为依据，自主决定是否发图：

1. **角色想发就发**：如果角色有分享欲、想展示什么、情绪高涨想晒日常、觉得场景适合配图 → 发
2. **角色不想发就不发**：如果角色觉得没必要、性格内敛、场景普通、纯文字就够 → 不发
3. **用户要求时也自主决定**：即使用户要求发图，角色也可以根据人设选择发或不发（傲娇、害羞、故意吊胃口等都可以）
4. **内容贴合场景**：图片内容要符合当前对话场景和角色人设，不能突兀

## 输出格式
只输出 JSON，不要其他文字：
{"send":true/false,"prompt":"生图描述，send为true时必填，用中文或英文描述画面","reason":"简短的决策理由，以角色心态说明为什么发/不发"}`;

  const user = `对话历史：\n${history}\n\n角色刚说完：\n${opts.assistantReply.slice(0, 800)}`;

  const raw = await callChatLlm(opts.apiConfig, system, user, 300, 0.7);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        shouldSend: !!parsed.send,
        prompt: typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '',
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      };
    }
  } catch { /* fall through */ }

  return { shouldSend: false, prompt: '', reason: 'parse_failed' };
}

export function countImagesInTurn(messages: Message[], sinceUserMsgId: number | null): number {
  if (!sinceUserMsgId) return 0;
  const idx = messages.findIndex(m => m.id === sinceUserMsgId);
  if (idx < 0) return 0;
  return messages.slice(idx + 1).filter(m =>
    m.role === 'assistant' && (m.type === 'image_with_voice' || m.type === 'image'),
  ).length;
}

export function notifyImageMessagePush(charId: string, charName: string): void {
  window.dispatchEvent(new CustomEvent('assistant-image-sent', {
    detail: { charId, charName, body: `[${charName}] 发送了一张图片` },
  }));
}

export async function deliverImageWithVoiceMessage(opts: {
  charId: string;
  charName: string;
  imageUrl: string;
  metadata: ImageWithVoiceMetadata;
  existingMemories?: MemoryFragment[];
  onMemoryUpdate?: (memories: MemoryFragment[]) => void;
  placeholderMsgId?: number;
}): Promise<number> {
  const payload = {
    charId: opts.charId,
    role: 'assistant' as const,
    type: 'image_with_voice' as const,
    content: opts.imageUrl,
    metadata: opts.metadata,
  };

  let msgId: number;
  if (opts.placeholderMsgId) {
    await DB.updateMessage(opts.placeholderMsgId, opts.imageUrl);
    await DB.updateMessageMetadata(opts.placeholderMsgId, () => opts.metadata);
    msgId = opts.placeholderMsgId;
  } else {
    msgId = await DB.saveMessage(payload);
  }

  // 自动保存图片到对应角色的相册
  await DB.saveGalleryImage({
    id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    charId: opts.charId,
    url: opts.imageUrl,
    timestamp: Date.now(),
    savedDate: new Date().toISOString().split('T')[0],
  });

  const memory: MemoryFragment = {
    id: `mem-img-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    summary: opts.metadata.memoryText,
    mood: 'image',
  };
  opts.onMemoryUpdate?.([...(opts.existingMemories || []), memory]);

  window.dispatchEvent(new CustomEvent('chat-image-gen-delivered', {
    detail: { charId: opts.charId, msgId },
  }));

  notifyImageMessagePush(opts.charId, opts.charName);

  return msgId;
}

export async function createImageLoadingPlaceholder(charId: string, source: 'manual' | 'auto' = 'manual'): Promise<number> {
  return DB.saveMessage({
    charId,
    role: 'assistant',
    type: 'image_with_voice',
    content: '',
    metadata: {
      imageGen: {
        prompt: '',
        summary: '',
        source,
        generatedAt: Date.now(),
        loading: true,
      },
      memoryText: '',
    } satisfies Partial<ImageWithVoiceMetadata>,
  });
}
