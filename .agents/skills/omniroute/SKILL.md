---
name: omniroute
description: >-
  Universal AI Gateway for routing, token compression, multi-provider auto-fallback (290+ providers, 90+ free), and MCP tool integrations in Antigravity. Use when managing AI models, setting up local/remote proxy endpoints, or optimizing token usage.
---

# OmniRoute AI Gateway Integration for Antigravity

OmniRoute is a universal local/remote AI gateway that provides unified OpenAI-compatible routing (`http://localhost:20128/v1`) across 290+ AI providers (Claude, GPT-4o, Gemini, DeepSeek, GLM, Kimi, MiniMax, Qwen, Ollama, etc.) with automatic fallback, RTK + Caveman compression (15–95% token savings), and MCP tools.

## Quick Commands
- **Start Gateway**: `omniroute` (starts local server on port 20128)
- **Web UI & Free-Tier Dashboard**: `http://localhost:20128`
- **OpenAI Compatible Endpoint**: `http://localhost:20128/v1`

## Key Capabilities
1. **Zero-Config Routing (`auto`)**:
   - `model: "auto"`: Automatic scoring and fallback across available providers.
   - `model: "auto/coding"`: Coding-optimized provider selection.
   - `model: "auto/cheap"` / `model: "auto/fast"`: Budget and latency optimization.
2. **Token Compression**:
   - Built-in RTK + Caveman compression layers reducing token overhead by up to 95%.
3. **19 Fallback & Combo Strategies**:
   - `priority`, `round-robin`, `cost-optimized`, `context-relay`, `lkgp` (last-known-good-provider), `fusion`.
4. **Antigravity & Tool Compatibility**:
   - Works as an upstream provider for Antigravity, Claude Code, Cursor, Cline, OpenCode, and Continue.
