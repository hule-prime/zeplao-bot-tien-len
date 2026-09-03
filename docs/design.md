# Quyết định

Cái gì làm thế nào, và chỗ nào từng làm sai trước khi làm đúng. File này để đọc trước khi sửa,
vì phần lớn những thứ ở đây trông vô lý cho tới lúc biết nó thay thế cái gì.

---

## 1. Một phiên thuộc về một người, không thuộc về một bàn

Đây là quyết định chịu lực của cả dự án.

Một phiên widget thuộc về **một cuộc trò chuyện**, và `showSession` từ chối mở phiên cho người
không ở trong cuộc trò chuyện đó (`BotApi.cs`, lỗi `not_in_conversation`). Đúng — nếu không thì
bot nào cũng đẩy được màn hình của phòng lạ lên trước mặt bất kỳ ai.

Hệ quả: **một bàn có phiên riêng là một bàn chỉ phòng mở ra nó chơi được**. "Tìm bàn ở khắp nơi"
là chuyện không thể.

Nên ở đây phiên thuộc về **một người**, nằm trong phòng của chính người đó, và đi theo họ: sảnh →
bàn họ ngồi → sảnh. Một bàn được đẩy vào bao nhiêu phiên tuỳ số người ngồi ở nó, và những người
đó ở bốn nhóm khác nhau cũng được. Không phiên nào đi xuyên phòng — **chỉ có bức ảnh của cái bàn
là đi**.

Nó còn xoá sạch `setSessionPlayers`: một phiên có đúng một người chơi, là chủ của nó. Nghĩa là
`role` trên mỗi hành động gửi tới **không nói lên điều gì** (server sẽ trả lời "player" cho bất
kỳ ai mở màn hình của người khác), nên mọi kiểm tra đều dựa vào **ghế mà chính bot này chia**,
cộng với việc người gửi có phải chủ màn hình đó không.

Carobot giải bài toán ngược lại: nó *soi* trạng thái bàn này vào phiên của bàn kia (`mirroring`).
Cách đó chạy được và tốn máy móc hơn — năm chỗ phải đồng ý với nhau, và widget cần cả một chế độ
"đang xem".

Test `two people in different groups sit at the same table` dựng server giả **thực thi đúng luật
đó**, nên nếu hai khung chơi được với nhau thì đó là thật.

## 2. Không ai nhận bài của người khác

`pushState` không có `to` đi tới mọi người đang mở, và mang **số lá** mỗi ghế đang cầm.
`pushState` có `to` đi tới một người, và mang bài của người đó.

Đây là lỗi mà trong game bài không ai phát hiện cho tới lúc có người mở tab Network — và tới lúc
đó thì đã có người gian lận cả tuần. Có một test **đọc mã nguồn** và fail nếu chữ `hand` lọt vào
một trong hai hàm dựng trạng thái chung.

Bản đẩy riêng là **một trạng thái đầy đủ**, không phải một mẩu vá. Server nhớ thứ cuối cùng đã đẩy
cho từng người và **ưu tiên bản riêng** khi ai đó mở widget muộn — nên một bản riêng chỉ chứa bài
sẽ cho người ta thấy một tay bài và không có cái bàn nào.

## 3. Vàng

| | |
| --- | --- |
| Vốn ban đầu | **50.000**, một lần, lần đầu mở widget. Đủ để ngồi bất kỳ bàn nào trên danh sách và thua vài ván mà chưa phải đi xem quảng cáo. **Cho một lần rồi đánh dấu**, nên nâng nó lên không cộng thêm cho ai đang chơi — chỉ người vào sau mới nhận con số mới |
| Quà mỗi ngày | **+30.000**, và phải **bấm nhận**. Ngày sang lúc nửa đêm giờ Việt Nam, không phải giờ UTC |
| Bàn với máy | Cược cố định **10.000**, bất kể bàn mở ở mức nào. Nhất +10.000, nhì +5.000, ba −5.000, bét −10.000. Một ván cờ với máy cũng đúng con số ấy: thắng ăn, thua mất, hoà thì giữ nguyên |
| Bàn giữa người | Cược của phòng — **tự đặt**, từ 1.000 tới 1.000.000 và không quá số tiền người mở đang có. Ba mức có sẵn chỉ là câu trả lời thường gặp |
| Kiếm thêm | Quảng cáo 10 giây, **8.000** — tối đa 1.000 lần/ngày (con số đó chặn lỗi đếm chứ không phải để hạn chế — mười giây một lần đã là hạn chế rồi). Nằm sau dấu `+` cạnh ví, **ở mọi mức tiền** |
| Bảng xếp hạng | Vàng, của cả thế giới |

**Quảng cáo trả đúng một ván với máy**, không phải trùng hợp: nó tồn tại để đưa người hết tiền
quay lại bàn, mà một quảng cáo xem xong vẫn không đủ ngồi thứ rẻ nhất trên màn hình là một quảng
cáo không làm được việc của nó.

`ADS_GOLD` từng **được định nghĩa bằng `BOT_STAKE`** đúng vì câu ấy. Lý lẽ đó đứng vững khi ván
với máy là bốn nghìn; khi nó lên mười thì không: mười nghìn cho mười giây là một phần ba quà cả
ngày, mà quà cả ngày mới là thứ người ta được mong quay lại vì nó. Nên giờ nó là con số riêng —
**8.000** — và cái phải nói ra là nó **mua được gì**: tám bàn rẻ nhất trên danh sách, một buổi
dài ở hai cái bát, hay gần trọn một ván với máy. Hai lần xem là về lại bàn máy, còn dư.

Sàn của nó là `MIN_STAKE`, không phải `BOT_STAKE`: dưới một cược nhỏ nhất thì thật sự không còn
bàn nào ngồi được. Có test canh cả sàn lẫn trần — đường về bàn máy dài hơn bốn lần xem thì là một
việc vặt, không phải một đường về.

`BROKE` cũng đổi nghĩa theo, và đổi cho **đúng**: nó là chỗ không còn bàn nào ngồi được, tức là
`MIN_STAKE`. Để nó bằng `BOT_STAKE` thì gọi người còn ngồi được bốn bàn trên danh sách và cả hai
cái bát là "hết vàng", mà chữ ấy lúc đó thôi nói được điều gì.

Ba con số vừa nâng: vốn ban đầu 20.000 → **50.000**, quà mỗi ngày 10.000 → **30.000**, cược với
máy 4.000 → **10.000**. Vốn ban đầu **không hồi tố**: `rowFor` phát nó đúng một lần rồi ghi
`started` xuống sổ, nên ai đang chơi vẫn giữ số của mình.

**Tổng bằng không.** `payouts` cho nhất ăn một cược của bét, và ở bàn đủ bốn thì nhì ăn nửa cược
của ba; giữa bàn lẻ thì hoà. Vàng chuyển giữa những người ngồi đó và không sinh ra từ đâu — đây là
hình dạng duy nhất còn tỉnh táo khi bốn người ngồi chơi cả buổi tối.

**Máy là đồ đạc.** Bàn hai người hai máy: ai trong **hai người** hết bài trước là thắng một cược
của người kia, máy làm gì ở giữa không tính. Và bàn chỉ có một người là bàn đánh với nhà cái ở
mức cố định, bất kể phòng mở ở mức nào — nếu không thì mở bàn năm mươi nghìn rồi điền toàn máy là
in vàng.

**Thu cược trước khi ngồi xuống**, không phải sau khi thua. Không thì một cược đủ ngồi bốn bàn
cùng lúc và thua cả bốn. Không ai âm vàng.

**Trả tiền ngay lúc từng người về**, không đợi bàn tan. Hết bài **là** thắng — hạng chốt và tiền
quyết định ngay lúc lá cuối rời tay, nên trả ở đó và người ta đứng dậy đi được.

**Rời bàn khi còn bài trên tay là về bét**, và bị trừ. Rời bàn khi hết bài thì không phải là rời
bàn. Hai việc là hai nút khác nhau — `Bỏ ván` và `Về sảnh` — vì giá của chúng khác nhau.

**Mười giây quảng cáo do bot đếm.** Trang vẽ đồng hồ; đòi tiền sớm thì bị từ chối. Một đồng hồ do
widget đếm là một đồng hồ widget bỏ qua được, vì widget là file ai cũng sửa được.

**Người chơi cũ cũng được vốn ban đầu**, một lần, có dấu `started` trên từng dòng sổ. Cái dấu
mới là thứ làm việc này chạy được ở mỗi lần khởi động mà không cộng hai lần — và bot khởi động
lại nhiều hơn người ta tưởng.

**Một người là một ví.** Sổ khoá theo người và không theo gì khác — không theo phòng, không theo
màn hình, không theo phiên. Ai ở năm nhóm cũng chỉ một đống vàng và một chỗ trên bảng.

## 4. Luật, viết ở một chỗ

Một lá bài là **một con số**, `rank * 4 + suit`, và con số đó *chính là* sức mạnh của nó: 3♠ là 0
và 2♥ là 51. Mọi so sánh trong trò chơi — rác lớn hơn, đôi lớn hơn, sảnh dài hơn — đều là `>` trên
một số nguyên, và không có chỗ thứ hai nào để thứ tự bị viết khác đi.

Toàn bộ máy trạng thái lượt chơi nằm **ngoài** `run()`, thuần, không dính chat. Đó là phần cần
cẩn thận nhất và cũng là phần không nhìn màn hình nào mà kiểm được: một vòng kết thúc sớm một ghế
trông y hệt một vòng kết thúc đúng. Test chia bài và đánh hết **220 ván** — 100 bàn bốn người, 60
bàn ba, 60 bàn hai — kiểm từng thế cờ trên đường đi.

Ai giữ **lá thấp nhất trong bàn** đi trước và phải đi kèm lá đó. Ở bàn đủ bốn thì đó là 3♠, luật
ai cũng biết; ở bàn ngắn thì 3♠ có thể nằm trong nửa cỗ không ai được chia, nên luật thật là "lá
thấp nhất **đang chơi**". Từng là hai lần tra ở hai chỗ, và bàn ngắn mở đúng ghế nhưng đòi một lá
không ai có.

## 5. Giao diện

Khung rộng chừng 390×640 trên điện thoại và **không bao giờ chiếm cả màn hình**, nên thứ nằm
trong đó là do quyết định chứ không phải xếp bừa rồi mong nó vừa.

- **Trên cùng luôn là ví.** Từ khung hình đầu tiên, trên mọi màn. Vàng là thứ cả trò chơi chơi vì
  nó; đi tìm nó không phải việc ai đó phải làm.
- **Hỏi từng câu một.** Màn đầu là hai lối vào, rồi mới hỏi mấy người, rồi mới hỏi cược bao nhiêu.
  Bày hết ra cùng lúc là **mười một cái nút** trên thứ đầu tiên người ta nhìn thấy.
- **Kiếm thêm vàng nằm sau dấu `+` cạnh ví**, không nằm trên màn đầu. Từng làm sai đúng chỗ này:
  dọn màn đầu xuống hai thẻ xong lại nhét thẻ quảng cáo trở vào đó khi hết vàng — tức là thêm
  một thứ thứ ba để đọc, đúng cái vừa bỏ đi. Dấu `+` cạnh số tiền là chỗ ai cũng biết tìm, và nó
  có mặt trên mọi màn **ở mọi mức tiền**: một dấu `+` lúc có lúc không là một dấu `+` không ai
  học được là nó ở đó, mà lúc người ta muốn nó không phải lúc nào cũng là lúc hết sạch tiền.
