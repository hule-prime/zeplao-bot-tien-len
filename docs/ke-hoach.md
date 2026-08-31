# Kế hoạch: sửa luật, nâng AI, thêm phỏm

Viết ngày 31/08/2026, **đã làm xong ngày 01/09/2026**. Giữ lại nguyên văn để đối chiếu kế hoạch
với cái thực sự làm; chỗ nào làm khác đi thì ghi ở [design.md](design.md). Chưa deploy — đang
chờ duyệt sau khi test tay ở máy.

Mọi lỗi bên dưới đều đã **dựng lại được trên máy**, không có cái nào là suy đoán. Chỗ nào tôi
đoán, tôi ghi rõ là đoán.

---

## 0. Tóm tắt một trang

| # | Việc | Mức | Ghi chú |
| --- | --- | --- | --- |
| 1 | Cầu bầu cua mất khi restart | **đã xong** | Đã sửa và deploy 20:41 hôm nay. Server đang giữ 30 ván trên đĩa |
| 2 | Về nhất báo mãi khi bàn > 2 người | **lỗi thật** | Đã dựng lại: màn "Bạn về nhất" bị vẽ lại 12 lần |
| 3 | Ván sau vẫn bắt 3 bích | **lỗi luật** | Đúng phải là người về nhất ván trước đi đầu |
| 4 | 5/6 đôi thông không chặt được gì | **lỗi luật** | `beats` chỉ biết đúng 3 và 4 đôi |
| 5 | Chưa có tới trắng | thiếu | Chưa có dòng code nào |
| 6 | Chưa có chặt heo ăn tiền / thối / đền | thiếu | Chưa có dòng code nào |
| 7 | AI còn ngây thơ | nâng cấp | Tham lam 1 nước, không đếm bài, không phân rã bài |
| 8 | Thêm phỏm (tá lả) | game mới | Xếp dưới tiến lên, trên bầu cua |

Ba việc **kiến trúc** phải làm kèm, nếu không thì mấy việc trên không lên được server:

- `deploy/deploy-bot.sh` hiện chỉ upload đúng **hai file**: `tienlenbot.mjs` và `package.json`.
  Tách file là bot chết ngay khi restart. Phải sửa deploy trước khi tách.
- File `tienlenbot.mjs` đang ~2.300 dòng. Thêm phỏm vào một file nữa là không đọc nổi.
- Tên bot hiển thị vẫn là **"Tiến Lên"** dù sắp có ba trò. API `setMe` không đổi được tên;
  phải vào `kuku.vn/bot → @tienlenbot` đổi tay.

---

## 1. Ba lỗi đã dựng lại được

### 1.1 Cầu bầu cua — đã sửa rồi

Anh nói đúng ở thời điểm anh xem. Trước bản deploy lúc 20:41 hôm nay, `game.history` chỉ nằm
trong RAM: **mỗi lần restart là trắng bảng**. Bản đã deploy ghi nó xuống `scores.json` cạnh sổ
vàng, đọc lại lúc khởi động, ghi lại sau mỗi lần xóc.

Kiểm chứng trên server vừa xong:

```
cau: 30 ván
keys: ['cau', 'greeted', 'offset', 'people']
file: 2544 bytes, sửa lúc Mon Aug 31 22:06:37 2026
bot khởi động: Mon 2026-08-31 20:41:17
```

Ghi lúc 22:06 trong khi bot chạy từ 20:41 — tức là nó đang ghi thật, không phải ghi một lần rồi
thôi. Lần restart tới sẽ đọc lại đủ 30 ván.

**Không cần làm gì thêm.** Nếu anh vẫn thấy mất, cho tôi biết mất trong hoàn cảnh nào (đóng mở
lại widget? hay sau khi tôi deploy?) — hai chuyện đó khác nhau và tôi sẽ đo lại.

### 1.2 "Về nhất báo mãi" — lỗi thật, đã dựng lại

Tôi cho một người đánh với ba máy, chơi tới lúc về nhất, rồi **ngồi xem tiếp 40 giây** trong lúc
ba máy còn đánh nhau. Đếm số lần cái tiêu đề "Bạn về nhất" được dựng lại trong DOM:

```
32s pha=over tieu="Bạn về nhất · +4.000" chip=0 lanve=12
36s pha=over tieu="Bạn về nhất · +4.000" chip=0 lanve=12

tiêu đề "Bạn về": 12 lần
```

