# gemini-mcp

Gemini CLI 기반 Streamable HTTP MCP 서버입니다.

## 요구사항

- Node.js 18+
- Gemini CLI 설치 및 로그인

## 실행

```bash
cd /Users/iseungchan/Project/mcp/gemini-mcp
npm install
npm start
```

기본 주소:

- MCP endpoint: `http://127.0.0.1:8765/mcp`
- Health check: `http://127.0.0.1:8765/healthz`

## 환경 변수

- `PORT` (기본값: `8765`)
- `HOST` (기본값: `127.0.0.1`)
- `GEMINI_CLI_BIN` (기본값: `gemini`)

## 노출된 MCP Tool

- `gemini.generate`
  - 입력:
    - `prompt` (string, 필수)
    - `model` (string, 선택, 기본 `gemini-2.0-flash`)
    - `output_format` (`text` | `json`, 선택, 기본 `text`)

## OpenClaw 연동 예시

OpenClaw MCP 서버 설정에서 아래 endpoint를 사용하세요.

- URL: `http://127.0.0.1:8765/mcp`
- Transport: Streamable HTTP