- **Chạm một lá là nhặt cả bộ.** Đối thủ ra sảnh ba, chạm một lá thì sảnh ba hiện lên. Lá được
  chạm bị *ghim* — mọi bộ đều dựng quanh nó — nên chạm 5♥ ra `3♥ 4♥ 5♥` chứ không ra bộ dựng từ
  chất thấp nhất rồi thua.
- **Nút bị khoá phải nói vì sao.** `Không thành bộ`, `Không chặt được`, `Phải có 3♠`. Một cái nút
  sáng rồi bấm không ra gì tệ hơn một cái nút tối có ghi lý do.
- **Phòng chờ nói nó là bàn của ai, cược bao nhiêu, còn mấy ghế**, và người không phải chủ bàn
  được **báo** chứ không được đưa một cái nút xám. Nút xám ghi "đang đợi" là thứ người ta bấm cho
  tới lúc bỏ cuộc.

## 6. Tiền của một ván tiến lên

Trước đây tiền chỉ đến từ thứ hạng. Chặt heo không được gì, ôm heo tới cuối không mất gì — tức
là phần "sát phạt", đúng cái làm nên trò này, không có trong game.

Một bảng giá dùng chung cho hai câu hỏi, vì ở bàn thật nó cũng là một bảng: **chặt được thì thu
bấy nhiêu, ôm tới cuối thì trả bấy nhiêu.**

| Bộ | Giá (× cược) |
| --- | --- |
| Heo đen (2♠, 2♣) | 1 |
| Heo đỏ (2♦, 2♥) | 2 |
| 3 đôi thông | 2 |
| Tứ quý | 3 |
| 4 đôi thông | 4 |
| 5 đôi thông | 5 |
| 6 đôi thông | 6 |

- **Heo đen và heo đỏ không phải một con.** Nên heo được đếm **từng lá**, chứ không đếm theo bộ
  đã đánh ra: hai con heo nằm trong tay tới cuối ván là hai con heo, dù chủ nó có định đánh
  thành đôi hay không.
- **Chặt chồng có một cái nồi.** Nồi là số tiền người đang cầm đống bài sẽ mất nếu bị đè tiếp:
  tiền họ vừa ăn được, cộng giá quả bom của chính họ. Ba lượt chặt thì người đầu tiên chỉ mất
  đúng con heo của mình — hai người ở giữa mới là người chảy máu. Đúng cái luật "ai bị chặt cuối
  cùng đền hết" ngoài đời.
- **Chỉ giữa người với người.** Máy không thu và không trả, y như nó không trả tiền về nhất. Bàn
  một người với ba máy thì không có chặt, không có thối, không có đền — nếu không thì có một
  đường in vàng: mở bàn với máy rồi chặt heo của chúng.
- **Tới trắng** — tứ quý heo, năm đôi thông, sáu đôi bất kỳ, sảnh rồng — ăn **ba lần cược của
  từng người** và ván không có tiền thứ hạng, vì không ai đánh gì cả. Chỉ tính ở bàn từ hai
  người thật trở lên, cùng lý do trên: một tay bài đẹp không được là một cái máy in.
- **Đền** là một người trả thay cả làng, và có hai đường tới: **cóng** (hết ván chưa đánh nổi
  một lá) và **ôm hàng không chặt** (để người ta về nhất bằng con heo trong khi mình cầm bom
  chặt được). Cả hai chỉ tính khi chỉ ra được **đúng một** người — hai người cùng cóng thì không
  ai đền ai, và hai người cùng ôm hàng thì không chỉ mặt được ai.

**Chỗ suýt sai, và nó sai ở cả hai trò cùng lúc.** Đền viết lần đầu là "người đền gánh nợ của
những người thua". Nghe đúng, và đúng *chừng nào người đền cũng đang thua*. Người đền mà lại
đang thắng thì công thức đó làm bàn in ra một nghìn vàng từ hư không. Cách viết đúng là **"người
đền trả cho những người thắng"** — hai câu ấy chỉ trùng nhau ở một nửa số trường hợp. Bắt được
nhờ cái test tổng-bằng-không bên phỏm, nơi cùng một hình dạng sai nằm trong cùng một hình dạng
code; sửa xong mới đi ngược lại tìm thấy nó bên tiến lên.

---

## 7. Cái máy: nó nghĩ bằng gì

Máy cũ chấm điểm **từng nước một**: lá cao trừ đi số lá, cộng 60 nếu là heo, cộng 120 nếu là
bom, cộng 100 nếu xé tứ quý. Nó biết giữ heo và đừng xé tứ quý. Nó **không** biết tay bài của
nó đi hết trong mấy nước, không biết lá nào đã ra rồi, không phạt xé sảnh, và vì cộng thẳng 120
cho mọi quả bom nên nó **né chặt heo** — kể cả lúc chặt là nước đúng.

Cái thiếu là một con số: **tay này đi hết trong mấy nước.** Một tay đi hết trong năm nước thắng
một tay đi hết trong tám nước có hai con heo, gần như luôn luôn. Bài báo về AI Big Two gọi nó là
*Minimum Combination Search*; ở đây nó rẻ đến mức không cần xấp xỉ gì:

> Một tay nhiều nhất mười ba lá → nhiều nhất **2¹³ = 8.192** cách còn lại một phần. Mỗi trạng
> thái chỉ cần xét những nước dùng **lá thấp nhất của chính nó** — lá thấp nhất kiểu gì cũng
> phải đi trong một nước nào đó. Vài nghìn bước, mỗi lượt một lần.

Trên nền đó:

- **`costOf` đổi câu hỏi.** Không còn là "nước này đắt bao nhiêu" mà là *"đánh xong thì tay còn
  lại đi hết trong mấy nước"*. Một mình chuyện đó sửa luôn lỗi xé sảnh: rút con 7 khỏi
  5-6-7-8-9 làm số nước còn lại nhảy vọt, và giờ nó thấy.
- **Phân rã phải bóc được dây song song**, mà `movesFrom` thì không — nó chỉ sinh sảnh làm bằng
  lá thấp nhất mỗi hạng, vì để *đánh* thì không có lý do sinh cái thứ hai. Để *chia* thì có mọi
  lý do: 3♠4♠ 5♠5♣ 6♠6♣ 7♠7♣ là sảnh 3-4-5-6-7 rồi sảnh 5♣6♣7♣ — hai nước, không phải ba.
- **Đếm bài.** `seen` là những lá **đã đánh ra trước mặt mọi người** — không bao giờ là bài trên
  tay ai. Có test đọc thẳng thân hàm `chooseMove` và bắt đỏ nếu trong đó xuất hiện `hands`,
  `game.` hay `seats`. Một cái máy nhìn được bài người khác là cái máy không ai thắng nổi, và là
  gian lận.
- **Ưu tiên chặt.** Chặt không còn là "tốn một quả bom" mà là lấy con heo ra khỏi tay người đang
  trông vào nó. Nó chặt khi bài mình đã ngắn, hoặc khi có người sắp về — chứ vẫn không chặt bằng
  quả bom duy nhất ở nước thứ hai của ván.

**Đo được, không nói suông.** Máy mới đấu máy cũ 2.000 ván ở cả bàn hai người lẫn bàn bốn người:
thắng **62%** và **64%**. Ngưỡng trong test đặt ở 57%, thấp hơn số đo chừng bốn lần sai số — một
cái test chập chờn còn tệ hơn không có test, vì lần đỏ nào cũng bị đọc thành "chạy lại xem". Kèm
một ngưỡng thời gian: một nước phải xong dưới 50ms, vì bàn bốn máy là bốn lần nghĩ nối nhau.

Thử mà **không** giữ lại, ghi ở đây để khỏi ai thử lại:

| Ý | Kết quả |
| --- | --- |
| Bỏ lượt thay vì xé một bộ | 62% → **53%**. Giữ được dây nhưng mất quyền dẫn, mà quyền dẫn đắt hơn |
| Phạt nặng hơn nước ngoài kế hoạch (40 → 90 → 160) | không đổi gì — số nước còn lại đã át hết |
| Sắp về đích thì dẫn lá khó đè trước | trong khoảng nhiễu, không đáng thêm một nhánh |

---

## 8. Đánh phỏm

Cùng bộ khung: cùng ví, cùng mô hình phiên, cùng bàn thế giới, cùng cách máy là đồ đạc. Khác ở
ba chỗ, và cả ba đều là chỗ dễ sai.

**Một lá bài đọc khác nhau ở hai trò.** Cùng con số 0–51, cùng `hạng * 4 + chất`. Nhưng tiến lên
xếp 3 thấp nhất và 2 cao nhất; phỏm xếp A thấp nhất, K cao nhất, và A đáng đúng **một điểm**.
Hai cách đọc trên cùng một con số là chỗ dễ lẫn nhất trong cả dự án, nên hai trò có hai bộ hàm
đọc riêng và không bao giờ dùng chung `rankOf`. Cả bên widget cũng vậy: `rankName` hỏi xem đang
là trò nào rồi mới tra bảng.

**Chia tay bài cho ít điểm rác nhất** lại là quy hoạch động trên bitmask, và lại vì đúng lý do
cũ: mười lá là 1.024 trạng thái, nên trả lời *chính xác* rẻ hơn đoán. Cái bẫy ở đây không phải
thuật toán mà là câu hỏi: cách chia đúng là cách để lại **ít điểm** nhất, không phải ít **lá**
nhất. 5♥6♥7♥ 7♠7♣ K♦ giữ sảnh thì thừa 27 điểm, giữ bộ ba thì thừa 24 — hai câu nghe giống nhau
và không phải một.

**Ăn thì khoá bộ lại.** Ăn được một lá là vì nó vào phỏm — nên phỏm ấy phải đứng. Không rút ruột
nó để ăn tiếp, và không đánh lá của nó đi. Ở bàn thật chuyện này không cần nói: ba lá nằm ngửa
trước mặt và không ai với tới. Ở đây phải nói ra thành luật, và bản đầu tôi quên:

```
ăn 7♥  →  bộ 7♠ 7♣ 7♥
ăn 8♠  →  bộ 6♠ 7♠ 8♠      (cướp mất 7♠)
chia rẻ nhất thành 5♠ 6♠ 7♠ 8♠, rác gồm 7♣ và 7♥
                              ↑ 7♥ là lá đã ăn, giờ là rác
```

Tức là đã ăn một lá rồi không dùng được nó. Người chơi tìm ra, và họ mô tả đúng cái đang xảy ra:
"ăn lần hai hư bộ ăn lần một".

Sửa thì `bestSplit` nhận thêm danh sách bộ đã khoá và chia phần còn lại quanh chúng — câu hỏi
không còn là "chia sao cho ít điểm nhất" mà là "chia sao cho ít điểm nhất **mà vẫn giữ những bộ
đã ăn**". Hai câu trả lời khác nhau, và câu thứ hai đắt hơn: ở ca trên, giữ bộ khoá tốn 45 điểm
thay vì 40. Đó là cái giá của luật, không phải một chỗ chưa tối ưu.

`eatOptions` cũng chỉ được dùng lá tự do, `phomDiscard` chừa lá đã khoá, và `phomThrow` từ chối
thẳng. Trên trang thì lá ấy được ghim lại, bỏ con trỏ tay, và bấm vào thì nói ra lý do.

**Từ chối phải nói ra.** Bot lặng lẽ bỏ qua một nước không hợp lệ là cái bàn đứng im mà không ai
hiểu vì sao — trang đang mở có thể là bản cũ, hoặc vừa lỡ nhịp. Chính chuyện này làm một test
ngồi chờ hai lăm giây rồi mới đỏ, và nó đỏ đúng: cái máy đo tôi gắn vào chỗ chờ đã chỉ thẳng ra
"gửi nước đi, không có gì đổi, không có gì bị từ chối".

