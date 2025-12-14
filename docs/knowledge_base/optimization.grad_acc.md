# Gradient Accumulation ➕

## The Problem: Memory Limits
Training large models requires large batch sizes (e.g., 512 or 1024) to get stable gradients. However, fitting 1024 samples of a 7B model into GPU memory is often impossible.

## The Solution: Accumulation
**Gradient Accumulation** lets us simulate a large batch size by breaking it down into smaller "micro-batches".

1.  **Micro-Step 1**: Forward/Backward pass on Micro-Batch 1. **Do NOT update weights yet.**
2.  **Micro-Step 2**: Forward/Backward pass on Micro-Batch 2. Add these gradients to the previous ones.
3.  ...
4.  **Micro-Step N**: Forward/Backward pass on Micro-Batch N.
5.  **Step**: Now that we have accumulated gradients for the full "Global Batch", we call `optimizer.step()` to update weights and `optimizer.zero_grad()` to clear them.

## The Math
Effectively:
$$ \text{Global Batch Size} = \text{Micro Batch Size} \times \text{Accumulation Steps} \times \text{World Size} $$

## In NanoChat
```python
# Training Loop
for micro_step in range(grad_accum_steps):
    # Forward
    logits, loss = model(X, Y)
    # Scale loss because gradients are summed
    loss = loss / grad_accum_steps 
    # Backward (accumulates gradients)
    loss.backward()

# Update Weights
optimizer.step()
optimizer.zero_grad()
```

> [!IMPORTANT]
> We must divide the loss by `grad_accum_steps` because `loss.backward()` *sums* gradients by default. If we didn't divide, the gradients would be N times too large!
