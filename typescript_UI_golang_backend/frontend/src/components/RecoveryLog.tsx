import React, { useEffect, useRef } from 'react';

interface Props {
  log: string[];
  verified: boolean | null;
}

export const RecoveryLog: React.FC<Props> = ({ log, verified }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  return (
    <div className="recovery-log">
      <div className="log-header">
        <span className="log-title">◈ RECOVERY LOG</span>
        {verified !== null && (
          <span className={`log-badge ${verified ? 'badge-ok' : 'badge-fail'}`}>
            {verified ? '✓ VERIFIED' : '✗ FAILED'}
          </span>
        )}
      </div>
      <div className="log-body">
        {log.map((line, i) => (
          <div key={i} className={`log-line log-line-${i}`} style={{ animationDelay: `${i * 60}ms` }}>
            <span className="log-time">{String(i).padStart(3, '0')}</span>
            <span className="log-text">{line}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