**Ăn thì phải nhả.** Cái bẫy của trò này: ăn xong vẫn phải đánh đi một lá. Ăn một lá ba điểm rồi
buộc phải nhả một lá mười ba điểm là ăn để lỗ mười. Nên máy so **điểm rác sau khi đã ăn và đã
đánh đi lá tốt nhất**, chứ không so điểm rác lúc vừa ăn xong.

Ngoài ra: máy nhớ người ngồi sau đã ăn những lá nào và tránh nhả lá quanh đó — đây là thứ phân
biệt người biết chơi với người mới, và nó rẻ.

**Trình.** Trước khi đánh ở vòng bốn, người chơi mở tất cả phỏm của mình ra cho cả bàn thấy.
Không phải lúc ăn — ăn thì **chỉ lá vừa ăn** là công khai, hai lá kia vẫn nằm trên tay — mà đúng
ở lượt cuối. Đây là nửa sau của một ván phỏm: ai đi sau thì biết trên bàn đang có những phỏm
nào, biết lá rác của mình gửi được vào đâu, và biết lá nào nhả ra là an toàn. Bản đầu tôi làm
thiếu hẳn đoạn này — phỏm chỉ hiện ra lúc tính điểm, tức là đúng lúc nó không còn dùng để làm gì
nữa.

Trình xong mà không có phỏm nào thì cả bàn thấy chữ **móm**, và đó cũng là một thông tin.

**Gửi thì làm tự động**, không hỏi. Một lá rác gửi được vào phỏm trên bàn thì gửi luôn là đúng,
luôn luôn — không có nước nào để chơi sai ở đây, nên một màn hình bắt bấm bốn lần để đồng ý với
câu trả lời duy nhất là một màn hình bắt người ta làm việc cho nó.

**Tiền** giữ đúng khung tiến lên để một cái ví ba trò không có ba cách hiểu về "thắng bao nhiêu":
xếp hạng theo điểm rác rồi trả theo `payouts`. Trên đó là ba thứ riêng của phỏm — **móm** thua
gấp đôi, **ù** ăn gấp đôi từ mỗi người, **đền** trả thay cả làng. Bằng điểm thì ai hạ sau thua.

**Cái xoay vòng.** Người về nhất ván trước làm cái ván sau: họ được lá thứ mười và đánh trước.
Bản đầu cái nằm chết ở ghế số không — tức là người mở bàn — nên suốt buổi chỉ một người được
thêm lá và đi đầu. Ngồi vào bàn của ai đó không có nghĩa là người ấy mở mọi ván. Cùng luật với
tiến lên, và cùng cách viết: nhớ **cả thứ tự về đích** chứ không chỉ nhớ người đầu, vì người về
nhất chính là người dễ cầm tiền đi về nhất.

**Một chỗ đổi so với kế hoạch, nói thẳng ra:** kế hoạch ghi đền là "ăn chốt rồi người sau ù".
Với cấu trúc lượt ở đây thì ván dừng ngay lúc có người ù, nên tình huống ấy không bao giờ tới
được. Thay bằng **"nhả lá cho người ta ù thì người nhả đền"** — cùng một họ luật, và là cái thật
sự xảy ra ở bàn.

---

## 9. Chia bài, bốc bài, và nặn

**Chia bài** là hiệu ứng, và hiệu ứng thì phải nhớ đã chạy chưa. `drawHand` dựng lại cả tay bài
ở **mỗi** push, mà một bàn bốn người có hàng chục push một ván — nên không nhớ thì mười ba lá
bay vào lại từ đầu mỗi khi ai đó đánh một lá, và cái người ta đang đọc dở nhảy khỏi tay.

Khung đầu của nó là một chỗ **đứng được**, không phải một chỗ ngoài màn hình. `backwards` giữ
khung đầu suốt quãng chờ so le, nên khung đầu chính là thứ nhìn thấy nếu animation không chạy.
Bản đầu tôi đẩy lá đi 190% chiều cao — lúc ấy cả tay bài văng khỏi khung. Cùng họ với cái bẫy
`opacity: 0` ở con xúc xắc, chỉ khác là lệch chỗ thay vì tàng hình. Giờ là ba mươi tư pixel: bay
vẫn ra bay, mà đứng yên vẫn đọc được.

**Nặn lá vừa bốc** dùng lại đúng động tác của cái đĩa bầu cua, và đúng một luật: kéo tới lúc hở
hết thì lá mới lật, thả tay giữa chừng thì lớp úp trượt về che lại. Khác một chỗ — ở đây chỉ có
một lá và nó rộng bốn mươi tư pixel, nặn không được gì — nên lá được **phóng to hẳn** ra giữa
bàn.

Ba điều nó phải làm được, và cả ba đều là chuyện đã sai ở đâu đó rồi:

- **Không chặn bàn.** `pointer-events: none` trên cả lớp phủ, chỉ cái lớp úp mới nhận ngón tay;
  và ba giây thì nó tự lật rồi tự đi.
- **Hết lượt mình là nó đi.** Bàn nhích sang người khác mà lá phóng to vẫn treo giữa màn hình
  thì nó không còn là "lá bạn vừa bốc" — nó là một tấm bìa che mất cái bàn đang chạy.
- **Có nền mờ.** Mặt bàn bên dưới có chữ, và chữ ấy xuyên thẳng qua: "vòng 2/4 · nọc 15" nằm đè
  lên "Kéo ra xem" thì cả hai cùng không đọc được.

**Mặc định là có nặn**, và tắt được **ngay trong ván**. Nặn là cái thú của ván đầu và của người
đang rảnh; ai chơi nhanh thì mỗi lượt thêm một thao tác là một thao tác thừa — nhưng người ta chỉ
nghĩ tới chuyện ấy *lúc đang chơi*, chứ không phải lúc đứng ở sảnh. Nên cái công tắc nằm trên
bàn: một cái chip nhỏ ở mép thanh trạng thái của phỏm, và ở góc cái bát bầu cua. Bắt thoát ra
sảnh để đổi một cái công tắc là bắt bỏ dở một ván.

Chỉ hiện ở hai trò có gì để nặn. Tiến lên không có lá nào để nặn, và một cái công tắc không làm
gì thì đứng đó chỉ để gây phân vân.

Tắt rồi thì **tắt cả cái đĩa bầu cua** — hai chỗ ấy là cùng một động tác — và nhớ trong
`localStorage`, bọc try/catch vì có trình duyệt chặn hẳn: một cái bàn không mở được vì không đọc
nổi một tuỳ chọn là một cái bàn hỏng vì một thứ không quan trọng.

Tắt thì đĩa **không úp xuống** chứ không phải úp rồi mở ngay: úp một phần mười giây rồi bật lên
là một cái nháy, mà một cái nháy khó chịu hơn hẳn không có gì.

**Nhịp máy.** Chín trăm mili giây một nước là quá nhanh: hai giây là chừng thời gian một người
kịp thấy lá vừa rơi, đọc ra nó là gì, rồi nhìn xuống tay mình — nhanh hơn thế thì lúc nào cũng
đi sau bàn một nước, và cái đó đọc ra là **game giục mình**, không phải đối thủ chơi hay. Tiến
lên 2,1 giây một nước.

Phỏm nghỉ **hai lần một lượt**, mỗi lần 1,3 giây, và đẩy trạng thái ở giữa. Làm cả hai việc
trong một nhịp thì nhìn ra là cái bàn tự nhảy: tay người ta dài thêm rồi ngắn lại trong cùng một
khung hình, không ai kịp thấy nó lấy con gì.

**Ba dấu hiệu, và cả ba đều là chuyện "không nhìn thấy thì không chơi được":**

- **Lá vừa được đánh ra thì bay xuống.** Không có hiệu ứng thì lá trên bãi cứ đứng đó và đổi
  mặt — nhìn ra là cái bàn tự sửa mình chứ không phải ai đó vừa đánh một lá.
- **Lá vừa về tay thì có vòng vàng — và chỉ có vòng vàng.** Tay phỏm xếp lại theo phỏm sau mỗi
  lần lấy bài, nên lá mới không nằm ở cuối hàng: bốc xong nhìn xuống là một tay bài đã xáo lại.
  Cần cả khi tắt nặn — lúc ấy nó là dấu hiệu **duy nhất**.

  Không nhấc lá lên. Nhấc lên đã có nghĩa rồi: đó là "đang chọn để đánh". Dùng lại đúng cái
  chuyển động ấy cho "lá vừa về" là làm hai chuyện khác nhau trông giống hệt nhau, ngay lúc người
  ta đang phải chọn lá để đánh đi.
- **Lá người khác ăn của mình nằm cạnh ghế họ, bằng bài thật, tới hết ván.** Nó là lá *mình vừa
  nhả ra*: biết nó ở đâu là biết nên tránh nhả thêm con nào. Viết ra chữ thì phải đọc rồi dịch
  lại thành hình một lá bài; để nguyên lá bài thì không phải làm gì cả. Và nó ở lại tới cuối ván,
  vì đó là thứ người ta nhìn lại nhiều lần chứ không phải một thông báo thoáng qua.
- **Đang nặn thì tay bài là tay *trước khi* bốc, cộng một lá úp.** Nặn mà lá đã nằm sẵn trong
  tay thì không còn gì để nặn. Và không chỉ mặt lá: viền xanh của phỏm với con số điểm rác cũng
  nói ra hết, vì cả hai được tính lại với lá mới — nhìn "rác 58" tụt xuống "rác 34" là biết vừa
  bốc được gì mà chẳng cần lật. Nên trong lúc còn nặn, cả ba thứ ấy đều là của tay cũ.
- **Ghế đối diện xếp thêm gì thì xếp ra hai bên, không xuống dưới.** Ghế trên cùng nằm ngay phía
  trên cái nọc, nên mọi thứ thêm bên dưới nó rơi thẳng vào giữa bàn và bị nọc đè — che mất đúng
  những lá cần nhìn. Hai bên thì trống: khoảng giữa ghế trái và ghế phải không ai dùng.
- **Ăn thì không nặn.** Lá ấy vừa nằm ngửa giữa bàn, cả bàn đã thấy, và chính mình vừa bấm nút để
  lấy đúng nó. Chỉ lá **bốc từ nọc** mới là lá chưa ai biết. Bắt nặn một lá mình đã biết là bắt
  làm một thao tác thừa đúng vào lúc đang vội.
- **Hết ván thì mở hết bài, bằng bài thật.** Trước đây ván xong là nhảy thẳng sang bảng tiền,
  không ai kịp nhìn người khác có phỏm gì và dư con gì — mà đó chính là lúc người ta muốn nhìn
  nhất, vì nó trả lời câu "mình thua ở đâu". Một con số nói mình thua bao nhiêu; nó không nói vì
  sao.

  Bản đầu tôi in ra **chữ**: "8♣ 8♦ 8♥ · A♠ 3♠". Đọc được, nhưng đọc là việc phải làm còn nhìn
  thì không, và cuối ván là lúc người ta muốn *nhìn*. Giờ là lá thật, nhỏ, phỏm gom thành cụm có
  viền xanh — viền quanh **cả cụm** chứ không quanh từng lá, vì cái mắt phải thấy là *một bộ*,
  không phải ba lá tình cờ đứng cạnh nhau.

  Chỗ ngửa bài là **cả mặt bàn**, không phải từng ghế: ghế rộng bảy mươi tám pixel và một tay
  phỏm có mười lá. Hết ván thì mặt bàn thôi là bàn và trở thành chiếu ngửa.

  Lá **gửi** đứng riêng một cụm có nhãn "gửi". Bản trước để chúng lẫn với rác và chỉ mờ đi — mà
  "mờ đi" không nói được điều cần nói: gửi rồi là **hết tính điểm**, khác hẳn "còn trên tay và
  nhỏ", và không ai đoán ra ý ấy từ độ mờ.

