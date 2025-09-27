# Agent Setup Notes

Codex Cloud sessions need a GitHub credential to work with the private repo and the Product Roadmap project board.

1. Store a PAT (with `repo` and `project` scopes) in the environment secrets as `GITHUB_TOKEN`.
2. install `gh`
3. After the workspace boots, authenticate GitHub CLI:
   ```bash
   echo "$GITHUB_TOKEN" | gh auth login --with-token
   gh auth status
   ```
   You should see `Logged in to github.com as abulhawa`.
4. Use `git clone https://github.com/abulhawa/GermanVerbMaster.git` or any GitHub API calls; they will reuse the authenticated session.
5. When rotating the token, update the secret value in the Codex environment.

SSH keys are optional; the PAT + `gh auth` flow covers both git and project automation calls.