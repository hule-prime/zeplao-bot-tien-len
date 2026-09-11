# Widget 404 vì bộ file chỉ nằm trên một máy — hồ sơ bàn giao cho project zeplao

Viết ngày 12/09/2026. Người đọc không cần biết gì về con bot tiến lên.

Đối tượng: người giữ **API của kuku**. Chỗ phải sửa nằm trong `server/Zeplao.Api`, không nằm bên
bot và cũng không nằm ở bộ widget.

Đây là **con bệnh thứ hai** của cùng một triệu chứng "khung trắng". Con thứ nhất — `404` bị đóng
băng một năm vì `Cache-Control: immutable` gắn lên cả nhánh lỗi — đã sửa xong, hồ sơ ở
[loi-khung-trang.md](loi-khung-trang.md). Con này ở tầng dưới nó, và là con làm người ta trắng
**mỗi lần đẩy widget**.

---

## 1. Một đoạn cho người bận

`POST /bot/setWidget` giải nén bộ file vào **đĩa cục bộ của đúng cái máy nhận request**. API
chạy sau nginx trên **ba máy**, và không có gì nhân bản thư mục ấy. Nên mỗi lần một bot đẩy
widget lên, **chỉ một trong ba máy có bộ file mới**, còn hai máy kia trả `404` cho tới lần deploy
sau — deploy đồng bộ lại thư mục, và đó là lý do chuyện này trông giống "lâu lâu lại lỗi" thay vì
"hỏng suốt".

Nghĩa là: **cứ đẩy widget xong thì khoảng hai phần ba người chơi mở ra là khung trắng**, ai rơi
vào máy nào do nginx quyết định. Người báo lỗi và người sửa lỗi thường rơi vào hai máy khác nhau,
nên một bên thấy hỏng còn một bên thấy chạy — và không ai chứng minh được gì.

Sửa: **đừng để bộ file sống trên đĩa riêng của một máy**, và **đừng công bố version khi cả ba máy
chưa đọc được nó**. Chi tiết ở mục 5.

---

## 2. Bằng chứng

Hỏi thẳng ba máy, cùng một bot, cùng một lúc (12/09/2026, khoảng 23:40):

```bash
# trên từng máy
ls /opt/zeplao/shared/bot-widgets/<botId dạng N>/ | sort -n
```

| máy | các bản có trên đĩa |
| --- | --- |
| 103.72.99.**39** | 1 … 33, 35 … 38, 40 … **59** |
| 103.72.99.**162** | 1 … **47** |
| 103.72.99.**185** | 1 … 33, 35 … 38, 40 … **47** |

Ba điều đọc ra được từ bảng này:

1. **Bản 48 trở đi chỉ có trên một máy.** Toàn bộ các lần đẩy widget trong ngày hôm đó rơi vào
   máy `.39`.
2. **Bản 47 là bản cuối cùng có đủ trên cả ba** — và đúng là bản chạy tốt trước khi ngày làm việc
   ấy bắt đầu. Nó đủ ba máy vì một lần deploy đã đồng bộ thư mục.
3. **Ngay cả trong khoảng 1–47 ba máy cũng đã lệch nhau**: `.162` có bản 34 và 39, hai máy kia
   không. Tức là từ trước tới nay mỗi lần upload rơi vào một máy ngẫu nhiên, và mỗi máy giữ một
   tập con khác nhau. Chuyện này **đã xảy ra từ lâu**, không phải mới.

Phía người dùng, cùng lúc đó:

- App mobile hiện đúng chữ **"Máy chủ trả lỗi 404"** (sau khi bổ sung callback lỗi — xem mục 7).
- Một người chơi khác, cùng bot, cùng bản v58, mở bình thường. Log bot ghi
  `widget chạy được cho thuongd · bản v58` — tức là **bộ file hoàn toàn lành**, chỉ là không có
  mặt ở máy mà người kia rơi vào.
- Kiểm qua `https://kuku.vn/...` từ máy người sửa: **200, mọi lần**. Vì nginx đẩy request ấy vào
  máy có file.

Sau khi chép tay bản 48–59 sang hai máy thiếu, log ghi
`widget chạy được cho tao1 · bản v59` — cùng thiết bị vừa nãy còn trắng.

---

## 3. Cơ chế

```
POST /bot/setWidget (zip)
        │
     nginx  ──► chọn 1 trong 3 máy
        │
        ▼
   máy A: giải nén vào /opt/zeplao/shared/bot-widgets/<bot>/<version>/
          bump WidgetVersion trong store dùng chung (Postgres/Redis)
        │
        ▼
  mọi máy đều biết "version mới là N"   ← dùng chung
  chỉ máy A có file của version N       ← KHÔNG dùng chung
```

`/opt/zeplao/shared/bot-widgets` được gắn vào container bằng **bind mount từ đĩa của chính máy
đó** (`deploy/ba-may-chung.sh`, dòng `-v /opt/zeplao/shared/bot-widgets:...`). Chữ "shared" trong
đường dẫn là **tên thư mục**, không phải một ổ dùng chung: không có NFS, không có Gluster, không
có gì đồng bộ nó giữa ba máy.