**Chỗ suýt hụt.** Hiệu ứng lá rơi gắn ở *lần vẽ đầu tiên* sau mỗi nước — và biến mất. Mỗi nước
đi tới trang này thành **hai** push: một cái chung cho cả bàn, một cái riêng có bài của mình. Lần
vẽ thứ hai, cách vài mili giây, dựng lại lá và không còn lớp hiệu ứng nữa. Sửa bằng cách gắn theo
**thời điểm** thay vì theo lần vẽ: rơi xong thì trong 420ms lần vẽ nào cũng có, và animation chạy
lại sau mười mili giây thì không ai phân biệt được.

---

## 10. Bầu cua tôm cá

**Sòng thế giới không phải một cái bàn ai đó mở.** Nó có sẵn, nó xóc liên tục, và vào là vào
giữa một ván đang chạy — đó mới là cái sòng. Một cái bàn phải có người mở trước là cái bàn đóng
cửa gần hết thời gian, mà bàn thế giới đóng cửa gần hết thời gian là một căn phòng không có ai.

Vòng xóc chạy khi còn người mở nó, **hoặc còn tiền trên bàn**. Vế thứ hai không phải để cho đẹp:
người cuối cùng có thể rời đi khi chip còn nằm đó, và một khoản cược không bao giờ được thanh
toán là một khoản cược bị lấy mất. Xúc xắc không quan tâm ai đang nhìn.

Cùng con bot, cùng cái ví, cùng mô hình phiên. Khác ở chỗ nó **không có lượt**: ai cũng đặt cùng
lúc lên cùng ba con xúc xắc, nên bàn không có "đang chờ ai" và người tới sau ngồi xuống giữa ván
được — họ đơn giản là đặt cho lần xóc sau.

- **Xúc xắc được quyết ở cuối tiếng lắc, không phải đầu.** Cái bot chưa nghĩ ra thì không nằm
  trong bất kỳ push nào ai đó đọc sớm được. Ở caro chuyện này không quan trọng; ở đây cả trò chơi
  là một con số chưa ai được biết.
- **Không trừ tiền lúc đặt.** Cược chỉ đi khi xúc xắc rơi, nên không có khoảnh khắc nào tiền
  "đang ở đâu đó". Thứ chặn nợ là kiểm tra lúc đặt: trên bàn không bao giờ nhiều hơn trong ví.
- **Chip hiện ngay khi chạm, gửi sau.** Round-trip nhanh nhất cũng một phần mười giây, mà bầu
  cua là đặt bốn chip trong ba giây — bàn đợi phản hồi là bàn không nghe thấy mình.
- **Bot được báo *cả bàn*, không phải "thêm một chip" hay "gỡ chip cuối".** Bốn cú chạm và một
  lần hoàn tác là năm POST riêng biệt, mà năm POST riêng biệt tới theo thứ tự mạng thích: "gỡ
  chip cuối" lúc đó là hai chuyện khác nhau ở hai đầu, và bàn lúc vẽ khớp nhau thì lúc xóc lại
  lệch. Đã xảy ra thật ngay lần đầu trộn đặt với hoàn tác. Tổng thì không có thứ tự nào để sai;
  kèm một số đếm tăng dần để cái gửi trước mà tới sau bị bỏ qua thay vì ghi đè cái mới.
- **Gửi gộp sau 200ms** kể từ cú chạm cuối, nên sáu cú chạm là một request. Gửi ngay nếu đồng hồ
  còn dưới 3 giây — bàn đặt xong mà chưa kịp gửi là bàn chưa từng đặt.
- **Bàn là của mọi người.** Ai đặt gì vào cửa nào đều hiện — nửa cái thú của trò này là nhìn
  người khác bỏ tiền vào đâu.
- **Cái đĩa che cả kết quả, không riêng ba con xúc xắc.** Xóc xong là úp đĩa, kéo ra mới biết ra
  con gì — đúng cái động tác nặn ở bàn thật. Nhưng che mỗi xúc xắc thì vô nghĩa: còn cái ví đứng
  ngay trên đầu, còn cửa thắng sáng lên, còn dòng "+40.000 vàng". Bất kỳ chỗ nào trong số đó cũng
  nói trước kết quả, và người ta sẽ liếc cái ví chứ không thèm kéo đĩa. Nên trong lúc đĩa còn úp:
  ví hiện **số trước khi thanh toán** (`heldGold`, chốt lại đúng lúc bắt đầu lắc), mặt bàn không
  cửa nào sáng, hàng người chơi hiện tiền đặt chứ không hiện được mất. Kéo đĩa ra rồi mới trả lại
  tất cả cùng một lúc. Có kịch bản kiểm đúng chuyện này: đặt 20.000, dưới đĩa ví vẫn 30.000 và
  không cửa nào sáng; nặn xong mới thành 10.000.
- **Mặt bàn vẫn hiện tiền mình đặt trong lúc đĩa úp.** Đang hồi hộp chờ mở bát mà không nhớ nổi
  mình đã bỏ vào cửa nào là lúc cái bàn cần nói nhất. Khi ván chuyển sang lắc, chip tạm trên máy
  được thay bằng bàn cược chính thức từ bot chứ không bị xoá đi.
- **Phải kéo tới lúc hở hết ba con thì đĩa mới đi.** Bản đầu chỉ cần nhích 34px là đĩa bay mất,
  tức là cắt cụt đúng cái động tác mà cả tính năng này sinh ra để có. Giờ đĩa bám theo ngón tay
  1:1 và chỉ rời đi khi hình chữ nhật của nó **không còn giao với hình chữ nhật của xúc xắc** —
  đo bằng `getBoundingClientRect`, không phải bằng một con số ngưỡng đoán mò. Thả tay giữa chừng
  thì đĩa trượt về úp lại, chưa lộ gì. Chạm mà không kéo vẫn mở luôn: đó là một động tác trọn
  vẹn, khác với một cú kéo dở dang.
- **Đĩa tự mở sau 3,4 giây, và không bao giờ trong lúc có ngón tay đang giữ.** Một ván chung của
  cả thế giới không thể đứng chờ tay một người; nhưng giật cái đĩa khỏi bàn tay đang kéo nó thì
  còn tệ hơn là không cho kéo.
- **Soi cầu ba mươi phiên gần nhất.** Sáu hàng, mỗi hàng một con; mỗi cột một ván, **mới nhất bên
  trái** nên mở tab ra là thấy ngay ván vừa rồi, không phải cuộn. Mặt và tổng số lần ra dính liền
  ở mép trái và không trôi theo khi cuộn ngang — cuộn về quá khứ mà mất hàng nào là hàng nào thì
  bảng đó vô dụng. Ra hai và ra ba đổi màu và có số trên ô, vì "về đôi" mới là thứ người soi cầu
  đi tìm; có chú thích màu ngay dưới bảng. Bot giữ vòng ba mươi ván (`HISTORY`), mới nhất đứng đầu.
- **Cầu nằm trên đĩa cứng, cạnh sổ vàng.** Sòng thế giới là vĩnh viễn, một lần deploy thì không:
  bảng cầu bắt đầu lại từ trống rỗng sau mỗi lần cập nhật là bảng nhớ ngắn hơn người đang đọc nó,
  tức là vô dụng. Nên nó đi cùng vàng xuống `scores.json` chứ không nằm cùng các bàn trong bộ nhớ.
  Chỉ sòng thế giới thôi — bát riêng của một người là của riêng người đó trong lúc họ mở, đem ván
  của họ nhét vào cầu chung là đem buổi chiều của một người vào lịch sử của tất cả.
- **Sáu linh vật vẽ bằng SVG**, không dùng emoji. Emoji do hãng làm điện thoại vẽ, nên cùng một
  bàn là sáu phong cách khác nhau trên sáu máy khác nhau và không cái nào là phong cách của bàn
  này. Với lại **không có emoji quả bầu**, mà bầu là chữ đầu tiên của tên trò.
- **Xúc xắc không nhìn thấy tiền.** `roll()` **không nhận tham số nào** — không có đường nào để
  truyền vào cho nó biết ai đang ngồi, đặt cửa nào, đặt bao nhiêu — và nó được gọi *sau* khi cửa
  đã khoá. Có test ghim cả hai: `roll.length === 0`, và thân hàm không được nhắc tới `bets`,
  `staked`, `gold`, `seat` hay `game`. Cách dễ nhất để một cái sòng gian là thêm một tham số vào
  đúng chỗ đó rồi không ai để ý.
- **`randomInt(6)`, không phải `floor(random() * 6)`.** Sáu không chia hết cho luỹ thừa của hai,
  nên nhân một số thực rồi làm tròn khiến hai mặt nhỉnh hơn bốn mặt kia — khoảng bảy phần triệu
  tỉ, không ai đo được, và không có lý do gì phải mang theo.
- **Nhà cái ăn 17/216 = 7,87%** — đúng con số cổ điển của mọi bàn bầu cua vỉa hè, tính chính xác
  chứ không phải đo. Đây là thứ giữ cho vàng phát mỗi ngày không biến thành một đống chỉ có tăng.
  **Không phải 50-50 và chưa bao giờ là:** đặt một cửa thì 57,87% số lần không ra con nào.

---

## 11. Tài xỉu

Cùng cái bát của bầu cua, và không cùng một luật nào cả. Ở kia mỗi con xúc xắc đứng riêng: đặt
vào một *mặt*, mặt ấy ra mấy con thì ăn mấy lần. Ở đây ba con chỉ có nghĩa lúc **cộng lại**, nên
cửa không phải là một cái hình mà là một *câu nói về con số* — lớn hay nhỏ, chẵn hay lẻ, hay cả
ba giống hệt nhau.

**Một cái bàn duy nhất, của cả thế giới, và không có bản chơi với máy.** Đây là quyết định, không
phải một thứ chưa kịp viết. Bầu cua có bát riêng vì bầu cua một mình vẫn là một trò: sáu ô, ba
con, và một mặt chiếu để đọc. Tài xỉu một mình là **một con số hiện lên mỗi nửa phút** — không có
chiếu để đọc, không có gì để nhìn, và cái cầu thì chỉ có nghĩa khi nó đứng cạnh tiền của người
khác. Nửa đáng chơi của trò này là hai chục người cùng đặt lên đúng cái bát ấy. Nên là cái bàn
chung, hoặc là không có.

### Cửa

| Cửa | Là gì | Trả |
| --- | --- | --- |
| Tài | Tổng 11–17 | 1 ăn 1 |
| Xỉu | Tổng 4–10 | 1 ăn 1 |
| Chẵn | Tổng là số chẵn | 1 ăn 1 |
| Lẻ | Tổng là số lẻ | 1 ăn 1 |
| Bão | Ba con giống hệt nhau | 1 ăn 30 |

**Bão chặn cả bốn cửa kia.** Đây là toàn bộ luật đáng viết ra: ba con giống nhau thì tài, xỉu,
chẵn và lẻ đều thua, dù cái tổng có rơi vào khoảng nào. 3-3-3 là 9 — nằm gọn trong khoảng xỉu — và
vẫn thua. 4-4-4 là 12 — nằm gọn trong khoảng tài — và vẫn thua. Vì thế hai khoảng viết là 4–10 và
11–17 chứ không phải 3–10 và 11–18: tổng 3 chỉ ra được bằng 1-1-1, tổng 18 chỉ ra được bằng
6-6-6, và cả hai đều là bão.

