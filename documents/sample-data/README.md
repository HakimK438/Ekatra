# Sample files for the Import screen

All data is synthetic. Sign in as `arao` (PGRC), `siyer` (RB-WR) or `mkhan` (coordinator), open **Import records**, choose the unit shown, and upload the file. Best order: 01 → 03 → 02 → 04 → 05.

| File | Unit | What it shows | What you should see |
|---|---|---|---|
| `01_pgrc_clean.csv` | PGRC | Six good rows, each matched a different way | 6 new. Three match by Permanent ID, one by Current ID, one is only a name suggestion, one stays unmatched. Sahyadri also gets an overlap with the RB-WR hearing already open there |
| `02_pgrc_with_errors.csv` | PGRC | One good row and eight bad ones | 1 new, 8 rejected. Each rejection says what is wrong and how to fix it (bad date, future date, unknown source, unknown category, bad Permanent ID, empty name, empty reference, unknown status) |
| `03_rb_wr_duplicate_and_new_words.csv` | RB-WR | The same complaint number as file 01, and two status words Ekatra does not know | 1 new, 2 held back until you say what "Show cause issued" and "Hearing fixed" mean (asked once, then remembered). The new row raises a "likely duplicate" overlap with the PGRC case |
| `04_pgrc_update_existing.csv` | PGRC | A reference that already exists | 1 update, 0 new. Nothing is duplicated |
| `05_ro_wr_small.csv` | RO-WR | A third unit joins the same institution; one row is already closed | 2 new. Import the file twice: the second time shows 2 updates and no new cases |

Columns: `source_reference, received_on (YYYY-MM-DD), channel, category, local_status, institution_name, permanent_id, current_id, complaint_ref, summary`. The template on the Import screen has the same columns.

These files are checked by `backend/tests/test_csv_files.py` and `frontend/src/lib/csvfiles.test.ts`, so they cannot drift from what this page says.
