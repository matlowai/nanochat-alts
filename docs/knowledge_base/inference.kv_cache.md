# KV Cache 🧠

## The Bottleneck
In a Transformer, generating the next token requires attending to *all* previous tokens.
If we re-compute the Key (K) and Value (V) vectors for the entire history at every step, it becomes incredibly slow ($O(N^2)$).

## The Solution: Cache It!
Since the past tokens don't change, we can compute their K and V vectors once and store them.
At each step, we only compute K and V for the *new* token, append it to the cache, and attend to the full cache.

## Circular Buffer
In `nanochat`, we pre-allocate a fixed-size cache (e.g., 4096 tokens) to avoid memory allocation overhead.
We treat it as a **Circular Buffer**:
1.  Fill it up from index 0 to 4095.
2.  If we exceed the size, we might rotate or stop (depending on implementation).

## Memory Usage
KV Cache can be huge!
$$ \text{Size} = 2 \times \text{Batch} \times \text{Layers} \times \text{Heads} \times \text{Head Dim} \times \text{Seq Len} \times \text{Bytes} $$

For a 7B model with 4k context, this can be gigabytes of VRAM.

## In Code
```python
# Pre-allocate
cache_k = torch.zeros((B, max_seq_len, n_heads, head_dim))
cache_v = torch.zeros((B, max_seq_len, n_heads, head_dim))

# Update
cache_k[:, pos] = k_val
cache_v[:, pos] = v_val

# Attend
keys = cache_k[:, :pos+1]
values = cache_v[:, :pos+1]
```
