// Step 1 — read the JD.
//
// The LLM fills a FORM (structured JSON), never prose. Code then reads the boxes
// by name and enforces the rules the LLM cannot be trusted with:
//   1. every requirement must quote EVIDENCE that actually appears in the JD —
//      invented ("hallucinated") requirements are dropped;
//   2. must/nice priority is decided by CODE from the wording, not the model.

import type { LlmComplete } from '../../lib/llm';
import type { Requirement } from '../types';

export type RoleExtract = {
  company: string;
  role_title: string;
  location: string;
  seniority: string;
  responsibilities: string[];
  requirements: Requirement[];
};

// What the LLM hands back, before any trust is extended to it.
type RawRequirement = { text?: unknown; kind?: unknown; evidence?: unknown };
type RawForm = {
  company?: unknown;
  role_title?: unknown;
  location?: unknown;
  seniority?: unknown;
  responsibilities?: unknown;
  requirements?: unknown;
};

const KINDS = new Set<Requirement['kind']>([
  'technical',
  'behavioural',
  'domain',
]);

// The form the model must fill. The provider enforces this shape in JSON mode.
const FORM_SCHEMA = {
  type: 'object',
  properties: {
    company: { type: 'string' },
    role_title: { type: 'string' },
    location: { type: 'string' },
    seniority: { type: 'string' },
    responsibilities: { type: 'array', items: { type: 'string' } },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['technical', 'behavioural', 'domain'],
          },
          evidence: { type: 'string' },
        },
        required: ['text', 'kind', 'evidence'],
      },
    },
  },
  required: [
    'company',
    'role_title',
    'location',
    'seniority',
    'responsibilities',
    'requirements',
  ],
};

// Lowercase + collapse whitespace, so an evidence quote matches even when the
// model reflows spacing or casing. Exact-substring is too brittle; this is the
// deliberate middle — grounded in the JD, tolerant of cosmetic drift.
export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// CODE owns priority. "nice to have / preferred / bonus / a plus" => nice,
// everything else defaults to must.
export function derivePriority(text: string): Requirement['priority'] {
  return /\b(nice[ -]to[ -]have|preferred|bonus|a plus|is a plus|ideally|desirable)\b/i.test(
    text,
  )
    ? 'nice'
    : 'must';
}

function asString(x: unknown): string {
  return typeof x === 'string' ? x.trim() : '';
}

// PURE and deterministic — the unit under test. Keeps only requirements whose
// evidence quote is present in the JD; drops the rest; re-indexes ids so they
// stay contiguous (req-1, req-2, ...).
export function groundRequirements(
  jd: string,
  raw: RawRequirement[],
): Requirement[] {
  const haystack = normalize(jd);
  const kept: Requirement[] = [];
  for (const r of raw) {
    const text = asString(r.text);
    const evidence = asString(r.evidence);
    if (!text || !evidence) continue; // malformed box
    if (!haystack.includes(normalize(evidence))) continue; // invented -> drop
    const kind =
      typeof r.kind === 'string' && KINDS.has(r.kind as Requirement['kind'])
        ? (r.kind as Requirement['kind'])
        : 'technical';
    kept.push({
      id: `req-${kept.length + 1}`,
      text,
      kind,
      // Derive from the paraphrase AND the verbatim JD quote: "preferred / nice
      // to have" wording often survives only in `evidence`, not the model's `text`.
      priority: derivePriority(`${text} ${evidence}`),
    });
  }
  return kept;
}

function asStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim());
}

export function buildPrompt(jd: string): string {
  return [
    'You are extracting structured facts from a job description (JD).',
    'Fill the JSON form. Rules you MUST follow:',
    '- For every requirement, copy an `evidence` string VERBATIM from the JD text',
    '  below. Do not paraphrase the evidence. If you cannot find supporting text',
    '  in the JD, do not include that requirement at all.',
    '- Do not invent requirements, responsibilities, company, or location that are',
    '  not present in the JD. Leave a field empty rather than guessing.',
    '',
    'JD:',
    '"""',
    jd,
    '"""',
  ].join('\n');
}

// The step: call the LLM, parse its form, then ground it in code.
export async function readJd(
  jd: string,
  llm: LlmComplete,
): Promise<RoleExtract> {
  const raw = await llm(buildPrompt(jd), { schema: FORM_SCHEMA });

  let form: RawForm;
  try {
    form = JSON.parse(raw) as RawForm;
  } catch {
    throw new Error('readJd: LLM did not return valid JSON');
  }

  const rawRequirements = Array.isArray(form.requirements)
    ? (form.requirements as RawRequirement[])
    : [];

  return {
    company: asString(form.company),
    role_title: asString(form.role_title),
    location: asString(form.location),
    seniority: asString(form.seniority),
    responsibilities: asStringArray(form.responsibilities),
    requirements: groundRequirements(jd, rawRequirements),
  };
}
