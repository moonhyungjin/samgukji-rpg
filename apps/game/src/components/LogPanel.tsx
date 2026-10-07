import { useEffect, useRef } from 'react';

/** 전투 로그. 새 줄이 생기면 맨 아래로 스크롤한다. */
export function LogPanel({ lines }: { lines: readonly string[] }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <section className="panel log-panel">
      <h3>전투 로그</h3>
      <pre ref={ref} className="log">
        {lines.length === 0 ? '(아직 없음)' : lines.join('\n')}
      </pre>
    </section>
  );
}
