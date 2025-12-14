# Implementation Plan - Code Indexing Script

The goal is to create a script that generates a comprehensive index of the codebase, including docstrings, function signatures, and comments, to aid in understanding the project.

## User Review Required

> [!NOTE]
> The script will be placed in `scripts/generate_code_index.py`.
> The output file will be `CODE_INDEX.md` in the root directory.

## Proposed Changes

### Scripts

#### [NEW] [generate_code_index.py](file:///media/dylan-matlow/BigU/AI/pretraining/nanochat-alts/scripts/generate_code_index.py)

- Create a new Python script that:
    - Accepts a root directory argument.
    - Recursively finds all `.py` files.
    - **Parsing**:
        - Uses `ast` to parse code structure.
        - **Extracts `@learn`, `@def`, `@viz`, `@todo` tags** from comments.
    - **Knowledge Base Integration**:
        - Scans `docs/knowledge_base/` for markdown files.
        - Validates links between Code and KB.
    - **Output**:
        - Generates `knowledge_graph.json` (for the web viewer).
        - Generates `GAP_REPORT.md` (listing missing concepts/explanations).

### Documentation

#### [NEW] [docs/knowledge_base/](file:///media/dylan-matlow/BigU/AI/pretraining/nanochat-alts/docs/knowledge_base/)
- Create directory structure for the knowledge base.
- Add `README.md` explaining the annotation spec.

## Verification Plan

### Automated Tests
- Run `python scripts/generate_code_index.py`.
- Verify `knowledge_graph.json` is valid JSON and contains expected nodes.
- Verify `GAP_REPORT.md` correctly lists "missing" concepts (since we haven't written them yet).

### Manual Verification
- Inspect `GAP_REPORT.md` to ensure it catches the `@todo` tags we will add.
