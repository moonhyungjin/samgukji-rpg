import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { isLabState, normalizeState, useLab } from '../lab/LabContext';
import { NumberField } from './Fields';

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** 경고 기준, 가져오기/내보내기, 초기화. */
export function SettingsTab() {
  const { state, replace, reset } = useLab();
  const [message, setMessage] = useState<string | null>(null);

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isLabState(parsed)) throw new Error('Balance Lab에서 내보낸 파일이 아닙니다.');
      replace(normalizeState(parsed));
      setMessage(`${file.name}을(를) 가져왔습니다.`);
    } catch (e) {
      setMessage(`가져오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="grid">
      <section className="panel" data-panel="warnings">
        <h3>경고 기준</h3>
        <p className="note">
          시뮬레이션 결과가 이 범위를 벗어나면 시뮬레이션 탭의 "경고 (깨진 곳)"에 알립니다. 균형을 맞추는 목표가 아니라 값이 <b>깨졌는지</b> 보는 안전선입니다. 예를 들어 한 병종이 거의 다 이기거나, 전멸이 거의 나지 않거나, 전투가 너무 짧거나 길 때입니다. 값은 [임시]이고 여기서 고칩니다.
        </p>
        <div className="range">
          <span>평균 전투 길이 (라운드)</span>
          <NumberField path="warnings.averageRounds.0" step={0.5} min={0} />
          <NumberField path="warnings.averageRounds.1" step={0.5} min={0} />
        </div>
        <div className="range">
          <span>병종 계열 승률 (무작위 편성)</span>
          <NumberField path="warnings.familyWinRate.0" step={0.05} min={0} max={1} />
          <NumberField path="warnings.familyWinRate.1" step={0.05} min={0} max={1} />
        </div>
        <div className="range">
          <span>장수 승률 (무작위 편성)</span>
          <NumberField path="warnings.characterWinRate.0" step={0.05} min={0} max={1} />
          <NumberField path="warnings.characterWinRate.1" step={0.05} min={0} max={1} />
        </div>
        <div className="range">
          <span>공격측 승률</span>
          <NumberField path="warnings.attackerWinRate.0" step={0.05} min={0} max={1} />
          <NumberField path="warnings.attackerWinRate.1" step={0.05} min={0} max={1} />
        </div>
        <div className="range">
          <span>공격 스킬 1회 피해 (평균 대비 배)</span>
          <NumberField path="warnings.skillDamageRatio.0" step={0.25} min={0} />
          <NumberField path="warnings.skillDamageRatio.1" step={0.25} min={0} />
        </div>
        <div className="range">
          <span>전멸로 끝난 전투 최소 비율</span>
          <NumberField path="warnings.minWipeRate" step={0.05} min={0} max={1} />
        </div>
        <div className="range">
          <span>교착으로 끝난 전투 최대 비율</span>
          <NumberField path="warnings.maxStallRate" step={0.05} min={0} max={1} />
        </div>
        <p className="note">비율은 0~1입니다 (0.3 = 30%). 범위는 왼쪽이 최소, 오른쪽이 최대입니다.</p>
      </section>

      <section className="panel">
        <h3>가져오기 · 내보내기</h3>
        <div className="stack">
          <button type="button" onClick={() => downloadJson('balance-lab-state.json', state)}>
            전체 상태 내보내기 (데이터, 밸런스, 편성, 경고 기준)
          </button>
          <button type="button" onClick={() => downloadJson('balance.json', state.balance)}>
            밸런스 수치만 내보내기 (CLI의 --balance 용)
          </button>
          <label className="file">
            전체 상태 가져오기
            <input type="file" accept="application/json" onChange={onImport} />
          </label>
          {message && <p className="note">{message}</p>}
        </div>
      </section>

      <section className="panel">
        <h3>초기화</h3>
        <p className="note">모든 수치, 편성, 경고 기준을 기본값으로 되돌립니다. 브라우저에 자동 저장된 내용도 덮어씁니다.</p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('모든 수치와 편성을 기본값으로 되돌릴까요?')) reset();
          }}
        >
          기본값으로 되돌리기
        </button>
      </section>
    </div>
  );
}
