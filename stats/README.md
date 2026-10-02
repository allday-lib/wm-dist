# stats

`counter-log.csv` — 서재의 정석 앱이 하루 한 번 보내는 사용 신호(counter 릴리스의 `ping-pc` / `ping-and` 다운로드 수)의 **누적값을 매일 한 줄씩** 남긴 기록입니다. 매일 00:05(한국시간)에 `.github/workflows/counter-log.yml` 이 자동으로 적습니다.

- `pc_total` / `and_total` = 그날 마감 누적값. `pc_delta` / `and_delta` = 앞 줄 대비 증가분 = **그날 사용한 기기 수 어림값**입니다(앱이 기기마다 하루 1회만 신호를 보내므로). 앞 줄과 날짜가 하루 넘게 벌어져 있으면 증가분은 그 기간 합계입니다.
- 요일별로 보려면 `weekday` 열로 묶어 `*_delta` 평균을 내면 됩니다(엑셀: 피벗 표 → 행 `weekday`, 값 `pc_delta`·`and_delta` 평균).