**Nguyên nhân.** `drawFinished()` vẽ lại **toàn bộ** màn hình đó mỗi lần bot đẩy state — mà bot
đẩy state sau *mỗi nước đi của mỗi máy* và mỗi nhịp đồng hồ. Người về nhất ngồi nhìn cái màn
"Bạn về nhất" bị dựng lại từ đầu hàng chục lần: chữ nhảy, số tiền chạy lại, hiệu ứng nổ lại.

**Vì sao chỉ lộ ra khi > 2 người:** bàn 2 người thì người thứ nhất về là ván hết luôn, không còn
push nào nữa. Bàn 3–4 người thì sau khi anh về nhất còn cả chục nước nữa mới xong.

**Hai lỗi con thấy kèm:**

- Lần vẽ **đầu tiên** ra chữ `"Bạn về "` — **trống hạng**. Ngay khoảnh khắc đi hết bài,
  `paid` chưa có tên mình và `seat.place` còn `null`, nên nó in ra một câu cụt.
- Chip tiền bay `+2.000` nổ **hai lần cùng một mili giây** (`@80166` hai lần): một cái trên ghế,
  một cái trên ví. Cái này *có thể* là cố ý (anh từng yêu cầu hiệu ứng cả trên bàn lẫn khi kết
  thúc), nhưng hai cái y hệt nhau chồng lên nhau cùng lúc thì trông như lỗi.

**Cách sửa.**

1. Màn "đã về đích" chỉ dựng **một lần cho mỗi ván**: nhớ `gameId` đã dựng, các push sau chỉ
   *cập nhật số* trong các phần tử đang có (giống cách `#purse` đang làm), không `replaceChildren`.
2. Không vẽ màn đó cho tới khi **có hạng thật**. Chưa có `place` thì chưa phải lúc thông báo.
3. Hai chip tiền: giữ **một**. Đề xuất giữ chip trên **ghế** (nơi việc đó xảy ra), ví thì chỉ
   đổi số + nháy, không bắn chip. *Cái này tôi muốn anh chốt.*

### 1.3 Ai được đi đầu ván sau — lỗi luật, anh nói đúng

Code hiện tại, `startGame()` — chạy cho **cả** ván đầu lẫn ván đấu lại:

```js
const opening = opensGame(game.hands);   // luôn luôn đi tìm 3 bích
game.turn = opening.seat;
game.opensWith = opening.card;
game.first = true;                        // luôn luôn bắt buộc phải có 3 bích trong nước đầu
```

Không có nhánh nào cho ván sau. Wikipedia tiếng Việt: *"In the opening round, whoever holds ♠3
must play it first. **Subsequent rounds are won by the previous round's winner.**"*

**Cách sửa.** Nhớ **userId** người về nhất trước khi `startGame` xoá `game.finished` (phải là
userId chứ không phải số ghế — lúc đấu lại `game.seats` bị lọc bỏ người đã rời, số ghế đổi).
Ván sau: `turn` = ghế của người đó, `first = false`, `opensWith = null` — đánh gì cũng được.

Người về nhất mà rời bàn thì lùi xuống người về nhì; không còn ai thì mới quay lại 3 bích.

**Luật "cướp cái" bằng 3 đôi thông** (người không về nhất nhưng có 3 đôi thông được đánh ra để
giành lượt đi đầu) — có thật ở một số bàn, nhưng **tôi đề nghị không làm**: nó chỉ có nghĩa khi
bàn thống nhất trước, và nó đánh đổi sự dễ hiểu lấy một tình huống hiếm. Anh muốn thì tôi làm.

---

## 2. Rà soát luật tiến lên miền nam

### 2.1 Cái đang đúng

