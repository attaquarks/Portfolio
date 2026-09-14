export type Project = {
  name: string;
  tag: string;
  description: string;
  stack: string[];
  url: string;
};

// Pulled from github.com/attaquarks — update as your pinned repos change.
//
// Each entry is a story, not an inventory: the problem that started it, what
// got built, and what it is like to use. The stack line stays short on purpose
// — the reader who wants the bill of materials can follow the link; the reader
// who doesn't should never have to wade through it.
export const projects: Project[] = [
  {
    name: 'AIA — Local Multi-Agent Assistant',
    tag: 'agentic systems',
    description:
      'I wanted the useful parts of a personal assistant without handing my life to someone else\'s cloud. So the business agent and the health agent run locally on Docker Compose, and a WhatsApp gateway puts the whole thing inside the app I already talk to — one command to start, and the data never leaves the machine.',
    stack: ['Python', 'FastAPI', 'Docker', 'Ollama'],
    url: 'https://github.com/attaquarks/ai-assistant-system',
  },
  {
    name: 'Supply Chain Intelligence Agent',
    tag: 'agentic + RAG',
    description:
      'Inventory decisions get made on spreadsheets and gut feel, and the reasoning behind them disappears with the person who left. This agent does the boring half of procurement — supplier intelligence, reorder-risk scoring, first-draft orders — on a LangGraph pipeline with guardrails and drift monitoring, because an agent that silently goes stale is worse than no agent at all.',
    stack: ['Python', 'LangGraph', 'RAG', 'ChromaDB'],
    url: 'https://github.com/attaquarks/Capstone',
  },
  {
    name: '3AM Talks — AI Therapy System',
    tag: 'applied NLP',
    description:
      'The hardest conversations are the ones there\'s nobody awake to have. 3AM Talks is a counseling companion built for exactly that hour: it adapts to personality, retrieves an actual therapeutic technique instead of guessing at one, and keeps persistent memory between sessions — so at 3AM you pick up where you left off, rather than explaining yourself from zero to something that has never met you.',
    stack: ['Python', 'RAG', 'Supabase', 'Pinecone'],
    url: 'https://github.com/attaquarks/3am-talks',
  },
  {
    name: 'NeuroReport',
    tag: 'medical AI',
    description:
      'Clinician time disappears into report-writing. This pipeline looks at an MRI and does the first pass — visual question answering over the scan, slice aggregation across the volume, and a drafted report from biomedical language models — so the radiologist sits down to something to correct rather than a blank page.',
    stack: ['Python', 'PyTorch', 'Transformers'],
    url: 'https://github.com/attaquarks/NeuroReport',
  },
  {
    name: 'SymptoLens',
    tag: 'full-stack AI',
    description:
      'Symptom checkers usually feel like a form that judges you. SymptoLens runs structured medical reasoning behind a React front end and an authenticated Express/Postgres backend, and the care shows up in the interface: it asks the way a careful interviewer would, and the reasoning is structured rather than arriving as a verdict from nowhere.',
    stack: ['TypeScript', 'React', 'Express', 'PostgreSQL'],
    url: 'https://github.com/attaquarks/SymptoLens',
  },
];
