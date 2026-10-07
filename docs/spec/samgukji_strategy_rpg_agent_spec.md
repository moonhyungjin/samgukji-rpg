# 삼국지 × 전국란스 스타일 서브컬처 전략 RPG
## 개발 기획 및 에이전트 작업 명세서 v0.1

> 목적: 삼국지의 역사적 서사/세력전과 전국란스 스타일의 지역 제패 및 캐릭터 중심 전투를 결합한 전략 RPG를 웹 기술 스택으로 빠르게 프로토타이핑한다.
>
> **현재 최우선 목표는 정식 게임 제작이 아니라 `전투 엔진 + Balance Lab + 전투 프로토타입`을 검증하는 것이다.**

---

# 1. 프로젝트 방향

## 1.1 게임 콘셉트

삼국지를 소재로 하되, 전통적인 삼국지 전략 게임보다는 다음 요소에 집중한다.

- 삼국지 무장/세력 중심의 캐릭터 게임
- 전국란스 스타일의 지역 제패/땅따먹기
- 6인 그리드 기반 전투
- 전열/후열의 위치 전략
- 병종 간 상성
- 캐릭터별 고유 스킬
- 행동 게이지 기반의 빠른 턴 진행
- 다양한 무장 조합과 빌드
- 캐릭터 중심의 서브컬처적 연출

다만 초기 프로토타입에서는 지역 제패, 스토리, 대규모 캐릭터 콘텐츠보다 **전투 시스템의 재미와 밸런스 검증**을 우선한다.

---

# 2. 개발 방향 변경: Unity → Web + PixiJS

초기 명세에서는 Unity + UI Toolkit을 고려했으나, 현재 프로젝트 방향에서는 **Unity를 필수로 사용하지 않는다.**

사용자가 웹 프론트엔드 개발 경험을 가지고 있고, 게임의 핵심이 2D 캐릭터/이펙트/UI 중심이므로 다음 스택을 우선 사용한다.

## 2.1 권장 기술 스택

- **언어:** TypeScript
- **UI:** React
- **2D 게임 렌더링:** PixiJS
- **게임 로직:** 순수 TypeScript
- **데이터:** JSON / TypeScript Data
- **빌드:** Vite
- **스타일:** CSS
- **패키지 관리:** npm
- **버전 관리:** Git

### 역할 분리

```text
React
 ├─ 메뉴
 ├─ 캐릭터 정보
 ├─ 스킬 정보
 ├─ Balance Lab
 ├─ 전투 로그
 └─ 결과 분석

PixiJS
 ├─ 전투 필드
 ├─ 캐릭터 렌더링
 ├─ HP Bar
 ├─ 행동 게이지
 ├─ 공격 연출
 ├─ 데미지 숫자
 └─ 스킬 이펙트

Battle Engine
 ├─ 행동 게이지
 ├─ 턴 처리
 ├─ 상성
 ├─ 타겟팅
 ├─ 데미지
 ├─ 스킬
 ├─ 버프/디버프
 └─ 승패 판정

Game Data
 ├─ 병종
 ├─ 캐릭터
 ├─ 스킬
 └─ 밸런스 설정
```

**중요:** Battle Engine은 React와 PixiJS에 의존하지 않는 순수 TypeScript 코드로 작성한다.

---

# 3. 전체 아키텍처

권장 프로젝트 구조:

```text
project/
├─ apps/
│  ├─ game/
│  │  ├─ React UI
│  │  └─ PixiJS Battle Renderer
│  │
│  └─ balance-lab/
│     └─ React Balance Editor / Analyzer
│
├─ packages/
│  ├─ battle-engine/
│  │  ├─ BattleEngine
│  │  ├─ CharacterState
│  │  ├─ ActionGauge
│  │  ├─ DamageCalculator
│  │  ├─ TargetSelector
│  │  ├─ SkillSystem
│  │  └─ StatusEffectSystem
│  │
│  └─ game-data/
│     ├─ units
│     ├─ characters
│     ├─ skills
│     └─ balance
│
└─ tools/
   └─ data / simulation utilities
```