| Luật | Trạng thái |
| --- | --- |
| Thứ tự 3 < 4 < … < A < 2, chất ♠ < ♣ < ♦ < ♥ | ✅ `card = rank*4 + suit`, số nguyên chính là độ mạnh |
| Sáu bộ: lẻ, đôi, ba, tứ quý, sảnh ≥3, đôi thông ≥3 | ✅ |
| Sảnh và đôi thông **không được chứa heo** | ✅ chặn ở `shapeOf` |
| Sảnh tới A là hợp lệ | ✅ |
| Cùng bộ cùng độ dài thì so lá cao nhất | ✅ |
| Ván đầu phải có 3 bích trong nước đầu | ✅ |
| 3 đôi thông chặt heo lẻ | ✅ |
| Tứ quý chặt heo lẻ, đôi heo, 3 đôi thông | ✅ |
| 4 đôi thông chặt tất cả những cái trên + tứ quý | ✅ |
| Chặt chồng (tứ quý to đè tứ quý nhỏ, 4 đôi đè tứ quý) | ✅ về mặt *đánh được* |
| Chống gian: bài gửi lên được đối chiếu với bài đã chia | ✅ |

### 2.2 Cái đang sai hoặc thiếu

**(a) 5 đôi thông và 6 đôi thông không chặt được gì.** `beats()` chỉ xét đúng `pairs === 3` và
`pairs === 4`. Một dây 5 đôi thông **không đè nổi 4 đôi thông** — nó rơi thẳng xuống
`return false`. Sửa: thang chặt tính theo *hạng bom* chứ không liệt kê từng trường hợp.

Thang đề xuất (hạng cao chặt được mọi hạng thấp hơn):

| Hạng | Bộ |
| --- | --- |
| 0 | heo lẻ |
| 1 | đôi heo |
| 2 | 3 đôi thông |
| 3 | tứ quý |
| 4 | 4 đôi thông |
| 5 | 5 đôi thông |
| 6 | 6 đôi thông |

Cùng hạng thì so lá cao nhất. Riêng 3 đôi thông **chỉ** chặt heo lẻ (hạng 0), không chặt đôi
heo — đây là luật phổ biến nhất và cũng là cái code đang làm.

**(b) Chưa có tới trắng (ăn trắng).** Chia bài xong là thắng luôn, không cần đánh. Đề xuất:

| Bài | Ghi chú |
| --- | --- |
| Tứ quý 2 | bốn con heo |
| 5 đôi thông | năm đôi liên tiếp |
| 6 đôi bất kỳ | không cần thông |
| Sảnh rồng | 12 lá liên tiếp 3→A |
| 3 đôi thông có 3 bích | *tuỳ chọn — mặc định tắt* |

**(c) Chưa có tiền chặt / thối / đền.** Hiện tại toàn bộ tiền chỉ đến từ thứ hạng
(`payouts`: 2 người `[1,-1]`, 3 người `[1,0,-1]`, 4 người `[1,½,-½,-1]`). Chặt heo không được
gì, ôm heo tới cuối không mất gì. Đây là phần "sát phạt" mà anh hỏi, và nó **chưa có gì cả**.

Bảng giá đề xuất, tính theo bội của **tiền cược bàn**, dùng chung cho cả *chặt* lẫn *thối*:

| Bộ | Giá |
| --- | --- |
| Heo đen (2♠, 2♣) | 1× |
| Heo đỏ (2♦, 2♥) | 2× |
| 3 đôi thông | 2× |
| Tứ quý | 3× |
| 4 đôi thông | 4× |
| 5 đôi thông | 5× |
| 6 đôi thông | 6× |

- **Chặt**: ai chặt thì **người bị chặt trả cho người chặt** đúng giá của bộ bị chặt.
- **Chặt chồng**: mỗi lượt chặt cộng dồn vào một cái "nồi" trên đống bài. Người chặt sau ăn cả
  nồi từ người chặt trước, cộng giá bộ của chính mình. Ai bị đè cuối cùng thì trả nhiều nhất —
  đúng cái luật "người bị chặt cuối cùng đền hết" ngoài đời.
- **Thối**: hết ván mà còn ôm heo hoặc còn ôm hàng thì trả đúng giá đó **cho người về nhất**.

**(d) Đền — cần anh chốt.** Ba trường hợp phổ biến, tôi xếp theo mức độ nên làm:

1. **Cóng / thua trắng** — hết ván mà **chưa đánh được lá nào**. Người đó trả tiền thay cho cả
   làng (mỗi người thắng được nhận đủ phần, một mình người cóng gánh). *Nên làm — rõ ràng, ai
   cũng biết.*
2. **Ôm hàng không chặt** — có tứ quý / đôi thông trong tay mà để người khác về nhất bằng con
   heo. Người ôm hàng đền. *Nên làm — nhưng phải giải thích được trên màn hình, nếu không người
   ta bị trừ tiền mà không hiểu vì sao.*
