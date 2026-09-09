export type Project = {
  name: string;
  tag: string;
  description: string;
  stack: string[];
  url: string;
};

// Pulled from github.com/attaquarks — update as your pinned repos change.
export const projects: Project[] = [
  {
    name: 'AIA — Local Multi-Agent Assistant',
    tag: 'agentic systems',
    description:
      'Local-first personal assistant with independent business and health agents, running on Docker Compose with a WhatsApp gateway.',
    stack: ['Python', 'FastAPI', 'Docker', 'Ollama', 'Redis', 'PostgreSQL'],
    url: 'https://github.com/attaquarks/ai-assistant-system',
  },
  {
    name: 'Supply Chain Intelligence Agent',
    tag: 'agentic + RAG',
    description:
      'Industrial agentic system built with LangGraph for inventory analysis, supplier intelligence, reorder-risk scoring, and procurement drafting, with guardrails and drift monitoring.',
    stack: ['Python', 'LangGraph', 'RAG', 'FastAPI', 'Streamlit', 'ChromaDB'],
    url: 'https://github.com/attaquarks/Capstone',
  },
  {
    name: '3AM Talks — AI Therapy System',
    tag: 'applied NLP',
    description:
      'AI-powered counseling system using personality-aware responses, RAG over therapeutic technique retrieval, and persistent conversation memory.',
    stack: ['Python', 'RAG', 'Supabase', 'Pinecone', 'Ollama'],
    url: 'https://github.com/attaquarks/3am-talks',
  },
  {
    name: 'NeuroReport',
    tag: 'medical AI',
    description:
      'Medical imaging VQA and report-generation pipeline for MRI scans — vision encoders, slice aggregation, and biomedical language models.',
    stack: ['Python', 'PyTorch', 'Transformers', 'VQA'],
    url: 'https://github.com/attaquarks/NeuroReport',
  },
  {
    name: 'SymptoLens',
    tag: 'full-stack AI',
    description:
      'AI-assisted symptom analysis with structured medical reasoning behind a React front end and an authenticated Express/Postgres backend.',
    stack: ['TypeScript', 'React', 'Express', 'PostgreSQL'],
    url: 'https://github.com/attaquarks/SymptoLens',
  },
];
