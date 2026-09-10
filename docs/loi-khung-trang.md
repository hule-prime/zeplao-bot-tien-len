# Lỗi khung trắng của widget — hồ sơ bàn giao cho project kuku

Viết ngày 11/09/2026, sau một buổi truy lỗi trọn vẹn. Người đọc không cần biết gì về con bot
tiến lên; mọi thứ cần thiết nằm trong file này.

Đối tượng: người giữ **API và web app của kuku**. Chỗ phải sửa nằm bên đó, không nằm bên bot.

---

## 1. Một đoạn cho người bận

Handler phục vụ file widget gắn `Cache-Control: public, max-age=31536000, immutable` cho **mọi**
phản hồi, **kể cả `404`**. Cloudflare cache đúng cái 404 ấy. Nên một cú 404 thoáng qua — một
request rơi vào vài giây sau khi upload, lúc bundle chưa đọc được — làm file đó **biến mất suốt
một năm ở edge đấy**, trong khi edge khác vẫn tốt.

Trang widget nạp bảy script nối đuôi nhau, nên mất một file là mất cả trang: `z.ready()` không
bao giờ được gọi, app chờ mãi, người dùng thấy một **khung trắng không có lấy một dòng lỗi**.

Ba việc phải làm, theo thứ tự: **(1)** header cache phải phụ thuộc status, **(2)** purge những
gì đã đóng băng, **(3)** đừng công bố version khi file chưa đọc được. Chi tiết ở mục 5.

---

## 2. Tái hiện trong 10 giây

Xin một file **chưa ai từng xin** trong bundle của một bot bất kỳ, ba lần liên tiếp:

```bash
BOT=3b82d8e9-2446-4de3-b701-be6a40331a45   # bot nào cũng được
V=50                                        # version nào cũng được
GHOST="https://kuku.vn/api/widgets/$BOT/$V/ma-$(date +%s).js"

for i in 1 2 3; do
  curl -sS -D - -o /dev/null "$GHOST" \
    | grep -iE '^(HTTP/2|cache-control|cf-cache-status|age)'
  sleep 2
done
```

Kết quả thật, chạy lúc 00:52 ngày 11/09/2026:

```
HTTP/2 404
cache-control: public, max-age=31536000, immutable
cf-cache-status: MISS

HTTP/2 404
cache-control: public, max-age=31536000, immutable
age: 2
cf-cache-status: HIT          ← 404 đã nằm trong cache

HTTP/2 404
cache-control: public, max-age=31536000, immutable
age: 4
cf-cache-status: HIT
```

**Một cú 404 vừa được đóng băng, với hạn một năm.** Đó là toàn bộ con bệnh.

Mẫu vật thật đã bắt được trước đó: `…/50/tienlen.js?r=1` trả `404 · age: 66 · HIT` — một file
**có thật**, vì có người bấm thử đúng URL đó **đúng một lần, sai thời điểm**. Trong khi
`?r=2`, `?r=3` vẫn 200. (Mục này đã hết hiệu lực sau khi cache bị đẩy ra, nhưng lệnh ở trên tái
hiện lại được bất cứ lúc nào.)

---

## 3. Triệu chứng — và vì sao chúng đánh lừa tất cả mọi người

| Triệu chứng | Nó có nghĩa gì |
| --- | --- |
| Chỉ **một số người** trắng, người khác vào bình thường | Cache theo **từng edge CDN**. Ai đi qua edge đã đóng băng thì trắng |
| **Không bao giờ tự lành** | `max-age` là một năm, và `immutable` nghĩa là trình duyệt còn không thèm hỏi lại |
| Luôn xảy ra **ngay sau khi đẩy widget** | Đó là khoảng duy nhất sinh ra 404 thoáng qua |
| **Không tài nào tái hiện** từ máy vừa deploy | Máy deploy đi qua edge khác, edge ấy giữ bản tốt. Kiểm 150 request: 200/200 |
| Cả **Chrome lẫn Firefox**, cả Windows lẫn máy khác | Không phải chuyện trình duyệt |
| **Không có một dòng lỗi nào** ở đâu | Xem mục 4 |
| Deploy đã kiểm "mọi file đều trả 200" mà vẫn trắng | Kiểm từ máy deploy, tức là từ edge tốt. Kiểm sai chỗ |

