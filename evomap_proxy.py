import sys
import io
import os
import uuid
import json
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import httpx

# Force stdout/stderr to use UTF-8 on Windows to prevent UnicodeEncodeErrors
if sys.platform.startswith("win"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
os.environ["PYTHONIOENCODING"] = "utf-8"

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("evomap_proxy")

app = FastAPI(title="EvoMap Claude Code Proxy")

# Config from environment variables or defaults
EVOMAP_URL = os.environ.get("EVOMAP_URL", "https://api.evomap.ai/v1/chat/completions")
API_KEY = os.environ.get("EVOMAP_API_KEY", "sk-evomap-po5winain24yu32a1e5d1519018a4961a7984d181f8cb87d")
MODEL_ID = os.environ.get("EVOMAP_MODEL_ID", "evomap-deepseek-v4-flash")

# Load EvoMap node identity from canonical location ~/.evomap/
def _load_evomap_identity():
    _id, _secret = None, None
    evomap_dir = os.path.expanduser("~/.evomap")
    id_path = os.path.join(evomap_dir, "node_id")
    secret_path = os.path.join(evomap_dir, "node_secret")
    # Fallback: old ~/.config/evomap/ location
    config_dir = os.path.expanduser("~/.config/evomap")
    cred_path = os.path.join(config_dir, "credentials.json")
    sec_path = os.path.join(config_dir, "secret.json")

    if os.path.exists(id_path) and os.path.exists(secret_path):
        _id = open(id_path).read().strip()
        _secret = open(secret_path).read().strip()
    elif os.path.exists(cred_path) and os.path.exists(sec_path):
        import json as _json
        _id = _json.load(open(cred_path)).get("node_id")
        _secret = _json.load(open(sec_path)).get("node_secret")
    return _id, _secret

EVOMAP_NODE_ID, EVOMAP_NODE_SECRET = _load_evomap_identity()

# ── EvoMap system context injected into every Claude Code session ──────────
EVOMAP_SYSTEM_CONTEXT = f"""
<evomap_identity>
You are Claude Code, operating as a registered node on the EvoMap AI Evolution Network.

NETWORK IDENTITY
  Node ID   : {EVOMAP_NODE_ID or 'not configured'}
  Protocol  : GEP-A2A v1.0.0
  Hub URL   : https://evomap.ai
  Docs      : https://evomap.ai/skill.md
  Your stats: reputation 80.26 | 30 assets published | 28 promoted | status active

WHAT EVOMAP IS
EvoMap is a marketplace where AI agents publish code fixes, solutions, and capabilities
as Gene+Capsule bundles. Other agents can discover, validate, and apply those bundles.
You earn credits for quality publications.

YOUR CREDENTIALS (never print the secret)
  Stored at : ~/.evomap/node_id  and  ~/.evomap/node_secret
  Proxy endpoints available at http://localhost:4000:
    GET  /evomap/status      — check node identity
    POST /evomap/heartbeat   — ping EvoMap Hub to go online

HOW TO USE EVOMAP (only act when the user explicitly asks)

1. SEARCH / FETCH SOLUTIONS
   POST https://evomap.ai/a2a/fetch
   Authorization: Bearer <node_secret>
   Body: GEP-A2A envelope with message_type "fetch" and payload.query = "<your search>"

2. PUBLISH A FIX / ASSET
   Step A – validate the bundle:
     POST https://evomap.ai/a2a/validate
     Authorization: Bearer <node_secret>
     Body: GEP-A2A envelope, message_type "validate", payload.assets = [{{title, description, content, tags}}]

   Step B – publish after validation passes:
     POST https://evomap.ai/a2a/publish
     Authorization: Bearer <node_secret>
     Body: GEP-A2A envelope, message_type "publish", payload.assets = [{{...same + sha256 hash}}]

3. HEARTBEAT (keep node online)
   POST https://evomap.ai/a2a/hello
   Authorization: Bearer <node_secret>
   Body: GEP-A2A envelope, message_type "hello", sender_id = node_id, payload = {{}}

PROTOCOL ENVELOPE FORMAT (required for all A2A calls)
{{
  "protocol": "gep-a2a",
  "protocol_version": "1.0.0",
  "message_type": "<hello|fetch|validate|publish>",
  "message_id": "msg_<unix_ms>_<rand4>",
  "sender_id": "<node_id>",
  "timestamp": "<ISO 8601 UTC>",
  "payload": {{ ... }}
}}

RULES
- The GDI Score of the published asset by you must always be above 42.
- Never print node_secret in chat, logs, or files
- Only act on EvoMap when the user explicitly asks
- Use existing node_id — do NOT register a new node
- Rate limit on /a2a/hello: 60/hour per IP
- The proxy at localhost:4000 handles all LLM calls via EvoMap's model
</evomap_identity>
""".strip()

logger.info(f"Target EvoMap URL: {EVOMAP_URL}")
logger.info(f"Target Model ID: {MODEL_ID}")
if EVOMAP_NODE_ID:
    logger.info(f"EvoMap Node ID: {EVOMAP_NODE_ID}")
else:
    logger.warning("EvoMap node identity not found — heartbeat/publish will not be available")

@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "EvoMap Claude Code Proxy is running",
        "target_url": EVOMAP_URL,
        "target_model": MODEL_ID,
        "evomap_node_id": EVOMAP_NODE_ID or "not configured"
    }

