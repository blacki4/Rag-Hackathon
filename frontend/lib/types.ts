/** The contract between this frontend and the Python RAG API (backend/api.py). */

export type Source = {
  n: number;               // citation number, the [n] in the answer
  file: string;            // e.g. student_guide_2025.pdf
  title: string;           // human title, e.g. "دليل الطالب 2025"
  page: number;
  section?: string;        // e.g. "المادة (14): السحب"
  snippet: string;         // the chunk text the answer is based on
  doc: 0 | 1 | 2;          // 0 = دليل الطالب, 1 = اللوائح, 2 = الخطط الدراسية (colour in the UI)
  version?: 'new' | 'old'; // only when two versions of the same section were retrieved
  year?: number;
  scores?: { bm25: number; vector: number; rrf: number }; // 0..1, for the evidence panel
};

export type RefusalKind = 'not_found' | 'out_of_scope' | 'error';

export type AskResponse = {
  answer: string;          // may contain **bold**, [n] citations and "\n" line breaks
  sources: Source[];
  refused: boolean;
  refusalKind?: RefusalKind;
  note?: string;           // e.g. "النسخة القديمة كانت بتحكي..."
  latencyMs: number;
  model?: string;
  cached?: boolean;        // answered from the backend cache (no LLM call)
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: AskResponse;
  pending?: boolean;
  fresh?: boolean;         // animate the reveal once
};
