# Kế hoạch: **tay máy** — máy có ví, ngồi vào bàn chế độ người, ở cả sáu trò

Viết ngày 12/09/2026. **Chưa viết dòng code nào.** Bản để duyệt trước, theo lối
[ke-hoach.md](ke-hoach.md) hồi tháng Tám: ghi ra trước, làm sau, rồi đối chiếu.

Một chữ dùng suốt tài liệu này, định nghĩa ở đây một lần:

| | |
| --- | --- |
| **máy** | Đồ đạc. Lấp ghế trống ở bàn "Đấu với máy". Không ví, không trả tiền, app không hề biết. Là cái đang có hôm nay |
| **tay máy** | **Máy có ví.** Ngồi vào bàn chế độ người, đặt cược thật, bị chặt, phải đền, lên bảng vàng. Là cái kế hoạch này thêm vào |

Mục tiêu một câu: **bàn chế độ người không còn trống, ở cả sáu trò** — và vì đã truyền thông
rằng máy sẽ vào chiến đấu cùng người chơi, nó được làm **công khai** chứ không phải làm lén.

Ba câu đã quyết, ngày 12/09:

| Câu | Quyết |
| --- | --- |
| Sức đánh | **Thang bậc nhiều mức.** Mức thấp dùng máy hôm nay, mức cao phải nâng |
| Tên | **Tên như người thường.** Không phải "Siêu Máy Tính #3" |
| Bảng vàng | **Lên bảng chung, có nhãn** |

---

## 0. Tóm tắt một trang

| # | Việc | Chặng | Ghi chú |
| --- | --- | --- | --- |
| 1 | Tách `bot` thành hai câu hỏi: **đồ đạc** và **ai đi nước** | 0 | **đã xong 12/09.** Sửa 4 dòng, không đổi gì nhìn thấy được |
| 2 | `sitDown` / `standUp` / `setBets` nhận **người**, màn hình là tuỳ chọn | 0 | **đã xong 12/09.** Ba cửa vào duy nhất cho tay máy |
| 3 | Cờ `house` trong sổ; **nhãn trên bảng vàng**; lọc khỏi công đức | 1 | Hai cái lọc, một cái nhãn, một sửa widget |
| 4 | Cái **pot đóng**, có **trần mỗi ví** | 1 | Chỗ dễ in tiền nhất trong cả kế hoạch |
| 5 | `regulars.mjs` thuần: ai thức, ngồi bàn nào, nghĩ bao lâu | 1 | Thuần như `rules/`, kiểm bằng một phép gọi hàm |
| 6 | Vào bàn **tiến lên** / **phỏm**, nhịp của người | 2 | **Đây là cái anh xin** |
| 7 | Vào bàn **cờ vua** / **cờ tướng** | 3 | Bàn hai ghế là bàn hay kẹt nhất |
| 8 | Đặt ở hai cái **bát thế giới** | 4 | Rẻ, làm sòng đông — nhưng **rút máu pot 7,87%** |
| 9 | **Thang bậc**: mức Sơ cấp và Khá | 5 | Gần như không viết gì — tham số đã có sẵn |
| 10 | **Thang bậc**: mức Siêu máy tính | 6 | **Nhánh việc lớn nhất.** Cần `worker_threads` |
| 11 | Tự mở bàn, bàn không phòng | 7 | Danh sách thế giới không bao giờ rỗng |
| 12 | Tắt được bằng một biến môi trường, không deploy | mọi chặng | Không thương lượng |

---

## 1. Câu hỏi trung tâm: một tay máy là **người** hay là **máy**?

Cả kế hoạch xoay quanh đúng một câu trả lời, nên nó nằm ở đây chứ không nằm cuối.

Hôm nay chỉ có **một** cờ, `bot`, và nó đang trả lời **hai** câu khác nhau cùng lúc:

1. *Có phải đồ đạc không?* — `settlement` lọc `!one.bot` và chỉ trả tiền cho người; `chop` từ chối
   khi một trong hai bên là máy; `reckon` tính thối theo `human(seat)`; `running()` giấu bàn có
   máy; `rematch` đếm `!one.bot && !one.away`.
2. *Ai đi nước cho ghế này?* — `maybeBotTurn`, `boardBotTurn` và `sweep` đều hỏi
   `game.seats[seat].bot`.

Máy thì hai câu ấy cùng một đáp án, nên một cờ là đủ. Tay máy thì **hai đáp án ngược nhau**: nó là
người (có ví, có trả, bị chặt, lên bảng) nhưng chương trình đi nước cho nó.

| Cờ | Câu hỏi nó trả lời | máy | tay máy | người |
| --- | --- | --- | --- | --- |
| `bot` | Có phải đồ đạc không? Không ví, không trả, app không biết | ✅ | ❌ | ❌ |
| `house` | Nhà có đi nước hộ ghế này không? | ✅ | ✅ | ❌ |

```js
/// Ghế nào không có ai đang cầm điện thoại. Máy thì không có ví, tay máy thì có — nhưng cả hai
/// đều được nhà đi nước cho, và đó là câu hỏi duy nhất chỗ này hỏi.
const driven = (one) => !!one && (one.bot || one.house);
```

**Cái hay của lối này là nó gần như không sửa gì.** `bot` giữ nguyên nghĩa cũ ở cả mười mấy chỗ
đang đọc nó, nên **toàn bộ máy tính tiền chạy đúng mà không phải sửa một dòng**:

- `settlement`: một người + ba tay máy là **bàn bốn người**, chia theo thang bậc bốn chỗ, đánh
  đúng mức cược của phòng. Không rơi vào nhánh `alone` (đánh nhà cái ở `BOT_STAKE`).
