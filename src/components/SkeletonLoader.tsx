'use client';

import React from 'react';

export function SkeletonLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 40, color: '#8e857b', fontSize: '13px' }}>
      <div style={{ height: 16, background: '#E8E3D8', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
      <div style={{ height: 16, background: '#E8E3D8', borderRadius: 4, animation: 'pulse 1.5s infinite', width: '60%' }} />
      <div style={{ height: 16, background: '#E8E3D8', borderRadius: 4, animation: 'pulse 1.5s infinite', width: '80%' }} />
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
