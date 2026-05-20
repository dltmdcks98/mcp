# postgres-admin-mcp

Hermes에서 NAS PostgreSQL을 관리하기 위한 로컬 stdio MCP 서버입니다.

## 기능

- `health`: 연결 대상 DB/사용자/서버 확인
- `execute_sql`: 임의 SQL 실행 (`$1`, `$2` 파라미터 지원)
- `list_databases`: 데이터베이스 목록
- `list_roles`: 역할/사용자 목록
- `list_schemas`: 현재 DB 스키마 목록
- `list_tables`: 현재 DB 테이블/뷰 목록
- `select_rows`: 테이블 행 조회
- `create_database`: 데이터베이스 생성
- `create_user`: 로그인 역할/사용자 생성

## 환경 변수

우선순위:

1. `DATABASE_URI`
2. `POSTGRES_URL`
3. `POSTGRES_CONNECTION_STRING`
4. 개별 `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`

NAS PostgreSQL 기본 후보:

```yaml
PGHOST: 192.168.50.20
PGPORT: "25432"
PGUSER: postgres
PGDATABASE: postgres
# PGPASSWORD는 민감정보이므로 Hermes config/env에 직접 입력하거나 별도 secret 관리
```

## 설치

```bash
npm install
npm test
```

## Hermes 등록 예시

```yaml
mcp_servers:
  postgres:
    command: node
    args:
      - /Users/iseungchan/Project/mcp/postgres-admin-mcp/server.mjs
    env:
      PGHOST: 192.168.50.20
      PGPORT: "25432"
      PGUSER: postgres
      PGDATABASE: postgres
      PGPASSWORD: "[REDACTED]"
    timeout: 120
    connect_timeout: 30
    enabled: true
```
