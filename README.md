# Studai

Studai is a local-first study workspace for reading PDF and EPUB documents, annotating them, and asking AI questions about selected text or the document itself.

## Highlights

- **PDF reader** with page navigation, zoom controls, annotations, and restored reading state
- **EPUB reader** powered by `react-reader` with saved reading position
- **Document-aware AI chat** that can answer natural-language PDF questions like current page, specific pages, and short page ranges
- **Page-image fallback for scan PDFs** so figure/table questions can still use the currently viewed page image when extractable text is sparse
- **Ask AI from selection** via an inline popup when text is highlighted
- **Annotation tools** including pen, highlighter, underline, eraser, and color presets
- **AI chat panel** with provider/model selection and Markdown responses
- **Background PDF indexing** optimized to sample scan-heavy documents instead of eagerly indexing every page
- **Settings page** for provider validation and chat font-size preferences
- **Local document cache** that preserves annotations, chat history, and reading state by file identity

## Architecture

Studai is built with **Next.js App Router**.

The UI uses built-in application API routes for chat, model discovery, and provider checks, while server-side route handlers invoke the local AI runtime. For PDF chat, the client builds document context from page text and, when needed, rendered page images before sending the user’s original request to the server runtime.

### API surface

- `POST /api/chat`
- `GET /api/models`
- `GET /api/providers/status`
- `POST /api/providers/validate`

## Tech Stack

| Area | Tools |
| --- | --- |
| App framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| PDF | `react-pdf`, `pdfjs-dist` |
| EPUB | `epubjs`, `react-reader` |
| AI runtime | Next.js Route Handlers + local Codex CLI |
| Motion | `framer-motion` |
| Markdown | `react-markdown`, `remark-gfm` |

## Requirements

- Node.js 20 or newer
- Codex CLI installed locally
- Codex CLI already authenticated on the machine

## Getting Started

```bash
git clone https://github.com/Yooh-an/studai.git
cd studai
npm install
```

## Development

Start the app locally:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Production

Build and run the production server:

```bash
npm run build
npm run start
```

## PDF Chat Behavior

Studai's PDF chat flow is document-aware:

- natural-language requests such as `현재 페이지 설명해줘`, `15페이지 요약해줘`, or `10~12페이지 핵심 정리해줘` are resolved against the open PDF
- figure/table references without explicit page wording prefer the **currently viewed page** first
- text PDFs use extracted page text as primary evidence
- scan-heavy PDFs can attach rendered page images to the model when text extraction is weak
- background indexing samples the first pages to detect image-heavy PDFs and avoids unnecessary full-text indexing for large scan documents

Current limitations:

- chapter/section-level understanding is not indexed yet
- broad whole-document requests on scan PDFs still depend on page-local context more than full-document retrieval

## AI Provider Setup

Studai currently integrates with **Codex** through server-side runtime handlers.

From the **Settings** page you can:

- check provider availability
- validate the current provider connection
- save the default provider for new chats
- adjust chat font size

> Note: **Claude Code** still appears in the UI, but its runtime is not implemented in the current version.

## Project Structure

```text
studai/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts
│   │   │   ├── models/route.ts
│   │   │   └── providers/
│   │   │       ├── status/route.ts
│   │   │       └── validate/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── AppShell.tsx
│   │   ├── AskAIPopup.tsx
│   │   ├── Auth.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── EpubViewer.tsx
│   │   ├── MainLayout.tsx
│   │   ├── PdfViewer.tsx
│   │   ├── SettingsPage.tsx
│   │   └── Uploader.tsx
│   ├── context/
│   │   └── AppContext.tsx
│   ├── lib/
│   │   ├── aiClient.ts
│   │   ├── chatApi.ts
│   │   ├── chatPreferences.ts
│   │   ├── documentCache.ts
│   │   ├── fileUtils.ts
│   │   ├── pdfAnnotations.ts
│   │   ├── pdfImages.ts
│   │   ├── pdfPageRequests.ts
│   │   ├── pdfQueryPlanner.ts
│   │   ├── pdfText.ts
│   │   ├── pdfTextHeuristics.ts
│   │   ├── providerPreferences.ts
│   │   └── server/
│   │       ├── codex.ts
│   │       └── providers.ts
│   ├── types/
│   │   └── ai.ts
│   └── App.tsx
├── next.config.ts
├── postcss.config.mjs
├── package.json
└── README.md
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Build the production app |
| `npm run start` | Start the production server |
| `npm run clean` | Remove generated build output |
| `npm run lint` | Run TypeScript type checking |
| `npm test` | Run unit tests |

## License

Apache-2.0