Rồi trang widget nạp **bảy file nối đuôi nhau**. Thiếu một file là dây đứt tại đó, `z.ready()`
không bao giờ được gọi, app ngồi chờ mãi — và cái người dùng thấy là một **khung trắng**.

---

## 4. Vì sao nó trốn được lâu đến thế

| Chuyện | Vì sao nó che mất lỗi |
| --- | --- |
| Kiểm sau upload bằng cách gọi `https://kuku.vn/...` | Đi qua nginx, rơi trúng máy có file là báo xanh. **Kiểm sai chỗ.** |
| Người sửa lỗi thấy chạy, người dùng thấy trắng | Hai người rơi vào hai máy khác nhau. Không ai tái hiện được của ai. |
| Deploy đồng bộ lại thư mục | Nên sau mỗi lần deploy thì "tự lành", và con bệnh trông như chập chờn. |
| Chỉ một phần người chơi bị | Đúng tỉ lệ 2/3, nhưng không ai đếm nên nó giống "mạng của mấy bạn ấy yếu". |
| Không có log nào | Máy không có file chỉ trả 404 — không phải lỗi của nó, nên không kêu. |

Cộng với con bệnh thứ nhất (404 bị cache một năm) thì hai cái chồng lên nhau: máy thiếu file trả
404, CDN đóng băng cái 404 ấy, và người dùng trắng **vĩnh viễn** chứ không phải trắng một lúc.

---

## 5. Phải sửa gì

### 5.1 BẮT BUỘC — Bộ file phải tới được cả ba máy trước khi version được công bố

Ba cách, xếp theo thứ tự nên chọn.

**(a) Để bundle ở chỗ dùng chung — nên nhất.**

Hệ thống đã có S3 (khoá nằm trong `shared.env`). `setWidget` ghi **nguyên cái zip** lên đó dưới
khoá `bot-widgets/<botId>/<version>.zip`, rồi mỗi máy giải nén ra đĩa của mình **lần đầu có người
hỏi tới** (hoặc khi nghe một tín hiệu Redis, xem (b)). Đĩa cục bộ khi ấy chỉ còn là cache, mất
cũng không sao — máy tự dựng lại từ S3.

Việc phải làm:
- `setWidget`: nhận zip → kiểm hợp lệ → **ghi lên S3** → xác nhận đọc lại được → **rồi mới** bump
  `WidgetVersion`.
- `BotWidgetFiles.Resolve`: không thấy thư mục version trên đĩa thì kéo zip từ S3 về, giải nén,
  rồi phục vụ. Một khoá theo `<bot>/<version>` để hai request cùng lúc không giải nén đè nhau.
- Giữ nguyên `Cache-Control` theo status như hiện tại (đã sửa ở con bệnh thứ nhất).

**(b) Bắn tín hiệu qua Redis, mỗi máy tự kéo về.**

Ba máy đã dùng chung Redis (backplane của SignalR, và `MobileDiagnostics` đã dùng nó để chia sẻ
giữa các instance — có sẵn tiền lệ). `setWidget` publish `bot-widget:<botId>:<version>`; máy nào
nghe được thì kéo về. Vẫn cần **chỗ để kéo**, nên thực chất là (a) cộng thêm một cú đẩy sớm cho
đỡ phải chờ người đầu tiên hỏi tới. Làm (a) trước, (b) là phần tăng tốc.

**(c) Đẩy thẳng sang hai máy kia lúc upload.**

Máy nhận zip gọi một endpoint nội bộ của hai máy còn lại, chờ cả hai xác nhận rồi mới bump
version. Nhanh để làm, nhưng đẻ ra thứ hôm nay chưa có: **API phải biết địa chỉ các máy anh em**.
Danh sách ấy hiện chỉ nằm trong script deploy (`deploy/ba-may-chung.sh`, mảng `IP`). Thêm một
nguồn sự thật thứ hai về topo cụm là thứ sẽ lệch vào ngày thêm máy thứ tư.

> Dù chọn cách nào: **chỉ bump `WidgetVersion` sau khi bộ file thật sự đọc được ở mọi chỗ sẽ phục
> vụ nó.** Khoảng hở giữa "đã công bố version" và "file đọc được" chính là cái cửa sinh ra mọi cú
> 404 — và với con bệnh thứ nhất thì mỗi cú 404 ấy từng bị đóng băng một năm.

### 5.2 NÊN — Quét bản cũ phải biết cả cụm

Chú thích trong `BotWidgets.cs` nói *"Old ones are swept when nothing is pinned to them"*. Với ba
máy thì "nothing is pinned" phải là **trên toàn cụm**, không phải theo những gì một máy biết. Máy
B xoá một version mà máy A đang có phiên ghim vào là lại đúng con bệnh này, chỉ đi ngược chiều.

### 5.3 NÊN — Đừng `await` một cú phát SignalR trong đường trả lời request

`GET /widget-sessions/{sessionId}` hiện làm thế này trước khi trả lời:

