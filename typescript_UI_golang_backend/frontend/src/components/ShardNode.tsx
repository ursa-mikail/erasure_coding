import React, { useEffect, useRef } from 'react';
import { Shard } from '../types';

interface Props {
  shard: Shard;
  selected: boolean;
  onToggle: (id: number) => void;
  phase: string;
  animateDestroy?: boolean;
}

export const ShardNode: React.FC<Props> = ({ shard, selected, onToggle, phase, animateDestroy }) => {
  const ref = useRef<HTMLDivElement>(null);

  const canSelect = phase === 'generated' || phase === 'destroying';

  const handleClick = () => {
    if (canSelect && !shard.destroyed) onToggle(shard.id);
  };

  const getStateClass = () => {
    if (shard.destroyed) return 'destroyed';
    if (selected) return 'selected';
    return 'active';
  };

  const shortHash = shard.sha256 ? shard.sha256.substring(0, 8) : '--------';

  return (
    <div
      ref={ref}
      className={`shard-node shard-${getStateClass()} ${animateDestroy ? 'shard-exploding' : ''}`}
      onClick={handleClick}
      style={{ cursor: canSelect && !shard.destroyed ? 'pointer' : 'default' }}
    >
      <div className="shard-inner">
        <div className="shard-id">DB_{String(shard.id).padStart(2, '0')}</div>
        <div className="shard-hex">
          {shard.destroyed ? (
            <span className="destroyed-text">DESTROYED</span>
          ) : (
            <>
              <span className="hash-label">SHA256</span>
              <span className="hash-value">{shortHash}…</span>
            </>
          )}
        </div>
        <div className="shard-size">
          {shard.destroyed ? '0 B' : `${shard.size} B`}
        </div>
        {selected && !shard.destroyed && (
          <div className="shard-mark">✕ MARK</div>
        )}
        {shard.destroyed && (
          <div className="destroyed-icon">💀</div>
        )}
      </div>
    </div>
  );
};