초기에는 하나의 Vite 프로젝트 안에서 시작해도 되지만, **게임 로직과 UI를 분리하는 원칙은 반드시 유지한다.**

---

# 4. 전투 시스템

## 4.1 전투 인원

기본 전투는:

**아군 6명 vs 적군 6명**

으로 설계한다.

각 진영은 전열 3명 / 후열 3명이다.

```text
아군                         적군

후열  [A1][A2][A3]          [E1][E2][E3]  후열
전열  [A4][A5][A6]          [E4][E5][E6]  전열
```

실제 렌더링 배치는 UI/아트에 따라 변경 가능하지만, **논리적인 전열/후열 구조는 데이터에서 명확하게 유지한다.**

---

# 5. 기본 병종

초기 병종은 4개로 제한한다.

## 5.1 보병 Infantry

역할:

- 전열 고정
- 높은 HP
- 높은 방어력
- 안정적인 전투
- 적의 후열 접근 차단
- 도발/가드 등 보호 스킬

상성:

```text
보병 > 기병
```

## 5.2 기병 Cavalry

역할:

- 전열/후열 배치 가능
- 높은 공격력
- 높은 속도
- 후열 저격
- 관통
- 돌격

상성:

```text
기병 > 궁병
```

## 5.3 궁병 Archer

역할:

- 후열 고정
- 높은 공격력
- 낮은 방어력
- 전열을 무시하고 후열 공격 가능

상성:

```text
궁병 > 보병
```

## 5.4 도사/책사 Tactician

역할:

- 후열 고정
- 광역 공격
- 광역 디버프
- 속성 마법
- 회복
- 높은 행동력 비용

상성:

```text
특정 병종 상성 없음
```

단, 위 상성은 초기 가설이다. 실제 Balance Lab 시뮬레이션을 통해 조정한다.

---

# 6. 상성 시스템

초기 상성 배율 예시:

```text
Infantry → Cavalry   × 1.5
Cavalry  → Archer    × 1.5
Archer   → Infantry  × 1.5
```

반드시 코드에 숫자를 하드코딩하지 말고 데이터화한다.

예:

```ts
type MatchupTable = {
  [attacker: string]: {
    [defender: string]: number;
  };
};
```

향후:

- 약점 배율
- 저항 배율
- 상성 무효
- 특수 캐릭터 상성
- 스킬별 상성 무시

등으로 확장할 수 있도록 설계한다.

---

# 7. 행동 게이지 시스템

전국란스 스타일의 빠른 턴 진행을 참고한다.

각 캐릭터는:

```ts
actionGauge: number; // 0 ~ 100
speed: number;
```

을 가진다.

기본적인 처리:

```text
Speed가 높을수록 Action Gauge가 빠르게 증가
↓
100 도달
↓
행동 가능
↓
행동 실행
↓
Gauge 감소/초기화
↓
다음 캐릭터 행동
```

정확한 게이지 공식은 프로토타입에서 조정한다.

예:

```ts
gauge += speed * delta;
```

또는 프레임과 무관한 deterministic tick 방식도 검토한다.

**중요:** 밸런스 테스트가 가능해야 하므로 시뮬레이터에서는 동일한 입력에 대해 재현 가능한 결과를 만들 수 있어야 한다.

---

# 8. 캐릭터 데이터

초기 `CharacterState` 개념:

```ts
interface CharacterState {
  id: string;
  name: string;

  unitType: UnitType;
  position: RowPosition;

  maxHp: number;
  currentHp: number;

  attack: number;
  defense: number;
  speed: number;

  actionGauge: number;

  skills: string[];

  isDead: boolean;
}
```

실제 게임에서는 다음과 같이 **정적 데이터와 전투 중 상태를 분리**한다.

```text
CharacterData
    ↓
CharacterState
```

예:

```ts
interface CharacterData {
  id: string;
  name: string;
  unitType: UnitType;

  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseSpeed: number;

  skills: string[];
}
```

전투 중 변경되는 HP, Gauge, 상태 이상 등은 `CharacterState`에서 관리한다.

---

# 9. 스킬 시스템

