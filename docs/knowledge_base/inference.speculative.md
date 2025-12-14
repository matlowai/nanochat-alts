# Speculative Decoding 🎲

## The Speed Limit
LLMs generate tokens one by one (autoregressive). Each token requires a full forward pass through the massive model. This is memory-bound and slow.

## The Trick
What if we had a small, fast "Draft Model" guess the next few tokens, and then use the big "Target Model" to verify them all at once?

1.  **Draft**: Small model generates K tokens (cheap).
2.  **Verify**: Big model processes the K tokens in parallel (efficient).
3.  **Accept/Reject**:
    - If the big model agrees with the draft, we keep the token.
    - If it disagrees, we stop and keep the big model's correction.

## Why it works
- Running the big model on 5 tokens in parallel takes almost the same time as running it on 1 token (due to GPU parallelism).
- If the draft model is decent, we can generate 2-3 tokens per "big model step".

## In NanoChat
(Note: This feature might be experimental or planned).

```python
# Pseudo-code
draft_tokens = draft_model.generate(input, k=5)
target_logits = target_model(input + draft_tokens)

for i in range(k):
    if target_logits[i].argmax() == draft_tokens[i]:
        accept(draft_tokens[i])
    else:
        reject_and_correct()
        break
```
