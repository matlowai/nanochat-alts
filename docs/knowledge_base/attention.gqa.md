# Group-Query Attention (GQA)

GQA is an interpolation between Multi-Head Attention (MHA) and Multi-Query Attention (MQA).

## Mechanism
- **MHA**: $H$ query heads, $H$ key/value heads.
- **MQA**: $H$ query heads, 1 key/value head.
- **GQA**: $H$ query heads, $G$ key/value heads (where $1 < G < H$).

## Benefits
GQA significantly reduces the memory bandwidth required to load keys and values during inference (KV Cache), while maintaining better performance than MQA.
