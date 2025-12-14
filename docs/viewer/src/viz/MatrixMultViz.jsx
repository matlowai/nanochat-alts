import React, { useState } from 'react';

const MatrixMultViz = () => {
    const [hoveredCell, setHoveredCell] = useState(null);

    // Example Matrices: A (2x3) * B (3x2) = C (2x2)
    const matrixA = [
        [1, 2, 3],
        [4, 5, 6]
    ];
    const matrixB = [
        [7, 8],
        [9, 1],
        [2, 3]
    ];

    // Calculate C
    const matrixC = [
        [1 * 7 + 2 * 9 + 3 * 2, 1 * 8 + 2 * 1 + 3 * 3],
        [4 * 7 + 5 * 9 + 6 * 2, 4 * 8 + 5 * 1 + 6 * 3]
    ];

    const handleHover = (row, col) => {
        setHoveredCell({ row, col });
    };

    const clearHover = () => {
        setHoveredCell(null);
    };

    const getCellColor = (isActive) => isActive ? '#facc15' : '#334155';
    const getTextColor = (isActive) => isActive ? '#000' : '#fff';

    return (
        <div style={{ padding: '20px', background: '#1e293b', borderRadius: '8px', color: 'white' }}>
            <h5 style={{ margin: '0 0 15px 0' }}>Matrix Multiplication</h5>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>

                {/* Matrix A */}
                <div>
                    <div style={{ textAlign: 'center', marginBottom: '5px', color: '#94a3b8' }}>A (2x3)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gap: '5px' }}>
                        {matrixA.map((row, rIndex) => (
                            row.map((val, cIndex) => {
                                const isActive = hoveredCell && hoveredCell.row === rIndex;
                                return (
                                    <div key={`${rIndex}-${cIndex}`} style={{
                                        width: '40px', height: '40px',
                                        background: getCellColor(isActive),
                                        color: getTextColor(isActive),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRadius: '4px', fontWeight: 'bold'
                                    }}>
                                        {val}
                                    </div>
                                );
                            })
                        ))}
                    </div>
                </div>

                <div style={{ fontSize: '24px' }}>×</div>

                {/* Matrix B */}
                <div>
                    <div style={{ textAlign: 'center', marginBottom: '5px', color: '#94a3b8' }}>B (3x2)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 40px)', gap: '5px' }}>
                        {matrixB.map((row, rIndex) => (
                            row.map((val, cIndex) => {
                                const isActive = hoveredCell && hoveredCell.col === cIndex;
                                return (
                                    <div key={`${rIndex}-${cIndex}`} style={{
                                        width: '40px', height: '40px',
                                        background: getCellColor(isActive),
                                        color: getTextColor(isActive),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRadius: '4px', fontWeight: 'bold'
                                    }}>
                                        {val}
                                    </div>
                                );
                            })
                        ))}
                    </div>
                </div>

                <div style={{ fontSize: '24px' }}>=</div>

                {/* Matrix C (Result) */}
                <div>
                    <div style={{ textAlign: 'center', marginBottom: '5px', color: '#94a3b8' }}>C (2x2)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 40px)', gap: '5px' }}>
                        {matrixC.map((row, rIndex) => (
                            row.map((val, cIndex) => {
                                const isHovered = hoveredCell && hoveredCell.row === rIndex && hoveredCell.col === cIndex;
                                return (
                                    <div
                                        key={`${rIndex}-${cIndex}`}
                                        onMouseEnter={() => handleHover(rIndex, cIndex)}
                                        onMouseLeave={clearHover}
                                        style={{
                                            width: '40px', height: '40px',
                                            background: isHovered ? '#22c55e' : '#475569',
                                            color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer',
                                            border: isHovered ? '2px solid white' : 'none'
                                        }}
                                    >
                                        {val}
                                    </div>
                                );
                            })
                        ))}
                    </div>
                </div>

            </div>

            {/* Explanation */}
            <div style={{ marginTop: '20px', height: '40px', color: '#cbd5e1' }}>
                {hoveredCell ? (
                    <span>
                        <strong>Row {hoveredCell.row}</strong> of A • <strong>Col {hoveredCell.col}</strong> of B =
                        {' '}({matrixA[hoveredCell.row][0]}×{matrixB[0][hoveredCell.col]}) +
                        ({matrixA[hoveredCell.row][1]}×{matrixB[1][hoveredCell.col]}) +
                        ({matrixA[hoveredCell.row][2]}×{matrixB[2][hoveredCell.col]}) =
                        <strong> {matrixC[hoveredCell.row][hoveredCell.col]}</strong>
                    </span>
                ) : (
                    <span>Hover over the result matrix (C) to see the calculation.</span>
                )}
            </div>
        </div>
    );
};

export default MatrixMultViz;
