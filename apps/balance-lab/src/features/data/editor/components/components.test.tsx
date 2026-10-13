import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { defaultBalance, gameData, presets } from '@samgukji/game-data';
import { maxTroops } from '@samgukji/battle-engine';
import type { CharacterData } from '@samgukji/battle-engine';
import { derive, newCharacter, validate } from '../lib/editor';
import { UnitTypeEditor } from './UnitTypeEditor';
import { CharacterTable } from './CharacterTable';

const noop = () => {};
const characters = Object.values(gameData.characters);
const html = (node: React.ReactElement) => renderToString(node).replace(/<!-- -->/g, '');

const table = (list: CharacterData[], extra: Partial<React.ComponentProps<typeof CharacterTable>> = {}) =>
  html(
    <CharacterTable
      list={list}
      savedIds={new Set(characters.map((c) => c.id))}
      changed={new Set()}
      issues={validate(list, gameData, defaultBalance)}
      data={gameData}
      balance={defaultBalance}
      presets={presets}
      onEdit={noop}
      onDuplicate={noop}
      onRevert={noop}
      onRemove={noop}
      {...extra}
    />,
  );

describe('장수 편집기 화면', () => {
  it('모든 장수가 이름, 병종, 스탯 입력란과 계산값(총 AP, 병력, 1회 피해)과 함께 나온다', () => {
    const out = table(characters);
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('undefined');
    for (const c of characters) expect(out).toContain(`value="${c.name}"`);
    for (const label of ['공격', '방어', '지력', '속도', '행동력', '외교', '내정', '매력', '총 AP', '병력', '1회 피해', '실제 공/방/지/속']) expect(out).toContain(label);
    // 장비: 실제 공/방/지/속 = 초기 스탯 + 병종 보정 + 승급 보너스, 병력 = Lv1 병력 + 레벨당 증가 × 병종 병력 배율 × (레벨 − 1) (현재 데이터에서 계산)
    const row = out.slice(out.indexOf('data-id="zhangFei"'), out.indexOf('data-id="guanYu"'));
    const zf = gameData.characters.zhangFei;
    const d = derive(zf, gameData, defaultBalance)!;
    expect(row).toContain(`${d.finalStats.attack} / ${d.finalStats.defense} / ${d.finalStats.intellect} / ${d.finalStats.speed}`);
    expect(row).toContain(`<strong>${d.totalAp}</strong>`);
    expect(row).toContain(String(maxTroops(defaultBalance, zf.level, gameData.unitTypes[zf.unitType].troopScale ?? 1)));
  });

  it('수정된 줄, 새 장수 줄, 오류 줄을 구분해 칠한다', () => {
    const added = newCharacter(characters, 'infantry');
    const broken = { ...newCharacter([...characters, added], 'infantry'), name: '' };
    const out = table([...characters, added, broken], { changed: new Set(['guanYu']) });
    expect(out).toMatch(/<tr class="changed" data-id="guanYu"/);
    expect(out).toMatch(new RegExp(`<tr class="added" data-id="${added.id}"`));
    expect(out).toMatch(new RegExp(`<tr class="added invalid" data-id="${broken.id}"`));
  });

  it('기본 편성에서 쓰는 장수는 삭제 버튼이 막혀 있다', () => {
    const out = table(characters);
    const row = (id: string, next: string) => out.slice(out.indexOf(`data-id="${id}"`), out.indexOf(`data-id="${next}"`));
    expect(row('zhangFei', 'guanYu')).toMatch(/class="danger" disabled=""/);
    // 편성에 없는 장수는 삭제할 수 있다
    expect(row('ytShieldB', 'ytInfantryA')).not.toMatch(/disabled=""/);
  });

  it('visibleIds로 줄을 걸러낸다', () => {
    const out = table(characters, { visibleIds: new Set(['guanYu']) });
    expect(out).toContain('data-id="guanYu"');
    expect(out).not.toContain('data-id="zhangFei"');
  });

});

describe('병종 편집 화면', () => {
  const unitTypes = Object.values(gameData.unitTypes);
  const editor = (list = unitTypes, extra: Partial<React.ComponentProps<typeof UnitTypeEditor>> = {}) =>
    html(
      <UnitTypeEditor
        unitTypes={list}
        savedIds={new Set(unitTypes.map((u) => u.id))}
        changed={new Set()}
        issues={[]}
        characters={gameData.characters}
        data={gameData}
        balance={defaultBalance}
        onEdit={noop}
        onDuplicate={noop}
        onRevert={noop}
        onRemove={noop}
        {...extra}
      />,
    );

  it('모든 병종이 카드로 나오고 값이 비어 있거나 NaN이 아니다', () => {
    const out = editor();
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('undefined');
    for (const u of unitTypes) expect(out).toContain(`data-unittype="${u.id}"`);
    for (const label of ['사거리', '병력 배율', '기본 AP', '배치 가능 열', '스탯 보정', '받는 피해 배수', '반격', '일반공격', '추가 스킬', '특성', '가드']) expect(out).toContain(label);
  });

  it('방패병 카드에는 가드 설정(시작/상승/지력당 상승/감소/피해 배수)이 있고 보병 카드에는 없다', () => {
    const out = editor();
    const card = (id: string, next: string) => out.slice(out.indexOf(`data-unittype="${id}"`), out.indexOf(`data-unittype="${next}"`));
    expect(card('shield', 'cavalry')).toContain('가드 시작');
    expect(card('shield', 'cavalry')).toContain('가드 지력당 상승');
    expect(card('shield', 'cavalry')).toContain('가드 피해 배수');
    expect(card('infantry', 'shield')).not.toContain('가드 시작');
  });

  it('장수가 쓰는 병종은 삭제 버튼이 막혀 있고, 쓰는 장수가 없으면 삭제할 수 있다', () => {
    const out = editor();
    // 쓰는 장수가 있는 병종과 없는 병종은 지금 데이터에서 고른다 (장수 구성은 Lab에서 바뀐다)
    const chars = Object.values(gameData.characters);
    const cardOf = (id: string) => {
      const start = out.indexOf(`data-unittype="${id}"`);
      return out.slice(start, out.indexOf('</section>', start));
    };
    expect(cardOf(chars[0].unitType)).toMatch(/class="danger" disabled=""/);
    const unused = unitTypes.find((u) => !chars.some((c) => c.unitType === u.id));
    if (unused) expect(cardOf(unused.id)).not.toMatch(/class="danger" disabled=""/);
  });

  it('수정/새 병종/오류 카드를 구분해 칠하고, 병력과 열 요약을 보여 준다', () => {
    const fresh = { ...unitTypes[0], id: 'unit1', name: '새 병종' };
    const out = editor([...unitTypes, fresh], { changed: new Set(['cavalry']), issues: [{ level: 'error', id: 'unit1', message: '병종 새 병종: 오류' }] });
    expect(out).toMatch(/class="unittype changed" data-unittype="cavalry"/);
    expect(out).toMatch(/class="unittype added invalid" data-unittype="unit1"/);
    expect(out).toContain(`병력 ${maxTroops(defaultBalance, 15, gameData.unitTypes.cavalry.troopScale ?? 1)} · 전열/후열`); // 기병
  });

});