3. **Đền do để người khác tới trắng.** *Đề nghị không làm* — tới trắng là chuyện của bài, không
   phải lỗi của ai.

### 2.3 Còn thiếu cây nào không?

Tôi rà cả `shapeOf` lẫn `movesFrom`:

- Sinh nước đi: lẻ / đôi / ba / tứ quý ở mọi cách chọn chất, sảnh mọi độ dài 3→12, đôi thông
  mọi độ dài 3→6. **Không thiếu bộ nào.**
- Một chi tiết tinh: sảnh chỉ sinh từ lá **thấp nhất** ở mỗi hạng, kèm **một** biến thể lấy lá
  cao nhất của hạng chót. Đúng — chất chỉ có ý nghĩa ở lá cao nhất.
- **Thiếu**: sảnh dài hơn không đè được sảnh ngắn hơn — cái này **đúng luật**, giữ nguyên.

---

## 3. AI tiến lên: đang ở đâu và nâng thế nào

### 3.1 Hiện tại nó làm gì

`chooseMove` là tham lam một nước, chấm điểm bằng `costOf`:

```js
cost = lá_cao_nhất − số_lá × 6
     + 60 nếu là heo
     + 120 nếu là bom
     + 100 nếu xé tứ quý,  + 15 nếu xé bộ ba
```

Rồi: đi hết bài được thì đi; dẫn thì tránh bom; theo thì không tiêu heo/bom trừ khi có người
còn ≤ 2 lá.

**Nó biết:** đừng xé tứ quý, đừng phá bộ ba, giữ heo, ưu tiên đánh nhiều lá, chặn người sắp về.
Nói cho công bằng thì nó đã hơn người mới chơi.

**Nó không biết:**

1. **Bài nào đã ra rồi.** Nó không biết cả bốn con K đã đi hết, nên không biết con Q của nó giờ
   là lớn nhất — tức là không biết mình đang cầm quyền dẫn.
2. **Bài mình chia được thành mấy nước.** Đây là thứ quyết định thắng thua ở tiến lên. Một tay
   13 lá đi được trong 5 nước mạnh hơn hẳn tay 13 lá đi trong 8 nước, kể cả khi tay sau có heo.
   AI hiện tại chấm điểm **từng nước một**, không bao giờ nhìn cả tay bài.
3. **Bỏ lượt có chủ ý.** Nó chỉ bỏ khi không đánh nổi hoặc khi nước rẻ nhất quá đắt. Không có
   khái niệm "nhường vòng này để giữ quyền dẫn vòng sau".
4. **Ưu tiên chặt heo.** Anh hỏi đúng chỗ: hiện tại tứ quý **không** được ưu tiên để chặt heo —
   `costOf` cộng +120 cho bom nên nó *né* chặt, trừ khi có người còn ≤2 lá. Nghĩa là **chưa
   biết chặt heo ăn tiền**, mà khi có luật tiền chặt ở mục 2.2(c) thì chặt heo là *có lời thật*.
5. **Xé sảnh.** `costOf` phạt xé tứ quý và bộ ba, nhưng **không phạt xé sảnh**. Lấy con 7 trong
   dây 5-6-7-8-9 ra đánh lẻ là mất cả dây, mà nó không thấy.

### 3.2 Nâng cấp đề xuất

Đọc tài liệu về AI Big Two / Tiến lên (ScienceDirect về *Optimized Deep Monte-Carlo*, khảo sát
AI game bài của arXiv), hướng mạnh nhất là mạng nơ-ron học từ tự chơi — **không hợp ở đây**:
container 192MB, 0.25 CPU, phải trả lời trong ~900ms. Nhưng bài báo đó dùng kèm một thứ rất hợp:
**Minimum Combination Search** — quy hoạch động tìm số nước ít nhất để đi hết bài. Đó chính là
thứ AI của mình đang thiếu, và ở tiến lên nó **rẻ đến bất ngờ**:

> Một tay chỉ có tối đa 13 lá → chỉ có **2¹³ = 8.192** tập con. Quy hoạch động trên bitmask là
> tức thời, không cần xấp xỉ gì cả.

**Bốn tầng, làm theo thứ tự, mỗi tầng đo được:**

