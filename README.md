# ✦ Moralta Claude

A powerful **CLI AI coding assistant** — a full-featured Claude Code clone that works with any API key, base URL, and model ID.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Features

| Feature | Description |
|---|---|
| 🤖 **Agentic Tool Use** | Reads, writes, edits files, runs shell commands, searches codebases |
| 🌊 **Streaming Responses** | Real-time token-by-token streaming with formatted output |
| 🔑 **Custom API Config** | Use any API key, base URL, and model ID |
| 🔌 **Dual API Format** | Supports both **Anthropic** and **OpenAI-compatible** APIs |
| ⚡ **Tool Approval** | Approve/reject each tool call, or enable auto-approve |
| 💰 **Cost Tracking** | Per-turn and session-wide token & cost tracking |
| 📝 **Slash Commands** | 11 built-in commands (`/help`, `/clear`, `/model`, etc.) |
| 🗜️ **Context Compaction** | Compact old conversation turns to stay within context limits |
| 💾 **Session Persistence** | Conversation history saved to disk automatically |
| 🎨 **Rich Terminal UI** | Formatted headings, code blocks, lists with colour theming |
| 📤 **Multi-line Input** | End a line with `\` for multi-line prompts |

---

## Quick Start

```bash
# 1 — Install dependencies
cd "CLI AI Chatbot"
npm install

# 2 — Run
npm start
#   — or directly —
node bin/moralta.js
```

On first run, a **setup wizard** walks you through:
1. **API format** — Anthropic or OpenAI-compatible
2. **API Key**
3. **Base URL** (e.g. `https://api.anthropic.com`, `https://openrouter.ai/api`)
4. **Model ID** (e.g. `claude-sonnet-4-20250514`)

Configuration is stored at `~/.moralta-claude/config.json`.

---

## Configuration

### Interactive

```
/config                      # view all settings
/config model gpt-4o         # change a setting
/model claude-sonnet-4-20250514  # shortcut for model
```

### Environment Variables

Create a `.env` file (see `.env.example`):

```env
MORALTA_API_KEY=sk-ant-...
MORALTA_BASE_URL=https://api.anthropic.com
MORALTA_MODEL=claude-sonnet-4-20250514
MORALTA_API_FORMAT=anthropic
```

Environment variables **override** the config file.

---

## Supported API Formats

### Anthropic (default)
Use with the official Anthropic API or any Anthropic-compatible proxy.

```
Base URL:  https://api.anthropic.com
Model:     claude-sonnet-4-20250514
```

### OpenAI-compatible
Use with OpenRouter, LM Studio, Ollama, vLLM, Together AI, Groq, etc.

```
Base URL:  https://openrouter.ai/api
Model:     anthropic/claude-sonnet-4-20250514
```

---

## Tools

Moralta Claude can use these tools autonomously (with your approval):

| Tool | What it does |
|---|---|
| `read_file` | Read file contents with line numbers |
| `write_file` | Create or overwrite files |
| `edit_file` | Find-and-replace targeted edits |
| `run_command` | Execute shell commands |
| `search_files` | Regex search across files |
| `list_directory` | List directory structure |

### Approval Modes

When a tool call is proposed:
- **`y`** / **Enter** — approve this call
- **`n`** — reject this call
- **`a`** — approve this and auto-approve all future calls

Toggle auto-approve any time with `/auto`.

---

## Slash Commands

| Command | Action |
|---|---|
| `/help` | Show help |
| `/clear` | Clear conversation |
| `/compact` | Compact old turns to save context |
| `/config` | View/set configuration |
| `/model` | View/change model |
| `/cost` | Show token usage & cost |
| `/auto` | Toggle auto-approve |
| `/system` | View/set system prompt |
| `/history` | Show conversation summary |
| `/reset` | Reset config to defaults |
| `/exit` | Exit |

---

## Project Structure

```
CLI AI Chatbot/
├── bin/
│   └── moralta.js        # Entry point
├── src/
│   ├── index.js          # Main REPL + agentic loop
│   ├── config.js         # Configuration manager
│   ├── api.js            # Streaming API client (Anthropic + OpenAI)
│   ├── tools.js          # Tool definitions & implementations
│   ├── ui.js             # Terminal rendering & StreamRenderer
│   ├── commands.js       # Slash command registry
│   └── history.js        # Conversation history manager
├── .env.example
├── package.json
└── README.md
```

---

## License

MIT