Đó cũng là chỗ nhà cái sống, và là số duy nhất trong trò này không phải do ai gõ vào: bỏ bão đi
thì tài xỉu là một đồng xu công bằng, mà một đồng xu công bằng thì không nuôi nổi mười nghìn vàng
phát mỗi ngày. Có bão thì nhà cái ăn **6/216 = 2,78%** ở bốn cửa đều tiền và **30/216 = 13,89%**
ở cửa bão. Tính chính xác trên đủ 216 ván chứ không phải đo, và có test ghim từng con số.

Nhẹ tay hơn bầu cua (2,78% so với 7,87%), và đó là chuyện có thật về hai trò chứ không phải một
lựa chọn: bầu cua trả theo số con ra, tài xỉu trả một ăn một.

**Mỗi ván ăn đúng hai cửa, hoặc đúng một cửa bão.** Một câu nói lớn nhỏ và một câu nói chẵn lẻ
trên cùng một cái tổng — nên đặt cả năm cửa thì bao giờ cũng thắng hai thua ba, và đó là hình
dạng của cả cái chiếu. Có test đi hết 216 ván để giữ điều này.

### Nặn, hai chặng

Bầu cua có một cái đĩa: kéo ra là xong. Tài xỉu có **cái nắp bát, rồi tới ba con** — và hai chặng
ấy không phải để cho dài. Trò này là cái tổng, mà hai con ngửa thì **vẫn chưa có tổng nào cả**:
đó chính là chỗ hồi hộp nằm, và một cái nắp mở ra ba con cùng lúc là một cái nắp lấy mất nó.

- Nắp bát kéo ra, hoặc chạm. Cùng một hàm với cái đĩa bầu cua và với lớp úp lá phỏm — `dragOff`,
  một chỗ, mấy cái nắp. Viết ba lần là ba lần nó lệch đi một chút, mà lệch ở đây thì không ai báo
  lỗi: người ta chỉ thấy "cái này nặn không đã bằng cái kia".
- **Đúng một cái nắp trong cả ván**, và ba con thì luôn nằm sẵn dưới nó, đúng mặt của nó. Thứ duy
  nhất giấu chúng là cái bát nằm đè lên.
- **Kéo tới đâu ba con ló ra tới đó.** `dragOff` gọi `txPeek` mỗi lần ngón tay nhích; cái bát là
  hình tròn nên phép kiểm là tròn-với-ô — điểm gần tâm nhất trên hình chữ nhật con xúc xắc, xa
  hơn bán kính thì con ấy đã ra. Kéo chậm thì cái tổng lớn dần: `?`, rồi `6 + ?`, rồi `10 + ?`.
  Kéo nhanh, chạm một cái, hay không đụng vào thì cả ba ra cùng lúc. **Không ai phải đợi một cái
  đồng hồ nào.** Đó là chỗ duy nhất nặn thật sự có nghĩa: nó là một thứ mình *được làm*, không
  phải một thứ mình *phải qua*.
- **Còn đúng một con chưa ló thì bát bày ra cả sáu khả năng của nó**: sáu con xúc xắc nhỏ, nhuộm
  theo cửa mỗi khả năng sẽ ra, viền sáng những khả năng trả tiền cho mình. Đây là cả cái thú của
  nặn tài xỉu — hai con ra rồi thì trò chơi thôi là may rủi và thành một danh sách sáu dòng, và
  mình biết mình cần dòng nào.
- **"Xong" là cái bát đã đi hẳn, không phải "ba con đã ló".** Kéo chậm thì có một quãng cả ba con
  đã thò ra mà cái bát vẫn còn nằm đó: lúc ấy cái tổng đọc được rồi, còn cửa thắng thì chưa được
  sáng, ví chưa được đổi. Mặt chiếu nói ra kết quả trước cái bát là cùng một chuyện lộ bài, chỉ
  đi đường khác.
- Chừng nào cái bát chưa đi thì **không có gì trên màn hình nhúc nhích**: cái ví hiện số trước khi
  thanh toán, mặt chiếu không cửa nào sáng, hàng người chơi hiện tiền đặt chứ không hiện được mất.
- Bát tự đi sau **2,8 giây** nếu không ai đụng vào, và không bao giờ trong lúc có ngón tay đang
  giữ. Một tám là chưa kịp với tay: mắt còn đang ở mặt chiếu xem cửa nào của mình, ngẩng lên thì
  cái bát đã đi rồi — và một cái nặn tự mở trước khi người ta kịp chạm thì không phải một cái
  nặn, nó là một hiệu ứng. Trần của nó là `TX_SHOW_MS`, vì mở xong còn phải đủ chỗ để đọc.
- **Ba con nằm giữa bát, và cái đĩa căn theo ba con — không phải theo cái bát.** Cái đĩa từng
  căn giữa cái bát, mà ba con thì bị hàng chữ dưới đẩy lên ba chục pixel: cái đĩa **vừa đúng cỡ
  để phủ nhưng đặt lệch ba chục pixel**, tức là hở nguyên mép trên. Đo đúng kích thước mà đặt sai
  chỗ thì vẫn là hở. Giờ `fitLid` đặt nó bằng `left`/`top` đo từ tâm ba con; `transform` để nguyên
  cho cú kéo.
- **Chừa hai đầu bằng nhau.** Chỉ chừa ở dưới thì ba con nằm cao hơn tâm bát nửa khoảng chừa —
  người thử nói hai lần "sao nằm sát phía trên thế". Chừa `TX_PAD` ở cả trên lẫn dưới thì tâm ba
  con rơi đúng tâm cái bát; nửa trên chẳng đựng gì, và đó là cái giá của việc nằm giữa.
- **Hàng chữ trong bát rút xuống một hàng, và hàng người chơi ra hẳn ngoài bát.** Cái tổng và
  dòng nói được mất là hai nửa của cùng một câu — "11 Tài · +2.000 vàng". Còn ai đặt bao nhiêu là
  chuyện về *cái bàn*, không phải về *cú xóc*: để nó trong bát là lấy mất chỗ của đúng ba thứ cái
  bát sinh ra để đựng.
- **`fitLid` không tin phép tính kia nữa.** `txDieSize` cắt con xúc xắc theo chiều cao bát, `fitLid`
  cắt cái đĩa theo ba con — hai phép tính độc lập, và chỉ cần lệch vài pixel là cái đĩa hụt. Hụt
  thì hở góc, mà hở góc thì kết quả ló ra trước khi có ai kéo. Nên `fitLid` **đo**: nếu cái đĩa
  lớn nhất cái bát chứa nổi vẫn không phủ hết ba con thì nó tự thu ba con lại rồi đo lại. Một
  vòng là đủ, vì thu theo đúng tỷ lệ còn thiếu.
- **Chữ trên chiếu bớt tới mức ít nhất mà vẫn đủ.** Bốn cửa đều ăn một-ăn-một nên không cửa nào
  phải nói ra; cái đáng nói là cửa nào *khác đi*, và chỉ có bão. Bảng trả tiền đầy đủ nằm ở tab
  Luật. Mỗi dòng chữ thừa trên chiếu là một dòng lấy mất chỗ của cái bát.

**Hai bản trước đều sai, và sai nặng dần** — cả hai đều do người chơi tìm ra, và cả hai lần câu
hỏi đều là "cái này để làm gì".

Bản đầu úp thêm lên mỗi con một cái nắp con có chữ `?`: kéo cái bát ra để gặp ba cái nắp nữa, tức
là mở một thứ để lộ ra ba thứ phải mở. Bản sau bỏ nắp con đi nhưng cho con chưa lật **quay tiếp**
— mà mở bát ra thì xúc xắc đã nằm rồi, không có cách nào nó còn quay, nên nó đọc ra là cái bàn bị
treo. Cả hai đều là cùng một sai lầm: dựng thêm một trạng thái giả để có chỗ nhét cái hồi hộp
vào, thay vì để cái hồi hộp nằm ở chỗ nó vốn có — cái bát đang trượt đi.

Luật rút ra, có test canh: **ba con chỉ quay trong lúc còn lắc**, và không có cái đồng hồ nào bắt
người ta đợi để xem kết quả của chính mình.

Tắt nặn thì ba con ngửa cùng lúc và không có cái nắp nào — chứ không phải úp xuống rồi mở ngay.
Cùng một công tắc với phỏm và bầu cua, vì đó là cùng một việc.

### Cái nắp là một cái đĩa, và một cái đĩa thì tròn

Bản đầu là một hình chữ nhật bo góc phủ kín cả cái bát: đúng chức năng, sai hẳn về hình. Chú
thích cũ ngay trên nó đã tự viết ra "để nó đọc ra là một cái đĩa úp chứ không phải một hình chữ
nhật có màu" và giải bằng cách thêm một cái viền — cái viền không cứu được một hình chữ nhật.
Giờ nó tròn thật, có vệt sáng lệch để phồng lên như cái bát úp, và hai vòng đồng tâm làm mép đĩa.
Đổi ở cả hai cái bát, vì đó là cùng một cái đĩa.

Và kéo theo cách xếp ba con: **hai trên, một dưới**, không phải một hàng ngang. Cũng là hình học
chứ không phải trang trí — một hình tròn phủ một hàng ngang thì phải lớn bằng **đường chéo** của
hàng ấy, tức là tốn đúng cái chiều mà hình tròn không có. Xếp tam giác thì khối ba con là một hình
vuông cạnh `2d + g`, và đường chéo hình vuông ngắn hơn hẳn: ở con 54px, hàng ngang cần đĩa 186,
tam giác cần 164. Hai mươi hai pixel ấy là chỗ để xúc xắc to lên trong cùng một cái bát. Với lại
ba con vừa đổ ra khỏi bát thì nằm túm lại, không nằm thành một hàng.

Mấy chuyện kéo theo, và tất cả đều là hình học chứ không phải thẩm mỹ:

- **Cỡ con xúc xắc là hệ quả của chiều cao cái bát**, không phải một con số trong stylesheet. Ba
  con phải lọt trong đĩa, đĩa phải lọt trong bát — nên `txDieSize` giải ngược phương trình ấy ra
  `d` rồi đặt vào biến `--die`. Gõ một con số vào CSS thì trên một cái khung thấp hơn dự tính,
  cái đĩa bị cắt trần cho vừa bát và **hở mất bốn góc**: kết quả lộ ra trước khi có ai kéo. Cái
  bát vì thế có `min-height` **thấp** — ép nó cao lên thì phần thừa không co lại được và đè xuống
  hàng chip; để nó thấp thì bát ngắn là xúc xắc nhỏ đi, chứ không có gì vỡ.
- **Đường kính đĩa cũng được đo, không phải gõ vào.** Một hình tròn phủ kín được một khối rộng `w`
  cao `h` thì đường kính tối thiểu là `√(w² + h²)`. `fitLid` đo khối ba con **thật** rồi cắt cái
  nắp cho vừa, và cắt trần lại theo chiều cao cái bát. Hai đầu cùng đo một thứ, nên đổi cách xếp
  ba con là cả hai tự theo.
- **Hàng cửa gọn lại còn hai dòng**: tên và luật đứng chung một dòng, tiền đặt xuống dòng dưới. Ba
  dòng một cửa thì hàng cửa cao hơn cả cái bát — mà cái bát là chỗ trò này thật sự diễn ra.
- **Căn giữa bằng `inset: 0` + `margin: auto`, không bằng `transform`.** `transform` là của cú
  kéo — `dragOff` ghi thẳng vào `style.transform` mỗi lần ngón tay nhích — nên một cái đĩa căn
  giữa bằng transform sẽ nhảy về góc trên bên trái ngay ở pixel đầu tiên của cú kéo.