스킬 역시 데이터 기반으로 만든다.

예:

```ts
interface SkillData {
  id: string;
  name: string;

  power: number;
  actionCost: number;

  targetType: TargetType;

  effects: SkillEffect[];

  cooldown?: number;
}
```

예시:

```text
청룡참
- 대상: 적 전열 1명
- 피해: ATK × 1.8
- 행동 비용: 35
- 추가 효과: 출혈 2턴
```

초기에는 복잡한 스킬을 만들지 말고:

1. 단일 공격
2. 단일 회복
3. 광역 공격
4. 버프
5. 디버프
6. 관통 공격

정도의 기본 효과부터 구현한다.

---

# 10. 타겟팅 시스템

타겟 선택 로직은 별도의 모듈로 분리한다.

예:

```ts
TargetSelector.getValidTargets(attacker, battleState)
```

기본 규칙:

### 보병

- 기본적으로 적 전열을 우선 공격
- 적 전열이 존재하면 후열 공격 불가
- 단, 특정 스킬로 후열 공격 가능

### 기병

- 전열/후열 공격 가능
- 일부 스킬로 후열 저격
- 일부 스킬로 관통

### 궁병

- 후열 고정
- 적 전열을 무시하고 후열 공격 가능

### 책사

- 스킬에 따라 대상 결정
- 단일/광역/아군/적군 모두 가능

향후 도발/가드가 추가되면:

```text
TargetSelector
    ↓
기본 대상 규칙
    ↓
도발
    ↓
가드
    ↓
은신
    ↓
관통
    ↓
최종 대상
```

처럼 처리한다.

---

# 11. 데미지 계산

초기에는 단순하게 시작한다.

```text
기본 피해
= 공격자의 Attack

상성 적용
= 기본 피해 × 상성 배율

방어력 적용
= 상성 적용 피해 - 방어력 보정
```

정확한 공식은 Balance Lab에서 반복적으로 조정한다.

**중요:** 데미지 공식도 별도 함수로 분리한다.

```ts
DamageCalculator.calculate({
  attacker,
  defender,
  skill,
  battleState
});
```

이를 통해 Balance Lab에서 동일한 공식으로 수천~수만 회의 전투를 시뮬레이션할 수 있어야 한다.

---

# 12. Balance Lab

## 12.1 가장 중요한 개발 도구

이 프로젝트에서 Balance Lab은 단순한 개발자용 옵션 메뉴가 아니라 핵심 개발 도구다.

목표:

> 병종, 캐릭터, 스킬, 상성의 숫자를 수정하고 실제 전투 결과에 어떤 영향을 주는지 즉시 확인한다.

---

# 13. Balance Lab 기능

## 13.1 병종 편집

예:

```text
Infantry

HP       [150]
Attack   [35]
Defense  [30]
Speed    [10]
```

---

## 13.2 상성 편집

```text
             Infantry  Cavalry  Archer  Tactician

Infantry       1.0       1.5      1.0      1.0
Cavalry        1.0       1.0      1.5      1.0
Archer         1.5       1.0      1.0      1.0
Tactician      1.0       1.0      1.0      1.0
```

수정 즉시 시뮬레이션에 반영한다.

---

# 14. 스킬 편집

예:

```text
[청룡참]

Power          [1.8]
Action Cost    [35]
Target         Front 1
Cooldown       [2]

Effects
- Bleed
- 2 turns
```

스킬의 예상 피해도 표시한다.

```text
일반 공격       45
청룡참           81
차이            +80%
```

---

# 15. 자동 전투 시뮬레이션

Balance Lab에서:

```text
[1회 전투]
[100회]
[1,000회]
[10,000회]
```

를 실행할 수 있도록 한다.

결과:

```text
10,000 Battles

Ally Win       6,421
Enemy Win      3,579

Ally Win Rate  64.21%

Average Battle Duration   31.7 sec
Average Turns             21.4
Average Damage            42.8
```

---

# 16. 전투 분석

다음 정보를 제공한다.

