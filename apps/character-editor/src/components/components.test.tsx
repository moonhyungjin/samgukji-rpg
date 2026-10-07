import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { defaultBalance, gameData, presets } from '@samgukji/game-data';
import type { CharacterData } from '@samgukji/battle-engine';
import App from '../App';
import { newCharacter, validate } from '../lib/editor';
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
    // 방패병 장비: 총 AP 5, 병력 1000, 실제 공격 7(8-1)/방어 9/지력 4/속도 4(5-1)
    const row = out.slice(out.indexOf('data-id="zhangFei"'), out.indexOf('data-id="guanYu"'));
    expect(row).toContain('7 / 9 / 4 / 4');
    expect(row).toContain('<strong>5</strong>');
    expect(row).toContain('1000');
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

  it('앱 전체: 저장하기 버튼, 내보내기/가져오기, 필터가 나온다', () => {
    const out = html(<App />);
    for (const text of ['장수 편집기', '저장하기', '저장된 상태', '+ 새 장수', '내보내기', '가져오기', '이름/id 검색', 'characters.json']) expect(out).toContain(text);
    expect(out).toContain(`${characters.length} / ${characters.length}명`);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>저장하기<\/button>|<button[^>]*class="primary"[^>]*disabled=""/);
  });
});