- Và cái khung xin cao thêm ba mươi pixel (`setSize` 540 → 570), vì hình tròn thì chiều cao đi
  theo chiều rộng. `tools/play.mjs` ghim cùng con số ấy: một cái khung thử ở kích thước khác với
  kích thước máy thật cho là một cái khung thử sai chỗ chật.

### Tiếng xóc, dựng ra chứ không tải về

Widget **không ra được mạng**, nên một file .mp3 từ CDN thì đơn giản là không bao giờ tới nơi, và
nhét cả một file âm thanh vào bundle dưới dạng data URI là vài trăm kilobyte cho một tiếng lạch
cạch. Nên nó được tổng hợp bằng Web Audio: một mẩu nhiễu trắng ngắn qua bộ lọc dải hẹp là đúng
cái tiếng một viên xúc xắc chạm vào thành bát, và rải hai chục mẩu như thế theo nhịp ngẫu nhiên —
dày ở giữa, thưa ở cuối — là tiếng xóc. Lật một con thì trầm hơn và chắc hơn: nó đã dừng lại.

- **Phát từ lúc trạng thái đổi, không phải từ trong một hàm vẽ.** Hàm vẽ chạy lại mỗi lần đẩy, mà
  một ván xóc có mấy lần đẩy — tiếng phát ra ở đó là tiếng xóc chồng lên tiếng xóc. Ở bầu cua
  tiếng ba con rơi vẫn nằm trong hàm vẽ vì nó phải khớp với hiệu ứng, nên nó được ghim bằng khoá
  `bàn:ván`.
- **Trình duyệt không cho phát tiếng trước khi có người chạm vào trang**, nên `AudioContext` được
  đánh thức ở mọi `pointerdown`. Rẻ, và là cách duy nhất chắc chắn.
- **Không có Web Audio, hoặc dựng `AudioContext` là ném — thì im lặng.** Một cái bàn không mở
  được vì không phát nổi tiếng lạch cạch là một cái bàn hỏng vì một thứ không quan trọng.
- **Có công tắc tắt, ngay trong bát, cạnh công tắc nặn**, nhớ trên máy người ta. Đây là một cái
  widget nổi trong một phòng chat: thứ tự nhiên kêu lên mà không tắt được ngay tại chỗ là thứ
  người ta đóng cả cái bàn lại để tắt.
- Chữ trên công tắc ấy là **"Tiếng"**, không phải "Âm". Bản đầu ghi "Âm", và ở một cái sòng có
  tiền được mất thì một ô tick cạnh chữ ấy đọc ra là *số âm* trước khi đọc ra là *âm thanh* —
  người thử nó hỏi ngay "cái ô âm là cái gì". Một cái nhãn phải đoán nghĩa thì đã hỏng rồi, dù
  cái nút phía sau nó chạy đúng. Hai cái `title` cũng viết lại thành câu đủ nghĩa, vì "Đang nặn"
  chỉ nói được cho người đã biết nặn là gì.

### Ván trước để nguyên trong bát

Cửa đặt mở hai mươi lăm giây, mà cái bát thì trống — nên ba con của ván trước nằm lại đó, mờ đi và
nhỏ lại. Cái bàn thật cũng để nguyên cho tới lúc xóc lại, và một cái bát trống trơn suốt hai mươi
lăm giây đọc ra là màn hình chưa tải xong.

Có **chú thích bằng chữ**: "ván trước · 11 · Tài". Ba con mờ đứng đó không kèm dòng này thì hoặc
người ta không nhìn thấy chúng, hoặc nhìn thấy rồi tưởng là ván đang chạy — mà cái thứ hai còn tệ
hơn cái thứ nhất. Mờ 0,5 chứ không phải 0,34: trên nền lục sẫm thì 0,34 là một vệt xám đọc ra là
"không có gì".

### Soi cầu là một con đường, không phải một cái lưới

Bảng bầu cua có sáu hàng, mỗi hàng một mặt, mỗi cột một ván: sáu mặt độc lập thì cái đáng nhìn là
"mặt nào ra mấy lần". Tài xỉu chỉ có hai bên, nên cái đáng nhìn là **mạch** — bệt mấy ván rồi,
nhảy mấy lần rồi. Đó là con đường: cùng bên thì rơi xuống dưới trong một cột, đổi bên thì gãy
sang cột mới, cao nhất sáu ô. Đúng cái bảng mọi sòng tài xỉu đều treo, và số tổng nằm ngay trong
từng hạt.

Mới nhất bên **phải**, ngược với bầu cua, vì một con đường thì đi từ trái sang phải và cột mới
mọc ở cuối. Nói ra một lần ở chân bảng, và cuộn sẵn tới đó — một bảng phải cuộn tay mới thấy ván
vừa rồi là một bảng mở ra để không dùng.

Ba mươi sáu ván chứ không phải ba mươi: một mạch chỉ đọc được khi còn đủ mạch phía sau nó. Nằm
trên đĩa cứng cạnh sổ vàng, ở **hàng riêng của nó** (`cauTx`) — hai cái bát là hai trò khác nhau ở
hai độ dài khác nhau, đổ cái này vào cái kia là vẽ cầu bằng xúc xắc của người khác.

### Một bộ máy, hai cái bát

Bầu cua và tài xỉu là cùng một cái bàn với hai mặt chiếu: không có lượt, ai cũng đặt cùng lúc lên
cùng ba con, một cái đồng hồ đóng cửa, và cú xóc trả mọi khoản cùng một lúc. Khác nhau đúng năm
thứ — tên cửa, một bàn cược đáng bao nhiêu, trên đó có bao nhiêu, xúc xắc làm ra thế nào, và mỗi
chặng dài bao lâu. Nên đó là những gì bảng `BOWLS` giữ, và mọi chỗ bên dưới hỏi cái bảng ấy thay
vì hỏi "đây là trò nào".

Không có bảng ấy thì thêm một trò xúc xắc là thêm một bản sao của con bot: mười hai chỗ trong
file đều đang gọi tên bầu cua ra, và bỏ sót đúng một chỗ thì cái bàn tài xỉu đếm tiền cược bằng
danh sách cửa của bầu cua — tức là đọc mọi khoản đặt thành số không, im lặng.

Mặt chiếu thì **không** dùng chung, và đó là chỗ duy nhất hai trò tách hẳn ra. Bầu cua có sáu ô
vuông bằng nhau, mắt đi tìm hình. Tài xỉu có hai cửa lớn với một hàng nhỏ dưới, vì trò này là một
câu hỏi lớn — lớn hay nhỏ — và mấy cách đọc khác của cùng ba con ấy. Hai cửa lớn bằng nhau và to
gấp đôi phần còn lại: đó là hình vẽ của chính cái luật.

### Luật ở ngay trong bàn

Vào thẳng, không có màn hỏi gì ở giữa: bầu cua hỏi một câu vì nó có hai câu trả lời, tài xỉu có
đúng một cái bàn nên không có gì để hỏi, và một màn hình với đúng một cái nút là một màn hình.

Đổi lại, luật đi tới chỗ có tiền: mỗi cửa trên chiếu tự nói khoảng của nó và trả bao nhiêu, dưới
chiếu có một dòng nói bão chặn những cửa nào, và cạnh tab cầu có tab **Luật** với đủ bảng trả tiền
và hai câu về bão. Một màn luật người ta bấm qua trên đường vào là một màn luật chưa ai đọc vào
lúc nó cần được đọc.

---

## 12. Cờ vua và cờ tướng

Hai trò này **ngược với hai cái bát**. Bầu cua và tài xỉu tách ra làm hai màn vì chúng đặt cược
vào hai thứ khác nhau — một cái vào con vật, một cái vào con số — nên chẳng có gì để chung ngoài
cái khung. Hai bàn cờ thì ngược hẳn: khác nhau ở **mọi quân và mọi luật**, mà giống nhau ở **toàn
bộ cách ngồi**. Hai người, đi luân phiên, một lưới ô, chạm quân rồi chạm ô.

Nên chỗ chung nằm ở đúng những gì giống nhau, và chỗ riêng nằm gọn trong một bộ luật:

| Chung | Riêng |
| --- | --- |
| `search.mjs` — cái máy nghĩ, không biết gì về quân cờ | `moves`, `apply`, `status`, `evaluate` |
| `BOARDS` trong bot — bày quân, kiểm nước, đồng hồ, chia tiền | `dead`: hết nước đi thì thua hay hoà |
| `board.js` — một màn, một lưới, một cách chạm | Ba con số: mấy cột, tỉ lệ khung, và vẽ quân thế nào |

### Luật kiểm bằng perft, không kiểm bằng test viết tay

Đây là quyết định đáng nói nhất của cả hai trò.

Perft là: từ một thế cờ, đếm hết số lá ở độ sâu *n*. Con số ấy **đã biết** — cả thế giới đếm ra
cùng một số cho cùng một thế — nên nó bắt được mọi luật thiếu, kể cả những luật thiếu mà người
viết không nghĩ tới. Một cái test viết tay chỉ hỏi được những gì người viết nhớ ra để hỏi: quên
luật "nhập thành không được đi qua ô đang bị chiếu" thì cũng quên luôn cái test về nó.

Cờ vua chạy bốn thế chuẩn, chọn đúng để chạm vào các góc khuất: nhập thành hai bên, bắt tốt qua
đường mở ra một đường chiếu ngang, phong quân bằng nước ăn, và một thế rối để không quân nào
không được hỏi tới. Cờ tướng chạy thế khai cuộc tới độ sâu ba — **44 / 1920 / 79666** — và ba con
số ấy đã gói sẵn cản chân mã, mắt tượng, pháo chưa có ngòi thì không ăn được, và tướng không ra
khỏi cung.

Nó bắt được thật. Trong lúc viết, mấy thế tôi dựng tay để thử luật đều ra "không có nước nào đi
được", và tôi tưởng code sai. Code đúng: tôi đặt hai tướng cùng một cột nên chúng **đối mặt**, mà
đối mặt thì mọi nước đều không hợp lệ. Cái test viết tay nói dối; perft thì không.

### Chỗ hai trò khác nhau, và ai cũng quên đúng chỗ ấy

**Hết nước đi: cờ vua thì hoà, cờ tướng thì thua.** Không phải một chi tiết phụ — nó đổi cả cách
đánh tàn cuộc, và nó đổi cả cái máy nghĩ. Nên nó nằm trong bộ luật (`dead`) chứ không nằm trong
`search.mjs`: cái máy không được biết mình đang chơi trò nào.

Còn **luật cấm chiếu mãi** của cờ tướng thì ở đây rút gọn thành "lặp ba lần là hoà". Luật thật
phân biệt ai gây ra thế lặp — chiếu mãi thì bên chiếu thua, đuổi mãi thì bên đuổi thua — và nó là
một tập luật dài mà các giải còn ghi khác nhau. Rút gọn thì mất phần phạt bên chiếu mãi: ván ấy
thành hoà thay vì thành thua cho họ. Ghi ra vì đó là một chỗ **cố ý** khác luật thi đấu, không
phải một chỗ chưa làm.

### Cái máy: trần là số nút, không phải đồng hồ

Con bot chạy **một luồng** và phục vụ mọi bàn cùng lúc. Một lượt nghĩ nửa giây là bàn tiến lên
bên cạnh không nhận được lá bài và cái bát tài xỉu trễ mất nhịp xóc. Nên cái máy đếm nút và dừng
ở một con số định trước — và như thế thì cùng một thế cờ bao giờ cũng ra cùng một nước, dù chạy
trên máy nào, tức là **kiểm được**.

