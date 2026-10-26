// Dumps the deterministic mock dataset to JSON so the backend seeds the exact same records. Run: npx tsx export-seed.ts
import { writeFileSync } from 'node:fs'
import { CASES, INSTITUTIONS, SOURCE_SYNC, TODAY, UNITS } from './src/lib/mock/data'
import { IMPORTS, STATUS_MAP } from './src/lib/mock/extra'

writeFileSync('../backend/scripts/seed_data.json', JSON.stringify({ today: TODAY, units: UNITS, institutions: INSTITUTIONS, cases: CASES, sourceSync: SOURCE_SYNC, imports: IMPORTS, statusMap: STATUS_MAP }, null, 1))
console.log('cases', CASES.length, 'institutions', INSTITUTIONS.length)