- 승률
- 평균 전투 시간
- 평균 턴 수
- 평균 피해량
- 평균 사망자 수
- 캐릭터별 생존율
- 캐릭터별 피해량
- 캐릭터별 사망률
- 스킬 사용 횟수
- 스킬별 평균 피해량
- 병종별 승률
- 선공/후공 승률
- 상성별 승률

예:

```text
Character Performance

관우
Damage        3,821
Kills         2.4
Deaths        0.8
Win Rate      61%

장비
Damage        2,910
Kills         1.7
Deaths        0.5
Win Rate      67%

제갈량
Damage        2,440
Healing       1,920
Deaths        1.1
Win Rate      59%
```

---

# 17. Balance Lab에서 특히 찾아야 할 문제

자동 분석을 통해 다음을 탐지한다.

### 지나치게 강한 병종

```text
Cavalry Win Rate: 72%
```

→ 기병이 과도하게 강할 가능성

### 지나치게 약한 병종

```text
Archer Win Rate: 29%
```

→ 궁병이 구조적으로 약할 가능성

### 특정 캐릭터가 과도하게 강함

```text
Character A
Pick Rate: 82%
Win Rate: 68%
```

### 특정 스킬이 지나치게 강함

```text
Skill X
Average Damage: 2.4 × Normal Attack
```

이런 식으로 **밸런스 이상 징후를 개발자에게 보여주는 것**을 목표로 한다.

---

# 18. 게임 화면

PixiJS를 이용해 실제 전투를 렌더링한다.

초기에는 고퀄리티 아트를 사용하지 않는다.

임시 형태:

```text
┌─────────────────────────────────────────────┐

     ENEMY

     [E1]       [E2]       [E3]
     [E4]       [E5]       [E6]


                 VS


     [A1]       [A2]       [A3]
     [A4]       [A5]       [A6]

     PLAYER

└─────────────────────────────────────────────┘
```

캐릭터는 우선:

- 사각형
- 간단한 아이콘
- 이름
- HP Bar
- Action Gauge

정도로 표현한다.

---

# 19. React와 PixiJS의 책임

## React

담당:

- 메뉴
- 캐릭터 정보
- 스킬 정보
- Balance Lab
- 설정
- 전투 로그
- 전투 결과
- 통계/그래프

## PixiJS

담당:

- 전투 캐릭터
- 캐릭터 위치
- 공격 애니메이션
- 스킬 연출
- 데미지 숫자
- HP Bar
- Action Gauge
- 타겟 표시
- 이펙트

## Battle Engine

담당:

- 실제 게임 규칙
- 행동 순서
- 상성
- 데미지
- 타겟팅
- 스킬
- 상태 이상
- 승패

**React/PixiJS에서 게임 규칙을 직접 계산하지 않는다.**

---

# 20. 전투 엔진의 핵심 원칙

다음 코드가 가능해야 한다.

```ts
const result = BattleSimulator.run({
  ally: [
    "guanYu",
    "zhangFei",
    "zhugeLiang"
  ],

  enemy: [
    "caoCao",
    "xiahouDun",
    "archer"
  ],

  iterations: 10000
});
```

그리고 결과:

```ts
{
  allyWinRate: 0.6421,
  enemyWinRate: 0.3579,
  averageDuration: 31.7,
  averageTurns: 21.4,
  characterStats: {...},
  skillStats: {...}
}
```

를 반환할 수 있어야 한다.

이 구조가 완성되면 게임 화면 없이도 전투 밸런스를 검증할 수 있다.

---

# 21. 데이터 중심 설계

가능한 한 숫자를 코드에 직접 넣지 않는다.

잘못된 예:

```ts
if (attacker.type === "Cavalry") {
  damage *= 1.5;
}
```

권장:

```ts
damage *= balance.matchups[attacker.type][defender.type];
```

데이터:

```json
{
  "Infantry": {
    "Cavalry": 1.5
  },
  "Cavalry": {
    "Archer": 1.5
  },
  "Archer": {
    "Infantry": 1.5
  }
}
```

---

# 22. 초기 개발 단계

## Phase 1 — Battle Engine

목표:

- CharacterState
- UnitType
- RowPosition
- ActionGauge
- DamageCalculator
- TargetSelector
- 기본 공격
- 사망
- 승패

