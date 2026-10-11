# 아트 에셋 정리 도구

에셋(제미나이 등으로 만든 이미지)이 많이 쌓여도 저장소와 게임 빌드가 불어나지 않게 하는 규칙과 점검 도구다.

## 3단 구조

| 단계 | 위치 | git | 내용 |
|---|---|---|---|
| 1. 보관함 | `art-inbox/` | 제외 (`.gitignore`) | 만든 것 전부, 안 쓰는 시안, 검토용 렌더. 마음껏 쌓는다 |
| 2. 참고 | `docs/art/` | 올림 | 채택한 시안, 스타일 가이드, 프롬프트, 에셋 만드는 스크립트 입력 |
| 3. 사용 | `apps/game/public/art/` | 올림 | 게임 코드가 실제로 불러오는 파일만. 이 폴더는 빌드에 통째로 들어간다 |

`art-inbox/` 안의 경로는 원래 경로와 같게 둔다 (예: `art-inbox/docs/art/rance-mockup/foo.png`). 되돌릴 때는 `art-inbox/` 접두사만 떼고 옮기면 된다.

## 점검

```
python tools/art/audit.py            # 요약과 폴더별 표
python tools/art/audit.py --orphans  # 어디서도 안 쓰는 파일 (art-inbox/ 로 옮겨도 아무것도 안 깨진다)
python tools/art/audit.py --dups     # 내용이 같은 파일 묶음
```

분류는 파일 이름이 코드/문서/스크립트에 나오는지로 본다. 이름을 조합해서 불러오면 놓칠 수 있으니 지우기 전에 확인한다. 이 스크립트는 파일을 지우거나 옮기지 않는다.

## 알려 둔 남은 정리 (아트 담당이 정할 일)

- **중복:** `docs/art/first-batch/sprites`, `docs/art/cavalry/sprites` 등이 `apps/game/public/art/battle`과 같은 파일이다 (약 15MB). 미리보기 페이지(`preview.html`)가 상대 경로로 부르고 있어서, 페이지 경로를 `public/art`로 고친 뒤 복사본을 지우면 된다.
- **UI 슬라이스 3벌:** `public/art/battle/ui`, `ui/dark`, `ui/light`와 `docs/art/ui-sheets/slices/{dark,light}`가 같은 슬라이스다. 게임이 쓰는 한 벌만 `public`에 두고 나머지는 `docs/art`나 `art-inbox/`에 둔다.
- **올라간 것은 히스토리에 남는다.** 이미 push된 파일을 지워도 저장소 용량은 줄지 않는다 (히스토리 재작성이 필요). 앞으로 불어나는 것을 막는 게 목적이다.
