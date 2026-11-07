/**
 * DEMO MODE ONLY. Pre-written answers so the UI can be shown before the RAG backend is connected.
 * All numbers here are illustrative (not from the organizers' documents). Replace with the real API.
 */
import { normalizeAr } from './arabic';
import type { AskResponse, ChatTurn, Source } from './types';

const GUIDE = { file: 'student_guide_2025.pdf', title: 'دليل الطالب 2025', doc: 0 as const, year: 2025 };
const GUIDE_OLD = { file: 'student_guide_2023.pdf', title: 'دليل الطالب 2023', doc: 0 as const, year: 2023 };
const REGS = { file: 'study_exam_regulations.pdf', title: 'لوائح الدراسة والامتحانات', doc: 1 as const };
const PLAN = { file: 'study_plan_computer_eng.pdf', title: 'الخطة الدراسية · هندسة الحاسوب', doc: 2 as const };

type Doc = typeof GUIDE | typeof GUIDE_OLD | typeof REGS | typeof PLAN;
const src = (d: Doc, page: number, section: string, snippet: string, version?: 'new' | 'old'): Omit<Source, 'n'> => ({
  file: d.file, title: d.title, doc: d.doc, page, section, snippet, version,
  year: 'year' in d ? d.year : undefined,
});

type Entry = {
  id: string;
  any: string[];            // at least one must appear
  all?: string[];           // all must appear
  answer: string;
  sources: Omit<Source, 'n'>[];
  note?: string;
  followUp?: { answer: string; sources: Omit<Source, 'n'>[] };
};

