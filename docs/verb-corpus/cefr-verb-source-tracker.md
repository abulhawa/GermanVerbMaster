# CEFR Verb Source Audit & Shortlist Tracker

This tracker documents the source audit performed for epic #31 and captures the preliminary verb candidate pool by CEFR level.

## Source Inventory
| Source ID | Description | Levels | Access URL | License | Status |
| --- | --- | --- | --- | --- | --- |
| goethe_a1_2018 | Goethe-Zertifikat A1 official word list (2018 export mirrored via MIT-licensed repo) | A1 | https://raw.githubusercontent.com/harrymatthews50/ich_lerne_deutsch/main/data/Goethe_A1_Wordlist.csv | MIT | ✅ Imported (178 verb candidates)
| goethe_a2_official | Goethe-Zertifikat A2 Wortliste (2018) | A2 | https://www.goethe.de/pro/relaunch/prf/de/A2_Wortliste_2018.pdf | Copyright © Goethe-Institut | ⚠️ Direct download returns 404 via automated fetch. Manual retrieval or partner access required.
| goethe_b1_official | Goethe-Zertifikat B1 Wortliste (2018) | B1 | https://www.goethe.de/pro/relaunch/prf/de/B1_Wortliste_2018.pdf | Copyright © Goethe-Institut | ⚠️ Same as above; accessible only via browser session.
| goethe_b2_official | Goethe-Zertifikat B2 Wortliste (2018) | B2 | https://www.goethe.de/pro/relaunch/prf/de/B2_Wortliste_2018.pdf | Copyright © Goethe-Institut | ⚠️ Requires manual download workflow.
| goethe_c1_official | Goethe-Zertifikat C1 Wortliste | C1 | https://www.goethe.de/pro/relaunch/prf/de/C1_Wortliste.pdf | Copyright © Goethe-Institut | ⚠️ Manual extraction required.
| goethe_c2_official | Goethe-Zertifikat C2 Wortliste | C2 | https://www.goethe.de/pro/relaunch/prf/de/C2_Wortliste.pdf | Copyright © Goethe-Institut | ⚠️ Manual extraction required.
| cukowski_words | Community word-list repo (GermanWordListByLevel) | A1–B2 | https://github.com/Cukowski/GermanWordListByLevel | Unknown | ⚠️ Contains only ~65 verb entries for A1; other levels lack verb tagging. License clarification required before use.
| duden_api | Duden “Sprachniveau” annotations for verbs | B1–C2 | https://www.duden.de (HTML pages) | Copyright © Bibliographisches Institut | ⚠️ Accessible, but needs scraping pipeline + usage review.

## Candidate Pool Snapshot
Verb candidates extracted so far are stored in `docs/verb-corpus/cefr-verb-shortlist.csv`. Counts per level:

| Level | Candidates | Primary Sources | Notes |
| --- | --- | --- | --- |
| A1 | 178 | goethe_a1_2018 | Meets ≥100 target with vetted Goethe list. Needs dedupe against existing 43 verbs and QA on duplicates.
| A2 | 0 | — | Blocked: no machine-accessible source yet. Requires manual PDF extraction or publisher CSV.
| B1 | 0 | — | Same blocker as A2.
| B2 | 0 | — | Same blocker as A2.
| C1 | 0 | — | Requires high-level corpus; plan to mine Goethe C1 list + Duden "Sprachniveau" tags.
| C2 | 0 | — | Requires Goethe C2 list + advanced corpora. Currently no digital source captured.

## Outstanding Risks & Follow-ups
- **Goethe Wortlisten access**: Automated downloads of the 2018 PDFs return HTTP 404. Need stakeholder-approved workflow (e.g., authenticated manual download + local OCR) before proceeding. Logged in epic #31.
- **Licensing**: Goethe lists are copyrighted; confirm permissible internal use and citation requirements before distribution. Cukowski dataset has no explicit license ⇒ treat as reference-only until clarified.
- **Coverage gaps (A2–C2)**: No digitally parsable verb datasets available yet. Next step is to extract verbs from official PDFs and enrich with Duden “Sprachniveau” markers to hit 120+ per level.
- **Normalization**: A1 import still needs auxiliary verb classification and deduping against existing DB records (deferred to task #33).

## Next Actions (handoff to #33/#34)
1. Secure manual copies of Goethe Wortlisten for A2–C2 (product/legal approval) and run text extraction to seed candidate sheets.
2. Enrich extracted verbs with auxiliary, separability, and example sentences during the normalization pass.
3. Validate licensing/attribution text per source and document in the ingestion workbook.

## Review Status
- Document shared for product + linguistics review. Feedback pending; blockers documented above to satisfy #32 acceptance criterion.
- Risks and data access blockers recorded as comments on epic #31 and task issue #32 for follow-up.
