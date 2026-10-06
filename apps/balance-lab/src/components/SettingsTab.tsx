import { FAMILIES } from '@samgukji/battle-engine';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { isLabState, normalizeState, useLab } from '../lab/LabContext';
import { FAMILY_LABEL } from '../lib/format';
import { CheckField, NumberField } from './Fields';

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** 목표 지표, 가져오기/내보내기, 초기화. */
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
      <section className="panel">
        <h3>목표 지표</h3>
        <p className="note">시뮬레이션 결과가 이 범위를 벗어나면 "목표 지표 점검"에서 경고합니다.</p>
        <div className="range">
          <span>공격측 승률</span>
          <NumberField path="targets.attackerWinRate.0" step={0.01} min={0} max={1} />
          <NumberField path="targets.attackerWinRate.1" step={0.01} min={0} max={1} />
        </div>
        <div className="range">
          <span>평균 라운드</span>
          <NumberField path="targets.averageRounds.0" step={0.5} min={0} />
          <NumberField path="targets.averageRounds.1" step={0.5} min={0} />
        </div>
        <div className="range">
          <span>병종 승률 (무작위 편성)</span>
          <NumberField path="targets.familyWinRate.0" step={0.01} min={0} max={1} />
          <NumberField path="targets.familyWinRate.1" step={0.01} min={0} max={1} />
        </div>
        <div className="range">
          <span>캐릭터 승률 (무작위 편성)</span>
          <NumberField path="targets.characterWinRate.0" step={0.01} min={0} max={1} />
          <NumberField path="targets.characterWinRate.1" step={0.01} min={0} max={1} />
        </div>
        <div className="range">
          <span>스킬 피해 배율 (공격 스킬 평균 대비)</span>
          <NumberField path="targets.skillDamageRatio.0" step={0.1} min={0} />
          <NumberField path="targets.skillDamageRatio.1" step={0.1} min={0} />
        </div>
      </section>

      <section className="panel">
        <h3>병종별 생존율 목표</h3>
        <p className="note">첫 목표는 궁병 생존율 20% (±10%p)입니다.</p>
        <table>
          <thead>
            <tr>
              <th>사용</th>
              <th>병종</th>
              <th>목표 생존율</th>
              <th>허용 오차</th>
            </tr>
          </thead>
          <tbody>
            {FAMILIES.map((f) => (
              <tr key={f}>
                <td>
                  <CheckField label="" path={`targets.familySurvival.${f}.enabled`} />
                </td>
                <td>{FAMILY_LABEL[f]}</td>
                <td>
                  <NumberField path={`targets.familySurvival.${f}.target`} step={0.05} min={0} max={1} />
                </td>
                <td>
                  <NumberField path={`targets.familySurvival.${f}.tolerance`} step={0.05} min={0} max={1} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>가져오기 · 내보내기</h3>
        <div className="stack">
          <button type="button" onClick={() => downloadJson('balance-lab-state.json', state)}>
            전체 상태 내보내기 (데이터, 밸런스, 편성, 목표)
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
        <p className="note">모든 수치, 편성, 목표를 기본값으로 되돌립니다. 브라우저에 자동 저장된 내용도 덮어씁니다.</p>
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
