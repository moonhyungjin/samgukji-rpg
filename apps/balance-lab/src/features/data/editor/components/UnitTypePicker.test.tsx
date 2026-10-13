import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { gameData } from '@samgukji/game-data';
import { UnitTypePicker } from './UnitTypePicker';

const render = (value: string) => renderToString(<UnitTypePicker label="x 병종" value={value} unitTypes={gameData.unitTypes} onChange={() => {}} />).replace(/<!-- -->/g, '');
const optionsOf = (html: string, label: string) => {
  const select = new RegExp(`<select aria-label="${label}"[^>]*>(.*?)</select>`).exec(html)?.[1] ?? '';
  return [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
};

describe('병종 고르기 (계열 + 그 계열의 병종)', () => {
  it('방패병이면 방패병 계열의 병종만 나온다', () => {
    const members = optionsOf(render('shield'), 'x 병종');
    expect(members).toEqual(expect.arrayContaining(['shield', 'escort', 'heavy-shield', 'armored-guard', 'iron-wall']));
    expect(members).not.toContain('infantry');
    expect(members).not.toContain('cavalry');
    expect(members.every((id) => gameData.unitTypes[id].family === gameData.unitTypes.shield.family)).toBe(true);
  });

  it('승급한 병종을 골라도 같은 계열의 목록이 나온다 (기본 병종부터 순서대로)', () => {
    const members = optionsOf(render('iron-wall'), 'x 병종');
    expect(members[0]).toBe('shield');
    expect(members).toContain('iron-wall');
  });

  it('계열 목록은 승급 트리의 뿌리 병종이다', () => {
    const roots = optionsOf(render('shield'), 'x 병종 계열');
    expect(roots).toEqual(expect.arrayContaining(['infantry', 'shield', 'cavalry']));
    expect(roots).not.toContain('escort');
  });
});
