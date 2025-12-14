# Tiktoken

Tiktoken is OpenAI's fast BPE tokenization library.

## Role
We use `tiktoken` for **inference** and encoding because it is extremely optimized. We load the vocabulary and merge rules learned by `RustBPE` into `tiktoken` to get the best of both worlds: custom training and fast inference.
