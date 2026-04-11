# Studai

Studai is a local-first study workspace for reading PDF and EPUB documents, annotating them, and asking AI questions directly from selected text.

## Highlights

- **PDF reader** with page navigation, zoom controls, and restored reading state
- **EPUB reader** powered by `react-reader` with saved reading position
- **Ask AI from selection** via an inline popup when text is highlighted
- **Annotation tools** including pen, highlighter, underline, eraser, and color presets
- **AI chat panel** with provider/model selection and Markdown responses
- **Settings page** for provider validation and chat font-size preferences
- **Local document cache** that preserves annotations and chat history by file identity

## Architecture

Studai is built with **Next.js App Router**.

The UI uses built-in application API routes for chat, model discovery, and provider checks, while server-side route handlers invoke the local AI runtime.

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
