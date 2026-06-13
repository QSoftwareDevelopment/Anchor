#!/usr/bin/env bash
# ============================================================
# One-shot: commit this project and push it to
#   https://github.com/QSoftwareDevelopment/Anchor
# committing as info@qsoftware.ca.
#
# Run it from your own machine (not the Cowork sandbox), from the
# project folder:
#     bash push-to-github.sh
#
# Prerequisites (one of):
#   • GitHub CLI logged in:        gh auth login
#   • or a credential helper / Personal Access Token for HTTPS
#
# The repo can be empty or not-yet-created — see the note near the end.
# Safe to re-run.
# ============================================================
set -u
cd "$(dirname "$0")"

REMOTE_URL="https://github.com/QSoftwareDevelopment/Anchor.git"
BRANCH="main"

echo "▸ Working in: $(pwd)"

# A previous interrupted git run can leave this behind; clear it.
rm -f .git/index.lock 2>/dev/null

# Make sure this is a git repo.
[ -d .git ] || git init

# Commit identity — scoped to THIS repo only, so your global git config
# is untouched.
git config user.email "info@qsoftware.ca"
git config user.name  "Q Software"

# Stage everything (respecting .gitignore) and commit if there's anything new.
git add -A
if git diff --cached --quiet; then
  echo "▸ Nothing new to commit."
else
  git commit -m "Anchor — Q Software operating system" -q
  echo "▸ Committed as info@qsoftware.ca"
fi

# Use 'main' as the branch name.
git branch -M "$BRANCH"

# Point origin at the Anchor repo (idempotent).
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi
echo "▸ origin = $REMOTE_URL"

# Push.
echo "▸ Pushing to $BRANCH …"
if git push -u origin "$BRANCH"; then
  echo "✓ Pushed. https://github.com/QSoftwareDevelopment/Anchor"
else
  echo ""
  echo "✗ Push failed. Most likely one of:"
  echo "  1) The repo doesn't exist yet. Create it (empty, no README):"
  echo "       • With GitHub CLI:  gh repo create QSoftwareDevelopment/Anchor --private --source=. --remote=origin --push"
  echo "       • Or on github.com: New repository → owner 'QSoftwareDevelopment', name 'Anchor', leave it empty, then re-run this script."
  echo "  2) You're not authenticated for that org. Run 'gh auth login', or set up a Personal Access Token with 'repo' scope."
  echo "  3) You lack push access to the QSoftwareDevelopment org — ask an org owner to add you."
  exit 1
fi