**Tầng 1 — Phân rã bài (DP trên bitmask).** `plansFor(hand)` trả về số nước ít nhất để đi hết,
và cách chia. Từ đó `costOf` đổi từ "nước này đắt bao nhiêu" sang câu đúng hơn:

> *Đánh nước này xong, tay còn lại đi hết trong mấy nước?*

Nước nào không làm tăng số nước còn lại là nước "miễn phí". Cái này một mình đã sửa luôn lỗi xé
sảnh ở 3.1(5), vì xé sảnh làm số nước còn lại tăng lên.

**Tầng 2 — Đếm bài.** Bot đã biết mọi lá đã đánh (nó giữ `pile` và cả ván). Từ đó tính được
`caoNhatConLai(bộ)`. Có hai thứ dùng ngay:

- *Lá cầm quyền*: nước nào không ai đè nổi nữa thì dẫn ra là chắc chắn được dẫn tiếp.
- Không giữ heo khi cả bốn con heo khác đã ra — lúc đó con A của mình đã là vô đối.

**Tầng 3 — Ý thức tàn cuộc.** Ai còn 1 lá thì **phải** chặn bằng mọi giá, kể cả xé tứ quý: mất
tứ quý còn hơn thua cả ván. Ngược lại, mình còn 2 lá mà nắm quyền dẫn thì đánh lá to trước rồi
lá bé sau, không bao giờ ngược lại.

**Tầng 4 — Ưu tiên chặt heo (sau khi có luật tiền ở 2.2c).** Chặt không còn là "tốn một quả
bom", nó là **thu tiền**. Quyết định thành phép so sánh thật: giá con heo chặt được so với giá
trị quả bom giữ lại. Đúng cái anh hỏi — "đã biết ưu tiên tứ quý chặt heo chưa" — hiện tại là
**chưa**, và tầng này làm nó biết.

**Tuỳ chọn — tầng 5, PIMC.** Bốc ngẫu nhiên bài của đối thủ từ những lá chưa thấy, chơi thử
vài chục ván, chọn nước thắng nhiều nhất. Mạnh hơn hẳn nhưng tốn CPU. *Đề nghị để sau*, và chỉ
bật ở tàn cuộc khi cả bàn còn ít lá.

### 3.3 Đo bằng cái gì

Không nói "thông minh hơn" suông. Test cho **AI mới đấu AI cũ 2.000 ván**, ghi tỉ lệ thắng.
Ngưỡng nhận: **≥ 60%**. Kèm test giữ ngưỡng thời gian: một nước đi phải xong trong **< 50ms**
trên máy chậm, nếu không thì bàn 4 máy sẽ ì.

---

## 4. Phỏm (tá lả)

### 4.1 Luật sẽ làm

Nguồn: Wikipedia tiếng Việt + luật Sảnh Rồng, đối chiếu vài nơi. Chỗ nào các nơi nói khác nhau
tôi ghi rõ và chọn một.

**Chia bài.** 2–4 người, bộ 52 lá. Mỗi người **9 lá**, riêng người đi đầu (cái) **10 lá**. Phần
còn lại làm **nọc**.

**Phỏm.** Ba lá trở lên, hoặc cùng hạng khác chất (777), hoặc liên tiếp cùng chất (5♥6♥7♥).

**Một lượt.** Theo chiều kim đồng hồ, mỗi lượt gồm hai việc:

1. **Ăn** lá người trước vừa đánh — chỉ được nếu nó ghép ngay thành phỏm với ≥2 lá trên tay —
   **hoặc bốc** một lá từ nọc.
2. **Đánh** ra một lá.

**Số vòng.** Mỗi người đi **4 lượt**. Hết lượt thứ tư của người cuối là hết ván. Lá đánh ra cuối
cùng gọi là **chốt**; ai ăn được chốt thì gọi là **ăn chốt**.

**Hạ bài.** Hết ván, ai có phỏm thì hạ. Sau khi hạ, được **gửi** những lá rác lẻ vào phỏm của
người khác đã hạ — lá gửi được thì không tính điểm. Chưa hạ phỏm nào thì **không được gửi**.

**Ù.** Cả tay vào phỏm hết, không còn lá rác. Ù là thắng ngay, dừng ván.

**Móm.** Hết ván mà không có phỏm nào. Thua nặng nhất và không được gửi.