Con bệnh này đã bị đuổi ít nhất năm lần bằng cách đoán, mỗi lần một hướng khác: đường dẫn asset
cho Firefox, upload qua nhiều origin, chuyển URL version sang dạng thư mục (rồi revert), kiểm
từng file sau upload, kiểm thêm route api-bot. Không lần nào trúng, vì tất cả đều nhìn vào
**nội dung bundle** hoặc **origin**, trong khi thủ phạm là **một cái header và một cái cache**.

---

## 4. Vì sao mất một file là mất cả trang, và im lặng

`index.html` của widget nạp bảy script **nối đuôi nhau**, mỗi cái chờ `onload` của cái trước:

```js
script.onload = function () { load(i + 1); };   // và (trước đây) không có onerror
```

Một file không tới nơi → `onload` không chạy → dây đứt tại đó → `tienlen.js` không bao giờ chạy
→ `z.ready()` không bao giờ gửi cho host → app ngồi chờ vô hạn với một cái iframe trống.

Không ai báo lỗi cả: một script không nạp được thì **không có gì để mà báo**. Không log ở bot,
không log ở app, không dòng nào trong journal. Cách duy nhất phát hiện được từ trước tới nay là
có người mở game rồi nhắn *"trắng bóc"*.

Bên bot đã vá phần này (mục 8), nhưng vá bên đó chỉ là **áo giáp**. Cái lỗ nằm ở server.

---

## 5. Phải sửa gì bên kuku

### 5.1 BẮT BUỘC — Header cache phải phụ thuộc status

Đây là cái sửa dứt điểm. Chỗ sửa: handler phục vụ `GET /api/widgets/{botId}/{version}/{file}`.
Hiện tại header cache đang được gắn **trước khi biết mình sắp trả cái gì**.

Luật đúng:

| Status | Cache-Control |
| --- | --- |
| `200` | `public, max-age=31536000, immutable` (giữ nguyên — version nằm trong đường dẫn nên nội dung không bao giờ đổi dưới một URL) |
| `404` | `no-store` |
| `5xx` | `no-store` |
| `304` | không đụng |

Thêm `CDN-Cache-Control: no-store` cho các nhánh lỗi: Cloudflare ưu tiên header này và nó tách
bạch hẳn ý định "đừng cache ở edge" khỏi ý định dành cho trình duyệt.

Hình dạng đúng, bất kể framework:

```
đọc file
  ├─ không có / đọc lỗi / độ dài bằng 0
  │     → Cache-Control: no-store
  │     → CDN-Cache-Control: no-store
  │     → 404 (hoặc 503 nếu là lỗi tạm thời của storage — xem 5.4)
  └─ có, đọc đủ
        → Cache-Control: public, max-age=31536000, immutable
        → Content-Length, ETag
        → 200
```

**Tìm chỗ sửa:** grep trong source của API — `immutable`, `31536000`, `max-age`, `CacheControl`,
`Cache-Control`. Chỗ nào gắn header cache **trước** khi biết mình sắp trả 200 hay 404 thì chính
là chỗ đó. Với `/api/widgets/...` thì thường là một dòng gắn header ngay khi vào route, hoặc một
middleware/attribute áp cho cả nhóm route tĩnh.

**Nguyên tắc để không tái phạm:** header cache được đặt **ở đúng chỗ quyết định thân phản hồi**,
không đặt ở một middleware quét cả route. Một middleware gắn `immutable` cho cả nhánh lỗi là
đúng cái đã xảy ra ở đây, và nó sẽ xảy ra lại với bất kỳ route tĩnh nào khác.

### 5.2 BẮT BUỘC — Purge những gì đã đóng băng

