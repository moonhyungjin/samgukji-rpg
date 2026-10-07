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
