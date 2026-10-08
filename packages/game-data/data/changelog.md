# 데이터 변경 기록

Balance Lab의 "파일에 저장"을 누를 때마다 자동으로 덧붙는다 (가장 아래가 최신). 값이 언제 어떻게 바뀌었는지, 왜 바뀌었는지(메모)를 확인하는 용도다.
손으로 지우거나 고치지 않는다. 형식: `경로: 이전 값 → 새 값`, `+ 새로 생김`, `- 없어짐`.

## 2026-10-07 — (수동 기록) 이 기능이 생기기 전에 Lab에서 저장된 값
메모: 저장 로그 도입 전이라 시각과 순서는 정확하지 않다. 나중에 파일을 비교해서 알게 된 변경만 적었다.
- balance.damage.attackScale: 47 → 50
- balance.heal.scale: 47 → 45
- unitTypes.cavalry.damageTakenByType.physical: 0.855 → 0.9
- unitTypes.cavalry.damageTakenByType.magic: 0.99 → 1.1
- presets.shu: 전열 세 번째 칸 조운(zhaoYun) → 유비(liuBei)
- presets.wei: 전열 세 번째 칸 장료(zhangLiao) → 위연(weiYan)
- unitTypes.geomancer.basicSkillId: "heal" → "infantry-attack" (이후 아래 항목에서 활 공격으로 재설계)

## 2026-10-07 — (수동 기록) 에이전트(Claude)가 파일을 직접 고친 변경
메모: 사용자 요청에 따른 설계 변경이다. 자세한 내용은 git 기록과 docs/design/01-character-and-unit.md의 변경 이력(v0.31 이후)에 있다.
- unitTypes.*.traitIds: 모두 [] (병종 특성을 당분간 쓰지 않음). 궁병의 "전열 ×0.8"은 unitTypes.archer.damageDealtByRow.front: 0.8로 옮김
- unitTypes.geomancer: 기본 공격을 활 공격(geomancer-shot, 계수 0.6, 공격력 기반)으로, 추가 스킬을 치유(heal, 지력 기반)로 재설계
- balance.troopFactor: mode(absolute/relative), relative, self 추가. normalizeByScale: true — 병종 병력 배율(징병 비용)이 피해에 영향을 주지 않게 함

## 2026-10-07 17:43 — 밸런스 수치
- balance.damage.attackScale: 50 → 60

## 2026-10-07 — (수동 기록) 에이전트(Claude)가 파일을 직접 고친 변경
메모: 원작(전국란스) 전투 방식을 따르기로 한 사용자 결정. 1단계: 병력 보정. 참고 docs/reference/sengoku-rance-battle.md
- balance.troopFactor.mode: "absolute" → "tiered"
- balance.troopFactor.normalizeByScale: true → false (원작처럼 실제 병력 수로 피해 계산)
+ balance.troopFactor.tiered: {"knee":1000,"knee2":4000,"rate2":0.5,"rate3":0.25,"floor":200,"capAtTroops":true}

## 2026-10-07 — (수동 기록) 에이전트(Claude)가 파일을 직접 고친 변경
메모: 원작 방식 2단계: 반격. 반격 비율을 병종에서 기술로 옮기고(원작 일반공격 25%), 반격은 맞기 전 병력으로 계산한다. 원작처럼 궁병은 반격하지 않는다.
- unitTypes.*.counterRate: 없어짐 (shield 0.5, infantry 0.5, cavalry 0.6, archer 0.25, strategist/taoist/geomancer 0.5)
+ skills.infantry-attack.counterRate: 0.25
+ skills.cavalry-charge.counterRate: 0.25
- unitTypes.archer.canCounter: true → false

## 2026-10-07 — (수동 기록) 에이전트(Claude)가 파일을 직접 고친 변경
메모: 원작 방식 3단계: 가드. 가드 한 번에 지력 × 20만큼 쌓이고, 가드 중에 맞을 때마다(대신 맞든 직접 맞든) 40 줄며, 가드 중 받는 피해는 절반이다.
- unitTypes.shield.guard.gain: 70 → 0
+ unitTypes.shield.guard.gainPerIntellect: 20
- unitTypes.shield.guard.damageTaken: 0.75 → 0.5