**Sửa header không dọn được cái đã nằm trong cache.** Mọi 404 đã đóng băng vẫn ở đó tới sang
năm, và những người đang trắng sẽ trắng tiếp. Phải purge sau khi (5.1) lên production:

```bash
# Purge theo prefix (chỉ có ở gói Enterprise):
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache" \
  -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"prefixes":["kuku.vn/api/widgets/"]}'

# Không có Enterprise thì purge toàn bộ zone, một lần:
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache" \
  -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"purge_everything":true}'
```

Nếu không purge được toàn zone thì cách cuối là **đẩy một version widget mới cho từng bot** —
đường dẫn đổi thì khoá cache đổi. Nhưng đó chỉ là né, và né xong lần sau lại dính.

### 5.3 BẮT BUỘC — Đừng công bố version khi file chưa đọc được

Khoảng hở giữa *"đã bump `widgetVersion`"* và *"mọi file đọc được qua đường công khai"* chính là
cái cửa sinh ra mọi cú 404 thoáng qua. `setWidget` phải:

1. lưu đủ toàn bộ file của bundle,
2. **tự đọc lại từng file qua đúng đường mà trình duyệt sẽ đi** (`/api/widgets/{bot}/{version}/{file}`),
3. rồi mới bump `widgetVersion` và trả về cho client.

Nếu API chạy nhiều instance (blue/green) mà bundle nằm trên **đĩa cục bộ của instance nhận
upload**, thì instance kia sẽ 404 — nhìn ra y hệt lỗi này và không bao giờ hết. Bundle phải nằm ở
chỗ dùng chung (DB / object store), hoặc phải nhân bản xong mới công bố.

### 5.4 NÊN — Không bao giờ trả `200` cho file thiếu hoặc đọc dở

Một `200` với thân rỗng là câu trả lời **tệ nhất có thể** ở đây: `onerror` của trình duyệt không
kêu một tiếng (nó coi như nạp xong), mà `immutable` thì đóng băng nó một năm. Luôn đặt
`Content-Length`, và nếu đọc từ storage bị lỗi tạm thời thì trả **`503` + `no-store`**, đừng trả
404 — 404 nghĩa là "không có", còn 503 nghĩa là "thử lại đi", và hai cái đó dẫn tới hai hành vi
rất khác nhau ở phía client lẫn CDN.

### 5.5 NÊN — Web app phải nói khi khung không mở được

Hiện tại nếu iframe không gửi `ready`, app để nguyên một cái khung trống **vô hạn**. Đó là lý do
không ai phân biệt nổi "bot chết", "trang hỏng" hay "mạng hỏng" — và là lý do buổi truy lỗi này
mất cả ngày.

Trong `BotWidget` (chỗ đang dựng `<iframe sandbox="allow-scripts">`):

```js
// sau khi iframe onLoad, nếu 5 giây không nhận được { zeplao: 'call', method: 'ready' }
//   → thay khung bằng: thông báo + nút "Thử lại"
//   → nút "Thử lại" nạp lại iframe với một query ngẫu nhiên (?r=<random>) để đổi khoá cache
```

Query ngẫu nhiên chứ không phải cố định: một khoá cố định cũng đóng băng được — `?r=1` của
`tienlen.js` từng là 404 vĩnh viễn ở một edge đúng vì lý do đó.

### 5.6 NÊN — CSP của file widget đang thiếu `www` (quả mìn hẹn giờ)

Header hiện tại trên mọi file widget:

```
content-security-policy: default-src https://kuku.vn; script-src https://kuku.vn 'unsafe-inline';
  ...; frame-ancestors https://kuku.vn https://www.kuku.vn http://localhost:5173 http://localhost:5174
```

`frame-ancestors` **cho phép** `https://www.kuku.vn`, nhưng `script-src`/`default-src` **chỉ có**
`https://kuku.vn`. Hôm nay `www` còn chuyển hướng về apex nên chưa nổ. Ngày nào cái chuyển hướng
ấy đổi hoặc ai đó cho app chạy thẳng trên `www`, **mọi widget trắng ngay lập tức trên toàn bộ
www**, và nó sẽ trông y hệt con bệnh này.

