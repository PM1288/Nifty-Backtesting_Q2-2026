# Shared contracts

These generated JSON Schemas are the language-neutral integration boundary for Python, Go and TypeScript services. Regenerate them with:

```bash
PYTHONPATH=src python tools/export_schemas.py
```

A schema change is not complete until downstream consumer tests pass. Do not edit the generated JSON files manually; change the canonical Pydantic model and regenerate.
