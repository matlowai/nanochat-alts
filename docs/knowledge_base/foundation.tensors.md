# Tensors, Shapes, and Broadcasting 📦

## What is a Tensor?
A **Tensor** is just a fancy name for a multi-dimensional array. It's the fundamental building block of all deep learning.

- **Scalar** (0-D): A single number. `x = 5`
- **Vector** (1-D): A list of numbers. `x = [1, 2, 3]` (Shape: `[3]`)
- **Matrix** (2-D): A grid of numbers. (Shape: `[Rows, Cols]`)
- **Tensor** (N-D): A grid with N dimensions. (Shape: `[Batch, Time, Channels, ...]`)

## Shapes in LLMs
In `nanochat`, you'll see tensors with specific shapes. Understanding them is key to understanding the code.

Common dimensions:
- **B (Batch Size)**: How many independent sequences we process in parallel.
- **T (Time / Sequence Length)**: How many tokens are in the sequence.
- **C (Channels / Embedding Dimension)**: The size of the vector representing a single token.

Example:
```python
# A batch of input tokens
x = torch.randint(0, 50257, (B, T)) 
# Shape: [B, T] (e.g., [8, 1024])

# After embedding lookup
x = embedding(x)
# Shape: [B, T, C] (e.g., [8, 1024, 768])
```

## Broadcasting
**Broadcasting** is the magic that allows you to do math on tensors of different shapes.

Rule: Two dimensions are compatible if:
1. They are equal, OR
2. One of them is 1.

Example:
```python
# A: [B, T, C] (Activations)
# B: [1, 1, C] (Bias vector)

# A + B works! 
# The Bias 'B' is stretched (broadcasted) across the Batch and Time dimensions.
```

## Views and Strides
A **View** lets you look at the same data with a different shape without copying memory.

```python
# Flattening the batch and time dimensions
x = x.view(B * T, C) 
# Shape: [B*T, C]
```

> [!TIP]
> Always track the shapes in your head (or comments) when reading model code. It's the best way to debug!
