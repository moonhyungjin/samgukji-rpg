import type { GameData } from '@samgukji/battle-engine';
import type { CampaignFile } from '@samgukji/game-data';
import type { LabState } from '../../lab/types';
import { NumberField, SelectField } from '../../shared/Fields';

interface Props {
  file: CampaignFile;
  data: GameData;
  presets: LabState['presets'];
  presetOptions: { value: string; label: string }[];
  setFile: (fn: (f: CampaignFile) => CampaignFile) => void;
}

/** 시작 자금과 레벨, 시작 편성, 승급 레벨, 포획 비율, 시작 장수 레벨, 경험치 */
export function CampaignSettingsPanel({ file, data, presets, presetOptions, setFile }: Props) {
  const name = (id: string) => data.characters[id]?.name ?? id;
  return (
  <section className="panel" data-panel="campaign-settings">
    <h3>캠페인: {file.name}</h3>
    <p className="note">
      시작·합류한 군단은 레벨 상한으로 가득 찬 병력입니다. 전투를 이어서 싸우고, 전투 사이에 자동 정비 AI가 승급 → 보충 → 남는 돈으로 증원을 합니다 (설계 문서 03). 값을 고친 뒤 아래 "돌려 보기"로 결과를 봅니다. 고친 값은 "파일에 저장"을 눌러야 게임에 들어갑니다. 숫자는 모두 [임시]입니다.
    </p>
    <div className="fields-grid">
      <NumberField label="시작 자금" path="campaign.startGold" step={100} min={0} />
      <NumberField label="시작 레벨" path="campaign.startLevel" step={1} min={1} />
      <SelectField label="시작 편성" path="campaign.startPreset" options={presetOptions} />
      <NumberField label="1차 승급 레벨" path="campaign.promotionLevels.0" step={1} min={1} />
      <NumberField label="2차 승급 레벨" path="campaign.promotionLevels.1" step={1} min={1} />
      <NumberField label="포획 비율" path="campaign.captureRate" step={0.01} min={0} hint="이기면 군단마다 자기가 줄인 적 병력 × 이 값만큼 정원과 병력이 는다 (레벨 상한까지). 0.05 = 5%" />
    </div>
    <h4 className="sub">시작 장수 레벨 (편성 순서대로)</h4>
    <p className="note">시작 편성의 장수마다 시작 레벨을 따로 정합니다. 비우면 위의 "시작 레벨"을 씁니다. 병력은 그 레벨의 상한으로 가득 찬 상태로 시작합니다.</p>
    <div className="fields-grid">
      {(presets.find((p) => p.id === file.startPreset)?.lineup ?? []).map((entry, i) => (
        <label className="field" key={entry.characterId}>
          <span>
            {i + 1}. {name(entry.characterId)}
          </span>
          <input
            type="number"
            aria-label={`${name(entry.characterId)} 시작 레벨`}
            min={1}
            step={1}
            value={file.startLevels?.[entry.characterId] ?? ''}
            placeholder={String(file.startLevel)}
            onChange={(e) => {
              const v = e.target.value;
              setFile((f) => {
                const { [entry.characterId]: _old, ...rest } = f.startLevels ?? {};
                const next = v === '' ? rest : { ...rest, [entry.characterId]: Math.max(1, Math.round(Number(v))) };
                const { startLevels: _drop, ...without } = f;
                return Object.keys(next).length > 0 ? { ...without, startLevels: next } : without;
              });
            }}
          />
        </label>
      ))}
    </div>
    <h4 className="sub">경험치 (출전한 군단마다)</h4>
    <div className="fields-grid">
      <NumberField label="이기면" path="campaign.exp.win" step={10} min={0} />
      <NumberField label="지면" path="campaign.exp.lose" step={10} min={0} />
      <NumberField label="처치 1당 추가" path="campaign.exp.perKill" step={5} min={0} />
      <NumberField label="레벨당 필요 경험치" path="campaign.exp.perLevel" step={10} min={1} hint="경험치가 이만큼 쌓일 때마다 레벨이 하나 오르고 병력 상한이 는다" />
    </div>
  </section>

  );
}
