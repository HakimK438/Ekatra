// Issue tagging: which problem a case is about, found by a small local keyword list. No AI service.
// Every tag keeps the words that triggered it, so a person can see exactly why the tag was given.
import type { Case } from './types'

export type IssueKey = 'faculty' | 'laboratory' | 'fees' | 'ragging' | 'admission' | 'infrastructure' | 'approval' | 'court'

/** Editable list (it moves to app_settings in the backend). Words match at the start of a word: "lab" matches "laboratory". */
export const ISSUES: Record<IssueKey, { label: string; words: string[] }> = {
  faculty: { label: 'Faculty and staff', words: ['faculty', 'teacher', 'teaching staff', 'salary', 'salaries', 'staff strength', 'professor'] },
  laboratory: { label: 'Laboratory and equipment', words: ['lab', 'equipment', 'workshop'] },
  fees: { label: 'Fees and refunds', words: ['fee', 'refund', 'tuition', 'withdrawal'] },
  ragging: { label: 'Ragging and student safety', words: ['ragging', 'harass', 'safety', 'assault'] },
  admission: { label: 'Admission process', words: ['admission', 'intake', 'seat', 'counselling'] },
  infrastructure: { label: 'Buildings and facilities', words: ['building', 'infrastructure', 'hostel', 'library', 'campus', 'classroom'] },
  approval: { label: 'Approval and compliance', words: ['approval', 'compliance', 'norm', 'evc', 'inspection', 'hearing', 'show-cause', 'notice'] },
  court: { label: 'Court matter', words: ['writ', 'court', 'petition', 'litigation'] },
}

/** Case category is also a signal, so a "fee refund" case with a short summary is still tagged. */
const CATEGORY_ISSUE: Record<string, IssueKey> = { fee_refund: 'fees', ragging: 'ragging', faculty_salary: 'faculty', admission: 'admission', court_matter: 'court' }

export interface IssueTag { issue: IssueKey; label: string; words: string[] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** All issues found in a text (and category), strongest first. A case can have more than one. */
export function tagIssues(text: string, category?: string): IssueTag[] {
  const out: IssueTag[] = []
  for (const [issue, def] of Object.entries(ISSUES) as [IssueKey, (typeof ISSUES)[IssueKey]][]) {
    const words = def.words.filter((w) => new RegExp(`\\b${esc(w)}`, 'i').test(text))
    if (category && CATEGORY_ISSUE[category] === issue && !words.length) words.push(`category: ${category.replace(/_/g, ' ')}`)
    if (words.length) out.push({ issue, label: def.label, words })
  }
  return out.sort((a, b) => b.words.length - a.words.length)
}

export const issuesOf = (c: Pick<Case, 'summary' | 'category'>) => tagIssues(c.summary, c.category)

export interface SharedIssue { issue: IssueKey; label: string; words: string[] }

/**
 * Issues that appear in two or more of the given cases, with the words that were found.
 * "approval" is skipped when it is the only link: every regulatory case mentions notices and hearings.
 */
export function sharedIssues(cases: Pick<Case, 'summary' | 'category'>[]): SharedIssue[] {
  const tags = cases.map(issuesOf)
  const out: SharedIssue[] = []
  for (const key of Object.keys(ISSUES) as IssueKey[]) {
    const hits = tags.map((t) => t.find((x) => x.issue === key)).filter((x): x is IssueTag => !!x)
    if (hits.length >= 2) out.push({ issue: key, label: ISSUES[key].label, words: [...new Set(hits.flatMap((h) => h.words))] })
  }
  const specific = out.filter((s) => s.issue !== 'approval')
  return specific.length ? specific : out
}

/** The main issue to announce for a group of cases: the shared one if there is one, else the first tagged. */
export function mainIssue(cases: Pick<Case, 'summary' | 'category'>[]): { label: string; shared: boolean } | null {
  const s = sharedIssues(cases)[0]
  if (s) return { label: s.label, shared: true }
  const first = cases.flatMap(issuesOf)[0]
  return first ? { label: first.label, shared: false } : null
}
