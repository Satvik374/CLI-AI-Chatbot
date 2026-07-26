import config from './config.js';

/**
 * Unified API client that supports both Anthropic Messages API
 * and OpenAI-compatible Chat Completions API.
 *
 * Handles:
 *  - Standard SSE streaming (Anthropic & OpenAI)
 *  - Non-streaming JSON responses (common with reverse proxies)
 *  - Proxy responses that embed Anthropic JSON in text content
 *
 * Streams responses via an async generator.
 */
class APIClient {
  constructor() {
    this.totalInputTokens  = 0;
    this.totalOutputTokens = 0;
    this.totalCost         = 0;
    this._abortController  = null;
  }

  /** Normalize apiFormat to lowercase for case-insensitive comparison */
  _format() {
    return (config.get('apiFormat') || 'anthropic').toLowerCase();
  }

  /** Check if native tool calling is enabled and supported */
  _useNativeTools() {
    // Explicitly set in config?
    const explicit = config.get('nativeTools');
    if (explicit === true) return true;
    if (explicit === false) return false;
    // Auto-detect: only official APIs support native tools
    const base = (config.get('baseUrl') || '').toLowerCase();
    return base.includes('api.anthropic.com') || base.includes('api.openai.com');
  }

  /* ─── public ─── */

  /** Whether native tool calling will be used for the next request */
  get nativeTools() { return this._useNativeTools(); }

