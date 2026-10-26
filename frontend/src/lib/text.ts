// Small wording helpers so the screens never say "1 days".
/** plural(1, 'day') is "1 day"; plural(3, 'day') is "3 days". */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
/** "today", "tomorrow", "in 3 days", "yesterday", "3 days ago" from a day difference (positive means in the future). */
export const dayWords = (diff: number) => diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff === -1 ? 'yesterday' : diff > 0 ? `in ${plural(diff, 'day')}` : `${plural(-diff, 'day')} ago`
/** "Mon 27 Oct" */
export const fmtDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
/** Short person name: "Anjali Rao" becomes "A. Rao". */
export const initial = (n: string) => n.replace(/^(\S)\S*\s+/, '$1. ')