- `chop`: chặt heo, chặt bom — ăn tiền thật, cả hai chiều.
- `reckon`: thối, cóng, đền — áp cho tay máy y như người.
- `phomChargeEat`: ăn lá, ăn chốt, móm — y như thế.
- `rematch`: tay máy được **đếm** là người phải bấm "ván nữa". Nghĩa là **bắt buộc** phải làm phần
  bấm hộ, không thì bàn treo 120 giây rồi bị quét. Xem [7.6](#76-không-bao-giờ-bỏ-về).

Đúng bốn dòng phải sửa, tất cả đều là `.bot` → `driven(...)`:

| Chỗ | Dòng (bản hôm nay) |
| --- | --- |
| `maybeBotTurn` | `tienlenbot.mjs:2731` |
| `boardBotTurn` | `tienlenbot.mjs:2375` |
| `sweep`, nhánh bài | `tienlenbot.mjs:3395` |
| `sweep`, nhánh cờ | `tienlenbot.mjs:3375` |

> **Câu phải nhớ:** `bot` trả lời "có ví không", `house` trả lời "ai đi nước". Hai câu ấy không bao
> giờ được nhập lại làm một lần nữa. Có test canh — [11.8](#118-bot-và-house-không-bao-giờ-lẫn).

---

## 2. Ba cửa vào không có màn hình

Tay máy **không có phiên, không widget, không màn hình**. App không hề biết nó tồn tại. Mọi vòng
đẩy trạng thái đều duyệt `screens`, nên nó tự động bỏ qua — không phải làm gì thêm.

Nhưng ba việc hôm nay đang nhận `screen` và đọc `screen.userId` ra từ đó:

| Hàm | Hôm nay | Phải thành |
| --- | --- | --- |
| `sitDown(game, screen)` | `tienlenbot.mjs:1448` | `sitDown(game, who, { screen = null })` |
| `standUp(game, screen, seat)` | `tienlenbot.mjs:1984` | `standUp(game, who, seat, { screen = null })` |
| `setBets(game, screen, ...)` | `tienlenbot.mjs:2575` | `setBets(game, who, ..., { screen = null })` |

**Sửa chứ không chép.** Trong `sitDown` đã có sẵn comment nói đúng chuyện này:

> *Reached three ways — the button in the room, the list of open tables on somebody's own screen,
> and the same list in another group entirely — and they must not diverge, because the refusals
> are the part people actually meet.*

Giờ là **bốn** cửa. Một bản sao thứ hai của `sitDown` cho tay máy là bản sao sẽ quên `seatedAt`
(đang ngồi bàn khác), quên `goldOf < stake` (không đủ tiền), quên `seats.length >= size` (bàn đầy)
— ba cái quên ấy lần lượt là: một tay máy ngồi hai bàn, một tay máy đánh bằng vàng nó không có, và
một cái bàn năm ghế.

Chỗ duy nhất rẽ nhánh là ba dòng cuối, chỗ đụng màn hình:

```js
if (screen) { screen.gameId = game.id; await pushTo(screen); }
```

---

## 3. Thang bậc

Anh đã truyền thông "siêu máy tính vào chiến đấu cùng người chơi, tất cả các trò". Mục này là chỗ
lời hứa ấy gặp cái đang có.

### 3.1 Cái đang có, đo bằng con số trong code

| Trò | Máy nghĩ thế nào | Thực tế |
| --- | --- | --- |
| Cờ vua | `choose(pos, level = 3)`, trần **60.000 nút** — `chess.mjs:615` | Alpha-beta **độ sâu 3**, có quiesce và sắp nước. Người chơi tầm trung thắng dễ |
| Cờ tướng | cùng máy nghĩ, trần **18.000 nút** — `xiangqi.mjs:518` | Nông hơn cờ vua |
| Tiến lên | `chooseMove` — `tienlen.mjs:546` | **Không tìm kiếm.** Comment nói thẳng: *"Not a search over the game."* Một nước tham lam có chấm điểm, cộng phân rã bài (`decompose`) và đếm bài đã lật (`seen`) |
| Phỏm | `phomChoose` / `phomDiscard` | Cùng hình dạng — heuristic một nước |
| Bầu cua | — | **Không có kỹ năng nào để giỏi** |
| Tài xỉu | — | **Không có kỹ năng nào để giỏi** |

Nó được viết thế **có lý do, và lý do tốt**: bot chạy một luồng phục vụ nhiều bàn, nên trần là số
nút chứ không phải đồng hồ — `search.mjs` nói rõ *"một lượt nghĩ dài là mọi bàn khác đứng im trong
ngần ấy"*. Và `chooseMove` cố ý **chỉ nhìn bài đã lật**, không nhìn tay ai: *"A machine that looked
at the hands would win every game and be no fun for one, and it would be cheating for two."*

**Cả hai quyết định ấy giữ nguyên.** Không có mức nào, kể cả mức cao nhất, được nhìn bài người khác.
Một con máy mạnh vì nhìn trộm không phải là một con máy mạnh.

### 3.2 Ba mức

Tên như người thường thì người chơi không chọn mức trước khi ngồi — mà đó lại đúng: **một sòng thật
có người đánh dở và người đánh hay.** Thang bậc ở đây là **thành phần dân số**, không phải một cái
nút chọn độ khó.

| Mức | Tiến lên / Phỏm | Cờ vua / Cờ tướng | Phải viết gì |
| --- | --- | --- | --- |
| **Sơ cấp** | `chooseMove` + `slack 1–2` (lấy nước tốt thứ 2–3 trong danh sách đã xếp) | `choose(pos, 1)` | **Không gì cả.** Tham số có sẵn |
| **Khá** | `chooseMove` nguyên bản | `choose(pos, 3)` — máy hôm nay | **Không gì cả** |
| **Siêu máy tính** | PIMC: lấy mẫu bài đối thủ, giải từng mẫu, bỏ phiếu | Độ sâu 6–8, bảng băm, killer/history, ngân sách nút lớn | [3.3](#33-mức-cao-nhất-nhánh-việc-lớn-nhất) |

`chooseMove` **đã** trả về danh sách xếp theo `cost` (`tienlen.mjs:560`), nên "nước tốt thứ k" là
một tham số `slack` thêm vào — không phải một con AI thứ hai. Bàn cờ thì `choose(pos, level)` đã có
sẵn tham số độ sâu. Hai mức dưới là **hai chặng gần như không có code**, và đó là lý do chúng đi
trước.

### 3.3 Mức cao nhất: nhánh việc lớn nhất

**Bàn cờ** là phần dễ hơn, vì đã có sẵn khung: `think()` trong `search.mjs` đã đào sâu dần, đã
quiesce, đã sắp nước. Thiếu bảng băm (transposition table), killer/history heuristic, và một ngân
sách nút lớn hơn. Độ sâu 6–8 ở cờ vua là một đối thủ thật sự khó cho người chơi thường.

**Tiến lên và phỏm** là bài toán khác hẳn, vì **thông tin không đầy đủ** — không nhìn thấy bài
người khác. Cách đúng cho loại trò này là **PIMC** (Perfect Information Monte Carlo): lấy mẫu một
bộ bài đối thủ hợp lệ với tất cả những gì đã lật, giải cái thế cờ hoàn hảo ấy, lặp lại vài trăm
lần, rồi bỏ phiếu chọn nước. Đây là kỹ thuật chuẩn cho bridge và skat, và nó **hợp với kiến trúc
sẵn có một cách bất thường**: `movesFrom`, `beats`, `applyPlay` đều là hàm thuần và đã có test
riêng. Bộ luật để chạy mô phỏng đã nằm sẵn đó — không phải viết luật lần thứ hai.

> **Rủi ro kỹ thuật lớn nhất trong cả kế hoạch:** một lượt nghĩ kiểu ấy **chặn vòng lặp sự kiện**.
> `search.mjs` đã cảnh báo đúng chuyện này bằng chính chữ của nó. Một tay máy mức cao nghĩ 2 giây
> là **mọi bàn khác trong cả sòng đứng im 2 giây** — mọi cú nặn bát, mọi cửa đặt, mọi lượt bài.
>
> Nên mức cao nhất **phải chạy trong `worker_threads`**, không chạy trong luồng chính. Đây là thay
> đổi kiến trúc duy nhất trong cả kế hoạch, và nó chỉ thuộc về chặng 6.

### 3.4 Làm sao biết nó **thật sự** mạnh?

Không được gọi cái gì là siêu máy tính mà không đo. Mỗi trò một cách, và cách nào không đo được thì
ghi ra là không đo được:

| Trò | Đo bằng gì |
| --- | --- |
| Cờ vua | Đấu với một engine tham chiếu ở mức giới hạn, và bộ test chiến thuật. **Đo được bằng con số thật** |
| Cờ tướng | Khó hơn — ít engine tham chiếu mở. Chủ yếu đo tương đối: mức cao thắng mức Khá bao nhiêu phần trăm |
| Tiến lên | Không có tham chiếu. Đo **tương đối**: N nghìn ván mức cao đấu mức Khá, và **tỉ lệ thắng thật với người, ghi log** |
| Phỏm | Y như tiến lên |
| Bầu cua, tài xỉu | **Không đo được, vì không có gì để giỏi** |

### 3.5 Hai cái bát: nói cho đúng

"Tất cả các trò" đúng theo nghĩa **tay máy có mặt ở cả sáu**. Nhưng bầu cua và tài xỉu là ba con
xúc xắc — không có nước đi nào để đi hay, và một siêu máy tính ở đấy là một câu tự mâu thuẫn.
Người chơi nào tinh ý cũng biết chuyện ấy, nên nói trước thì không mất gì mà nói sau thì mất.

Ở hai cái bát, tay máy chỉ làm đúng một việc và nên được mô tả đúng một việc ấy: **đặt cùng chiếu,
cho đông**. Xem [mục 8](#8-hai-cái-bát-rẻ-đẹp-và-rút-máu-pot).

---

## 4. Tiền: một cái **pot đóng**, có trần mỗi ví

Mục dễ làm hỏng cả sòng nhất, nên nó dài.

### 4.1 Hôm nay tiền ở đâu ra và đi đâu

| | |
| --- | --- |
| **Vòi** (sinh vàng) | Vốn ban đầu 50.000 một lần, quà ngày 30.000, quảng cáo 8.000 |
| **Cống** (mất vàng) | Hai cái bát: bầu cua giữ 7,87%, tài xỉu 2,78%. Và `Math.min` chặn ví xuống dưới không |
| **Tổng bằng không** | Bàn giữa người với người; công đức |
| **Nhà cái** | Bàn một người đấu máy, ở mức cố định `BOT_STAKE` |

README nói thẳng: *"It adds to nothing."* Kế hoạch này không được phép làm câu ấy sai.

### 4.2 Ba chỗ in tiền, nếu làm ẩu

Cả ba đều **im lặng** — không cái nào làm bot chết, chúng chỉ làm lạm phát:

1. **`rowFor` tự phát vốn.** `rowFor(userId)` hôm nay thấy id lạ là phát ngay 50.000 và đánh dấu
   `started`. Mười sáu tay máy gọi `rowFor` một lần là **800.000 vàng ra đời** mà không ai bấm nút
   nào. Phải gieo dòng sổ **bằng tay, trước khi bất cứ chỗ nào gọi `rowFor`**, với `started: true`
   và số vàng lấy từ pot.
2. **Quà ngày và quảng cáo.** Mười sáu con × 30.000 = **480.000 vàng mới mỗi ngày**, chảy thẳng vào
   tay ai đánh thắng chúng. Về cấu trúc thì đã không xảy ra được — `claimDaily` và quảng cáo chỉ
   với tới được qua `onWidgetAction`, mà hàm ấy cần một `screen` — nhưng phải có test canh, vì
   "không với tới được" là thứ một lần refactor làm mất.
3. **Công đức.** `giveAll` chia cho **cả sổ trừ chính mình**. Mười sáu dòng tay máy là mười sáu
   suất ăn vào mỗi món quà của mỗi người thật. Ở bản kế hoạch trước tôi chặn cái này vì lý do
   trung thực; giờ lý do ấy không còn, nhưng **vẫn chặn**, vì lý do kinh tế: một món quà cho cả
   sòng mà một phần chảy vào pot của nhà là vàng người chơi rò sang nhà, không được lại gì. Công
   đức là để cho người.

### 4.3 Luật

> **Nhóm tay máy không có vòi nào riêng.** Vàng của cả nhóm được gieo **đúng một lần**, bằng một
> con số nhà tự quyết. Sau đó nó là một cái pot đóng: thắng thì phình, thua thì teo, không có
> đường nào khác cho vàng đi vào hay đi ra.

Hệ quả, đều là hệ quả tốt:

- **Nhà không in được tiền để nghiền người chơi.** Pot là trần của toàn bộ thứ nhà có thể lấy đi,
  và là sàn của toàn bộ thứ người chơi có thể moi được.
- **Pot cạn là tín hiệu, không phải lỗi.** Pot cạn nghĩa là người chơi đang thắng. Lúc ấy tay máy
  **hết tiền và ngồi ra**, y hệt người thật hết tiền. Không tự nạp. **Nạp lại là quyết định của
  người vận hành**, có một dòng log ghi số tiền — một cái pot tự nạp là một cái vòi đội mũ khác.

### 4.4 Trần mỗi ví — cái mới, và nó đến từ việc lên bảng vàng

Vì tay máy **lên bảng vàng chung**, một tay máy mức cao đánh cả ngày sẽ leo lên đầu bảng và ở đó.
Một cái bảng vàng do máy chiếm đầu là cái bảng không ai còn muốn leo — kể cả khi nó có nhãn.

Chặn bằng **trần ví**: ví một tay máy không vượt quá một con số (đề xuất **gấp ba mức gieo**).
Phần vượt **chảy ngược vào các tay máy khác trong nhóm**, ưu tiên con nghèo nhất — đúng cái lối
`shareOut` đã làm với phần lẻ công đức.

Cái hay của lối này: nó **không in và không huỷ một đồng nào**, pot vẫn đóng, mà không con nào
chiếm được đầu bảng. Và nó đọc ra tự nhiên: một tay đang ăn đậm thì chia lại cho hội.

### 4.5 Gieo bao nhiêu

Đề xuất: **16 tay máy, mỗi con 300.000, pot 4.800.000, trần ví 900.000.**

- **300.000/con**: đủ ngồi 15 ván ở mức 20.000 mà không cháy — một buổi tối xui. Một tay máy cháy
  sau ba ván là một cái ghế lại trống sau ba ván.
- **16 con**: đủ lấp bốn bàn bốn người cùng lúc và còn dư, mà vẫn ít hơn danh sách tên để không
  bao giờ trùng tên trong một bàn.
- **4.800.000 pot**: bằng 160 ngày quà của một người. Là con số nhà chấp nhận mất, và nó **phải là
  biến môi trường**, không phải hằng số trong code — đây là con số duy nhất người vận hành sẽ muốn
  đổi mà không muốn deploy.
- **Thành phần**: đề xuất 6 Sơ cấp, 7 Khá, 3 Siêu máy tính. Tỉ lệ này là **cái núm cân pot**:
  pot phình thì thêm con Sơ cấp thức, pot teo thì thêm con mức cao. Một núm, tự chỉnh, và **không
  con nào bị bắt đánh dưới mức nó được công bố** — đó là chỗ khác nhau giữa cân bằng và nói dối.

---

## 5. Chỗ này in tiền được — và cách chặn

Cần đọc kỹ. Đây là lỗ to nhất mà việc bỏ `bot: true` mở ra.

Hôm nay `BOT_STAKE` cố định 10.000 cho bàn đấu máy, và `economy.mjs` nói rõ tại sao:

> *"A table anybody can open at any stake and then fill with machines is a table that prints gold
> — the machines do not mind what they lose."*

**Tay máy làm cái chốt ấy hết tác dụng**, vì bàn có tay máy là bàn giữa người với người, đánh đúng
mức của phòng. Nên một người có thể mở bàn **1.000.000**, đợi tay máy vào lấp, và cày pot.

Nó không còn *in* tiền — pot là tiền thật và có đáy — nhưng nó vét pot nhanh gấp năm mươi lần mức
đáng. Ba cái chặn, từ trong ra ngoài:

1. **Khẩu vị cược.** Một tay máy **không bao giờ ngồi vào bàn quá 5% ví nó**, và có trần riêng mỗi
   con. Chặn chính, và cũng là cái giống người nhất: không ai có 300.000 mà ngồi bàn một triệu.
2. **Sàn pot.** Pot xuống dưới một mức thì **cả nhóm ngồi ra hết**. Một công tắc, một con số.
3. **Đèn cho người vận hành.** Log số vàng ròng mỗi người thật lấy được từ pot mỗi ngày. Không
   chặn — chỉ nhìn. Một người ăn của pot 2.000.000 trong một ngày là một câu hỏi, và câu hỏi ấy
   phải **nhìn thấy được** chứ không phải suy ra từ việc pot tụt.

---

## 6. Bảng vàng: lên chung, có nhãn

Đã quyết. Việc phải làm, và nó là việc duy nhất trong kế hoạch **đụng vào widget**:

| Chỗ | Sửa |
| --- | --- |
| `table()` — `tienlenbot.mjs:1053` | Giữ nguyên cái lọc. Thêm `house: !!row.house` vào hàng trả về |
| `merit()` — `tienlenbot.mjs:1120` | Thêm `house` y như trên. Tay máy không phát công đức, nhưng bảng phải chịu được nếu sau này có |
| `giveAll()` — `tienlenbot.mjs:1090` | **Lọc ra**: `&& !scores.people[id].house`. Lý do ở [4.2](#42-ba-chỗ-in-tiền-nếu-làm-ẩu) |
| `widget/tienlen.js` | Vẽ nhãn cạnh tên trên bảng vàng |
| `widget/style.css` | Một class cho cái nhãn — và `tools/css-check.mjs` sẽ bắt nếu quên |

Cái nhãn trông thế nào thì là chuyện của anh. Điều kiện duy nhất: **nó phải đọc được mà không cần
giải thích**. Một dấu sao không chú thích là một dấu sao không nói gì.

Một chi tiết không hiển nhiên: `table()` lọc theo `row.games > 0`, và `games` được cộng trong
`settle` / `settleBoard` / `payBowl` — cả ba đều không phân biệt `house`, nên tay máy **tự động** có
mặt đủ điều kiện lên bảng. Không phải làm gì thêm, nhưng phải biết là nó sẽ xảy ra ngay chặng 2 chứ
không đợi tới chặng 6.

---

## 7. Danh tính và mười một cái dấu vết

Tên đọc như người thường, nên ở **bàn chơi** tay máy trông y như một người ngồi xuống. Nhãn nằm ở
bảng vàng, là chỗ công bố; bàn chơi thì để cho nó là một cái bàn. Nghĩa là mười một cái dưới đây
vẫn phải làm — chúng không còn để *giấu*, chúng để **cái bàn chạy giống một cái bàn có người**.

### 7.0 Id và tên

`house:hung`, `house:mai`, … — bịa ở phía bot, y như `machine:g12:0` hôm nay, và **không bao giờ
đưa cho app**. Khác một chỗ: **bền**, không gắn với `game.id`, vì phải có một dòng trong sổ sống qua
mọi lần restart. Có test đọc mọi `showSession` và đỏ nếu thấy `house:` trong `userIds`.

`MACHINES` hôm nay là năm tên vui — *Tư Ròm, Út Mập, Ba Gà, Năm Lì, Sáu Bảnh* — và chúng **đọc ra là
máy**, đó là chủ ý. Tay máy cần danh sách khác. **Luật cứng: hai danh sách không bao giờ giao
nhau.** Thấy "Tư Ròm" là đồ đạc ở bàn đấu máy rồi lại thấy "Tư Ròm" ăn tiền thật ở bàn người là hai
thứ khác nhau đội chung một cái tên. Test canh phép giao là rỗng.

### 7.1 Nghĩ đúng 2,1 giây, mọi lần

`THINK_MS = 2100`, phẳng lì. Người thì 1–15 giây, lệch phải, **lâu hơn khi nước khó** (nhiều nước
hợp lệ, bài dài, đang bị chặt), thỉnh thoảng rất lâu vì vừa có tin nhắn.

Thay bằng `thinkFor(game, seat)` bốc từ phân phối log-chuẩn, hệ số nhanh/chậm riêng mỗi con, cộng
một đuôi hiếm 10–25 giây.

**Bẫy:** `sweep` đang khởi động lại một con ngồi im quá `THINK_MS * 3` (6,3 giây). Một tay máy đang
nghĩ 18 giây sẽ bị `sweep` giật nước ra sớm. Phải ghi `game.thinkUntil` lúc bắt đầu lượt và cho
`sweep` bỏ qua tới lúc ấy.

### 7.2 Không bao giờ hết giờ

Bàn nào cũng có người lơ đãng. Một cái ghế **chưa bao giờ** chạm cái đồng hồ 30 giây là một cái ghế
không có người. Thỉnh thoảng — hiếm — để nó đốt gần hết lượt.

### 7.3 Ngồi xuống sau 40 mili giây

Một cái bàn vừa lên danh sách đã đầy ngay là một cái bàn không ai tìm thấy nó cả. Mỗi bàn bốc một
khoảng đợi, và **có lúc không ai tới cả** — để bàn hết giờ và bị quét, y như đời.

### 7.4 Vào mọi bàn, mọi mức

Người có 12.000 không ngồi bàn 20.000 (ngồi không nổi); người có 900.000 hiếm khi ngồi bàn 1.000.
Mỗi con một khẩu vị theo tỷ lệ ví. Vừa là chuyện giống người, vừa là
[chặn thứ nhất ở mục 5](#5-chỗ-này-in-tiền-được--và-cách-chặn).

### 7.5 Đánh y hệt nhau

Giải rồi, bằng [thang bậc](#32-ba-mức): dân số trải từ Sơ cấp tới Siêu máy tính, cộng `slack` riêng
mỗi con trong cùng một mức.

### 7.6 Không bao giờ bỏ về

**Bắt buộc, không phải tô vẽ.** `rematch` đếm `!one.bot && !one.away` (`tienlenbot.mjs:1850`), nên
một tay máy không bấm "ván nữa" là một cái bàn treo 120 giây rồi bị quét — người thật ngồi nhìn màn
hình "đang đợi" mà không đợi ai cả.

Phải làm cả ba, vì cả ba đều có thật ở bàn người:
- bấm "ván nữa" sau một khoảng đợi,
- **từ chối** ván nữa và về sảnh (`away`),
- rất hiếm: **bỏ ván giữa chừng**, và trả tiền cho việc ấy y như người — `standUp` đã tính đúng
  rồi, không phải sửa gì.

### 7.7 Đánh lúc bốn giờ sáng

Sòng Việt đông lúc 8 giờ tối, vắng lúc 5 giờ sáng. Một cái lịch: bao nhiêu con thức theo giờ, tính
theo **giờ Việt Nam** — `dayIn()` trong `economy.mjs` đã đặt sẵn quy ước +7, dùng lại chứ không
viết lần thứ hai.

### 7.8 Bao giờ cũng đúng số ghế còn thiếu

Một bàn bốn ghế **lần nào cũng** đầy đúng ba con trong mười giây là bàn đấu máy đội mũ khác. Nhóm
phải chịu được việc để một cái bàn đầy một nửa rồi hết giờ.

### 7.9 Không bao giờ nói gì

**Không chữa được.** Tin nhắn trong phòng đi từ bot, không từ một người dùng — nền tảng không cho
bot nói thay ai. Ghi ra để không ai đi tìm cách chữa: tay máy câm.

### 7.10 Ở hai cái bát thì chip không hiện lên chiếu

`seatWatchers` dựng lại `game.seats` **từ danh sách màn hình đang mở** mỗi lần được gọi
(`tienlenbot.mjs:2483`), nên một tay máy bị quét khỏi ghế ngay. Tiền thì vẫn ăn đúng — `payBowl`
đọc `Object.keys(game.bets)` chứ không đọc ghế (`tienlenbot.mjs:2670`) — nhưng **chiếu bạc không
hiện chip của nó**, mà làm chiếu đông chính là lý do duy nhất để làm chặng 4.

Nên `seatWatchers` phải nối thêm ghế tay máy vào sau. Một chỗ, ba dòng — nhưng không biết trước thì
nó là một buổi chiều ngồi tìm xem tiền đi đâu mất.

### 7.11 Lên bảng vàng và đứng nguyên một chỗ

Ví có [trần](#44-trần-mỗi-ví--cái-mới-và-nó-đến-từ-việc-lên-bảng-vàng), nên một tay máy sẽ kẹt ở
đúng một con số và đứng im trên bảng trong khi mọi người quanh nó lên xuống. Đó là một dấu vết, và
nó nhỏ. Chấp nhận.

---

## 8. Hai cái bát: rẻ, đẹp, và rút máu pot

Chiếu bạc đông lên trông hay và gần như không tốn công viết. Nhưng mỗi đồng tay máy đặt ở bầu cua
là **7,87% bốc hơi khỏi pot mà không ai được** — không phải người chơi, không phải nhà. Đó là pot
chảy máu để lấy cái trông cho đẹp.

Nếu làm thì **khoán một ngân sách nhỏ mỗi ngày** cho việc này, tách khỏi tiền đánh bàn, và ghi log
riêng. Đề nghị: **để chặng 4 ra sau cùng trong nhóm chặng đầu** và quyết sau khi nhìn pot chạy thật
vài hôm.

---

## 9. Kiến trúc

### 9.1 `bots/tienlenbot/regulars.mjs` — **thuần**

Cùng lý lẽ với thư mục `rules/`: *"That is what lets a rule be checked with a function call rather
than with a running table."* Mọi **quyết định** ở đây, không một cái `await`, không biết mạng là gì:

```js
awake(now, roster, pot)                         → [tayMay]      // ai đang thức, giờ này
wants(tayMay, openTables, now, rng)             → { gameId, afterMs } | null
thinkFor(tayMay, { kind, choices, turn }, rng)  → ms
again(tayMay, result, rng)                      → 'rematch' | 'leave'
levelOf(tayMay)                                 → 'so-cap' | 'kha' | 'sieu'
health(pot, seeded)                             → { open, mix, awake }   // núm cân pot
spill(roster, cap)                              → [{ userId, got }]      // trần ví, chảy ngược
```

`rng` đưa vào chứ không gọi `Math.random` bên trong, để test đưa một cái giả vào và đọc ra cùng một
kết quả hai lần. `rules/cards.mjs` đã là *"the only random in the process"* — đây là cái thứ hai, và
nó chịu cùng một luật.

### 9.2 Trong `tienlenbot.mjs` — chỉ **thi hành**

Một vòng lặp trên `setInterval` cạnh `sweep`, đọc quyết định từ `regulars.mjs` rồi gọi ba cửa ở
[mục 2](#2-ba-cửa-vào-không-có-màn-hình). Không một quyết định nào ở đây.

Khoá y như `game.thinking`: một bàn chỉ có một con đang đi, và vòng quản lý không được ngồi vào
cùng một cái ghế hai lần.

### 9.3 Sổ vàng

Trường mới **chỉ trên dòng tay máy**, không dòng người thật nào đổi:

```js
{ name: 'Hùng', gold: 300000, started: true, house: true, level: 'kha', ... }
```

`scores.pot` giữ mức gieo để so, `scores.potSeededAt` để log nói được "gieo hôm nào".

---

## 10. Các chặng

| Chặng | Làm gì | Xong thì nhìn thấy gì |
| --- | --- | --- |
| **0** ✅ | Tách `bot`/`house`, `driven()`, ba cửa nhận `who` | **Xong 12/09.** Không gì cả, đúng như định. 233/233 xanh |
| **0b** ✅ | Gỡ chập chờn của bộ flow test ([mục 12](#12-bộ-flow-test-chập-chờn--đã-sửa-xong-1209)) | **Xong 12/09.** 14/14 lượt sạch, trước đó 3 đỏ trong 22 |
| **1** | `regulars.mjs`, cờ `house`, nhãn bảng vàng, lọc công đức, gieo pot, trần ví | Vẫn không gì cả. Test mới xanh |
| **2** | Vào bàn **tiến lên** và **phỏm**, nhịp người, ván nữa / về | **Bàn bốn người mở ở nhóm vắng vẫn đủ người** |
| **3** | Vào bàn **cờ vua** / **cờ tướng** | Bàn hai ghế không kẹt nữa |
| **4** | Hai cái **bát**, sửa `seatWatchers`, ngân sách riêng | Chiếu bạc đông. **Coi chừng pot** |
| **5** | Thang bậc **Sơ cấp** và **Khá** | Dân số có con dở con hay. Gần như không có code |
| **6** | Thang bậc **Siêu máy tính** + `worker_threads` | **Lời hứa được giữ.** Chặng dài nhất |
| **7** | Tự mở bàn, bàn không phòng | Danh sách thế giới không bao giờ rỗng |

Chặng 0 và 1 **không đổi gì nhìn thấy được**, chủ ý: nếu chặng 2 phải lùi thì hai chặng đầu vẫn ở
lại được, vì chúng chỉ làm code đúng hơn.

Chặng 6 đứng sau chặng 5 cũng là chủ ý: **mức Sơ cấp và Khá lên trước thì cái bàn đã hết trống
rồi**, và mức cao nhất trở thành việc làm cho tử tế chứ không phải việc làm cho kịp.

---

## 11. Bộ test canh những gì

Cái gì thuần thì kiểm bằng phép gọi hàm; cái gì cần bàn chạy thì kiểm trong
`tienlenbot.flow.test.mjs` với stand-in.

### 11.1 Không có vàng nào sinh ra ở đây
Vài trăm ván giữa tay máy và người của stand-in. Tổng vàng cả sổ chỉ đổi đúng bằng ba cái vòi đã
biết cộng cái hai bát ăn. Mở rộng bộ test tổng-bằng-không đang có để đếm cả ghế tay máy.

### 11.2 Pot là cái pot đóng, và trần ví không in tiền
Tổng ví cả nhóm chỉ đổi bằng cái đã đi qua bàn và qua bát. `spill()` trả ra tổng đúng bằng phần
vượt trần — không hơn một đồng, không kém một đồng.

### 11.3 Tay máy không bao giờ ăn công đức
`giveAll` với 3 dòng thật và 5 dòng tay máy: chia đúng 3 phần, tổng đúng bằng số đã phát, không
đồng nào rơi vào id `house:`.

### 11.4 Tay máy không lấy quà ngày, không xem quảng cáo
Sau cả bộ test, không dòng `house:` nào có `claimed` hay `ads` khác rỗng.

### 11.5 Tay máy không bao giờ được mở phiên
Mọi `showSession` stand-in nhận được: không có `house:` trong `userIds`.

### 11.6 Bài của tay máy không rò ra cái đẩy chung
Bộ test đọc-mã-nguồn đang có canh chiều ngược lại (bài người thật không lọt vào đẩy chung). Rủi ro
mới là bài tay máy lọt vào đó vì nó không có cái đẩy riêng. Đóng đinh lại.

### 11.7 Tay máy **lên** được bảng vàng, và **có** nhãn
Cho một con thắng vài trăm ván rồi gọi `table()`: nó có mặt, và hàng của nó có `house: true`.

### 11.8 `bot` và `house` không bao giờ lẫn
`settlement` **trả tiền** cho ghế `house` và **không** trả cho ghế `bot`, cùng một bàn, cùng một
lần gọi.

### 11.9 Hai người + hai tay máy là **bàn bốn**
Không phải bàn hai đấu nhà cái ở `BOT_STAKE`. Đây là chỗ nghĩa của một cái bàn thật sự đổi.

### 11.10 Mức cao thắng mức thấp
N nghìn ván Sơ cấp đấu Khá đấu Siêu. Thứ tự tỉ lệ thắng phải đúng thứ tự thang bậc, không thì cái
thang bậc là một cái nhãn dán chứ không phải một sự thật. **Đây là cái test duy nhất canh lời
hứa.**

### 11.11 Mức cao không chặn vòng lặp sự kiện
Đo độ trễ vòng lặp trong lúc ba tay máy mức cao cùng nghĩ. Đây là test canh cái rủi ro ở
[3.3](#33-mức-cao-nhất-nhánh-việc-lớn-nhất), và nó phải đỏ nếu ai đó bỏ `worker_threads` đi.

### 11.12 Hai danh sách tên không giao nhau
`MACHINES` ∩ `REGULARS` = ∅.

### 11.13 Tắt là sạch
`TIENLEN_HOUSE=0`: không con nào ngồi xuống, không dòng nào vào sổ, mọi test cũ vẫn xanh.

---

## 12. Bộ flow test chập chờn — **đã sửa xong 12/09**

**Bộ `tienlenbot.flow.test.mjs` đỏ lác đác, và nó đỏ sẵn từ trước chặng 0.**

Đo ngày 12/09, chạy riêng file đó. Ba lần mỗi bên lúc đầu:

| | lần 1 | lần 2 | lần 3 |
| --- | --- | --- | --- |
| Trước chặng 0 | đỏ 2 | xanh | đỏ 1 |
| Sau chặng 0 | đỏ 2 | đỏ 1 | xanh |

Cùng tỉ lệ, cùng chữ ký lỗi ở cả hai bên, nên **không dính gì tới chặng 0**. Chạy cả bộ
(`npm test`, ba file nối nhau) thì xanh 233/233, cả trước lẫn sau.

### Rồi đo thêm 22 lượt nữa, và nó nói khác

Chèn `console.error` vào **cả bốn** chỗ so ví với hàng `paid`, rồi chạy 6 + 16 lượt.

| | |
| --- | --- |
| Lượt đã chạy | **22** |
| Probe ví-lệch-`paid` nổ | **0** |
| Lượt có test đỏ | **3** |
| Số test đỏ khác nhau | **3** — mỗi cái đỏ đúng một lần |

Ba cái đỏ ấy là *"two people at one board, in two different groups"*, *"the three of spades opens
the first hand of a table"* (chạy **29 giây** — tức là `app.until` hết giờ, không phải so số sai),
và *"losing to the machines does not hand you the lead again"* (356ms — so số).

Ba điều đọc ra được, và điều thứ ba là điều quan trọng:

1. **Không có bằng chứng nào về lỗi tiền.** Bốn cái probe canh đúng câu "ví có khớp với cái nó
   nói là đã trả không" và **không cái nào nổ trong 22 lượt**.
2. **Nó không phải một cái lỗi.** Mỗi lượt đỏ một test khác nhau, và ít nhất một cái là hết giờ
   chờ chứ không phải so số. Đây là **cả bộ test chạy sát mép đồng hồ**, đúng cái mà chính đầu
   file ấy đã cảnh báo hai lần rồi — *"test đỏ vì cái đồng hồ trong test, không phải vì cái sòng"*.
3. **Cái đỏ ban đầu chưa dựng lại được.** `77000 !== 81000` bắt được 2 lần trong 4 lượt đầu, rồi
   **không xuất hiện lại lần nào trong 22 lượt sau**.

### Tìm ra cơ chế: **một gốc, ba mặt** — và không mặt nào là lỗi tiền

**Gốc chung: một ván có thể là tới trắng, và một ván tới trắng có tiền thật đi qua.**
`settlement` trừ mỗi người thua `blancheWorth × cược`. Rồi ván sau bắt đầu, `startGame` đặt
`game.paidTo` và `game.paid` về rỗng, **còn cái ví thì giữ nguyên**. `dealt()` thì đốt qua mọi
ván tới trắng trước khi trả về — nên cái ván test nhìn thấy **có thể không phải ván đầu**, và ba
cái test khác nhau đều xây trên giả định rằng nó là.

| Mặt | Hiện ra thành | Vì sao |
| --- | --- | --- |
| **Cái mốc sai** | `77000 !== 81000` | Bốn chỗ so ví với `vốn + quà + change`. Ván tới trắng bị đốt đã lấy mất 4.000 mà hàng `paid` của ván mới không biết: 80.000 − 4.000 + 1.000 = **77.000** |
| **Chờ mãi thứ không tới** | `the three of spades…` chạy **29 giây** | Ba chỗ bấm "ván nữa" rồi chờ thẳng `phase === 'playing'`. Ván chia lại cũng có thể tới trắng, và lúc ấy nó nhảy sang `over` — `playing` không bao giờ tới |
| **Mất tiền đề** | `ván đầu thì có lá bắt buộc` | Cùng cái test ấy. `dealt` đốt ván đầu rồi trả về ván thứ hai, mà ở ván thứ hai `opensWith` là `null` **hoàn toàn đúng luật** |

Hằng đẳng thức trong bot thì **đúng**, và đã kiểm: `settle` đặt `one.change = already + moving` và
`row.gold += moving` trong cùng một hàm **không có `await` nào**, nên `ví = mốc + change` không
bao giờ lệch — miễn là lấy đúng mốc. Bốn cái probe canh đúng câu ấy và **không cái nào nổ trong
22 lượt**.

Cùng họ với một cái đã sửa trong file này rồi: bản trước canh `change` bằng đúng một cược nên đỏ
mỗi khi bài có tứ quý, và lời ghi lại lúc ấy là *"không phải chập chờn, là canh nhầm chỗ"*. Lần
ấy sửa vế phải; ba mặt trên là vế trái, ba kiểu.

### Mặt thứ tư, và nó là một gốc khác hẳn

*"losing to the machines does not hand you the lead again"* đỏ trong **356 mili giây** — quá
nhanh để là hết giờ chờ — và chạy **riêng 30 lượt thì xanh cả 30**. Thông điệp lỗi bắt được ở
lượt đo sau: *"ghế về nhất ván trước phải là ghế đi đầu, kể cả khi đó là máy"*.

Nguyên nhân: **máy nghĩ một mili giây trong bộ test** (`TIENLEN_THINK_MS=1`). Ván mới vừa chia,
nếu người được dẫn là một con máy thì nó đánh xong ngay — và tới lúc test đọc `app.mine()`, lượt
đã trôi qua người dẫn từ lâu.

*Ai được dẫn* là một sự thật chỉ đúng ở **đúng một khung hình**. Cái test đọc khung hình mới
nhất, nên nó hỏi đúng câu ở sai thời điểm, và trả lời sai một cách ngẫu nhiên theo việc push nào
kịp về trước. Chạy riêng thì nhanh và gọn nên nó thường bắt kịp; chạy cùng cả file thì không.

Sửa: đọc **cái push đầu tiên** của ván mới. `app.pushes` giữ cả dãy nên nó vốn có sẵn ở đó —
không phải thêm cơ chế gì, chỉ là thôi đọc nhầm cái.

Đáng ghi lại vì nó là **một họ lỗi khác** với ba mặt trên: ba mặt kia là *cái mốc sai*, mặt này
là *đọc đúng chỗ nhưng sai lúc*. Bộ test nào chạy con bot thật bằng đồng hồ rút ngắn cũng sẽ có
thêm mặt này, và nó luôn luôn hiện ra thành "chập chờn".

### Đã sửa

| | |
| --- | --- |
| `dealt()` trả về **cái ví lúc nó chia** và **đã phải chia mấy ván** | Bảy chỗ so ví giờ lấy mốc đo được thay vì mốc giả định |
| `redealt()` — xin ván nữa cho tới khi có ván đánh được | Chờ ngắn rồi thử lại, thay cho ba chỗ chờ `playing` tới hết giờ. Trả về **người vừa về nhất** *và* **khung hình lúc chia** |
| `app.maybe()` — chờ rồi trả lời có/không | `until` là để canh và để đỏ; có những chỗ "chưa xảy ra" là câu trả lời hợp lệ và có đường đi tiếp |
| Test 3 bích **mở bàn khác** nếu ván đầu là tới trắng | Nới câu hỏi cho vừa cái bàn hỏng là bỏ mất chính thứ nó sinh ra để bắt |
| Hai câu canh người dẫn **in ra đợi ai, được ai** | Một cái đỏ chỉ nói "sai" là một cái đỏ phải chạy lại ba mươi lượt mới đọc được |

**Không sửa một dòng nào trong `tienlenbot.mjs`.** Cả bốn mặt đều nằm ở cái test.

### Đo lại sau khi sửa

| | trước | sau |
| --- | --- | --- |
| Lượt chạy | 22 | **14** |
| Lượt có test đỏ | 3 | **0** |

### Vì sao việc này phải làm trước chặng 2

Hợp đồng của chặng 0 và 1 là *"toàn bộ test cũ vẫn xanh"*, và một bộ test đỏ ngẫu nhiên **không
ký được cái hợp đồng ấy**: mọi lần đỏ từ đó về sau đều bị đọc thành "chạy lại phát nữa xem" —
đúng câu mà chính file ấy đã cảnh báo ở đầu nó, *"một cái test đỏ ngẫu nhiên còn tệ hơn không có
test, vì lần đỏ nào cũng bị đọc thành chạy lại phát nữa xem"*. Chặng 2 là chặng đầu tiên **đổi
hành vi thật** của cái bàn, và là chặng đầu tiên thật sự cần bộ test này nói thật.

### Bài học mang sang chặng sau

Bốn mặt trên chia làm hai họ, và cả hai họ sẽ gặp lại khi tay máy ngồi vào bàn:

- **Mốc sai.** Một con số tuyệt đối viết trong test (`vốn + quà`) là một lời đoán về lịch sử. Đo
  cái mốc ngay trước cái việc đang canh, đừng suy ra nó.
- **Đúng chỗ, sai lúc.** Bộ test này chạy con bot thật bằng đồng hồ rút ngắn — máy nghĩ **một**
  mili giây. Mọi sự thật chỉ đúng trong một khung hình (ai được dẫn, lượt của ai, chip trên
  chiếu trước khi xóc) đều phải đọc từ **đúng khung hình ấy**, không phải từ cái mới nhất.

Cả hai đều sẽ nặng hơn ở chặng 2, vì lúc ấy có thêm một loại người chơi **tự đi nước** với nhịp
người — chậm, lệch, và thỉnh thoảng rất lâu.

## 13. Cái không làm

- **Không** cho tay máy nhìn bài người khác, ở bất kỳ mức nào. Một con máy mạnh vì nhìn trộm không
  phải là một con máy mạnh, và `chooseMove` đã nói đúng câu ấy từ đầu.
- **Không** hạ sức đánh của một con đã được công bố ở mức nào đó để cân pot. Cân bằng cách đổi
  **thành phần dân số**, không bằng cách làm cái nhãn thành lời nói dối.
- **Không** cho tay máy nhắn tin trong phòng. Không làm được.
- **Không** tự nạp pot.
- **Không** cho tay máy ngồi bàn "Đấu với máy" của ai đó. Bàn ấy là bàn một người, có cái giá của
  nó, và ai bấm vào đó là đang xin một bàn không có người.
- **Không** viết bộ luật thứ hai. Mọi mức đều chạy trên `rules/` đang có — mức cao thêm một lớp
  tìm kiếm **ở trên** nó, không thay nó. Một bộ luật thứ hai bao giờ cũng thiếu một luật.
