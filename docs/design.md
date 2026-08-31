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
| Vốn ban đầu | **20.000**, một lần, lần đầu mở widget. Đủ để ngồi bất kỳ bàn nào trên danh sách và thua vài ván mà chưa phải đi xem quảng cáo |
| Quà mỗi ngày | **+10.000**, và phải **bấm nhận**. Ngày sang lúc nửa đêm giờ Việt Nam, không phải giờ UTC |
| Bàn với máy | Cược cố định **4.000**, bất kể bàn mở ở mức nào. Nhất +4.000, nhì +2.000, ba −2.000, bét −4.000 |
| Bàn giữa người | Cược của phòng — **tự đặt**, từ 1.000 tới 1.000.000 và không quá số tiền người mở đang có. Ba mức có sẵn chỉ là câu trả lời thường gặp |
| Kiếm thêm | Quảng cáo 10 giây, **4.000** — đúng một ván với máy — tối đa 1.000 lần/ngày (con số đó chặn lỗi đếm chứ không phải để hạn chế — mười giây một lần đã là hạn chế rồi). Nằm sau dấu `+` cạnh ví, **ở mọi mức tiền** |
| Bảng xếp hạng | Vàng, của cả thế giới |

**Quảng cáo trả đúng một ván với máy**, không phải trùng hợp: nó tồn tại để đưa người hết tiền
quay lại bàn, mà một quảng cáo xem xong vẫn không đủ ngồi thứ rẻ nhất trên màn hình là một quảng
cáo không làm được việc của nó. Nâng cược máy lên 4.000 thì cái này phải theo — và số lượt trong
ngày giảm xuống một nửa để một ngày xem vẫn đáng đúng bốn mươi nghìn như cũ.

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

## 6. Bầu cua tôm cá

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
- **Đĩa tự mở sau 2,2 giây.** Kéo được, chạm cũng được — trên khung này kéo hay trượt tay — nhưng
  một ván chung của cả thế giới thì không thể đứng chờ ngón tay một người.
- **Soi cầu ba mươi phiên gần nhất.** Sáu hàng, mỗi hàng một con; mỗi cột một ván, **mới nhất bên
  trái** nên mở tab ra là thấy ngay ván vừa rồi, không phải cuộn. Mặt và tổng số lần ra dính liền
  ở mép trái và không trôi theo khi cuộn ngang — cuộn về quá khứ mà mất hàng nào là hàng nào thì
  bảng đó vô dụng. Ra hai và ra ba đổi màu và có số trên ô, vì "về đôi" mới là thứ người soi cầu
  đi tìm; có chú thích màu ngay dưới bảng. Bot giữ vòng ba mươi ván (`HISTORY`), mới nhất đứng đầu.
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

Và một luật rút ra từ carobot, có test canh:

> **Dưới vòng lặp vô tận chỉ được có khai báo hàm.** Một `const` khai dưới đó nằm trong vùng chết
> suốt đời tiến trình, còn một lệnh gọi trần thì đơn giản là không bao giờ chạy. Khai báo hàm thì
> được hoist và chạy bình thường — chính điều đó làm lỗi này dễ mắc và cực khó thấy.
