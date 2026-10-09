import { useMemo, useState } from 'react';
import { useLab } from '../lab/LabContext';
import { dataIssues } from '../lib/dataIssues';
import { describeChanges } from '../lib/dataLog';
import { FILE_LABEL, FILE_NAMES, changedFileNames, serializeFile } from '../lib/fileSync';
import type { DataFiles, FileName } from '../lib/fileSync';

/** 저장에 성공한 직후 개발 서버가 페이지를 새로고침하므로, 안내 문구를 다음 로드로 넘겨 준다. */
const NOTICE_KEY = 'samgukji-balance-lab-saved-notice';

interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

function readStoredNotice(): Notice | null {
  try {
    const text = sessionStorage.getItem(NOTICE_KEY);
    if (!text) return null;
    sessionStorage.removeItem(NOTICE_KEY);
    return { kind: 'ok', text };
  } catch {
    return null;
  }
}

/** 모든 탭 위에 보이는 줄: 프로젝트 파일과 다른 점을 알려 주고 "파일에 저장"한다. */
export function SaveBar() {
  const { state, update, baseline, setBaseline } = useLab();
  const [notice, setNotice] = useState<Notice | null>(readStoredNotice);
  const [saving, setSaving] = useState(false);
  const [memo, setMemo] = useState('');

  const current: DataFiles = useMemo(() => ({ data: state.data, balance: state.balance, presets: state.presets, campaign: state.campaign, map: state.map }), [state.data, state.balance, state.presets, state.campaign, state.map]);
  const changed = useMemo(() => changedFileNames(baseline, current), [baseline, current]);
  const issues = useMemo(() => dataIssues(current), [current]);
  const dirty = changed.length > 0;

  const save = async () => {
    if (issues.errors.length > 0) {
      setNotice({ kind: 'error', text: `오류 ${issues.errors.length}건을 고쳐야 저장할 수 있습니다.` });
      return;
    }
    setSaving(true);
    // 저장하면 개발 서버가 파일 변경을 보고 페이지를 새로고침하므로, 안내 문구를 미리 넘겨 둔다.
    const message = `${changed.map((n) => FILE_LABEL[n]).join(', ')}을(를) 파일에 저장했습니다. 게임과 시뮬레이터에 반영됩니다.`;
    try {
      sessionStorage.setItem(NOTICE_KEY, message);
    } catch {
      /* 저장소를 못 써도 저장은 계속한다 */
    }
    try {
      const body: Record<string, unknown> = Object.fromEntries(changed.map((name) => [name, JSON.parse(serializeFile(name, current))]));
      // 무엇이 어떻게 바뀌었는지 기록으로 남긴다 (data/changelog.md). 메모는 바꾼 이유를 적는 칸이다.
      body.__log = describeChanges(baseline, current, memo, new Date()) ?? '';
      const response = await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `저장 실패 (${response.status})`);
      setBaseline(JSON.parse(JSON.stringify(current)) as DataFiles);
      setMemo('');
      setNotice({ kind: 'ok', text: message });
    } catch (error) {
      try {
        sessionStorage.removeItem(NOTICE_KEY);
      } catch {
        /* 무시 */
      }
      const reason = error instanceof Error ? error.message : String(error);
      setNotice({
        kind: 'error',
        text: `저장하지 못했습니다 (${reason}). 개발 서버(npm run lab)에서 열었는지 확인하세요. 서버 없이 쓸 때는 "목표 · 가져오기" 탭의 내보내기로 파일을 받아 packages/game-data/data/에 직접 옮겨야 합니다.`,
      });
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    const clone = JSON.parse(JSON.stringify(baseline)) as DataFiles;
    update((s) => ({ ...s, data: clone.data, balance: clone.balance, presets: clone.presets, campaign: clone.campaign, map: clone.map }));
    setNotice(null);
  };

  const label = (name: FileName) => FILE_LABEL[name];
  return (
    <div className="savebar" role="region" aria-label="파일 저장">
      <div className="savebar-row">
        <button type="button" className="primary" disabled={!dirty || saving} onClick={save}>
          {saving ? '저장 중…' : '파일에 저장'}
        </button>
        <span className={dirty ? 'badge dirty' : 'badge clean'}>{dirty ? `저장 안 됨 (${changed.map(label).join(' · ')})` : '프로젝트 파일과 같음'}</span>
        <button type="button" disabled={!dirty} onClick={revert}>
          파일 값으로 되돌리기
        </button>
        <input
          type="text"
          className="savebar-memo"
          aria-label="변경 메모"
          placeholder="변경 메모 (선택): 왜 바꿨는지 적으면 기록에 남습니다"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <span className="savebar-hint">고친 값은 "파일에 저장"을 눌러야 게임과 시뮬레이터에 반영됩니다. 저장 위치: packages/game-data/data/ ({FILE_NAMES.length}개 파일), 변경 기록: changelog.md</span>
      </div>
      {notice && <div className={`savemsg ${notice.kind}`}>{notice.text}</div>}
      {issues.all.length > 0 && (
        <ul className="saveissues">
          {issues.all.slice(0, 6).map((i, index) => (
            <li key={index} className={i.level}>
              {i.message}
            </li>
          ))}
          {issues.all.length > 6 && <li>… 외 {issues.all.length - 6}건</li>}
        </ul>
      )}
    </div>
  );
}
