console.error(
  [
    "The TypeScript-based fixer has been retired.",
    "Please use the Python notebook at notebooks/fix_example_translations.ipynb to detect languages and migrate examples.",
  ].join(" "),
);
process.exitCode = 1;
