# Special Tokens

Special tokens are tokens that have a specific functional meaning and are not part of the natural language text.

## List
- `<|bos|>`: Beginning of Sequence. Marks the start of a document.
- `<|user_start|>` / `<|user_end|>`: Delimit user messages.
- `<|assistant_start|>` / `<|assistant_end|>`: Delimit assistant responses.
- `<|python_start|>` / `<|python_end|>`: Delimit code blocks for tool use.
- `<|output_start|>` / `<|output_end|>`: Delimit the output of the tool execution.

## Purpose
These tokens allow the model to understand the structure of a conversation and distinguish between different speakers and modalities (text vs. code).