완료 조건:

> UI 없이 TypeScript 테스트 코드만으로 6 vs 6 전투가 끝까지 실행된다.

---

## Phase 2 — Balance Lab

목표:

- 병종 편집
- 캐릭터 편집
- 상성 편집
- 스킬 편집
- 1/100/1000/10000회 시뮬레이션
- 결과 분석

완료 조건:

> 숫자를 변경하면 시뮬레이션 결과가 즉시 달라진다.

---

## Phase 3 — PixiJS Battle Renderer

목표:

- 전투 필드
- 12개 슬롯
- 캐릭터 표시
- HP
- Action Gauge
- 공격 애니메이션
- 데미지 숫자
- 사망 연출

완료 조건:

> Battle Engine의 상태를 PixiJS가 시각적으로 재현한다.

---

## Phase 4 — React Game UI

목표:

- 전투 시작
- 전투 정보
- 스킬 선택
- 전투 로그
- 결과 화면

---

## Phase 5 — 캐릭터 콘텐츠

목표:

- 실제 삼국지 무장
- 고유 스킬
- 능력치 차별화
- 세력

초기 목표:

**20~30명 정도**

---

## Phase 6 — 전략 시스템

이 단계부터:

- 지역
- 세력
- 지역 제패
- 병력
- 영입
- 이벤트
- 내정
- 스토리

등을 추가한다.

---

# 23. 장기적인 게임 구조

최종적으로는 다음 구조를 목표로 한다.

```text
전략 맵
   ↓
지역 선택
   ↓
세력/무장 편성
   ↓
6 vs 6 전투
   ↓
승리
   ↓
지역 점령
   ↓
무장 영입/성장
   ↓
다음 지역
```

전국란스 스타일의 지역 제패 구조와 삼국지의 역사적 사건/세력을 결합한다.

---

# 24. AI 이미지 생성 / ComfyUI

캐릭터 아트는 초기 개발에서 필수가 아니다.

필요한 시점에 ComfyUI 등의 이미지 생성 워크플로우를 고려한다.

목표:

```text
캐릭터 데이터
    ↓
캐릭터 이미지
    ↓
초상화 / 전투 이미지
    ↓
게임 Asset
```

하지만 **전투 엔진과 Balance Lab이 먼저다.**

아트를 먼저 만들고 게임 시스템을 나중에 만드는 방식은 피한다.

---

# 25. Steam 출시 방향

최종 목표는 Steam 출시를 고려한다.

권장 개발 순서:

```text
Battle Engine
    ↓
Balance Lab
    ↓
전투 프로토타입
    ↓
작은 플레이 가능한 게임
    ↓
Steam Coming Soon 페이지
    ↓
데모
    ↓
피드백
    ↓
콘텐츠 확장
    ↓
정식 출시
```

Steam 출시 자체보다 먼저 **핵심 전투의 재미를 검증**한다.

---

# 26. 첫 번째 프로토타입의 범위

첫 번째 버전은 다음만 구현한다.

### 필수

- React
- TypeScript
- PixiJS
- 4병종
- 6 vs 6
- 전열/후열
- Action Gauge
- 기본 공격
- 병종 상성
- 타겟팅
- HP
- 사망
- 승패
- 전투 로그
- Balance Lab
- 1,000회 이상 자동 시뮬레이션

### 아직 하지 않음

- 지역 제패
- 삼국지 전체 지도
- 대규모 스토리
- 복잡한 내정
- 캐릭터 성장
- 고퀄리티 아트
- 음성
- 복잡한 애니메이션
- 멀티플레이
- 과도한 UI 장식

---

# 27. 에이전트 작업 원칙

AI 에이전트는 다음 원칙을 준수한다.

