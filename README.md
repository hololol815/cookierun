# Cookie Run 🍪

장애물을 피해 끝없이 달리는 횡스크롤 러너 게임입니다. React + Vite + Canvas로 만들었습니다.

## 데모

**https://hololol815.github.io/cookierun/** (GitHub Pages)

## 플레이 방법

| 조작 | 키 |
| --- | --- |
| 점프 (空中에서 한 번 더 가능) | `Space` / `↑` / `W` / 클릭 |
| 슬라이드 | `↓` / `S` |
| 일시정지 | `P` / `Esc` |

- 화면 **위쪽 체력바**는 시간이 흐를수록 천천히 닳히고, 거리를 달리면 더 빠르게 닳습니다.
- 장애물(스파이크, 블록, 매달린 밀대, 구덩이)에 부딪히면 체력이 **22** 감소합니다.
- **체력이 0이 되면 게임이 종료**되고 점수·거리·최고 기록이 표시됩니다.
- 장애물을 아슬아슬하게 지나가면 근접 회피 보너스와 점수 배율이 올라갑니다.
- 쿠키를 먹으면 점수 +60, 체력 +4 회복됩니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # 린트
npm run deploy   # 빌드 후 gh-pages 브랜치로 배포 (약 1~2분 후 반영)
```

배포는 `gh-pages` 브랜치에 정적 파일을 올리는 방식이며, GitHub Pages 설정은
`gh-pages` 브랜치 루트(`/`)로 지정되어 있습니다. `vite.config.js`의 `base: './'` 설정으로
서브 경로 배포에서도 자산 경로가 정상 동작합니다.

## 구조

```
src/
  game/
    config.js       # 체력·점수·물리 등 튜닝값
    gameEngine.js   # 순수 Canvas 게임 엔진 (DOM 비의존)
  components/
    RunnerGame.jsx  # React 래퍼 (입력 · HUD · 오버레이)
    RunnerGame.css
  App.jsx / App.css
```

게임 규칙은 `gameEngine.js`에서 DOM 없이 독립적으로 동작하므로, 브라우저 없이도
`new Game()` 후 `update(dt)` / `render(ctx)`만 호출해 테스트할 수 있습니다.

점수는 `localStorage`의 `cookierun.best` 키에 최고 기록으로 저장됩니다.
