// Tiếng xúc xắc, dựng ra chứ không tải về.
//
// Widget **không ra được mạng**: một file .mp3 từ CDN thì đơn giản là không bao giờ tới nơi, và
// nhét cả một file âm thanh vào bundle dưới dạng data URI thì là vài trăm kilobyte cho một tiếng
// lạch cạch. Nên nó được tổng hợp: một mẩu nhiễu trắng ngắn qua bộ lọc dải là đúng cái tiếng một
// viên xúc xắc chạm vào thành bát, và rải hai chục mẩu như thế theo nhịp ngẫu nhiên là tiếng xóc.
//
// Ba chỗ phải cẩn thận, và cả ba đều là chỗ im lặng chứ không phải chỗ nổ lỗi:
//
//   1. **Trình duyệt không cho phát tiếng trước khi có người chạm vào trang.** `AudioContext`
//      sinh ra ở trạng thái `suspended` và chỉ `resume()` được từ trong một cử chỉ thật. Nên nó
//      được đánh thức ở mọi `pointerdown` — rẻ, và là cách duy nhất chắc chắn.
//   2. **Có máy không có Web Audio, có nơi dựng `AudioContext` là ném.** Không có tiếng thì bàn
//      vẫn phải chạy: một cái bàn không mở được vì không phát nổi tiếng lạch cạch là một cái bàn
//      hỏng vì một thứ không quan trọng.
//   3. **Đây là một cái widget nổi trong một phòng chat.** Nên có công tắc tắt ngay trong bát,
//      cạnh công tắc nặn, và nó nhớ trên máy người ta.

const AM = 'tienlen:am';
let sounding = true;
try {
  sounding = localStorage.getItem(AM) !== '0';
} catch (no) { /* không đọc được thì cứ để mặc định */ }

function setSounding(on) {
  sounding = !!on;
  try { localStorage.setItem(AM, on ? '1' : '0'); } catch (no) { /* không lưu được cũng chạy */ }
  if (on) wake();
}

let box = null;
let noise = null;
/// Đã thử dựng và hỏng thì thôi, không thử lại mỗi lần xóc.
let deaf = false;

/// Cái hộp tiếng, dựng lần đầu cần tới. Trả về `null` nếu không có gì để phát bằng.
function ears() {
  if (deaf || !sounding) return null;
  if (!box) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { deaf = true; return null; }
    try { box = new Ctx(); } catch (no) { deaf = true; return null; }
  }
  return box;
}

/// Đánh thức nó từ trong một cử chỉ. Gọi ở mọi lần chạm: `resume()` ngoài cử chỉ thì bị làm ngơ,
/// và một cái sòng chỉ kêu sau khi người ta bấm đúng một nút nào đó là một cái sòng câm.
function wake() {
  const ctx = ears();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/// Một giây nhiễu trắng, dựng một lần và dùng lại. Dựng lại cho từng tiếng gõ là hai mươi lần
/// cấp phát bộ nhớ trong một phần sáu giây, đúng lúc trang đang chạy hiệu ứng.
function grain(ctx) {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/**
 * Một tiếng: xúc xắc chạm vào thành bát.
 *
 * Nhiễu qua một bộ lọc dải hẹp, tắt trong bốn mươi mili giây. Tần số giữa quyết định nó nghe ra
 * là *sứ* hay là *gỗ*, nên mỗi tiếng lệch đi một chút — hai mươi tiếng giống hệt nhau nghe ra là
 * một cái máy chứ không phải ba viên xúc xắc.
 */
function knock(at = 0, loud = 1, hz = 1800) {
  const ctx = ears();
  if (!ctx || ctx.state !== 'running') return;

  const when = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = grain(ctx);
  // Bắt đầu từ một chỗ ngẫu nhiên trong mẩu nhiễu, để hai tiếng cạnh nhau không phải cùng một
  // đoạn sóng — cùng một đoạn thì tai nghe ra ngay là một mẫu lặp.
  const from = Math.random() * 0.8;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = hz;
  band.Q.value = 1.4;

  const vol = ctx.createGain();
  vol.gain.setValueAtTime(0.0001, when);
  vol.gain.exponentialRampToValueAtTime(0.16 * loud, when + 0.003);
  vol.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);

  src.connect(band);
  band.connect(vol);
  vol.connect(ctx.destination);
  src.start(when, from, 0.06);
  src.stop(when + 0.06);
}

/**
 * Tiếng xóc: cả nắm xúc xắc lăn trong bát.
 *
 * Dày dần rồi thưa ra ở cuối, vì đó là cái đang xảy ra — tay lắc mạnh nhất ở giữa, và mấy tiếng
 * cuối là ba viên đang nằm xuống. Nhịp ngẫu nhiên: xúc xắc không gõ theo phách.
 */
function rattle(ms = 1700) {
  const ctx = ears();
  if (!ctx || ctx.state !== 'running') return;

  const seconds = Math.max(0.2, ms / 1000);
  const many = Math.round(seconds * 13);

  for (let i = 0; i < many; i++) {
    const at = (i / many) * seconds + (Math.random() - 0.5) * (seconds / many) * 0.9;
    // To dần ở giữa: hình quả chuông thô, đủ để nghe ra là một cú lắc chứ không phải một tràng
    // đều đều.
    const swell = 0.45 + 0.55 * Math.sin((i / many) * Math.PI);
    knock(Math.max(0, at), swell * (0.7 + Math.random() * 0.6), 900 + Math.random() * 2200);
  }
}

/// Một viên nằm xuống mặt bàn. Trầm hơn và chắc hơn tiếng lăn trong bát: nó đã dừng lại.
function landedSound(at = 0) {
  knock(at, 1.25, 620 + Math.random() * 400);
  knock(at + 0.02, 0.5, 2400 + Math.random() * 900);
}

// Mọi lần chạm, ở bất kỳ đâu trên trang. Không phải `once`: lần chạm đầu tiên có thể tới trước
// khi có cái `AudioContext` nào, và trình duyệt còn treo lại quyền phát tiếng sau mỗi lần trang
// bị ẩn đi rồi quay lại.
document.addEventListener('pointerdown', wake, true);