  /** Abort an in-flight stream */
  abort() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  /**
   * Stream a response.
   * Yields events:
   *   { type:'text',       text }
   *   { type:'tool_start', name, id }
   *   { type:'tool_end',   id, name, input }
   *   { type:'usage',      inputTokens, outputTokens, cost }
   *   { type:'done' }
   */
  async *stream(messages, tools, systemPrompt) {
    const format = this._format();

    const body = format === 'anthropic'
      ? this._buildAnthropicBody(messages, tools, systemPrompt)
      : this._buildOpenAIBody(messages, tools, systemPrompt);

    this._abortController = new AbortController();

    const endpoint = this._endpoint();
    const debug = config.get('debug');

    if (debug) {
      console.error(`\n[DEBUG] POST ${endpoint}`);
      console.error(`[DEBUG] Format: ${format}, Model: ${config.get('model')}`);
      console.error(`[DEBUG] Tools sent: ${tools?.length || 0}`);
      console.error(`[DEBUG] Messages: ${messages.length}`);
    }

    const res = await fetch(endpoint, {
      method : 'POST',
      headers: this._headers(),
      body   : JSON.stringify(body),
      signal : this._abortController.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API ${res.status}: ${errText.slice(0, 400)}`);
    }

    /* ─── Detect response type ─── */
    const contentType = res.headers.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream');

    if (debug) {
      console.error(`[DEBUG] Response Content-Type: ${contentType}`);
      console.error(`[DEBUG] Mode: ${isSSE ? 'SSE streaming' : 'Non-streaming JSON'}`);
    }

    let inputTokens  = 0;
    let outputTokens = 0;

    if (!isSSE) {
      /* ─── Non-streaming JSON response ─── */
      if (debug) console.error('[DEBUG] Processing as non-streaming JSON...');
      for await (const ev of this._processNonStreamingResponse(res, format)) {
        if (ev.type === 'meta_usage') { inputTokens = ev.inputTokens; outputTokens = ev.outputTokens; continue; }
        yield ev;
      }
    } else {
      /* ─── SSE streaming response ─── */
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      const contentBlocks = [];
      const oaiToolCalls  = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes('\n')) {
          const idx  = buffer.indexOf('\n');
          const line = buffer.slice(0, idx);
          buffer     = buffer.slice(idx + 1);

          const result = this._processSSELine(line, format, contentBlocks, oaiToolCalls);
          if (result) {
            for (const ev of result.events) yield ev;
            if (result.inputTokens)  inputTokens  = result.inputTokens;
            if (result.outputTokens) outputTokens = result.outputTokens;
          }
        }
      }

      // Flush remaining buffer
      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) {
          const result = this._processSSELine(line, format, contentBlocks, oaiToolCalls);
          if (result) {
            for (const ev of result.events) yield ev;
            if (result.inputTokens)  inputTokens  = result.inputTokens;
            if (result.outputTokens) outputTokens = result.outputTokens;
          }
        }
      }

      // Force flush any incomplete tool calls (SSE stream ended without proper close)
      if (format === 'anthropic') {
        for (const b of contentBlocks) {
          if (b?.type === 'tool_use' && !b._done) {
            try { b.input = JSON.parse(b._json || '{}'); } catch { b.input = {}; }
            b._done = true;
            yield { type: 'tool_end', id: b.id, name: b.name, input: b.input };
          }
        }
      } else {
        for (const tc of Object.values(oaiToolCalls)) {
          if (tc.name && !tc._done) {
            try { tc.input = JSON.parse(tc.args || '{}'); } catch { tc.input = {}; }
            tc._done = true;
            if (!tc.id) tc.id = 'call_' + Math.random().toString(36).slice(2, 9);
            yield { type: 'tool_end', id: tc.id, name: tc.name, input: tc.input };
          }
        }
      }

      // Also try to parse the ENTIRE collected buffer as a non-SSE response
      // (some proxies set content-type to event-stream but return plain JSON)
      // This is handled by the fallback in _processNonStreamingResponse
    }

    this._abortController = null;
    this.totalInputTokens  += inputTokens;
    this.totalOutputTokens += outputTokens;
    const cost = this._cost(inputTokens, outputTokens);
    this.totalCost += cost;

    yield { type: 'usage', inputTokens, outputTokens, cost };
    yield { type: 'done' };
  }

  get usage() {
    return {
      totalInputTokens : this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCost        : this.totalCost,
    };
  }
  resetUsage() { this.totalInputTokens = 0; this.totalOutputTokens = 0; this.totalCost = 0; }

  /* ──────────────────────────────────────────────
     Non-streaming response handler
     ────────────────────────────────────────────── */

  async *_processNonStreamingResponse(res, format) {
    const debug = config.get('debug');
    let rawBody;
    try {
      rawBody = await res.text();
    } catch (e) {
      throw new Error('Failed to read API response body');
    }

    if (debug) {
      console.error(`[DEBUG] Raw response body (first 500 chars): ${rawBody.slice(0, 500)}`);
    }

    let json;
    try {
      json = JSON.parse(rawBody);
      if (debug) {
        console.error(`[DEBUG] Parsed as JSON. Keys: ${Object.keys(json).join(', ')}`);
        if (json.content) console.error(`[DEBUG] content blocks: ${json.content.length}, types: ${json.content.map(b => b.type).join(', ')}`);
        if (json.choices) console.error(`[DEBUG] choices: ${json.choices.length}`);
      }
    } catch {
      // Sometimes the proxy returns SSE-formatted text even without proper content-type
      // Try to extract data: lines
      const dataLines = rawBody.split('\n').filter(l => l.startsWith('data:'));
      if (dataLines.length > 0) {
        // It's actually SSE, just with wrong content-type — process each line
        const contentBlocks = [];
        const oaiToolCalls  = {};
        let inTok = 0, outTok = 0;
        for (const line of dataLines) {
          const result = this._processSSELine(line, format, contentBlocks, oaiToolCalls);
          if (result) {
            for (const ev of result.events) yield ev;
            if (result.inputTokens)  inTok  = result.inputTokens;
            if (result.outputTokens) outTok = result.outputTokens;
          }
        }
        if (inTok || outTok) yield { type: 'meta_usage', inputTokens: inTok, outputTokens: outTok };
        // Flush incomplete tool calls
        if (format === 'anthropic') {
          for (const b of contentBlocks) {
            if (b?.type === 'tool_use' && !b._done) {
              try { b.input = JSON.parse(b._json || '{}'); } catch { b.input = {}; }
              b._done = true;
              yield { type: 'tool_end', id: b.id, name: b.name, input: b.input };
            }
          }
        } else {
          for (const tc of Object.values(oaiToolCalls)) {
            if (tc.name && !tc._done) {
              try { tc.input = JSON.parse(tc.args || '{}'); } catch { tc.input = {}; }
              tc._done = true;
              if (!tc.id) tc.id = 'call_' + Math.random().toString(36).slice(2, 9);
              yield { type: 'tool_end', id: tc.id, name: tc.name, input: tc.input };
            }
          }
        }
        return;
      }
      throw new Error('API returned non-JSON response: ' + rawBody.slice(0, 300));
    }

    // Handle Anthropic non-streaming response format
    if (format === 'anthropic') {
      yield* this._parseAnthropicFullResponse(json);
    } else {
      yield* this._parseOpenAIFullResponse(json);
    }
  }

  /* Parse a complete Anthropic API response (non-streaming) */
  *_parseAnthropicFullResponse(json) {
    // Could be wrapped: { message: { content: [...] } } or direct: { content: [...] }
    const msg = json.message || json;
    const content = msg.content || [];

    for (const block of content) {
      if (block.type === 'text' && block.text) {
        yield { type: 'text', text: block.text };
      }
      if (block.type === 'tool_use') {
        const id = block.id || 'call_' + Math.random().toString(36).slice(2, 9);
        yield { type: 'tool_start', name: block.name, id };
        yield { type: 'tool_end', id, name: block.name, input: block.input || {} };
      }
    }

    if (msg.stop_reason === 'max_tokens') yield { type: 'truncated' };
    const usage = msg.usage || json.usage;
    if (usage) {
      yield { type: 'meta_usage', inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0 };
    }
  }

  /* Parse a complete OpenAI API response (non-streaming) */
  *_parseOpenAIFullResponse(json) {
    if (json.usage) {
      yield { type: 'meta_usage', inputTokens: json.usage.prompt_tokens || 0, outputTokens: json.usage.completion_tokens || 0 };
    }
    const choice = json.choices?.[0];
    if (!choice) return;

    const msg = choice.message || {};
    if (msg.content) {
      yield { type: 'text', text: msg.content };
    }

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const id   = tc.id || 'call_' + Math.random().toString(36).slice(2, 9);
        const name = tc.function?.name || 'unknown';
        let input  = {};
        try { input = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        yield { type: 'tool_start', name, id };
        yield { type: 'tool_end', id, name, input };
      }
    }

    // Detect truncation
    if (choice.finish_reason === 'length') {
      yield { type: 'truncated' };
    }
  }

  /* ──────────────────────────────────────────────
     Private — endpoint / headers
     ────────────────────────────────────────────── */

  _endpoint() {
    let base = config.get('baseUrl').replace(/\/+$/, '');
    // Strip known endpoint suffixes users might accidentally include
    base = base.replace(/\/v1\/(messages|chat\/completions)$/i, '');
    base = base.replace(/\/v1$/i, '');
    base = base.replace(/\/+$/, '');

    return this._format() === 'anthropic'
      ? `${base}/v1/messages`
      : `${base}/v1/chat/completions`;
  }

  _headers() {
    if (this._format() === 'anthropic') {
      return {
        'Content-Type'     : 'application/json',
        'x-api-key'        : config.get('apiKey'),
        'anthropic-version': '2023-06-01',
      };
    }
    return {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${config.get('apiKey')}`,
      'HTTP-Referer' : 'https://github.com/moralta/moralta-claude',
      'X-Title'      : 'Moralta Claude',
    };
  }

  /* ──────────────────────────────────────────────
     Private — request body builders
     ────────────────────────────────────────────── */

  /**
   * Anthropic requires strictly alternating user/assistant roles.
   * Error turns and fallback tool extraction can leave consecutive same-role
   * messages in history — merge them here so every request stays valid.
   */
  _mergeConsecutiveRoles(messages) {
    const out = [];
    const toBlocks = c => Array.isArray(c) ? c : [{ type: 'text', text: String(c) }];
    for (const m of messages) {
      const empty = typeof m.content === 'string' ? !m.content.trim() : !(m.content && m.content.length);
      if (empty) continue;
      const prev = out[out.length - 1];
      if (prev && prev.role === m.role) {
        const merged = [...toBlocks(prev.content), ...toBlocks(m.content)];
        // tool_result blocks must come before text blocks in a user message
        prev.content = [
          ...merged.filter(b => b.type === 'tool_result'),
          ...merged.filter(b => b.type !== 'tool_result'),
        ];
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }

  _buildAnthropicBody(messages, tools, systemPrompt) {
    const nativeTools = this._useNativeTools();
    const body = {
      model     : config.get('model'),
      max_tokens: config.get('maxTokens'),
      stream    : true,
      messages  : this._mergeConsecutiveRoles(messages),
    };
    if (systemPrompt) body.system = systemPrompt;
    // Only send tools if native tool calling is supported
    if (nativeTools && tools?.length) {
      body.tools = tools.map(t => ({
        name: t.name, description: t.description, input_schema: t.parameters,
      }));
      body.tool_choice = { type: 'auto' };
    }
    const temp = config.get('temperature');
    if (typeof temp === 'number') body.temperature = temp;
    return body;
  }

  _buildOpenAIBody(messages, tools, systemPrompt) {
    const msgs = [];
    const nativeTools = this._useNativeTools();

    if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });

    for (const m of messages) {
      /* user tool-result messages → convert to plain text if native tools disabled */
      if (m.role === 'user' && Array.isArray(m.content)) {
        const trs = m.content.filter(c => c.type === 'tool_result');
        if (trs.length) {
          if (nativeTools) {
            for (const tr of trs)
              msgs.push({ role: 'tool', tool_call_id: tr.tool_use_id,
                           content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content) });
          } else {
            // Convert to plain text for proxies that don't support tool role
            const textParts = trs.map(tr => {
              const content = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
              return `[Tool Result]\n${content}`;
            });
            msgs.push({ role: 'user', content: textParts.join('\n\n') });
          }
          continue;
        }
      }

      /* assistant with tool_use blocks → convert to plain text if native tools disabled */
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        const textParts = m.content.filter(c => c.type === 'text');
        const toolParts = m.content.filter(c => c.type === 'tool_use');

        if (nativeTools) {
          const fmsg = { role: 'assistant', content: textParts.map(p => p.text).join('') || null };
          if (toolParts.length)
            fmsg.tool_calls = toolParts.map(tp => ({
              id: tp.id, type: 'function',
              function: { name: tp.name, arguments: JSON.stringify(tp.input) },
            }));
          msgs.push(fmsg);
        } else {
          // Convert to plain text
          let txt = textParts.map(p => p.text).join('');
          if (toolParts.length) {
            const toolTexts = toolParts.map(tp =>
              `\`\`\`json\n${JSON.stringify({ name: tp.name, input: tp.input })}\n\`\`\``
            );
            txt = (txt ? txt + '\n\n' : '') + toolTexts.join('\n\n');
          }
          if (txt) msgs.push({ role: 'assistant', content: txt });
        }
        continue;
      }

      msgs.push(m);
    }

