# Frontend: المرشد الأكاديمي الذكي

Next.js 15 + React 19 + three.js (React Three Fiber) + framer-motion. Arabic RTL.

## Pages
- `/`: scroll-driven 3D story of the RAG pipeline. Document pages → chunks → vector space → a question retrieves the top 4 chunks → the LLM context around the core. Scrolling to the end enters the chat.
- `/chat`: the chat UI, with a live 3D vector space in the background. It reacts while the system is thinking, when it answers (the retrieved points light up), and when it refuses (a red ring). The evidence panel shows each source chunk: document, page, section, old or newest version, and the BM25 / Vector / RRF scores. Conversations are saved in the browser.

## Run
```bash
npm install
npm run dev        # http://localhost:3000
```

## Connecting the RAG
- With `NEXT_PUBLIC_RAG_API_URL` empty, the app runs in **demo mode**: pre-written answers from `lib/mock.ts`. Those numbers are illustrative.
- To connect the real backend, copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_RAG_API_URL=http://localhost:8000`. The backend is `../backend/api.py` (FastAPI).
- The contract lives in `lib/types.ts`: `POST /ask {question, history}` → `AskResponse`.
- `lib/api.ts` is the only file that calls the backend. On an error, the user sees «النظام عليه ضغط هلأ، جرّب كمان شوي».
