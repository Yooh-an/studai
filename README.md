# Studai

> PDF·EPUB 문서를 업로드하고, 텍스트를 선택해 AI에게 바로 질문할 수 있는 로컬 퍼스트 학습 도구입니다.

## Features

- PDF 뷰어 — 페이지 이동, 확대/축소, 마지막 페이지·배율 자동 복원
- EPUB 뷰어 — `react-reader` 기반 ebook 렌더링, 위치 자동 저장
- 텍스트 선택 → AI 질문 — 문서에서 텍스트를 드래그하면 *Ask AI* 팝업이 뜨고 바로 질문 전송
- 어노테이션 도구 — 펜·형광펜·밑줄·지우개, 6가지 색상, LocalStorage 영속 저장
- AI 채팅 패널 — provider/model 선택 UI, Markdown 렌더링, Codex 응답 표시
- Settings 화면 — 기본 provider, provider 상태 확인, 채팅 글자 크기 조절
- 문서 캐시 — 파일명·크기·수정일 기반 캐시 키로 어노테이션·채팅 히스토리 유지

## Architecture

Studai는 이제 **Next.js App Router** 기반입니다.
브라우저는 별도 `localhost:8787` 브릿지를 직접 호출하지 않고, 앱 내부 same-origin API를 호출합니다.

```text
Browser UI
  -> /api/chat
  -> Next.js route handler
  -> Codex CLI
```

주요 API:

- `POST /api/chat`
- `GET /api/models`
- `GET /api/providers/status`
- `POST /api/providers/validate`

## Tech Stack

| 영역 | 라이브러리 |
|------|-----------|
| UI | React 19, Tailwind CSS v4 |
| 앱 프레임워크 | Next.js 16, TypeScript |
| PDF | `react-pdf`, `pdfjs-dist` |
| EPUB | `epubjs`, `react-reader` |
| AI | Next.js Route Handlers + local Codex CLI |
| 애니메이션 | `framer-motion` |
| Markdown | `react-markdown`, `remark-gfm` |

## Requirements

- Node.js 20+
- Codex CLI installed locally
- Codex CLI login already completed on this machine

## Installation

```bash
git clone https://github.com/<your-handle>/studai.git
cd studai
npm install
```

## Run

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Build

```bash
npm run build
npm run start
```

## Settings / Provider checks

Settings 화면에서는 별도 bridge URL을 입력하지 않습니다.
앱이 same-origin `/api/*` 를 통해 로컬 Codex runtime을 직접 확인합니다.

확인 항목:

- provider 상태 조회
- 모델 목록 조회
- `Reply with exactly OK.` 검증 호출

## Project Structure

```text
studai/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── chat/route.ts
│   │       ├── models/route.ts
│   │       └── providers/
│   │           ├── status/route.ts
│   │           └── validate/route.ts
│   ├── components/
│   │   ├── Auth.tsx
│   │   ├── MainLayout.tsx
│   │   ├── Uploader.tsx
│   │   ├── PdfViewer.tsx
│   │   ├── EpubViewer.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── SettingsPage.tsx
│   │   └── AskAIPopup.tsx
│   ├── context/
│   │   └── AppContext.tsx
│   └── lib/
│       ├── aiClient.ts
│       ├── chatApi.ts
│       ├── server/
│       │   ├── codex.ts
│       │   └── providers.ts
│       ├── chatPreferences.ts
│       ├── providerPreferences.ts
│       ├── documentCache.ts
│       ├── pdfAnnotations.ts
│       └── fileUtils.ts
├── next.config.ts
├── postcss.config.mjs
├── package.json
└── README.md
```

## Scripts

| 명령 | 설명 |
|------|------|
| `npm run dev` | Next.js 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 실행 |
| `npm run lint` | TypeScript 타입 체크 |
| `npm test` | 유닛 테스트 실행 |

## Notes

- Claude Code provider 선택지는 UI에 남아 있지만 아직 실제 runtime 구현은 포함되지 않았습니다.
- 기존 `server/` 브릿지 파일들은 레거시 참고용으로 남아 있을 수 있으나, 현재 런타임은 `src/app/api/*` 를 사용합니다.

## License

Apache-2.0
