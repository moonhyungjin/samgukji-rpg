import type { BalanceConfig } from '@samgukji/battle-engine';
import balanceJson from '../data/balance.json';

/**
 * 밸런스 수치. 모두 임시값이며 Balance Lab(시뮬레이션)으로 조정하고 "파일에 저장"하면 data/balance.json이 바뀐다.
 * 규칙 근거는 docs/design/01-character-and-unit.md, 02-battle-rules.md 참고.
 * 계열 간 상성표는 없다. 병종 차이는 특성(data/traits.json)으로 표현한다.
 */
export const defaultBalance: BalanceConfig = balanceJson as unknown as BalanceConfig;