Trần của hai trò khác nhau gấp ba, và không phải vì cờ tướng dễ hơn: sinh nước đi ở đó đắt hơn
nhiều, vì mỗi nước phải thử rồi hỏi *hai* câu — tướng có bị chiếu không, và hai tướng có nhìn
nhau không — trên một bàn chín mươi ô. Có một cái test đo lại trung vị một lượt nghĩ sau mỗi lần
sửa, vì đó là con số duy nhất nói được "cái máy này còn ở được trong con bot này không".

Một chỗ đáng nói: `moves()` của cờ tướng **đi rồi lùi ngay trên bàn đang có**, không chép ra bàn
mới. Viết kiểu ấy ở chỗ khác là một cái bẫy; ở đây nó là chỗ duy nhất đáng đổi sự thẳng thớm lấy
tốc độ — bốn mươi lần cấp phát một mảng cho mỗi nút là chỗ tốn nhất của cả trò — và nó an toàn vì
hai dòng lùi nằm ngay dưới hai dòng đi, không `await` và không nhánh nào ở giữa. Perft canh.

### Trang không biết luật cờ, và đó là cả thiết kế

Bot gửi sang **danh sách nước đi hợp lệ** của người đang tới lượt. Không phải để giấu — ở một bàn
cờ chẳng có gì bí mật, hai người nhìn cùng một bàn — mà vì luật cờ đã viết một lần rồi, có perft
canh, và một bản thứ hai trong trang là một bản sẽ lệch: nó sẽ quên cản chân mã, hoặc quên rằng
nhập thành không đi qua ô bị chiếu. Trang chỉ vẽ chấm ở đúng những ô bot nói là đi được.

Bot cũng nói luôn **ô nào đang bị chiếu** và **nước vừa đi là từ đâu tới đâu**, vì tìm ra hai thứ
ấy là đã viết lại nửa bộ luật.

### Mấy chỗ của giao diện

- **Ai cũng ngồi ở phía mình.** Bàn cờ lật cho người cầm quân đen. Không phải chiều chuộng: ở cờ,
  "quân của tôi tiến lên trên" là cách cả bàn cờ được đọc — hướng tốt đi, hướng đường chéo mở ra,
  phía nào là hậu phương. Bắt người cầm quân đen đọc ngược là bắt họ dịch từng nước trong đầu.
- **Bên nào cầm quân trắng là rút thăm**, và ván sau đổi bên. Đi trước là một lợi thế đo được;
  để nó cho người mở bàn thì mọi bàn đều nghiêng về một phía, và cái nghiêng ấy đi thẳng vào sổ
  vàng.
- **Chạm rồi chạm, không kéo thả.** Trên một khung rộng ba trăm chín mươi pixel thì kéo một quân
  bằng ngón tay là ngón tay che mất chỗ định thả.
- **Chấm ở ô đi được, vòng ở ô ăn được.** Hai dấu khác nhau vì đó là hai nước khác nhau, và "ô
  này có quân địch" là nửa quyết định.
- **Phong quân thì hỏi**, không tự phong hậu. Phong xe hay phong mã là nước cứu ván trong đúng
  những thế mà phong hậu thành hoà hoặc thành thua — hiếm, nhưng đó là cả cái thú của nó.
- **Hàng quân đã ăn thay cho bảng điểm.** Cái khung này không có chỗ đặt một bảng điểm, mà ở cờ
  thì "ai đang hơn" đọc bằng mắt từ đúng hàng ấy nhanh hơn đọc từ một con số.
- **Quân cờ vua vẽ bằng SVG.** ♔♕♖♗♘♙ *có* trong Unicode, nhưng mỗi hệ máy vẽ một kiểu, và trên
  nhiều máy Android thì ♟ rơi vào bảng emoji và ra một quân tốt màu tím. Quân cờ tướng thì là chữ
  Hán trên đồng tròn — đó là bàn cờ tướng thật, và người chơi nhận ra quân bằng đúng những chữ
  ấy.
- **Rời bàn giữa ván là xin thua**, và cái nút ghi đúng như thế. Gọi nó là "thoát" rồi lặng lẽ
  trừ tiền là nói dối ngay trên mặt nút.
- **Hết giờ thì máy đi hộ một nước**, không xử thua. Cùng lối với phỏm và vì cùng lý do: một cái
  bàn đứng im không phân biệt được với một người đang nghĩ, mà bên kia thì đang đợi.

---

## 13. Hai luật của cái trang, mua bằng lỗi

Cả hai đều rút ra từ lỗi thật, cả hai đều có test canh, và cả hai đều không riêng gì chỗ chúng
được tìm ra.

### Thứ chỉ hiện đôi lúc thì không được nằm trong dòng chảy

`#says` — một dòng để nói ra lời từ chối — từng là **một hàng thật** trong cột: `min-height: 0`
lúc rỗng, 26px lúc có chữ, có cả transition cho mượt. Nghe thì gọn.

Nhưng cột của một trò xúc xắc chỉ có **một** hàng co được, là cái bát. Hai mươi sáu pixel ấy đẩy
cả cột qua ngưỡng, và hàng chip tiền — cái sát đáy nhất — rơi đè lên nút "Hoàn tác".

Tệ hơn cả việc vỡ là **nó tự lành**: lời nhắn hết hạn, hàng xẹp lại, bàn về như cũ. Một cái lỗi
lúc bị lúc không, mà lúc không thì không ai đi tìm. Người chơi báo về đúng bằng câu ấy — "lúc bị
lúc không".

Và kể cả khi không vỡ thì nó vẫn sai: xô cả trang đi vài chục pixel để nói một câu rồi kéo về là
**hai lần chuyển động ở đúng lúc ngón tay đang nhắm vào một cái nút**.

Nên: nổi lên trên, ngay trên hàng nút, `pointer-events: none`, và **tự đi sau ba giây sáu**. Một
lời từ chối còn nằm đó sau khi người ta đã sửa xong là một lời nói về một chuyện không còn nữa.

Cùng luật ấy áp cho mọi thứ chỉ hiện đôi lúc, và có test đi kiểm từng cái: `#promo` (chọn quân
phong), `#board-over` (bảng kết quả ván cờ), `#tx-below`, `#tx-bat`, `#plate`, `#peek`. Tất cả
đều `position: absolute`.

### Không hai file nào của trang được khai trùng một cái tên

Mấy file kịch bản của widget đều là **script thường**, không phải module. Nên `let` hay `function`
ở tầng ngoài cùng của file nào cũng nằm chung đúng một phạm vi — và hai cái trùng tên không phải
là một cái ghi đè cái kia. Nó là `SyntaxError` ngay lúc nạp, tức là **cả trang không chạy một
dòng nào**: không phải một màn hỏng, mà một cái khung trắng.

Bắt được lần đầu khi `board.js` khai một `let picked` cho ô cờ đang chọn, mà `tienlen.js` đã có
một `picked` cho mấy lá bài đang nhấc lên. Sáu file thì mắt không canh nổi, nên có test canh.

---

## Những chỗ từng sai

Phần đáng đọc nhất. Tất cả đều **im lặng** — không cái nào báo lỗi.