```csharp
if (!string.IsNullOrWhiteSpace(place))
{
    await hub.Clients.Group(ChatHub.UserGroup(user.Id))
        .SendAsync("WidgetOpenedElsewhere", new { sessionId, place });
}
```

Một client cùng tài khoản đang kẹt transport là một request HTTP **treo**, và cái đang chờ nó là
cái khung widget của người dùng. Trong `Program.cs` có **41 chỗ** `await hub.Clients…SendAsync`
nằm trong đường trả lời. Nên bắn-rồi-quên, hoặc bọc một hạn giờ ngắn: một tin nhắn realtime không
tới nơi là chuyện nhỏ; một request không bao giờ trả lời thì không.

(Đây là họ hàng gần của ba commit `Find out why a request could hang for ever` — cùng một hình
dạng lỗi, khác chỗ.)

---

## 6. Kiểm chứng đã sửa xong

**Luật số một: hỏi thẳng từng máy, đừng hỏi qua nginx.** Hỏi qua nginx mà rơi trúng máy tốt là
tưởng xong — đó là cái đã che con bệnh này suốt từ đầu.

```bash
# 1. Sau mỗi lần setWidget: cả ba máy phải có đủ bộ file của version vừa công bố
BOT=<botId dạng N>   # 32 ký tự hex, không dấu gạch
V=<version vừa trả về>
for IP in 103.72.99.39 103.72.99.162 103.72.99.185; do
  ssh -p 24700 root@$IP "ls /opt/zeplao/shared/bot-widgets/$BOT/$V/ | wc -l"
done
# mong đợi: ba con số giống nhau, và bằng số file trong zip

# 2. Và phục vụ được — hỏi từng máy, bỏ qua nginx
for IP in 103.72.99.39 103.72.99.162 103.72.99.185; do
  ssh -p 24700 root@$IP "curl -sS -o /dev/null -w '%{http_code}\n' \
    http://127.0.0.1:<cổng api>/widgets/<botId có gạch>/$V/index.html"
done
# mong đợi: 200 200 200

# 3. File thiếu vẫn phải no-store (con bệnh thứ nhất, đừng để nó quay lại)
curl -sS -D - -o /dev/null "https://kuku.vn/api/widgets/<botId>/$V/khong-co-$(date +%s).js" \
  | grep -iE 'HTTP/2|cache-control|cf-cache-status'
# mong đợi: 404 · no-store · không bao giờ HIT
```

---

## 7. Để nó không quay lại

1. **Test ở tầng handler**: `setWidget` không được bump version khi một trong các đích lưu trữ
   chưa xác nhận. Dựng hai "máy" giả, cho một cái từ chối, khẳng định version **không** đổi.
2. **Kiểm sau upload, từ từng máy** — đưa hẳn vòng lặp ở mục 6 vào bước deploy hoặc vào chính
   `setWidget`. Một lần kiểm qua nginx **không tính là kiểm**.
3. **Cảnh báo**: đếm `404` trên `/widgets/*`. Bình thường phải gần bằng không; một cụm 404 ngay
   sau upload là lúc con bệnh đang được gieo, và nhìn thấy được **trước khi** có người nhắn
   "trắng bóc".
4. **Một chỗ duy nhất giữ danh sách máy.** Hôm nay topo cụm chỉ nằm trong script deploy; ngày
   thêm máy thứ tư mà quên chỗ thứ hai là lại đúng con bệnh này.

Và một nguyên tắc chung, rút ra từ cả hai con bệnh: **thứ chỉ hỏng với một số người và không tái
hiện được ở máy dev thì gần như luôn là cache, CDN, hoặc một máy trong cụm khác với những máy
kia.** Câu hỏi đầu tiên nên là *"cái này được phục vụ từ đâu, và mọi chỗ phục vụ nó có giống nhau
không"* — chứ không phải *"code vừa đổi gì"*.

---

## 8. Hiện trạng lúc bàn giao

- **Đã chép tay** bản 48–59 của bot tiến lên sang hai máy thiếu. Người dùng vào được ngay sau đó
  (log bot: `widget chạy được cho tao1 · bản v59`).
- **Đây là vá tạm.** Lần `setWidget` kế tiếp — của bot này hay bot nào khác — vẫn rơi vào đúng một
  máy, và hai máy kia lại 404.
- **App mobile đã được vá** (`mobile/lib/src/widgets/bot_widget.dart`, đã trên `origin/main`):
  webview giờ có `onReceivedError`/`onReceivedHttpError`, có đồng hồ canh 15 giây cho trường hợp
  tài liệu về mà trang không chạy, có nút **Thử lại** dựng lại webview với khoá cache mới, và chốt
  URL so theo thư mục thay vì so bằng đúng một chuỗi. Chính bản vá này là thứ đã đổi "một ô trắng
  câm" thành dòng chữ **"Máy chủ trả lỗi 404"** — và đó là lúc con bệnh lộ ra sau nhiều ngày.
  Không có nó thì hồ sơ này không tồn tại.
