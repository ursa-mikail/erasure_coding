import React from 'react';

interface Props {
  label: string;
  hash: string;
  match?: boolean | null;
}

export const HashDisplay: React.FC<Props> = ({ label, hash, match }) => {
  return (
    <div className={`hash-display ${match === true ? 'hash-match' : match === false ? 'hash-mismatch' : ''}`}>
      <div className="hash-label-text">{label}</div>
      <div className="hash-full">
        {hash.split('').map((ch, i) => (
          <span key={i} className="hash-char" style={{ animationDelay: `${i * 8}ms` }}>
            {ch}
          </span>
        ))}
      </div>
      {match !== null && match !== undefined && (
        <div className={`hash-status ${match ? 'hash-ok' : 'hash-bad'}`}>
          {match ? '✓ INTEGRITY VERIFIED' : '✗ CORRUPTION DETECTED'}
        </div>
      )}
    </div>
  );
};