1. **작동하는 최소 단위부터 구현한다.**
2. 전투 로직과 렌더링을 분리한다.
3. 숫자를 가능한 한 데이터로 분리한다.
4. 새로운 시스템을 추가할 때 기존 전투 엔진을 불필요하게 수정하지 않는다.
5. 모든 주요 전투 규칙은 테스트 가능한 순수 함수/클래스로 작성한다.
6. Balance Lab과 실제 게임이 동일한 Battle Engine을 사용한다.
7. 임시 UI와 임시 아트를 사용해도 좋다.
8. 아트 제작보다 게임 시스템 검증을 우선한다.
9. 밸런스 수치는 처음부터 완벽하게 정하지 않는다.
10. 시뮬레이션 결과를 이용해 반복적으로 조정한다.

---

# 28. 에이전트에게 첫 작업으로 지시할 내용

다음 작업부터 시작한다.

## Task 1

React + TypeScript + PixiJS 프로젝트를 구성한다.

## Task 2

순수 TypeScript 기반 Battle Engine을 작성한다.

필수 클래스/모듈:

```text
BattleEngine
CharacterState
BattleState
ActionGaugeSystem
DamageCalculator
TargetSelector
SkillSystem
```

## Task 3

다음 병종을 구현한다.

```text
Infantry
Cavalry
Archer
Tactician
```

## Task 4

6 vs 6 전투를 코드만으로 실행한다.

## Task 5

Action Gauge 기반 자동 전투를 구현한다.

## Task 6

전열/후열 및 기본 타겟팅을 구현한다.

## Task 7

상성 데이터를 JSON 또는 TypeScript 데이터로 분리한다.

## Task 8

1,000회 자동 전투 시뮬레이션이 가능하도록 한다.

## Task 9

시뮬레이션 결과를 JSON으로 출력한다.

## Task 10

그 다음 React 기반 Balance Lab UI를 구축한다.

**PixiJS 전투 화면은 Battle Engine과 Balance Lab의 기본 구조가 검증된 이후 구축한다.**

---

# 29. 핵심 개발 철학

이 프로젝트의 핵심은 처음부터 거대한 삼국지 게임을 만드는 것이 아니다.

다음 질문을 단계적으로 검증한다.

```text
1. 6인 전투가 재미있는가?
        ↓
2. 병종 상성이 전략적인가?
        ↓
3. 캐릭터별 스킬 차이가 재미있는가?
        ↓
4. 조합을 바꾸는 재미가 있는가?
        ↓
5. 지역 제패를 붙이면 재미가 증가하는가?
        ↓
6. 삼국지 캐릭터/스토리가 게임을 강화하는가?
        ↓
7. Steam에 출시할 만한 게임이 되는가?
```

따라서 **첫 번째 성공 기준은 '멋진 삼국지 게임'이 아니라 '숫자를 바꿔가며 계속 싸워보고 싶은 전투 샌드박스'**다.

---

# 30. 현재 결정 사항 요약

| 항목 | 결정 |
|---|---|
| 엔진 | Unity 필수 아님 |
| 게임 기술 | React + TypeScript + PixiJS |
| UI | React |
| 렌더링 | PixiJS |
| 전투 로직 | 순수 TypeScript |
| 데이터 | JSON / TypeScript |
| 전투 | 6 vs 6 |
| 진형 | 전열 3 + 후열 3 |
| 병종 | 보병 / 기병 / 궁병 / 책사 |
| 턴 방식 | Action Gauge |
| 핵심 상성 | 보병 > 기병 > 궁병 > 보병 |
| 개발 우선순위 | Battle Engine → Balance Lab → PixiJS |
| 밸런스 검증 | 자동 시뮬레이션 |
| 아트 | 시스템 검증 이후 |
| AI 이미지 | 필요 시 ComfyUI |
| 최종 플랫폼 | Steam 우선 고려 |
| 첫 목표 | 플레이 가능한 전투 샌드박스 |

---

## 최종 지시

**지금 당장 지역 제패 시스템이나 대규모 콘텐츠를 만들지 않는다.**

먼저:

> **"데이터를 수정하고 → 전투를 수천 번 돌리고 → 결과를 분석하고 → 실제 PixiJS 전투에서 확인할 수 있는 구조"**

를 완성한다.

이 구조가 안정적으로 동작한 뒤 캐릭터, 스킬, 세력, 지역 제패 시스템을 단계적으로 추가한다.