const KB: Entry[] = [
  {
    id: 'attendance',
    any: ['حضور', 'غياب', 'غبت', 'غايب', 'حرمان', 'محاضرات'],
    answer:
      'الحد الأدنى للحضور **85%** من محاضرات المادة [1].\nإذا زاد غيابك عن **15%** بدون عذر مقبول، بتنحرم من المادة وبتنسجّل علامتك **صفر** [1].\nإذا الغياب بعذر طبي مقبول، بتنسجّل المادة **منسحب** بدل الحرمان [2].',
    sources: [
      src(REGS, 7, 'المادة (11): المواظبة', 'يجب ألا تقل نسبة حضور الطالب عن 85% من مجموع الساعات المقررة للمادة، وإذا تجاوز الغياب 15% دون عذر يقبله العميد يحرم الطالب من المادة وتعتبر علامته صفراً.'),
      src(GUIDE, 18, 'الغياب بعذر', 'إذا كان الغياب بعذر مرضي أو قهري يقبله العميد، يعتبر الطالب منسحباً من المادة.'),
    ],
  },
  {
    id: 'withdraw',
    any: ['سحب', 'انسحاب', 'اسحب', 'انسحب'],
    answer:
      'بتقدر تنسحب من المادة لحد نهاية **الأسبوع الثاني عشر** من الفصل [1]، بشرط ما تقل ساعاتك المسجّلة عن **12 ساعة** [1].\nالمادة بتنسجّل برمز **W** بكشف العلامات وما بتأثر على معدلك [1].',
    note: 'لقيت نسختين: دليل 2023 كان بيحكي الأسبوع العاشر [2]. اعتمدت النسخة الأحدث (2025).',
    sources: [
      src(GUIDE, 23, 'المادة (14): الانسحاب من المواد', 'يجوز للطالب الانسحاب من مادة أو أكثر حتى نهاية الأسبوع الثاني عشر من الفصل على ألا يقل عبؤه عن 12 ساعة معتمدة، ويرصد له (W).', 'new'),
      src(GUIDE_OLD, 19, 'المادة (14): الانسحاب من المواد', 'يجوز للطالب الانسحاب من مادة أو أكثر حتى نهاية الأسبوع العاشر من الفصل.', 'old'),
    ],
  },
  {
    id: 'course-hours',
    any: ['ساعه', 'ساعات', 'معتمده', 'متطلب'],
    all: ['برمج'],
    answer:
      'مادة **البرمجة المتقدمة (CE212)** إلها **3 ساعات معتمدة**: ساعتين نظري وساعة عملي [1].\nمتطلبها السابق **CE111 مقدمة في البرمجة** [1].',
    sources: [
      src(PLAN, 4, 'جدول مواد التخصص الإجبارية', 'رمز المادة: CE212 | اسم المادة: البرمجة المتقدمة | الساعات المعتمدة: 3 | نظري: 2 | عملي: 1 | المتطلب السابق: CE111'),
    ],
  },
  {
    id: 'load',
    any: ['معدل', 'معدلي', 'عبء', 'كم ساعه اسجل', 'بقدر اسجل'],
    answer:
      'معدلك **2.1** أقل من **2.5**، فبتنطبق عليك قاعدة العبء المخفّض: أقصى إشي **15 ساعة** بالفصل [1].\nالعبء العادي لطالب السنة الثالثة **18 ساعة** [2]، بس قاعدة المعدل بتتقدّم عليه [1].\n\nيعني الجواب: **15 ساعة كحد أقصى**.',
    sources: [
      src(REGS, 5, 'المادة (9): العبء الدراسي', 'لا يجوز للطالب الذي يقل معدله التراكمي عن 2.5 أن يسجل أكثر من 15 ساعة معتمدة في الفصل الواحد.'),
      src(GUIDE, 12, 'التسجيل والعبء الدراسي', 'العبء الدراسي العادي للطالب 18 ساعة معتمدة في الفصل الدراسي الأول والثاني.'),
    ],
    followUp: {
      answer:
        'إذا معدلك **2.5 أو أعلى**، بترجع للعبء العادي **18 ساعة** [2].\nوإذا معدلك **3.5 وفوق**، بتقدر تسجّل لحد **21 ساعة** بموافقة المرشد الأكاديمي [1].',
      sources: [
        src(REGS, 5, 'المادة (9): العبء الدراسي', 'يجوز للطالب الذي لا يقل معدله التراكمي عن 3.5 أن يسجل حتى 21 ساعة معتمدة بموافقة المرشد الأكاديمي.'),
        src(GUIDE, 12, 'التسجيل والعبء الدراسي', 'العبء الدراسي العادي للطالب 18 ساعة معتمدة في الفصل الدراسي الأول والثاني.'),
      ],
    },
  },
  {
    id: 'first-semester',
    any: ['اول فصل', 'سنه اولي', 'كم ماده', 'اختار موادي', 'سنه اولى'],
    answer:
      'طالب السنة الأولى بيسجّل بأول فصل **15 لـ 17 ساعة**، يعني تقريباً **5 لـ 6 مواد** [1].\nالخطة الدراسية بتقترح لأول فصل [2]:\n1. **MATH101** تفاضل وتكامل 1\n2. **PHYS101** فيزياء عامة 1\n3. **CE111** مقدمة في البرمجة\n4. **ARAB101** لغة عربية\n5. **ENG101** لغة إنجليزية',
    sources: [
      src(GUIDE, 11, 'تسجيل الطلبة الجدد', 'يسجل الطالب المستجد في فصله الأول ما بين 15 و17 ساعة معتمدة حسب الخطة الاسترشادية.'),
      src(PLAN, 2, 'الخطة الاسترشادية · السنة الأولى', 'الفصل الأول: MATH101 | PHYS101 | CE111 | ARAB101 | ENG101'),
    ],
  },
  {
    id: 'failed',
    any: ['رسبت', 'رسوب', 'راسب', 'سقطت'],
    answer:
      'إذا المادة اللي رسبت فيها **متطلب سابق** لمادة تانية، ما بتقدر تسجّل المادة اللي بعدها لحد ما تنجح فيها [1].\nمثلاً **CE211** متطلب سابق لـ **CE311** [2].\nبتقدر تعيد المادة، وبتنحسب **العلامة الأعلى** بمعدلك [1].',
    sources: [
      src(REGS, 9, 'المادة (16): إعادة المواد', 'لا يجوز تسجيل مادة قبل النجاح في متطلبها السابق. وللطالب إعادة المادة التي رسب فيها وتحتسب العلامة الأعلى.'),
      src(PLAN, 5, 'جدول المتطلبات السابقة', 'رمز المادة: CE311 | اسم المادة: تصميم الأنظمة الرقمية | المتطلب السابق: CE211'),
    ],
  },
  {
    id: 'graduation',
    any: ['اتخرج', 'تخرج', 'التخرج', 'بقي لي', 'ضل لي'],
    answer:
      'عشان تتخرج لازم تكمّل 3 شروط:\n1. تنجح بـ **160 ساعة معتمدة** حسب خطتك [1].\n2. معدلك التراكمي ما يقل عن **2.0** [2].\n3. تخلص **التدريب الميداني** [1].\nالساعات موزعة: 21 متطلبات جامعة، 30 متطلبات كلية، 94 تخصص، و15 اختياري [1].',
    sources: [
      src(PLAN, 1, 'توزيع الساعات المعتمدة', 'متطلبات الجامعة: 21 | متطلبات الكلية: 30 | متطلبات التخصص: 94 | مواد اختيارية: 15 | المجموع: 160 | التدريب الميداني: إجباري'),
      src(GUIDE, 30, 'شروط التخرج', 'يمنح الطالب الدرجة عند إتمام متطلبات الخطة بنجاح بمعدل تراكمي لا يقل عن 2.0.'),
    ],
  },
];