## 2026-10-07 — (수동 기록) 에이전트(Claude)가 파일을 직접 고친 변경
메모: 원작 방식 4단계: 병력 상한 배율과 징병 단가. 대응: 보병=무사, 방패병=아시가루, 궁병=궁병, 기병=기마, 책사=군사, 도사=음양사, 풍수사=무녀. 1명당 단가는 우리 병력 단위(원작의 약 2배)에 맞춰 원작의 절반 [기본값].
- unitTypes.shield.troopScale: 1 → 1.5
- unitTypes.archer.troopScale: 0.85 → 1.5
- unitTypes.cavalry.troopScale: 0.8 → 1
- unitTypes.strategist.troopScale: 0.8 → 1
- unitTypes.taoist.troopScale: 0.8 → 0.7
- unitTypes.geomancer.troopScale: 0.6 → 0.7
+ unitTypes.*.recruit (증원/보충/해고): 보병 24/2/2, 방패병 12/0.5/1, 궁병 18/2/1.5, 기병 30/2/2, 책사 24/2/2, 도사 30/2/2, 풍수사 36/2/2

## 2026-10-07 — (수동 기록) 에이전트(Claude)가 파일을 직접 고친 변경
메모: 방패병이 거의 죽지 않아서(생존율 99.9%) 사용자가 조정.
- unitTypes.shield.troopScale: 1.5 → 1.2
- unitTypes.shield.guard.damageTaken: 0.5 → 0.75

## 2026-10-07 — (수동 기록) 에이전트(Claude)가 파일을 직접 고친 변경
메모: 원작식(더하기/빼기) 피해 공식을 시험한다. 기존 공식은 balance.damage.formula: "divide"로 되돌릴 수 있다.
+ balance.damage.formula: "additive"
+ balance.damage.additive: {"attackMul":10,"defenseMul":8,"intellectMul":10,"resistMul":7,"min":10,"scale":10}
+ unitTypes.*.typeBonus (물리/책략): 보병 30/5, 방패병 15/5, 기병 50/5, 궁병 10/5, 책사 8/5, 도사 5/40, 풍수사 5/20
+ unitTypes.*.vulnerability (물리/책략): 보병 0/20, 방패병 10/10, 기병 0/20, 궁병 15/20, 책사 20/20, 도사 20/0, 풍수사 20/10

## 2026-10-07 21:35 — 밸런스 수치
- balance.damage.attackScale: 60 → 50
- balance.troopFactor.tiered.rate3: 0.25 → 0.3
- balance.troopFactor.tiered.floor: 200 → 300

## 2026-10-07 — (수동 기록) 에이전트(Claude)가 파일을 직접 고친 변경
메모: 원작식 공식에서 방패병이 너무 약해져서 사용자가 원작 값으로 되돌림 (가드 시작 50은 유지).
- unitTypes.shield.troopScale: 1.2 → 1.5
- unitTypes.shield.guard.damageTaken: 0.75 → 0.5

## 2026-10-07 21:56 — 병종
- unitTypes.infantry.typeBonus.physical: 30 → 5
- unitTypes.shield.typeBonus.physical: 15 → 0
- unitTypes.cavalry.typeBonus.physical: 50 → 30
- unitTypes.archer.typeBonus.physical: 10 → 0
- unitTypes.strategist.typeBonus.physical: 8 → 0
- unitTypes.taoist.typeBonus.physical: 5 → 0
- unitTypes.geomancer.typeBonus.physical: 5 → 0

