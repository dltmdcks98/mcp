# antigravity-mcp

단일 포트에서 2개 MCP 엔드포인트를 제공하는 Gemini CLI 기반 서버입니다.

- `gemini-mcp` → `/mcp/gemini`
- `antigravity-mcp` → `/mcp/antigravity`

## 요구사항

- Node.js 18+
- Gemini CLI 설치 및 로그인

## 실행

```bash
cd /Users/iseungchan/Project/mcp/antigravity-mcp
npm install
PORT=8765 npm start
```

기본 주소:

- Gemini MCP endpoint: `http://127.0.0.1:8765/mcp/gemini`
- Antigravity MCP endpoint: `http://127.0.0.1:8765/mcp/antigravity`
- Health check: `http://127.0.0.1:8765/healthz`

## 환경 변수

- `PORT` (기본값: `8765`)
- `HOST` (기본값: `127.0.0.1`)
- `GEMINI_CLI_BIN` (기본값: `gemini`)
- `GEMINI_DEFAULT_MODEL` (기본값: `auto`)
- `ANTIGRAVITY_DEFAULT_MODEL` (기본값: `auto`)

## 노출된 MCP Tool

양쪽 엔드포인트 모두 아래 툴 제공:

- `gemini.generate`
  - 입력:
    - `prompt` (string, 필수)
    - `model` (string, 선택)
    - `output_format` (`text` | `json`, 선택, 기본 `text`)

## OpenClaw 연동 예시

`/Users/iseungchan/.openclaw/workspace/config/mcporter.json`

```json
{
  "mcpServers": {
    "gemini-mcp": { "baseUrl": "http://127.0.0.1:8765/mcp/gemini" },
    "antigravity-mcp": { "baseUrl": "http://127.0.0.1:8765/mcp/antigravity" }
  }
}
```