**Điểm.** Tổng các lá rác còn lại. A = 1, 2 = 2, …, 10 = 10, J = 11, Q = 12, K = 13. Ít điểm
nhất thắng. **Bằng điểm thì ai hạ sau thua** — đúng luật Sảnh Rồng.

**Đền.** Hai trường hợp, đều là "trả thay cả làng":

1. **Ăn chốt rồi người sau ù** → người ăn chốt đền.
2. **Cho một người ăn 3 lần trong một ván** → người cho ăn đền.

*(Tôi chọn hai cái này vì chúng có ở gần như mọi nơi. Nếu anh chơi luật khác thì nói.)*

### 4.2 Tiền

Giữ đúng khung của tiến lên để một cái ví ba trò không lệch nhau:

- Xếp hạng theo điểm rác, tiền theo `payouts` sẵn có: 2 người `[1,−1]`, 3 người `[1,0,−1]`,
  4 người `[1,½,−½,−1]`, nhân với cược bàn.
- **Móm**: phần thua **nhân đôi**.
- **Ù**: ăn **gấp đôi** phần thường từ mỗi người.
- **Đền**: người đền trả **toàn bộ** số tiền của ván đó thay cho tất cả những người thua.
- Vẫn **tổng bằng không** giữa người với người. Máy không bao giờ được trả tiền — y như tiến
  lên, bàn dưới 2 người thật thì đánh với nhà ở mức cược cố định.

### 4.3 AI phỏm

Phỏm dễ làm AI khá hơn tiến lên vì nó gần như là bài toán tối ưu một tay:

1. **Phân rã tối ưu tay bài** (lại là DP trên bitmask, 10 lá → 1.024 tập con): chọn cách chia
   cho **điểm rác nhỏ nhất**.
2. **Ăn hay bốc**: ăn khi lá đó giảm điểm rác; **không ăn** khi ăn xong bắt buộc phải nhả ra
   một lá to hơn.
3. **Đánh lá nào**: lá rác điểm cao nhất mà **ít khả năng ghép nhất** — có tính cả lá đang chờ
   (ví dụ giữ 6♥7♥ vì còn cửa 5♥ và 8♥).
4. **Không nuôi người sau**: nhớ người kế bên đã ăn gì và đánh gì, tránh nhả lá họ đang chờ.
   Đây là thứ phân biệt người biết chơi với người mới, và nó rẻ.
5. **Ù**: kiểm tra sau mỗi lần ăn/bốc.
6. **Cảnh giác đền**: gần chốt thì tránh ăn chốt nếu tay còn nhiều rác — ăn chốt xong người sau
   ù là mình trả cả làng.

### 4.4 Giao diện

Vào từ menu chính, **giữa tiến lên và bầu cua** đúng như anh nói. Dùng lại y nguyên bộ khung
đang có: ví luôn hiện, bước chọn chế độ → số người → mức cược, bàn thế giới, bảng xếp hạng chung.

Màn chơi cần thêm:

- Tay bài **tự nhóm theo phỏm**, phỏm tô màu, lá rác để xám — nhìn phát biết mình đang bao nhiêu
  điểm. Có sẵn số **điểm rác hiện tại** trên màn.
- **Nọc** và **bãi đánh**, lá vừa đánh nổi bật vì đó là lá mình được quyền ăn.
- Nút **Ăn** chỉ sáng khi ăn hợp lệ; ấn vào phải nói rõ ăn thành phỏm nào.
- Vòng thứ mấy / còn mấy lượt — vì luật 4 vòng mà không đếm được thì không chơi được.
- Màn hạ bài cuối ván: phỏm của từng người, lá gửi được bay sang phỏm người ta, rồi mới ra điểm.

---

## 5. Kiến trúc

### 5.1 Tách file (bắt buộc, làm trước)

Hiện tại: một file 2.300 dòng. Thêm phỏm + luật tiền + AI mới là ~4.000. Đề xuất:

```
bots/tienlenbot/
  tienlenbot.mjs      vòng lặp update, phiên, ví, đẩy state   (~900 dòng)
  rules/tienlen.mjs   luật + AI tiến lên
  rules/phom.mjs      luật + AI phỏm
  rules/baucua.mjs    luật bầu cua
  economy.mjs         vàng, cược, chia tiền, quảng cáo
```

