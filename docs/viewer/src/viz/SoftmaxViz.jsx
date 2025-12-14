import React, { useState, useMemo } from 'react';

const SoftmaxViz = () => {
    const [temperature, setTemperature] = useState(1.0);

    // Example Logits (Raw scores)
    const logits = [2.0, 1.0, 0.1, -1.0, 0.5];
    const labels = ["cat", "dog", "fish", "bird", "cow"];

    // Calculate Softmax
    const probabilities = useMemo(() => {
        const expValues = logits.map(l => Math.exp(l / temperature));
        const sumExp = expValues.reduce((a, b) => a + b, 0);
        return expValues.map(v => v / sumExp);
    }, [temperature]);

    return (
        <div style={{ padding: '20px', background: '#1e293b', borderRadius: '8px', color: 'white' }}>
            <h5 style={{ margin: '0 0 15px 0' }}>Softmax & Temperature</h5>

            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#94a3b8' }}>
                    Temperature: <strong>{temperature}</strong>
                </label>
                <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={temperature}
                    onChange={e => setTemperature(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                    <span>Low (Peaked)</span>
                    <span>High (Uniform)</span>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {probabilities.map((prob, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '40px', textAlign: 'right', fontSize: '14px', fontWeight: 'bold' }}>
                            {labels[i]}
                        </div>
                        <div style={{ flex: 1, background: '#334155', height: '24px', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                            <div style={{
                                width: `${prob * 100}%`,
                                height: '100%',
                                background: '#3b82f6',
                                transition: 'width 0.3s ease-out'
                            }}></div>
                            <div style={{
                                position: 'absolute',
                                right: '5px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '12px',
                                color: 'white',
                                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                            }}>
                                {(prob * 100).toFixed(1)}%
                            </div>
                        </div>
                        <div style={{ width: '40px', fontSize: '12px', color: '#94a3b8' }}>
                            (L: {logits[i]})
                        </div>
                    </div>
                ))}
            </div>

            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '15px' }}>
                Formula: P_i = exp(z_i / T) / sum(exp(z_j / T))
            </p>
        </div>
    );
};

export default SoftmaxViz;