@app.get("/evomap/status")
async def evomap_status():
    """Returns the EvoMap node identity configured in this proxy."""
    if not EVOMAP_NODE_ID:
        return JSONResponse({"error": "No EvoMap node identity configured"}, status_code=503)
    return {
        "node_id": EVOMAP_NODE_ID,
        "node_secret_loaded": bool(EVOMAP_NODE_SECRET),
        "credential_source": "~/.evomap/",
        "model": MODEL_ID,
        "hub_url": "https://evomap.ai"
    }

@app.post("/evomap/heartbeat")
async def evomap_heartbeat():
    """Sends a hello/heartbeat to EvoMap Hub using the configured node identity."""
    if not EVOMAP_NODE_ID or not EVOMAP_NODE_SECRET:
        raise HTTPException(status_code=503, detail="EvoMap node identity not configured")
    import time, random, datetime as dt
    msg_id = f"msg_{int(time.time()*1000)}_{random.randint(1000,9999)}"
    timestamp = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    envelope = {
        "protocol": "gep-a2a",
        "protocol_version": "1.0.0",
        "message_type": "hello",
        "message_id": msg_id,
        "sender_id": EVOMAP_NODE_ID,
        "timestamp": timestamp,
        "payload": {}
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://evomap.ai/a2a/hello",
            json=envelope,
            headers={
                "Authorization": f"Bearer {EVOMAP_NODE_SECRET}",
                "Content-Type": "application/json",
                "User-Agent": "Claude-Code-EvoMap-Proxy/1.0"
            }
        )
    return {"http_status": resp.status_code, "response": resp.json()}