    const body = {
      model     : config.get('model'),
      max_tokens: config.get('maxTokens'),
      stream    : true,
      messages  : msgs,
    };

    // Only send tools in body if native tool calling is enabled
    if (nativeTools && tools?.length) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = 'auto';
    }

    const temp = config.get('temperature');
    if (typeof temp === 'number') body.temperature = temp;
    return body;
  }

  /* ──────────────────────────────────────────────
     Private — SSE line processor
     ────────────────────────────────────────────── */

  _processSSELine(line, format, contentBlocks, oaiToolCalls) {
    if (!line.startsWith('data:')) return null;
    const raw = line.slice(5).trim();
    if (raw === '[DONE]') return null;
    if (!raw) return null;

    let evt;
    try { evt = JSON.parse(raw); } catch { return null; }

    const events = [];
    let inputTokens = 0;
    let outputTokens = 0;

    if (format === 'anthropic') {
      // Check if the proxy returned the ENTIRE response as a single SSE event
      if (evt.content && Array.isArray(evt.content) && !evt.type) {
        // This is a full Anthropic response, not an SSE event
        for (const block of evt.content) {
          if (block.type === 'text' && block.text) {
            events.push({ type: 'text', text: block.text });
          }
          if (block.type === 'tool_use') {
            const id = block.id || 'call_' + Math.random().toString(36).slice(2, 9);
            events.push({ type: 'tool_start', name: block.name, id });
            events.push({ type: 'tool_end', id, name: block.name, input: block.input || {} });
          }
        }
        if (evt.usage) {
          inputTokens  = evt.usage.input_tokens || 0;
          outputTokens = evt.usage.output_tokens || 0;
        }
      } else {
        // Normal Anthropic SSE event
        for (const ev of this._procAnthropic(evt, contentBlocks)) events.push(ev);
        if (evt.type === 'message_start' && evt.message?.usage)
          inputTokens = evt.message.usage.input_tokens || 0;
        if (evt.type === 'message_delta' && evt.usage)
          outputTokens = evt.usage.output_tokens || 0;
      }
    } else {
      for (const ev of this._procOpenAI(evt, oaiToolCalls)) events.push(ev);
      if (evt.usage) {
        inputTokens  = evt.usage.prompt_tokens     || 0;
        outputTokens = evt.usage.completion_tokens  || 0;
      }
    }

    return { events, inputTokens, outputTokens };
  }

  /* ──────────────────────────────────────────────
     Private — SSE processors (generators)
     ────────────────────────────────────────────── */

  *_procAnthropic(evt, blocks) {
    switch (evt.type) {
      case 'content_block_start':
        blocks[evt.index] = evt.content_block;
        if (evt.content_block.type === 'tool_use') {
          blocks[evt.index]._json = '';
          yield { type: 'tool_start', name: evt.content_block.name, id: evt.content_block.id };
        }
        break;

      case 'content_block_delta':
        if (evt.delta.type === 'text_delta')       yield { type: 'text', text: evt.delta.text };
        if (evt.delta.type === 'input_json_delta' && blocks[evt.index]) {
          blocks[evt.index]._json = (blocks[evt.index]._json || '') + (evt.delta.partial_json || '');
        }
        break;

      case 'content_block_stop': {
        const b = blocks[evt.index];
        if (b?.type === 'tool_use') {
          try { b.input = JSON.parse(b._json || '{}'); } catch { b.input = {}; }
          b._done = true;
          yield { type: 'tool_end', id: b.id, name: b.name, input: b.input };
        }
        break;
      }

      case 'message_delta':
        if (evt.delta?.stop_reason === 'max_tokens') yield { type: 'truncated' };
        break;
    }
  }

  *_procOpenAI(evt, tcs) {
    const choice = evt.choices?.[0];
    if (!choice) return;
    const d = choice.delta;

    if (d?.content) yield { type: 'text', text: d.content };

    if (d?.tool_calls) {
      for (const tc of d.tool_calls) {
        const i = tc.index;
        if (!tcs[i]) tcs[i] = { id: '', name: '', args: '' };
        if (tc.id)               tcs[i].id   = tc.id;
        if (tc.function?.name)  { 
          tcs[i].name = tc.function.name; 
          if (!tcs[i].id) tcs[i].id = 'call_' + Math.random().toString(36).substring(2, 9);
          yield { type: 'tool_start', name: tcs[i].name, id: tcs[i].id }; 
        }
        if (tc.function?.arguments) tcs[i].args += tc.function.arguments;
      }
    }

    if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
      for (const tc of Object.values(tcs)) {
        if (tc.name && !tc._done) {
          try { tc.input = JSON.parse(tc.args || '{}'); } catch { tc.input = {}; }
          tc._done = true;
          if (!tc.id) tc.id = 'call_' + Math.random().toString(36).substring(2, 9);
          yield { type: 'tool_end', id: tc.id, name: tc.name, input: tc.input };
        }
      }
    }

    // Detect truncation due to max_tokens
    if (choice.finish_reason === 'length') {
      yield { type: 'truncated' };
    }
  }

  /* ──────────────────────────────────────────────
     Private — cost estimation
     ────────────────────────────────────────────── */

  _cost(inp, out) {
    const m = config.get('model').toLowerCase();
    let iC = 3, oC = 15;                       // defaults (Sonnet-tier)
    if (m.includes('haiku'))                    { iC = 0.25; oC = 1.25; }
    else if (m.includes('opus'))                { iC = 15;   oC = 75;   }
    else if (m.includes('sonnet'))              { iC = 3;    oC = 15;   }
    else if (m.includes('gpt-4o'))              { iC = 2.5;  oC = 10;   }
    else if (m.includes('gpt-4'))               { iC = 10;   oC = 30;   }
    else if (m.includes('gpt-3.5'))             { iC = 0.5;  oC = 1.5;  }
    else if (m.includes('deepseek'))            { iC = 0.14; oC = 0.28; }
    else if (m.includes('gemini'))              { iC = 0.5;  oC = 1.5;  }
    else if (m.includes('mistral') || m.includes('mixtral')) { iC = 0.6; oC = 2.0;  }
    else if (m.includes('llama'))               { iC = 0.5;  oC = 1.0;  }
    else if (m.includes('qwen'))                { iC = 0.4;  oC = 0.8;  }
    else if (m.includes('command') || m.includes('cohere'))   { iC = 1.0; oC = 2.0;  }
    return (inp / 1e6) * iC + (out / 1e6) * oC;
  }
}

export const api = new APIClient();
export default api;