| Sai chỗ nào | Nó trông như thế nào |
| --- | --- |
| `[hidden]` bị `display:flex` đè | Bốn màn hình vẽ chồng lên nhau. `hidden` là luật trong stylesheet của trình duyệt, mà mọi màn ở đây đều tự đặt `display` — nên `hidden` không làm gì cả |
| `const play` che chính hàm `play()` | Nút "Đánh" gọi tới một `HTMLButtonElement` chứ không phải nước đi |
| Ghế xếp theo số người **đã ngồi** | Ghế trống chưa ai lấp vẽ đè lên người đang ngồi |
| `countUp` chỉ dựa `requestAnimationFrame` | rAF không chạy khi tab bị ẩn → số tiền kẹt ở `0` vĩnh viễn, đúng vào lúc người ta ngoảnh đi |
| `countUp` chạy lại mỗi lần vẽ | Bàn mình đã xong vẫn đẩy mỗi giây → số **reset về 0 mỗi giây và không bao giờ tới nơi**. Ảnh chụp một khoảnh khắc không thấy được |
| Chip tiền bay nằm trong ghế | `drawSeats` dựng lại DOM mỗi push → chip bị xoá sau một phần năm quãng đường |
| Xúc xắc rơi từ `opacity: 0` với `fill-mode: both` | Animation không chạy thì **xúc xắc tàng hình vĩnh viễn**. Animation được quyền quyết định một thứ *đến* thế nào; không được là lý do duy nhất nhìn thấy nó |
| Người vào sòng giữa ván gọi `openBets()` | **Xoá sạch cửa đã đặt của mọi người**. Tới bàn mà dọn sạch bàn thì không phải là tới bàn |
| `watchersOf` khai bằng `const` dưới vòng lặp | Vùng chết vĩnh viễn — sòng thế giới không chạy được một dòng nào. Test canh bắt trước khi nó kịp chạy lần đầu |
| Vòng xóc dừng khi người cuối rời đi | Tiền còn trên bàn không bao giờ được thanh toán — tức là bị lấy mất |
| Đặt/gỡ chip gửi từng cái một | Năm POST riêng biệt tới không đúng thứ tự → bàn lúc xóc khác bàn lúc nhìn. Sửa bằng cách gửi cả bàn kèm số đếm |
| `betsOf` khai bằng `const` dưới vòng lặp | Lần thứ ba trong file này. Test canh là thứ duy nhất từng bắt được |
| Lời giải thích "hết vàng" đặt ở màn sau | Mà thẻ vào màn đó đang bị tắt — người ta không đọc được bằng gì. Phải nói ngay trên màn đang bị từ chối |
| `justify-content: center` trên hộp cuộn | Phần tràn nằm **trên** gốc cuộn, không cuộn tới được. Dòng "+10.000 vàng" bị cắt mất đầu |
| Một lệnh thay thế nuốt cả khối CSS quảng cáo | Màn ADS mất nền, mất căn giữa. Chỉ ảnh chụp mới thấy — nên giờ có `tools/css-check.mjs` |
| Nút thoát duy nhất tính là **bỏ ván** | Về nhất xong bấm thoát thì ghế ghi "đã rời" thay vì "Nhất" |
| `offset` khởi lại từ 0 mỗi lần restart | Mỗi lần deploy là **đọc lại cả trăm update cũ**: chào lại cả nhà ở mọi phòng, mở lại widget trên màn hình người ta, và trả lời những cái nút đã hết hạn (`answerCallback 404`). Người dùng thấy được, tôi thì phải đọc log production mới thấy |
| Sổ ghi trễ 2 giây, SIGTERM tới trước | Mất ván vừa thắng và mất cả `offset` — tức là lần deploy sau replay tiếp |
| Chào hỏi chỉ dựa vào việc không replay | Một lớp bảo vệ là không đủ cho thứ gửi tin nhắn tới phòng đầy người. Giờ ghi nhớ phòng nào đã chào, và đánh dấu sẵn mọi phòng đang ở lúc khởi động |
| `enable --now` rồi `restart` ngay | Deploy **lần nào cũng fail một lần** rồi tự lành sau 5 giây — tức là log failure không còn ai đọc |
| `seat.conversationId` | Ghi ở ba chỗ, đọc ở không chỗ nào. Đúng loại field sẽ mốc rồi có ngày bị tin |
| Đọc xuyên `next.me` không kiểm tra | Người **xem** sòng có `me: null`, còn push chung thì không có `me`. `next.me.theirs` ném `TypeError`, mà một cú ném trong `onState` là dừng luôn cả `render` — nên bàn **đứng nguyên ván trước**, tiền cược ván cũ còn nằm đó. Nó không trông giống lỗi, nó trông giống bàn bị kẹt, nên được báo về đúng như thế |
| Đĩa nặn bay mất sau 34px | Cắt cụt đúng cái động tác mà cả tính năng sinh ra để có. Ngưỡng đoán mò thay cho phép đo: cái phải hỏi là "đã hở hết ba con chưa", không phải "đã kéo đủ xa chưa" |
| Ván đấu lại vẫn bắt 3 bích | `startGame` ván nào cũng đi tìm 3 bích, không có nhánh nào cho ván sau. Đúng luật thì ván đầu mới bắt 3 bích, từ đó là người về nhất ván trước dẫn — ai chơi tiến lên cũng biết, mà bot thì không |
| Màn "Bạn về nhất" vẽ lại mỗi lần đẩy state | Về nhất xong, ba người kia còn đánh cả phút, và **mỗi nước của họ là một push**: cái màn ấy bị dựng lại **mười hai lần**, chữ nhảy và số tiền chạy lại từ đầu. Bàn hai người thì về nhất là hết ván nên không bao giờ lộ — đó là lý do nó chỉ xuất hiện khi hơn hai người |
| Lần vẽ đầu ra chữ "Bạn về " trống hạng | Cái push làm sạch tay bài tới trước cái push nói mình về thứ mấy |
| Năm và sáu đôi thông không chặt được gì | `beats` liệt kê từng trường hợp và danh sách có lỗ: dây năm đôi thông rơi thẳng xuống `return false`, không đè nổi bốn đôi thông và cũng không đè nổi thứ gì khác |
| Widget giữ bản sao `beats` và không được sửa theo | Thang chặt của bot lên bảy bậc, thang của widget vẫn bốn — người chơi ngồi nhìn dây năm đôi thông không chịu sáng lên |
| Đền viết thành "gánh nợ người thua" | Chỉ đúng chừng nào người đền cũng đang thua. Người đền mà đang thắng thì bàn in ra một nghìn vàng từ hư không. **Cùng một lỗi nằm ở cả hai trò**, bắt được ở phỏm rồi mới tìm ngược ra ở tiến lên |
| `placeName(place, số hàng được trả)` | Bàn một người ba máy: người ta về nhất, được cộng tiền, và màn hình báo **"Bạn về bét"** — vì chỉ có một hàng được trả nên hạng 0 vừa là nhất vừa là bét |
| Phỏm không có bước **trình** | Luật: trước khi đánh ở vòng bốn thì mở phỏm ra cho cả bàn thấy. Bản đầu chỉ hiện lúc tính điểm — tức là đúng lúc nó không còn dùng để làm gì nữa. Cả nửa sau của một ván phỏm nằm ở chỗ nhìn thấy phỏm người khác |
| Khung đầu của hiệu ứng chia bài đẩy lá ra ngoài khung | `backwards` giữ khung đầu suốt quãng chờ so le, nên đó là thứ nhìn thấy nếu animation không chạy: cả tay bài văng khỏi màn hình. Cùng họ với `opacity: 0` ở con xúc xắc, chỉ khác là lệch chỗ thay vì tàng hình |
| Lá đang nặn treo lại sau khi hết lượt | Bàn đã nhích sang người khác mà tấm bìa phóng to vẫn nằm giữa màn hình che mất bàn |
| Test canh `next.me` đòi dấu kiểm dính ngay sát | Đỏ ở `next.me && Array.isArray(next.me.hand)` — một dòng đã kiểm tra tử tế. Sửa **code** cho gọn (buộc một biến cục bộ) chứ không nới test, vì nới test là bỏ mất chính cái nó sinh ra để bắt |
| Ngưỡng thời gian đo bằng lần chạy tệ nhất | Một lần đo lẻ bị bộ dọn rác chen ngang thì nói về cái máy chứ không nói về thuật toán. Đổi sang **trung vị**, và để lần tệ nhất một khoảng rộng |
| Hiệu ứng lá rơi gắn ở lần vẽ đầu tiên | Mỗi nước là **hai** push — một chung, một riêng có bài mình — nên `render` chạy hai lần cách nhau vài mili giây, và lần thứ hai dựng lại lá không còn lớp hiệu ứng. Nhìn ra là chẳng có hiệu ứng nào cả |
| Phỏm lấy bài và đánh bài trong cùng một nhịp | Tay dài thêm rồi ngắn lại trong cùng một khung hình; không ai thấy nó lấy con gì |
| Danh sách về đích lọc bỏ máy | Máy là đồ đạc **lúc chia tiền**, không phải lúc xếp thứ tự. Lọc chúng ra thì ở bàn một người với ba máy, danh sách còn đúng một cái tên — và cái tên ấy thành "người về nhất" dù vừa về bét. Về ba, bấm "ván nữa", lại được đánh đầu, ván nào cũng thế. Sai ở **cả hai trò**, cùng một dòng |
| Ăn xong không khoá bộ lại | Ăn lần hai rút ruột bộ ăn lần một, và lá ăn lần một rơi ra thành rác — đã ăn một lá mà không dùng được nó. Người chơi tìm ra trước tôi |
| `tools/play.mjs` không đặt `TIENLEN_SCORES` | Con bot rơi về mặc định `/app/data/scores.json` — đường dẫn **bên trong container**, mà trên máy người viết thì `/app` không tạo được. Mọi lần ghi đều hỏng, cả cuốn sổ sống trong RAM, và mỗi lần khởi động lại là mất sạch vàng lẫn hai bảng cầu. Nhìn ra thì nó **không giống một cái lỗi**: nó giống "sao mới vào sòng mà không thấy ván trước", nên người ta đi tìm ở chỗ vẽ |
| Khối bàn giao bàn cược hỏi `state.kind === 'baucua'` | Ở bàn tài xỉu câu ấy **luôn** sai, nên `turned` luôn đúng, nên **mọi** push trong lúc đang đặt đều xoá sạch chip trên trang. Bot vẫn giữ đủ — nó được báo cả bàn cược — nên nhìn ra là "bấm đặt cái là mất, mà backend vẫn ghi nhận": đúng một nửa, và là nửa khó tìm hơn. Thêm một trò là mười hai chỗ phải thôi gọi tên trò cũ, và chỗ bị bỏ sót không nổ ra ở đâu cả |
| Kéo bát ra để gặp ba cái nắp con có chữ `?` | Mở một thứ để lộ ra ba thứ phải mở. Người thử hỏi "nặn rồi mà còn dấu hỏi làm cái quái gì", và câu ấy không có câu trả lời nào |
| Rồi bản sửa cho con chưa lật **quay tiếp** | Tệ hơn cái nó sửa. Mở bát ra thì xúc xắc đã nằm rồi — không có cách nào nó còn quay — nên nó đọc ra là bàn bị treo, chứ không phải một hiệu ứng. Cùng một sai lầm hai lần: dựng một trạng thái giả để nhét cái hồi hộp vào, thay vì để nó nằm ở chỗ nó vốn có, là cái bát đang trượt đi |
| Cái bát dựng ra không có số ván | Suốt cửa đặt đầu tiên nó gửi `round ?? 1`, tức là 1; rồi `openBets` đếm `0 + 1` và gửi 1 lần nữa cho ván thứ hai. **Hai lần xóc liền nhau mang cùng một tên**, mà trang thì nhớ "ván 1 tôi mở đĩa rồi" — nên ván thứ hai không được úp đĩa lên. Nặn được đúng một ván rồi thôi, ở **cả hai** cái bát, và không có gì báo lỗi cả |
| Cái đĩa căn giữa cái bát, không phải giữa ba con | Dưới ba con còn cái tổng và dòng chữ, nên cả khối bị đẩy lên chừng ba chục pixel. Cái đĩa vừa đúng cỡ để phủ ba con nhưng nằm lệch xuống ba chục pixel thì **hở nguyên mép trên**: kết quả ló ra trước khi có ai kéo. Đo đúng kích thước mà đặt sai chỗ vẫn là hở |
| Bàn cược của trang không gắn với số ván | Cửa đặt ván sau cũng là `phase === 'betting'` ở cùng một bàn, nên câu hỏi "vẫn cái bàn ấy chứ" trả lời đúng và **chip của ván trước ở nguyên đó**. Không dừng ở chỗ vẽ: `myBets()` đọc từ chính cái chồng chip ấy, nên chạm thêm một cái là gửi đi cả bàn cược cũ kèm cú chạm mới, và bot đặt lại nó **bằng tiền thật**. Một lỗi vẽ hoá lỗi tiền vì hai bên cùng đọc một biến. Cả `me` mang sang từ push chung cũng phải bỏ bàn cược lại — bot đẩy hai lần một nước, và cái cũ sống lại đúng ở khe giữa hai cái đẩy ấy |
| Nâng `min-height` của cái bát cho vừa cái đĩa tròn | Cột của một trò xúc xắc chỉ có **một** hàng co được, là cái bát. Nâng sàn của nó lên là lấy mất đúng cái tính co ấy: thiếu chỗ thì nó không nhường, cả cột tràn khỏi `#screen`, và thứ nằm ngay dưới `#screen` là hàng nút — hàng chip tiền rơi đè lên "Hoàn tác". Đúng một dòng `#says` là đủ đẩy nó qua ngưỡng, nên **lúc bị lúc không**, mà lúc không thì không ai đi tìm. Cỡ xúc xắc phải là hệ quả của chiều cao cái bát mới làm cho việc co lại vô hại |
| `#says` là một hàng thật trong cột | 26px lúc có chữ, 0 lúc rỗng. Cột chỉ có một hàng co được, nên hai mươi sáu pixel ấy đẩy nó qua ngưỡng và hàng chip tiền đè lên nút "Hoàn tác". Và **nó tự lành** khi lời nhắn hết hạn — nên lúc bị lúc không, mà lúc không thì không ai đi tìm |
| `board.js` khai `let picked`, mà `tienlen.js` đã có một cái | Script thường thì tầng ngoài cùng của mọi file chung một phạm vi. Không phải ghi đè: `SyntaxError` lúc nạp, tức là **cả trang trắng**. Sáu file thì mắt không canh nổi |
| Dựng thế cờ tướng bằng tay để thử luật | Đặt hai tướng cùng một cột, nên chúng **đối mặt**, nên mọi nước đều không hợp lệ — và tôi đọc ra là code sai. Cái test viết tay nói dối; perft thì không, vì nó không hỏi luật nào cả, nó đếm |
| Nhánh bàn cờ rơi vào `drawPile` thay vì `drawButtons` | Hai hàm cùng có `if (state.phase === 'lobby')`, và cái mỏ neo tôi dùng để chèn khớp cái đứng trước. Chạy vẫn chạy — chỉ là mấy cái nút mọc ra giữa bàn |
| Màn cờ và chiếu bầu cua cùng `id="board"` | `getElementById` trả về **cái đầu tiên**, nên `render()` bật tắt nhầm phần tử: vào cờ vua ra một khung trắng. Hỏng cả hai đầu — hai luật CSS cùng tên đè nhau nên sáu ô đặt cửa bầu cua xếp thành một cột. Và bộ smoke **mù trước nó**: nó dựng DOM giả bằng `Map` nên id trùng gộp lại làm một, đúng cái chỗ trình duyệt không gộp |
| Nước đi bị từ chối trong im lặng | Bàn đứng im, không ai hiểu vì sao. Một cái test ngồi chờ hai lăm giây rồi mới đỏ, và máy đo ở chỗ chờ là thứ chỉ ra được |

Và một luật rút ra từ carobot, có test canh:

> **Dưới vòng lặp vô tận chỉ được có khai báo hàm.** Một `const` khai dưới đó nằm trong vùng chết
> suốt đời tiến trình, còn một lệnh gọi trần thì đơn giản là không bao giờ chạy. Khai báo hàm thì
> được hoist và chạy bình thường — chính điều đó làm lỗi này dễ mắc và cực khó thấy.