## 2026-10-07 21:58 — 병종
- unitTypes.strategist.typeBonus.magic: 5 → 10
- unitTypes.strategist.vulnerability.physical: 20 → 10
- unitTypes.strategist.vulnerability.magic: 20 → 0
- unitTypes.taoist.typeBonus.magic: 40 → 5
- unitTypes.taoist.vulnerability.physical: 20 → 10
- unitTypes.geomancer.typeBonus.magic: 20 → 5
- unitTypes.geomancer.vulnerability.physical: 20 → 10
- unitTypes.geomancer.vulnerability.magic: 10 → 0

## 2026-10-07 21:59 — 병종
- unitTypes.archer.troopScale: 1.5 → 1.2

## 2026-10-07 21:59 — 병종
- unitTypes.archer.troopScale: 1.2 → 1
- unitTypes.archer.typeBonus.physical: 0 → 5

## 2026-10-07 22:00 — 병종
- unitTypes.infantry.typeBonus.physical: 5 → 10

## 2026-10-07 22:05 — 병종
- unitTypes.archer.troopScale: 1 → 0.9

## 2026-10-08 00:20 — 밸런스 수치
메모: 기본 피해 공식을 원작식에서 격차식으로 바꿈 (병종 보정 없이 공격 − 방어 격차 1점당 ±10%, 하한 0.3배, 기본 피해 = 기준 스탯 × 공격 계수 50). 크리티컬 10% ×1.5 추가.
- balance.damage.formula: additive → gap
- balance.critical: (없음) → 확률 10%, 배율 1.5

## 2026-10-07 23:52 — 밸런스 수치
- balance.troopFactor.mode: "tiered" → "relative"
- balance.troopFactor.normalizeByScale: false → true

## 2026-10-07 23:57 — 병종
- unitTypes.strategist.troopScale: 1 → 0.8
- unitTypes.taoist.troopScale: 0.7 → 0.8
- unitTypes.geomancer.vulnerability.physical: 10 → 5

## 2026-10-07 23:57 — 병종
- unitTypes.cavalry.troopScale: 1 → 0.9

## 2026-10-07 23:58 — 병종
- unitTypes.strategist.troopScale: 0.8 → 0.9

## 2026-10-07 23:58 — 병종
- unitTypes.strategist.troopScale: 0.9 → 1

## 2026-10-07 23:59 — 병종
- unitTypes.shield.recruit.replenish: 0.5 → 1

## 2026-10-07 23:59 — 병종
- unitTypes.cavalry.range: 1 → 2

## 2026-10-08 00:00 — 병종
- unitTypes.shield.typeBonus.physical: 0 → 5
- unitTypes.cavalry.damageDealtByRow.back: 1 → 0.8
- unitTypes.archer.typeBonus.physical: 5 → 0

## 2026-10-08 00:05 — 병종
- unitTypes.cavalry.canCounter: true → false
- unitTypes.cavalry.vulnerability.magic: 20 → 10
- unitTypes.archer.vulnerability.magic: 20 → 10

## 2026-10-08 00:10 — 밸런스 수치
- balance.damage.formula: "gap" → "additive"

## 2026-10-08 00:12 — 밸런스 수치
- balance.troopFactor.mode: "relative" → "tiered"

## 2026-10-08 00:12 — 장수
- characters.xiahouDun.stats.speed: 7 → 6

## 2026-10-08 00:13 — 병종
- unitTypes.archer.troopScale: 0.9 → 1

## 2026-10-08 00:13 — 병종
- unitTypes.archer.typeBonus.physical: 0 → 10
- unitTypes.archer.statMods.defense: -1 → 0

## 2026-10-08 00:14 — 밸런스 수치
- balance.troopFactor.normalizeByScale: true → false

## 2026-10-08 00:15 — 밸런스 수치
- balance.damage.attackScale: 50 → 60
- balance.heal.scale: 45 → 35

