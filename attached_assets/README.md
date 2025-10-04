# Local Attached Assets

Store large or proprietary source files (for example, partner-supplied verb datasets) in this directory.
These assets are intentionally ignored by Git so they can live only on contributor machines.

Required files:
- `Final_German_Verbs.pkl` – used by `scripts/import_verbs.ts` when importing the historic verb dataset.

Copy any required assets into this folder before running scripts that depend on them.
