import type { GameData } from '@samgukji/battle-engine';
import type { CampaignFile } from '@samgukji/game-data';
import type { campaignIssues } from '../../lib/dataIssues';
import { NumberField, SelectField, TextField } from '../../shared/Fields';

interface Props {
  file: CampaignFile;
  data: GameData;
  presetOptions: { value: string; label: string }[];
  characterOptions: { value: string; label: string }[];
  issues: ReturnType<typeof campaignIssues>;
  setBattles: (fn: (b: CampaignFile['battles']) => CampaignFile['battles']) => void;
}

/** 전투 순서 표: 이름, 적 편성, 적 레벨, 병력, 보상, 합류 장수 (추가/삭제/순서 바꾸기) */
export function CampaignBattlesPanel({ file, data, presetOptions, characterOptions, issues, setBattles }: Props) {
  const name = (id: string) => data.characters[id]?.name ?? id;
  return (
  <section className="panel" data-panel="campaign-battles">
    <h3>전투 순서</h3>
    <table className="campaign-table">
      <thead>
        <tr>
          <th>#</th>
          <th>이름</th>
          <th>적 편성</th>
          <th>적 레벨</th>
          <th title="적 군단마다의 병력. 비우면 레벨 상한으로 가득 (레벨 상한을 넘지 않음)">적 병력</th>
          <th>이기면 받는 돈</th>
          <th>이기면 합류</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {file.battles.map((b, i) => (
          <tr key={b.id}>
            <td>{i + 1}</td>
            <td>
              <TextField path={`campaign.battles.${i}.name`} />
            </td>
            <td>
              <SelectField path={`campaign.battles.${i}.enemyPreset`} options={presetOptions} />
            </td>
            <td>
              <NumberField path={`campaign.battles.${i}.enemyLevel`} step={1} min={1} />
            </td>
            <td>
              <input
                type="number"
                aria-label={`${b.name} 적 병력`}
                min={1}
                step={10}
                value={b.enemyTroops ?? ''}
                placeholder="상한 가득"
                onChange={(e) => {
                  const v = e.target.value;
                  setBattles((list) =>
                    list.map((x, n) => {
                      if (n !== i) return x;
                      const { enemyTroops: _old, ...rest } = x;
                      return v === '' ? rest : { ...rest, enemyTroops: Number(v) };
                    }),
                  );
                }}
              />
            </td>
            <td>
              <NumberField path={`campaign.battles.${i}.reward`} step={100} min={0} />
            </td>
            <td>
              <span className="join-list">
                {b.joins.map((j, k) => (
                  <button key={`${j.characterId}-${k}`} type="button" className="join-chip" title="눌러서 빼기" onClick={() => setBattles((list) => list.map((x, n) => (n === i ? { ...x, joins: x.joins.filter((_, m) => m !== k) } : x)))}>
                    {name(j.characterId)} ✕
                  </button>
                ))}
                <select
                  aria-label={`${b.name} 합류 추가`}
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) setBattles((list) => list.map((x, n) => (n === i ? { ...x, joins: [...x.joins, { characterId: id, unitType: data.characters[id]?.unitType }] } : x)));
                  }}
                >
                  <option value="">+ 장수</option>
                  {characterOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </span>
            </td>
            <td>
              <button type="button" disabled={file.battles.length <= 1} onClick={() => setBattles((list) => list.filter((_, n) => n !== i))}>
                빼기
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <button
      type="button"
      onClick={() =>
        setBattles((list) => {
          const last = list[list.length - 1];
          let n = list.length + 1;
          while (list.some((x) => x.id === `battle${n}`)) n++;
          return [...list, { ...last, id: `battle${n}`, name: `${last.name} (새)`, joins: [] }];
        })
      }
    >
      전투 추가 (마지막 전투 복사)
    </button>
    {issues.length > 0 && (
      <ul className="findings">
        {issues.map((i) => (
          <li key={i.message} className="warn">
            <span className="mark">!</span>
            {i.message}
          </li>
        ))}
      </ul>
    )}
  </section>
  );
}