## 2026-10-08 00:16 — 병종
- unitTypes.infantry.typeBonus.magic: 5 → 0
- unitTypes.infantry.vulnerability.magic: 20 → 0
- unitTypes.shield.typeBonus.physical: 5 → 0
- unitTypes.shield.typeBonus.magic: 5 → 0
- unitTypes.shield.vulnerability.physical: 10 → 0
- unitTypes.shield.vulnerability.magic: 10 → 0
- unitTypes.cavalry.typeBonus.magic: 5 → 0
- unitTypes.cavalry.vulnerability.magic: 10 → 0
- unitTypes.archer.typeBonus.magic: 5 → 0
- unitTypes.archer.vulnerability.physical: 15 → 0
- unitTypes.archer.vulnerability.magic: 10 → 0
- unitTypes.strategist.vulnerability.physical: 10 → 0
- unitTypes.taoist.typeBonus.magic: 5 → 10
- unitTypes.taoist.vulnerability.physical: 10 → 0
- unitTypes.geomancer.typeBonus.magic: 5 → 0
- unitTypes.geomancer.vulnerability.physical: 5 → 0

## 2026-10-08 00:18 — 장수
- characters.xiahouDun.stats.speed: 6 → 7

## 2026-10-08 00:21 — 병종
- unitTypes.infantry.damageTakenByType.magic: 1.1 → 1
- unitTypes.infantry.vulnerability.magic: 0 → 20
- unitTypes.shield.damageTakenByType.magic: 1.1 → 1
- unitTypes.shield.vulnerability.magic: 0 → 20
- unitTypes.cavalry.damageTakenByType.physical: 0.9 → 1
- unitTypes.cavalry.damageTakenByType.magic: 1.1 → 1
- unitTypes.cavalry.vulnerability.magic: 0 → 20
- unitTypes.archer.damageTakenByType.physical: 1.1 → 1
- unitTypes.archer.damageTakenByType.magic: 1.1 → 1
- unitTypes.archer.vulnerability.magic: 0 → 20
- unitTypes.strategist.damageTakenByType.physical: 1.1 → 1
- unitTypes.strategist.vulnerability.physical: 0 → 20
- unitTypes.taoist.damageTakenByType.physical: 1.1 → 1
- unitTypes.taoist.vulnerability.physical: 0 → 20
- unitTypes.geomancer.damageTakenByType.physical: 1.1 → 1
- unitTypes.geomancer.vulnerability.physical: 0 → 20

## 2026-10-08 00:21 — 장수
- characters.xiahouDun.stats.speed: 7 → 6

## 2026-10-08 00:22 — 병종
- unitTypes.infantry.damageTakenByType.magic: 1 → 1.1
- unitTypes.shield.damageTakenByType.magic: 1 → 1.1
- unitTypes.cavalry.damageTakenByType.physical: 1 → 0.9
- unitTypes.cavalry.damageTakenByType.magic: 1 → 1.1
- unitTypes.archer.damageTakenByType.magic: 1 → 1.1

## 2026-10-08 00:26 — 병종
- unitTypes.strategist.troopScale: 1 → 0.8

## 2026-10-08 00:28 — 병종
- unitTypes.infantry.vulnerability.magic: 20 → 0
- unitTypes.shield.vulnerability.magic: 20 → 0
- unitTypes.cavalry.vulnerability.magic: 20 → 0
- unitTypes.archer.troopScale: 1 → 0.8
- unitTypes.archer.vulnerability.magic: 20 → 0

## 2026-10-08 00:29 — 병종
- unitTypes.infantry.damageTakenByType.magic: 1.1 → 1
- unitTypes.shield.damageTakenByType.magic: 1.1 → 1
- unitTypes.cavalry.damageTakenByType.physical: 0.9 → 1
- unitTypes.cavalry.damageTakenByType.magic: 1.1 → 1
- unitTypes.archer.damageTakenByType.magic: 1.1 → 1
- unitTypes.strategist.damageTakenByType.magic: 0.8 → 1
- unitTypes.taoist.damageTakenByType.magic: 0.8 → 1
- unitTypes.geomancer.damageTakenByType.magic: 0.8 → 1

## 2026-10-08 00:31 — 스킬
- skills.stratagem.power: 0.8 → 1
- skills.poison-smoke.power: 0.8 → 1

