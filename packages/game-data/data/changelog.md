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