Sửa: thêm `https://www.kuku.vn` vào `default-src`/`script-src`/`style-src`/`img-src`/`font-src`/
`media-src`, hoặc bỏ `www` khỏi `frame-ancestors`. Chọn cái nào cũng được, miễn hai danh sách
đừng nói hai chuyện khác nhau.

---

## 6. Kiểm chứng đã sửa xong

Chạy được ngay sau khi deploy, không cần công cụ gì:

> **Lấy header bằng `GET`, đừng bằng `curl -I`.** Với đường dẫn có tên file thì `HEAD` chạy
> bình thường, nhưng với **URL gốc của version** (`…/api/widgets/{bot}/{version}`, không kèm tên
> file) thì server trả `405 · allow: GET` — không một chữ nào về cache, mà vẫn đủ để người kiểm
> tưởng mình vừa kiểm xong. Dùng `-D - -o /dev/null` thì cả hai dạng đều đúng.

```bash
BOT=<bất kỳ bot nào>; V=<version hiện tại>
BASE="https://kuku.vn/api/widgets/$BOT/$V"
GHOST="$BASE/ma-$(date +%s).js"

# 1. File không tồn tại: PHẢI no-store
curl -sS -D - -o /dev/null "$GHOST" | grep -iE 'HTTP/2|cache-control|cf-cache-status'
#    mong đợi: 404 · cache-control: no-store · cf-cache-status: KHÔNG BAO GIỜ là HIT

# 2. Xin đúng URL đó lần nữa: vẫn không được là HIT
curl -sS -D - -o /dev/null "$GHOST" | grep -iE 'cf-cache-status|age'

# 3. File có thật: vẫn phải immutable
curl -sS -D - -o /dev/null "$BASE/tienlen.js" | grep -iE 'HTTP/2|cache-control'
#    mong đợi: 200 · cache-control: public, max-age=31536000, immutable

# 4. Đủ bộ, đủ host — cái deploy của bot đang chạy sẵn vòng này
for host in https://kuku.vn https://www.kuku.vn https://api-bot.kuku.vn; do
  for f in index.html style.css zeplao.js faces.js sound.js pieces.js board.js taixiu.js tienlen.js; do
    printf '%s %s\n' "$(curl -sS -o /dev/null -w '%{http_code}' "$host/api/widgets/$BOT/$V/$f")" "$f"
  done
done
```

Điều kiện đạt: **(1)** và **(2)** không bao giờ ra `HIT`, **(3)** vẫn `immutable`, **(4)** toàn 200.

---

## 7. Để nó không quay lại

Sửa xong mà không có cái gì canh thì hai tháng nữa một cái middleware mới lại gắn `immutable`
cho cả nhánh lỗi. Bốn lớp, xếp từ rẻ tới đắt:

1. **Test ở tầng handler.** Một test: xin một file không tồn tại trong bundle → khẳng định
   `Cache-Control` **không chứa** `max-age` dương và **không chứa** `immutable`. Đây là test rẻ
   nhất và nó bắt đúng con bệnh này ngay tại chỗ sinh ra.
2. **Một luật chung, viết thành test:** *không phản hồi 4xx/5xx nào của toàn API được mang
   `max-age` dương*. Quét vài chục route trong integration test, hoặc chặn ngay ở lớp đặt header.
3. **Kiểm sau khi upload, từ nhiều nơi.** `setWidget` (hoặc CI) tự xin lại từng file qua đường
   công khai; và ít nhất một lượt kiểm **từ một vùng khác** (Cloudflare Worker ở colo khác, hoặc
   một runner ở VN) — vì cả buổi truy lỗi này đứng chết ở chỗ *"máy deploy thấy 200, người dùng
   thấy trắng"*.
