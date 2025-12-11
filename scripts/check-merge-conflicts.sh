#!/bin/bash
# Lists remaining conflicted files in a checklist format for the stop hook.
# Output: Either "✅ All merge conflicts resolved" or a numbered checklist of conflicted files with hunk counts.

set -e

if ! git rev-parse -q --verify MERGE_HEAD > /dev/null 2>&1; then
  echo "Not in a merge conflict state"
  exit 0
fi

conflicted_files=$(git diff --name-only --diff-filter=U 2>/dev/null || echo "")

if [ -z "$conflicted_files" ]; then
  echo "✅ All merge conflicts resolved"
  exit 0
fi

echo "# Remaining Conflicted Files"
echo ""

counter=1
while IFS= read -r file; do
  if [ -n "$file" ]; then
    hunk_count=$(grep -c '^<<<<<<<' "$file" 2>/dev/null || echo "0")
    echo "$counter. [ ] \`$file\` ($hunk_count conflict hunk(s))"
    counter=$((counter + 1))
  fi
done <<< "$conflicted_files"