const OUT_OF_SCOPE = ['قصيده', 'شعر', 'نكته', 'طقس', 'دوري', 'ماتش', 'اغنيه', 'طبخ', 'وصفه'];

const REFUSE_NOT_FOUND =
  'ما لقيت هالمعلومة بالمستندات المتاحة إلي.\nالأفضل تراجع **دائرة القبول والتسجيل** أو جدول الامتحانات الرسمي.';
const REFUSE_SCOPE =
  'عذراً، أنا مرشد أكاديمي وبجاوب بس عن **لوائح الجامعة ودليل الطالب والخطط الدراسية**.\nجرّب تسألني عن التسجيل، الغياب، الانسحاب، أو متطلبات التخرج.';

function match(q: string): Entry | null {
  let best: Entry | null = null;
  let bestScore = 0;
  for (const e of KB) {
    if (e.all && !e.all.every((k) => q.includes(normalizeAr(k)))) continue;
    const score = e.any.filter((k) => q.includes(normalizeAr(k))).length + (e.all ? 2 : 0);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return bestScore > 0 ? best : null;
}

function isFollowUp(q: string) {
  return q.startsWith('و') && q.length < 45 && /(هيك|ذلك|اعلي|اعلى|اقل|طيب|بعدها)/.test(q);
}

function withScores(list: Omit<Source, 'n'>[]): Source[] {
  return list.map((s, i) => ({
    ...s,
    n: i + 1,
    scores: {
      bm25: +(0.93 - i * 0.17 - (s.version === 'old' ? 0.08 : 0)).toFixed(2),
      vector: +(0.89 - i * 0.11).toFixed(2),
      rrf: +(1 - i * 0.22).toFixed(2),
    },
  }));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockAsk(question: string, history: ChatTurn[]): Promise<AskResponse> {
  const t0 = performance.now();
  await wait(700 + Math.random() * 600);
  const q = normalizeAr(question);
  const done = (r: Omit<AskResponse, 'latencyMs' | 'model'>): AskResponse => ({
    ...r, latencyMs: Math.round(performance.now() - t0), model: 'وضع تجريبي · بدون LLM',
  });

  if (isFollowUp(q)) {
    const lastUser = [...history].reverse().find((t) => t.role === 'user');
    const prev = lastUser ? match(normalizeAr(lastUser.content)) : null;
    if (prev?.followUp) {
      return done({ answer: prev.followUp.answer, sources: withScores(prev.followUp.sources), refused: false,
        note: 'فهمت إنه سؤالك متابعة للسؤال اللي قبله.' });
    }
  }

  if (OUT_OF_SCOPE.some((k) => q.includes(k))) {
    return done({ answer: REFUSE_SCOPE, sources: [], refused: true, refusalKind: 'out_of_scope' });
  }
  const e = match(q);
  if (!e) return done({ answer: REFUSE_NOT_FOUND, sources: [], refused: true, refusalKind: 'not_found' });
  return done({ answer: e.answer, sources: withScores(e.sources), refused: false, note: e.note });
}

/** Starter questions shown to the student (each one also covers a question type from the organizers' guide). */
export const SUGGESTIONS: { ic: string; type: string; q: string }[] = [
  { ic: '⏰', type: 'الغياب', q: 'شو بصير إذا غبت أكثر من المسموح؟' },
  { ic: '📝', type: 'التسجيل', q: 'معدلي 2.1 وأنا بسنة ثالثة، كم ساعة بقدر أسجل؟' },
  { ic: '↩️', type: 'الانسحاب', q: 'لإمتى بقدر أنسحب من مادة؟' },
  { ic: '📚', type: 'المواد', q: 'كم ساعة معتمدة لمادة البرمجة المتقدمة؟' },
  { ic: '🔁', type: 'الرسوب', q: 'رسبت بمادة، هل بتأثر على تسجيلي للمادة اللي بعدها؟' },
  { ic: '🎓', type: 'التخرّج', q: 'شو بقي لي عشان أتخرج؟' },
];
