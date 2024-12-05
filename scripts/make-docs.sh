#!/bin/bash

# Set the directories relative to the script location
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
SRC_DIR="$SCRIPT_DIR/../src/rules"
DOCS_DIR="$SCRIPT_DIR/../docs/rules"

# Create docs/rules directory if it doesn't exist
mkdir -p "$DOCS_DIR"

# Iterate over every file in src/rules
for SRC_FILE in $SRC_DIR/*; do
    # Extract the filename without the extension
    FILENAME=$(basename -- "$SRC_FILE")
    FILENAME="${FILENAME%.*}"
    
    # Create a corresponding .md file in docs/rules
    touch "$DOCS_DIR/$FILENAME.md"
done

echo "Markdown files have been created in $DOCS_DIR."
