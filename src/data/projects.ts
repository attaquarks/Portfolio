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
// got built, and what it is like to use. Five or six lines, so a card can be
// read without scrolling inside it.
//
// The stack line is checked against the repository that actually backs each
// entry — the manifests in the repo, not a plausible-sounding list — because it
// is the shortest proof that the sentence above it is true. Tools the
// description already names are left out of it rather than printed twice.
export const projects: Project[] = [
  {
    name: 'AIA — Local Multi-Agent Assistant',
    tag: 'agentic systems',
    description:
      'A personal assistant that never leaves your machine: a business agent and a health agent on Docker Compose, reachable through the WhatsApp window you already have open. One command starts it all, local models included.',
    stack: ['Python', 'FastAPI', 'LangGraph', 'Postgres + pgvector', 'Docker'],
    url: 'https://github.com/attaquarks/ai-assistant-system',
  },
  {
    name: 'Supply Chain Intelligence Agent',
    tag: 'agentic + RAG',
    description:
      'Procurement runs on spreadsheets and gut feel, and the reasoning behind a reorder leaves with whoever made it. The agent does the boring half: supplier intelligence, reorder-risk scoring, first-draft orders — with guardrails and drift monitoring.',
    stack: ['Python', 'LangGraph', 'ChromaDB', 'FastAPI', 'Streamlit'],
    url: 'https://github.com/attaquarks/Capstone',
  },
  {
    name: '3AM Talks — AI Therapy System',
    tag: 'applied NLP',
    description:
      'A counseling companion for the hours when nobody else is awake. It reads personality from how you talk, retrieves a real therapeutic technique instead of improvising one, and remembers the last session — so you continue, not start over.',
    stack: ['Python', 'PyTorch', 'Transformers', 'Pinecone', 'Supabase'],
    url: 'https://github.com/attaquarks/3am-talks',
  },
  {
    name: 'NeuroReport',
    tag: 'medical AI',
    description:
      'Clinician time disappears into report writing. This pipeline takes an MRI and does the first pass — a vision transformer per slice, a biomedical language model drafting the report — so the radiologist corrects a draft, not a blank page.',
    stack: ['Python', 'PyTorch', 'PyTorch Lightning', 'Transformers', 'QLoRA'],
    url: 'https://github.com/attaquarks/NeuroReport',
  },
  {
    name: 'SymptoLens',
    tag: 'full-stack AI',
    description:
      'Symptom checkers feel like a form that judges you. SymptoLens puts a medical knowledge base and a reasoning engine behind React, Express and Postgres, so it asks the way a clinician would and says what to do next.',
    stack: ['TypeScript', 'React', 'Express', 'PostgreSQL', 'Gemini API'],
    url: 'https://github.com/attaquarks/SymptoLens',
  },
];