**Cảnh báo:** `deploy/deploy-bot.sh` chỉ `scp` đúng `tienlenbot.mjs` và `package.json`. Tách file
mà quên sửa deploy là **bot chết ngay lần restart sau** với `ERR_MODULE_NOT_FOUND` — và nó chỉ
chết trên server chứ ở máy vẫn chạy ngon. Sửa deploy **trước**, và thêm một bước kiểm tra sau
deploy: `node --input-type=module -e "import('./tienlenbot.mjs')"` trên chính server.

### 5.2 Cái không đổi

Mô hình phiên (một phiên thuộc **một người**, ở phòng của họ) không đụng tới. Phỏm dùng lại y
nguyên: `screens`, `openBy`, `pushTo` với `to` cho bài riêng, bàn thế giới, ví chung. Một trò
mới chỉ là một `kind` mới.

---

## 6. Thứ tự làm

| Đợt | Việc | Vì sao trước/sau |
| --- | --- | --- |
| **1** | Sửa deploy để upload cả thư mục; tách file | Không có cái này thì mọi thứ sau không lên server được |
| **2** | Lỗi 1.2 (báo mãi) + 1.3 (3 bích) + 2.2a (5–6 đôi thông) | Lỗi đang chạy trên bot thật, sửa nhanh, rủi ro thấp |
| **3** | Luật tiền: chặt / thối / tới trắng / đền | Đụng vào ví — cần test kỹ nhất |
| **4** | AI tiến lên tầng 1–4 | Sau (3) vì tầng 4 cần luật tiền chặt |
| **5** | Phỏm: luật + test thuần | Phần lớn công sức, nhưng không đụng gì đang chạy |
| **6** | Phỏm: AI | |
| **7** | Phỏm: giao diện | |
| **8** | Doc + test toàn bộ + deploy | Chỉ deploy khi anh duyệt |

Ước lượng: đợt 1–2 nhỏ; đợt 3–4 vừa; đợt 5–7 là phần lớn.

## 7. Test sẽ viết

Giữ đúng lối đang có — test luật là hàm thuần, test luồng chạy qua HTTP giả.

- Luật tiến lên: thang chặt đầy đủ **6 hạng bom**, có ca 5 và 6 đôi thông (cái đang sai).
- Tiền: **tổng bằng không** sau mọi ván, kể cả có chặt chồng và đền — đây là test quan trọng
  nhất, vì lỗi tiền là lỗi duy nhất người chơi nhớ mãi.
- Tới trắng: đúng 5 loại bài, và không nhận nhầm cái gần giống.
- Ai đi đầu: ván đầu là 3 bích; ván sau là người về nhất; người đó rời bàn thì lùi xuống nhì.
- "Về nhất chỉ báo một lần": test đọc DOM như cái tôi vừa dùng để dựng lỗi, đếm số lần vẽ.
- AI: 2.000 ván mới đấu cũ, ngưỡng ≥60%; và một nước < 50ms.
- Phỏm: phỏm hợp lệ, ăn hợp lệ, gửi hợp lệ, ù, móm, hai ca đền, điểm rác, bằng điểm thì ai thua.

## 8. Cần anh chốt

Mấy cái này là **luật nhà**, mỗi bàn chơi một kiểu, tôi không tự quyết:

1. **Bảng giá chặt/thối** ở 2.2(c) — heo đen 1×, heo đỏ 2×, 3 đôi thông 2×, tứ quý 3×,
   4 đôi 4×, 5 đôi 5×, 6 đôi 6×. Được chưa, hay anh có bảng khác?
2. **Đền**: làm cả (1) cóng và (2) ôm hàng không chặt? Hay chỉ cóng?
3. **Tới trắng ăn bao nhiêu?** Đề xuất: **gấp 3** phần về nhất, thu từ mỗi người.
4. **Cướp cái bằng 3 đôi thông** — làm hay bỏ? (tôi đề nghị bỏ)
5. **Chip tiền bay**: giữ một cái trên ghế thôi, hay giữ cả hai?
6. **Phỏm 2 người** có mở không, hay tối thiểu 3?
7. Đổi tên bot ở `kuku.vn/bot` — ba trò rồi mà vẫn tên "Tiến Lên". Anh đổi hay để vậy?

Chốt xong tôi mới bắt đầu code, và **không deploy** cho tới khi anh bảo.
