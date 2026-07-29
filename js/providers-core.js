// 純邏輯:各 provider 的 HTTP request 組裝(不打網路,方便 node 測)。

function join(baseurl, path) {
  return baseurl.replace(/\/+$/, '') + path;
}

// codex-image-service:async job 提交
export function buildCodexRequest({ baseurl, apiKey, prompt, refImagesB64 = [], count = 1, size = '1024x1024', quality = 'medium' }) {
  return {
    url: join(baseurl, '/v1/images/jobs'),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      prompt, size, quality, count,
      ...(refImagesB64.length ? { reference_images_base64: refImagesB64 } : {}),
    }),
  };
}

export function buildCodexPollRequest({ baseurl, apiKey, jobId }) {
  return {
    url: join(baseurl, `/v1/images/jobs/${jobId}`),
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  };
}

// gemini-web:無參考圖走 generate,有參考圖走 edit(單張;多張由呼叫端先併圖)
export function buildGeminiWebRequest({ baseurl, apiKey, prompt, refImagesB64 = [], timeout = 300 }) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-goog-api-key'] = apiKey;
  if (refImagesB64.length) {
    return {
      url: join(baseurl, '/api/edit'),
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, reference_image: refImagesB64[0], timeout }),
    };
  }
  return {
    url: join(baseurl, '/api/generate'),
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, timeout }),
  };
}

// OpenAI 相容 images API
export function buildOpenAIImageRequest({ baseurl, apiKey, prompt, model, count = 1, size = '1024x1024' }) {
  return {
    url: join(baseurl, '/v1/images/generations'),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ prompt, model, n: count, size, response_format: 'b64_json' }),
  };
}

// 文字模型(分鏡用)
export function buildChatRequest({ type, baseurl, apiKey, model, prompt, timeout = 300 }) {
  if (type === 'gemini-web') {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-goog-api-key'] = apiKey;
    return { url: join(baseurl, '/api/chat'), method: 'POST', headers, body: JSON.stringify({ prompt, timeout }) };
  }
  // openai-compatible;baseurl 可含或不含 /v1
  const base = /\/v1\/?$/.test(baseurl) ? baseurl.replace(/\/+$/, '') : join(baseurl, '/v1');
  return {
    url: base + '/chat/completions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  };
}