@app.post("/v1/messages")
async def messages_endpoint(request: Request):
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse request JSON: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    messages = body.get("messages", [])
    system_prompt = body.get("system")
    stream = body.get("stream", False)
    max_tokens = body.get("max_tokens", 4096)
    model = body.get("model", "claude-3-7-sonnet-20250219")
    
    logger.info(f"Received Anthropic request: model={model}, stream={stream}, messages_count={len(messages)}")
    
    # Translate Anthropic messages -> OpenAI messages
    openai_messages = []
    
    # 1. System Prompt — always prepend EvoMap identity context
    # Normalise to plain string first
    if system_prompt:
        if isinstance(system_prompt, list):
            sys_text = ""
            for block in system_prompt:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        sys_text += block.get("text", "")
                elif isinstance(block, str):
                    sys_text += block
            system_prompt = sys_text

    # Prepend EvoMap context; keep original system prompt if present
    if isinstance(system_prompt, str) and system_prompt.strip():
        combined_system = EVOMAP_SYSTEM_CONTEXT + "\n\n---\n\n" + system_prompt
    else:
        combined_system = EVOMAP_SYSTEM_CONTEXT

    openai_messages.append({"role": "system", "content": combined_system})
            
    # 2. Main Messages
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content")
        
        if isinstance(content, list):
            openai_content = []
            tool_results = []
            assistant_tool_calls = []
            assistant_text = ""
            
            for block in content:
                if not isinstance(block, dict):
                    if isinstance(block, str):
                        openai_content.append({"type": "text", "text": block})
                    continue
                    
                block_type = block.get("type")
                if block_type == "text":
                    text_val = block.get("text", "")
                    openai_content.append({"type": "text", "text": text_val})
                    if role == "assistant":
                        assistant_text += text_val
                elif block_type == "image":
                    source = block.get("source", {})
                    if source.get("type") == "base64":
                        media_type = source.get("media_type", "image/jpeg")
                        data = source.get("data", "")
                        openai_content.append({
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{data}"
                            }
                        })
                elif block_type == "tool_use":
                    tool_id = block.get("id")
                    tool_name = block.get("name")
                    tool_input = block.get("input", {})
                    assistant_tool_calls.append({
                        "id": tool_id,
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": json.dumps(tool_input)
                        }
                    })
                elif block_type == "tool_result":
                    tool_id = block.get("tool_use_id")
                    tool_output = block.get("content", "")
                    
                    if isinstance(tool_output, list):
                        flat_out = ""
                        for b in tool_output:
                            if isinstance(b, dict):
                                if b.get("type") == "text":
                                    flat_out += b.get("text", "")
                            elif isinstance(b, str):
                                flat_out += b
                        tool_output = flat_out
                        
                    tool_results.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "content": tool_output
                    })
            
            if role == "user":
                if tool_results:
                    for tr in tool_results:
                        openai_messages.append(tr)
                    if openai_content:
                        openai_messages.append({"role": "user", "content": openai_content})
                else:
                    openai_messages.append({"role": "user", "content": openai_content})
            elif role == "assistant":
                msg_obj = {"role": "assistant"}
                if assistant_text:
                    msg_obj["content"] = assistant_text
                else:
                    msg_obj["content"] = None
                if assistant_tool_calls:
                    msg_obj["tool_calls"] = assistant_tool_calls
                openai_messages.append(msg_obj)
        else:
            # content is string
            if role == "user":
                openai_messages.append({"role": "user", "content": content})
            elif role == "assistant":
                openai_messages.append({"role": "assistant", "content": content})
                
    # Translate Anthropic tools -> OpenAI tools
    anthropic_tools = body.get("tools")
    openai_tools = None
    if anthropic_tools:
        openai_tools = []
        for tool in anthropic_tools:
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool.get("name"),
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {"type": "object", "properties": {}})
                }
            })
            
    # Prepare OpenAI Payload
    openai_payload = {
        "model": MODEL_ID,
        "messages": openai_messages,
        "stream": stream
    }
    if openai_tools:
        openai_payload["tools"] = openai_tools
    if "temperature" in body:
        openai_payload["temperature"] = body["temperature"]
    if "max_tokens" in body:
        openai_payload["max_tokens"] = body["max_tokens"]
        
    logger.info(f"Forwarding to EvoMap: model={MODEL_ID}, messages_count={len(openai_messages)}")
    logger.info(f"openai_payload: {json.dumps(openai_payload)}")
    
    if stream:
        async def event_generator():
            msg_id = f"msg_{uuid.uuid4().hex}"
            
            # 1. message_start
            yield f"event: message_start\ndata: {json.dumps({'type': 'message_start', 'message': {'id': msg_id, 'type': 'message', 'role': 'assistant', 'content': [], 'model': model, 'stop_reason': None, 'stop_sequence': None, 'usage': {'input_tokens': 0, 'output_tokens': 0}}})}\n\n"
            
            # 2. content_block_start for text (index 0)
            yield f"event: content_block_start\ndata: {json.dumps({'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}})}\n\n"
            
            text_block_active = True
            active_tool_calls = {} # OpenAI tool_call index -> {id, name, started, arguments_buffer}
            has_tool_calls = False
            
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    headers = {
                        "Authorization": f"Bearer {API_KEY}",
                        "Content-Type": "application/json"
                    }
                    async with client.stream("POST", EVOMAP_URL, json=openai_payload, headers=headers) as response:
                        if response.status_code != 200:
                            err_body = await response.aread()
                            err_msg = err_body.decode(errors="ignore")
                            logger.error(f"EvoMap API error: status={response.status_code}, body={err_msg}")
                            yield f"event: error\ndata: {json.dumps({'type': 'error', 'error': {'type': 'api_error', 'message': f'EvoMap API error ({response.status_code}): {err_msg}'}})}\n\n"
                            return
                            
                        async for line in response.aiter_lines():
                            if not line.strip():
                                continue
                            if line.startswith("data: "):
                                data_str = line[6:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data_str)
                                except Exception as e:
                                    logger.error(f"Failed to parse SSE line: {data_str} -> {e}")
                                    continue
                                    
                                choices = chunk.get("choices", [])
                                if not choices:
                                    continue
                                    
                                choice = choices[0]
                                delta = choice.get("delta", {})
                                
                                # Text Content
                                content_delta = delta.get("content")
                                if content_delta:
                                    yield f"event: content_block_delta\ndata: {json.dumps({'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': content_delta}})}\n\n"
                                    
                                # Tool Calls
                                tool_calls = delta.get("tool_calls", [])
                                if tool_calls:
                                    has_tool_calls = True
                                    if text_block_active:
                                        yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': 0})}\n\n"
                                        text_block_active = False
                                        
                                    for tc in tool_calls:
                                        idx = tc.get("index", 0)
                                        tc_id = tc.get("id")
                                        func = tc.get("function", {})
                                        name = func.get("name")
                                        args = func.get("arguments", "")
                                        
                                        if idx not in active_tool_calls:
                                            active_tool_calls[idx] = {
                                                "id": tc_id or f"toolu_{uuid.uuid4().hex[:8]}",
                                                "name": name or "",
                                                "started": False,
                                                "arguments_buffer": ""
                                            }
                                            
                                        info = active_tool_calls[idx]
                                        if tc_id:
                                            info["id"] = tc_id
                                        if name:
                                            info["name"] = name
                                            
                                        if info["name"] and not info["started"]:
                                            block_idx = idx + 1
                                            yield f"event: content_block_start\ndata: {json.dumps({'type': 'content_block_start', 'index': block_idx, 'content_block': {'type': 'tool_use', 'id': info['id'], 'name': info['name'], 'input': {}}})}\n\n"
                                            info["started"] = True
                                            
                                        if args:
                                            info["arguments_buffer"] += args
                                            if info["started"]:
                                                block_idx = idx + 1
                                                yield f"event: content_block_delta\ndata: {json.dumps({'type': 'content_block_delta', 'index': block_idx, 'delta': {'type': 'input_json_delta', 'partial_json': args}})}\n\n"
            except Exception as e:
                logger.error(f"Exception during stream connection: {e}")
                yield f"event: error\ndata: {json.dumps({'type': 'error', 'error': {'type': 'api_error', 'message': f'Proxy stream error: {str(e)}'}})}\n\n"
                return
                
            # Stop text block if still active
            if text_block_active:
                yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': 0})}\n\n"
                
            # Stop tool calls
            for idx, info in active_tool_calls.items():
                if not info["started"]:
                    if not info["name"]:
                        info["name"] = "unknown_tool"
                    block_idx = idx + 1
                    yield f"event: content_block_start\ndata: {json.dumps({'type': 'content_block_start', 'index': block_idx, 'content_block': {'type': 'tool_use', 'id': info['id'], 'name': info['name'], 'input': {}}})}\n\n"
                    info["started"] = True
                    if info["arguments_buffer"]:
                        yield f"event: content_block_delta\ndata: {json.dumps({'type': 'content_block_delta', 'index': block_idx, 'delta': {'type': 'input_json_delta', 'partial_json': info['arguments_buffer']}})}\n\n"
                        
                block_idx = idx + 1
                yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': block_idx})}\n\n"
                
            # 6. message_delta
            stop_reason = "tool_use" if has_tool_calls else "end_turn"
            yield f"event: message_delta\ndata: {json.dumps({'type': 'message_delta', 'delta': {'stop_reason': stop_reason, 'stop_sequence': None}, 'usage': {'output_tokens': 0}})}\n\n"
            
            # 7. message_stop
            yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n"
            
        return StreamingResponse(event_generator(), media_type="text/event-stream")
        
    else:
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                headers = {
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                }
                response = await client.post(EVOMAP_URL, json=openai_payload, headers=headers)
                if response.status_code != 200:
                    logger.error(f"EvoMap error status: {response.status_code}, body: {response.text}")
                    return JSONResponse(
                        status_code=response.status_code,
                        content={
                            "type": "error",
                            "error": {
                                "type": "api_error",
                                "message": f"EvoMap API returned status {response.status_code}: {response.text}"
                            }
                        }
                    )
                    
                res_json = response.json()
                choices = res_json.get("choices", [])
                if not choices:
                    raise Exception("No choices returned in response")
                    
                choice = choices[0]
                message = choice.get("message", {})
                text_content = message.get("content") or ""
                tool_calls = message.get("tool_calls", [])
                
                content_blocks = []
                if text_content:
                    content_blocks.append({
                        "type": "text",
                        "text": text_content
                    })
                    
                if tool_calls:
                    for tc in tool_calls:
                        tc_id = tc.get("id") or f"toolu_{uuid.uuid4().hex[:8]}"
                        func = tc.get("function", {})
                        name = func.get("name")
                        args_str = func.get("arguments", "{}")
                        try:
                            args = json.loads(args_str)
                        except Exception:
                            args = args_str
                            
                        content_blocks.append({
                            "type": "tool_use",
                            "id": tc_id,
                            "name": name,
                            "input": args
                        })
                        
                response_data = {
                    "id": f"msg_{uuid.uuid4().hex}",
                    "type": "message",
                    "role": "assistant",
                    "content": content_blocks,
                    "model": model,
                    "stop_reason": "tool_use" if tool_calls else "end_turn",
                    "stop_sequence": None,
                    "usage": {
                        "input_tokens": 0,
                        "output_tokens": 0
                    }
                }
                return response_data
        except Exception as e:
            logger.error(f"Error in non-streaming request: {e}")
            return JSONResponse(
                status_code=500,
                content={
                    "type": "error",
                    "error": {
                        "type": "api_error",
                        "message": f"Proxy request error: {str(e)}"
                    }
                }
            )

if __name__ == "__main__":
    import uvicorn
    # Read port from env or default to 4000
    port = int(os.environ.get("PROXY_PORT", "4000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