## 2026-10-08 00:32 — 밸런스 수치
- balance.damage.formula: "additive" → "gap"
- balance.troopFactor.mode: "tiered" → "relative"
- balance.troopFactor.normalizeByScale: false → true

## 2026-10-08 00:34 — 병종
- unitTypes.cavalry.statMods.attack: 1 → 0

## 2026-10-08 08:26 — 장수
- characters.xiahouDun.stats.attack: 9 → 8
- characters.xiahouDun.stats.intellect: 4 → 5
- characters.zhangLiao.stats.intellect: 5 → 6

## 2026-10-08 08:33 — 밸런스 수치
- balance.maxTurns: 40 → 30

## 2026-10-08 08:34 — 밸런스 수치
- balance.damage.formula: "gap" → "additive"
- balance.troopFactor.mode: "relative" → "tiered"
- balance.troopFactor.normalizeByScale: true → false

## 2026-10-08 08:38 — 밸런스 수치
- balance.damage.additive.defenseMul: 8 → 7
- balance.damage.additive.resistMul: 7 → 8
- balance.troops.base: 300 → 150
- balance.troopFactor.tiered.knee2: 4000 → 5000
- balance.morale.onUnitDestroyed: 8 → 10

## 2026-10-08 08:40 — 밸런스 수치
- balance.damage.additive.defenseMul: 7 → 6
- balance.damage.additive.resistMul: 8 → 6

## 2026-10-08 08:40 — 밸런스 수치
- balance.damage.additive.defenseMul: 6 → 5

## 2026-10-08 08:43 — 스킬 · 밸런스 수치
- skills.cavalry-charge.power: 1.2 → 1.25
- balance.troopFactor.tiered.floor: 300 → 500

## 2026-10-08 09:22 — 스킬 · 병종
- skills.archer-shot.power: 0.95 → 0.9
- unitTypes.cavalry.canCounter: false → true

## 2026-10-08 09:24 — 밸런스 수치
- balance.damage.additive.defenseMul: 5 → 6

## 2026-10-08 — 병종 · 장수 · 기본 편성
메모: 승급 트리 도입 (기병 → 경기병/중기병 → 궁기병/호표기, 임시값). 관우는 최종을 호표기로 두고 초기 스탯을 낮춤. 촉 초반 편성에서 관우는 보병.
- unitTypes: 승급 보너스(promotionBonus) 칸 추가, cavalry.promotesTo: [] → [light-cavalry, heavy-cavalry]
- unitTypes: + light-cavalry, heavy-cavalry, horse-archer, tiger-cavalry (기병 복사, 승급 보너스 임시값)
- characters.guanYu: unitType cavalry → tiger-cavalry, stats 공9 방7 속6 → 공7 방6 속5 (호표기에서 공9 방7 속7)
- presets.shuStart: 관우 병종을 보병으로 (승급 전)

## 2026-10-08 — 병종 · 장수 · 기본 편성
메모: 보병/방패병/궁병 승급 트리 추가 (임시값). 유비는 최종을 근위대, 장비는 철벽대로 두고 초기 스탯을 낮춤. 촉 초반은 세 명 모두 승급 전 병종.
- unitTypes: + light-infantry, heavy-infantry, assault-infantry, royal-guard (보병 복사)
- unitTypes: + escort, heavy-shield, armored-guard, iron-wall (방패병 복사)
- unitTypes: + strong-bow, long-bow, elite-archer, crossbow (궁병 복사)
- unitTypes: infantry/shield/archer.promotesTo 연결
- characters.liuBei: unitType infantry → royal-guard, stats 공7 방6 속5 → 공5 방5 속4 (근위대에서 공7 방6 속5)
- characters.zhangFei: unitType shield → iron-wall, stats 공8 방9 속5 → 공6 방8 속4 (철벽대에서 공7 방9 속4)
- presets.shuStart: 유비 보병, 장비 방패병, 관우 보병 (모두 승급 전)
