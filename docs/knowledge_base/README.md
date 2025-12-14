# NanoChat Knowledge Base

This directory contains the educational content for the "Zero to Hero" learning platform.

## Annotation System

We use special comment tags in the Python code to link to these concepts.

### Tags

- `# @learn:concept_id`: Links the adjacent code to a concept.
- `# @def:concept_id`: Defines a concept in-place (for simple things).
- `# @viz:concept_id`: Links to an interactive visualization.
- `# @todo:explain:context`: Marks a place that needs an explanation.

### Example

```python
# @learn:attention.self_attention
y = F.scaled_dot_product_attention(q, k, v)
```

## Structure

Create Markdown files in this directory. The filename (without extension) or a frontmatter ID will be used as the `concept_id`.
