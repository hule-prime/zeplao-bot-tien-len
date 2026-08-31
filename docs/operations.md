# Vận hành

Bot đang chạy thật. File này là chỗ tra khi có gì đó hỏng lúc ba giờ sáng.

## Nó là cái gì, ở đâu

| | |
| --- | --- |
| Tài khoản | `@tienlenbot` — "Tiến Lên", id `3b82d8e9-2446-4de3-b701-be6a40331a45` |
| Chủ | tài khoản dev — cùng chủ với `@carobot`. Số điện thoại của tài khoản đó nằm ở `deploy/check-accounts.mjs` bên project zeplao, không chép sang đây: đây là repo mã nguồn, không phải chỗ để số điện thoại của người thật |
| Máy chủ | `<địa chỉ máy chủ>`, cổng ssh trong deploy/.env, khoá `~/.ssh/<khoá>` |
| Service | `zeplao-tienlenbot.service` — container riêng, `node:22-alpine` |
| Mã | `/opt/zeplao/tienlenbot/tienlenbot.mjs` (gắn read-only vào container) |
| Sổ vàng | `/opt/zeplao/tienlenbot/data/scores.json` — **sống qua mọi lần deploy** |
| Token | `/opt/zeplao/tienlenbot/.env`, mode 600, **không có trong git** |
| Widget | Nằm trên server của app, không nằm trên máy này. `GET /getWidget` cho số phiên bản |

Bot là **client của API công khai**, không phải một phần của app. Nó gọi `api-bot.kuku.vn` qua
HTTPS đúng như một bot chạy trên laptop ai đó — không có đường đi tắt bên trong. Vì thế nó chạy
container riêng, restart riêng, và **một lần deploy API không khởi động lại nó cũng không đợi
nó**. Nếu nó crash liên tục thì thứ chết là nó.

## Deploy

```bash
deploy/deploy-bot.sh
```

Chạy test → tải file lên → tải widget lên → ghi unit → restart → đọc lại dòng bot tự nói lúc
khởi động. Không cần token trong tay: script đọc token từ `.env` trên server để tải widget.

**Widget lên trước khi restart, có lý do.** Một phiên ghim đúng bản widget lúc nó được mở, cố ý
như vậy — tác giả tải bản mới lên giữa ván thì ván đang chơi không đổi. Làm ngược lại thì bot mới
lên và phát bàn trong khoảng một giây, mỗi bàn ghim vào bản **cũ**, ai mở đúng lúc đó thì kẹt với
nó tới khi bàn tan.

> Từng có lỗi: `systemctl enable --now` rồi `systemctl restart` ngay sau đó đua nhau trên cùng
> một tên container. Docker từ chối, systemd ghi một dòng failure, năm giây sau lên bình thường.
> Một lệnh deploy **lần nào cũng fail một lần rồi tự lành** là lệnh deploy mà không ai đọc log
> nữa. Giờ chỉ `enable` (không `--now`), vì `restart` tự khởi động unit đang tắt.

## Xem nó có sống không

```bash
ssh -i ~/.ssh/<khoá> -p <cổng> root@$ZEPLAO_HOST \
  'systemctl is-active zeplao-tienlenbot; journalctl -u zeplao-tienlenbot -n 20 --no-pager'
```

Lúc lên đúng nó in `@tienlenbot is dealing`. Bất cứ gì khác là token sai.

Hỏi thẳng API bằng chính token của nó:

```bash
ssh -i ~/.ssh/<khoá> -p <cổng> root@$ZEPLAO_HOST \
  'T=$(grep -o "ZEPLAO_BOT_TOKEN=.*" /opt/zeplao/tienlenbot/.env | cut -d= -f2-);
   curl -s -H "Authorization: Bearer $T" https://api-bot.kuku.vn/getMe'
```

`401` ở đây nghĩa là token sai, bot bị tắt, hoặc tài khoản chủ bị khoá — API trả lời **giống
nhau** cho cả ba, cố ý, vì nói rõ cái nào là nói cho người đang đoán biết họ đã tới đâu.

## Những hỏng hóc đã biết

**Bot restart thì mọi ván đang chơi mất.** Ván nằm trong bộ nhớ của tiến trình, cố ý — một ván
là một cuộc trò chuyện đang xảy ra, và một con bot sống lại sau một tiếng rồi vẽ lại bàn không ai
còn nhìn nữa thì tệ hơn là quên. **Sổ vàng thì không mất**, nó nằm trên đĩa.

