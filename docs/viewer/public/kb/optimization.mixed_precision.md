# Mixed Precision (BF16) ⚡

## Floating Point Formats
Computers store decimal numbers as "Floating Point".
- **FP32 (Float)**: 32 bits. High precision. Standard for years.
- **FP16 (Half)**: 16 bits. Faster, less memory, but small range (prone to overflow).
- **BF16 (BFloat16)**: 16 bits. **Brain Float**.

## Why BF16?
BF16 is the "Goldilocks" format for Deep Learning.
- **Range**: Same as FP32 (8 exponent bits).
- **Precision**: Lower than FP32 (7 mantissa bits vs 23), but **sufficient for Neural Nets**.

| Format | Exponent | Mantissa | Range | Precision |
| :--- | :--- | :--- | :--- | :--- |
| **FP32** | 8 bits | 23 bits | ~1e38 | High |
| **FP16** | 5 bits | 10 bits | ~6e4 | Medium |
| **BF16** | 8 bits | 7 bits | ~1e38 | Low (but OK) |

## Benefits
1.  **Memory**: Uses 50% less VRAM than FP32.
2.  **Speed**: Tensor Cores on modern GPUs (A100, H100) are optimized for BF16 matrix math.
3.  **Stability**: Unlike FP16, BF16 rarely overflows/underflows because it shares the same dynamic range as FP32.

## In NanoChat
We use `torch.autocast` to automatically switch between FP32 (for stability in accumulation) and BF16 (for speed in matrix mul).

```python
with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
    logits, loss = model(X, Y)
```
