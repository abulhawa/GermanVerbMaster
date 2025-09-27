# Product Roadmap Project Report

Use the helper script to inspect the "Product Roadmap" view on the abulhawa GitHub project board.

```bash
./scripts/product-roadmap-report.sh
```

The script expects `gh` to be installed and authenticated with a token that has `project` scope. Override the owner, project number, or view name if the project ever moves:

```bash
./scripts/product-roadmap-report.sh <owner> <project-number> <view-name>
```

Example:

```bash
./scripts/product-roadmap-report.sh abulhawa 2 "Product Roadmap"
```

If authentication is missing you will see a reminder to run `echo "$GITHUB_TOKEN" | gh auth login --with-token` before retrying.