**Deploy API xong thì phiên widget cũ chết.** Phiên nằm trong bộ nhớ của API và API bị thay mới
mỗi lần deploy. Bot nhận ra qua một `pushState` không tới nơi và quên màn hình đó, nên lần gõ
`/tienlen` tiếp theo mở màn mới thay vì hỏng vĩnh viễn. Chiều ngược lại — bot restart, phiên còn
đó — được `endSessions` dọn lúc bot khởi động.

**Bot khởi động là gọi `endSessions`.** Nó đóng mọi widget của bot này đang mở ở mọi phòng. Đúng
như vậy: bàn nằm trong tiến trình vừa chết, để phiên lại là để một tay bài trên màn hình ai đó với
những cái nút gọi tới một con bot không còn biết ván đó tồn tại.

## Chưa công khai

`shared: false`. Chỉ chủ bot mới thêm nó vào phòng được — người khác biết cả handle cũng không
thêm được, vì cửa chặn nằm ở `AddBotToConversation` chứ không phải ở ô tìm kiếm.

Bàn thế giới chỉ có ý nghĩa khi nhiều nhóm cùng thêm được bot. Muốn mở:

```
kuku.vn/bot → @tienlenbot → bật "Chia sẻ cho mọi người"
```

Đây là quyết định của chủ bot, không phải của người viết mã — mặc định đóng là điểm mấu chốt:
một mặc định mở thì hỏng trong im lặng, và hỏng lên đầu người chưa được ai hỏi.

## Repo công khai — cái gì lộ, cái gì không

Mã nguồn nằm ở `github.com/hule-prime/zeplao-bot-tien-len`, **công khai**. Đã quét toàn bộ 9
commit: **không có token, không có khoá riêng, không có `.env`** ở bất kỳ commit nào. `.gitignore`
chặn `.env` và `data/` từ commit đầu.

Lộ ra, có chủ ý: IP máy chủ, cổng ssh, tên file khoá, id bot. Id bot **không phải bí mật** — nửa
đầu token chính là nó, và chỉ nửa sau mới được băm và lưu.

Mã nguồn công khai **không mở thêm đường nào vào trò chơi**: mọi thao tác đều được kiểm lại ở
phía bot, không phía nào tin cái trang gửi lên. Biết luật không giúp gì, đó là mục đích của việc
kiểm ở server. Riêng widget thì vốn đã không bí mật — nó được tải về máy mọi người chơi.

**Nhưng nó làm lộ một thứ:** trước đây xúc xắc và chia bài dùng `Math.random`, tức xorshift128+,
mà trạng thái của nó khôi phục được từ chính đầu ra. Xúc xắc được gieo **sau khi tiền đã đặt**, ở
sòng thế giới thì gieo công khai 25 giây một lần trước mặt mọi người — đúng nghĩa một cái máy
tiên tri cho ai chịu khó. Đã đổi sang `crypto.randomInt`, và có test giữ: nếu `roll` hay `deal`
quay lại dùng `Math.random` thì test đỏ.

## Việc cần làm: ssh đang mở cửa

```
permitrootlogin yes
passwordauthentication yes
```

Không có tường lửa. IP và cổng giờ nằm trong một repo công khai, mà trước đó chưa từng công khai
ở đâu (`zeplao` là private). Nghĩa là: **ai cũng dò được root bằng mật khẩu.**

Khoá `~/.ssh/<khoá>` đang dùng được, nên tắt mật khẩu là an toàn — nhưng phải tự kiểm là
không còn ai khác đang vào bằng mật khẩu trước khi tắt:

```bash
ssh -i ~/.ssh/<khoá> -p <cổng> root@$ZEPLAO_HOST '
  sed -i "s/^#*PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config
  sshd -t && systemctl reload sshd && sshd -T | grep passwordauthentication'
```

Và cân nhắc `fail2ban`, hoặc chỉ mở cổng ssh cho vài IP.

## Xoay token

`kuku.vn/bot → @tienlenbot → xoay token`, rồi ghi lại vào `.env` và restart:

```bash
ssh -i ~/.ssh/<khoá> -p <cổng> root@$ZEPLAO_HOST \
  'printf "ZEPLAO_BOT_TOKEN=%s\n" "<token mới>" > /opt/zeplao/tienlenbot/.env
   chmod 600 /opt/zeplao/tienlenbot/.env
   systemctl restart zeplao-tienlenbot'
```

Xoay có hiệu lực ngay lúc nó trả về. Đó là cách sửa duy nhất khi token lộ, nên nó không thể đợi
hết hạn.