4. **Cảnh báo trên log/analytics.** Đếm số phản hồi 404 cho `/api/widgets/*`. Bình thường phải
   gần bằng không; một cụm 404 ngay sau upload chính là lúc con bệnh đang được gieo, và nó nhìn
   thấy được **trước khi** có người nhắn "trắng bóc".

Và một nguyên tắc để lần sau đỡ mất một ngày: **thứ chỉ hiện với một số người và không bao giờ
tái hiện được ở máy dev thì gần như luôn là cache hoặc CDN**, không phải code. Câu hỏi đầu tiên
nên là *"cái gì đang được cache, ở đâu, và bao lâu"* — chứ không phải *"code vừa đổi gì"*.

---

## 8. Bên bot đã tự vá gì (để tham khảo, không cần làm gì)

Repo `zeplao-bots` đã bịt phần của mình, coi như áo giáp khi server còn chưa sửa:

- **`bots/tienlenbot/widget/index.html`** — vòng nạp không còn đứt trong im lặng: mỗi file thử
  lại 3 lần với **khoá cache ngẫu nhiên mỗi lần**; file phụ hỏng thì bỏ qua; hai file sống còn
  phải **để lại một cái tên ở tầng toàn cục** mới được coi là đã chạy (bắt được cả `200` thân
  rỗng — thứ `onerror` không bao giờ kêu); hết đường thì hiện chữ tiếng Việt + nút Tải lại thay
  vì để trắng.
- **`tools/loader-test.mjs`** — bốn cảnh hỏng file, chạy bằng Chrome thật. Trên `index.html` bản
  cũ thì **cả bốn đều ra một màn hình chỉ có dấu `…`**, tức là đúng cái khung trắng.
- **`tools/widget-selftest.mjs`** — mở **bản vừa upload** bằng trình duyệt thật, đóng vai host,
  và chỉ báo đạt khi trang **vẽ ra được cái sảnh**. Trả về 200 chưa bao giờ là bằng chứng.
- **`deploy/deploy-bot.sh`** — chạy `loader-test` trước khi upload và `widget-selftest` sau khi
  upload; hỏng là dừng, không restart bot.

Hai công cụ trên dùng lại được cho bất kỳ widget nào của nền tảng, chỉ cần đổi `botId` và
`version`.

---

## 9. Những hướng đã loại trừ (đừng đào lại)

Tất cả đều đã kiểm tận nơi trong buổi truy lỗi, để người sau khỏi mất công:

- **Nội dung bundle** — ba bản v47 (bản chạy tốt cũ), v48, v50 đều qua self-test: nạp đủ 7
  script, gọi `ready`, nhận state và vẽ ra sảnh. v50 giống v47 **từng byte**.
- **Nén hỏng** — br / gzip / zstd / thô đều giải ra đúng bytes, sha khớp.
- **Service worker** — `/firebase-messaging-sw.js` chỉ có handler `push`, **không bắt `fetch`**,
  nên không can thiệp vào request nào.
- **Sandbox / opaque origin** — dựng lại đúng `<iframe sandbox="allow-scripts">` tại chỗ: trang
  vẫn bắt tay và vẽ bình thường. `location.origin` trong khung sandbox vẫn trả về origin thật.
- **Dạng URL** — `…/50`, `…/50/`, `…/50/index.html`, qua `kuku.vn` lẫn `www.kuku.vn`: tất cả đều
  chạy.
- **Origin chập chờn** — 150 request liên tiếp qua 5 file, không một lần hỏng.
- **Bot** — mở phiên được, `pushState` không lỗi lần nào, sổ vàng nguyên vẹn.

Còn đúng một mắt xích chưa nhìn được từ ngoài: payload của `GET /api/widget-sessions/{id}`
(token bot không có quyền đọc). Trường `url`/`hosted` trong đó là thứ app dùng để dựng `src` của
iframe — nếu sau khi làm hết mục 5 mà vẫn còn trắng, đó là chỗ tiếp theo phải nhìn.
