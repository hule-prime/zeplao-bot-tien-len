// Quân cờ vua, vẽ ra chứ không lấy về.
//
// Cùng lý do với sáu con vật bầu cua, và ở đây còn nặng hơn: ♔♕♖♗♘♙ **có** trong Unicode, nhưng
// mỗi hệ máy vẽ một kiểu, và trên nhiều máy Android thì ♟ rơi vào bảng emoji và ra một quân tốt
// màu tím. Một bàn cờ mà quân trắng với quân đen khác nhau ở chỗ "một cái là chữ, một cái là
// emoji" thì không đọc được.
//
// Nên chúng là hình khối: tròn, thang, đa giác. Không phải Staunton chạm trổ — ở bốn mươi pixel
// thì chi tiết chỉ thành nhiễu. Cái phải đúng là **bóng của quân**, vì đó là thứ mắt nhận ra một
// quân cờ: tốt tròn thấp, xe vuông có răng, mã có bờm, tượng có chóp xẻ, hậu có vương miện nhiều
// đỉnh, vua có chữ thập.
//
// Một hộp 45×45 cho tất cả, và thân quân lấy `currentColor` — nên cùng một hình dùng được cho cả
// hai bên, chỉ đổi màu chữ của ô chứa nó.
const PIECE_ART = {
  // Tốt: đầu tròn, cổ thắt, chân loe.
  P: `<circle cx="22.5" cy="14" r="6.4"/>
    <path d="M22.5 20c-4 0-6.5 2.5-6.5 5.5 0 2.5 1.5 3.5 1.5 5.5 0 2-2.5 3-3.5 5h17c-1-2-3.5-3-3.5-5
      0-2 1.5-3 1.5-5.5 0-3-2.5-5.5-6.5-5.5z"/>
    <path d="M12.5 36h20v3.6h-20z"/>`,

  // Xe: răng tường ở trên, thân thẳng, chân bè.
  R: `<path d="M12 10h4.2v3h4v-3h4.6v3h4v-3H33v7l-3 3v11l3 3v3H12v-3l3-3V20l-3-3z"/>
    <path d="M10.5 36h24v4h-24z"/>`,

  // Mã: bờm và mõm. Cả quân cờ nằm ở cái nghiêng của đầu — vẽ thẳng đứng thì nó thành con lừa.
  N: `<path d="M14.5 37c0-7.5 2-11.5 6-14.5 1.6-1.2 2.2-2.5 1.7-4-1.1.6-2.2 1.6-3.2 3.1
      -1.7-1-2.3-3.1-1.7-5.2.9-3.2 3.7-6.2 7.4-7.8 1.6-.7 2.7-1.7 3.2-3.2 3.7 1.6 6.4 4.8 7.4 8.5
      1 3.7 1 8.4.5 12.6-.4 3.5-.6 8-.6 10.5z"/>
    <circle cx="18.2" cy="15.8" r="1.5" fill="rgba(0,0,0,.5)"/>
    <path d="M11.5 37h22v3.6h-22z"/>`,

  // Tượng: chóp nhọn có khe xẻ, cổ, chân.
  B: `<circle cx="22.5" cy="8.6" r="2.7"/>
    <path d="M22.5 11.6c5 3.5 7.6 8.2 7.6 12.4 0 3-2 5.1-3.6 6.1h-8c-1.6-1-3.6-3.1-3.6-6.1
      0-4.2 2.6-8.9 7.6-12.4z"/>
    <path d="M21.6 16.5h1.9v9.5h-1.9z" fill="rgba(255,255,255,.5)"/>
    <path d="M15 31.6h15v3.2H15zM11.5 37h22v3.6h-22z"/>`,

  // Hậu: vương miện năm đỉnh, mỗi đỉnh một hạt.
  Q: `<circle cx="9.2" cy="14" r="2.6"/><circle cx="15.8" cy="10.4" r="2.6"/>
    <circle cx="22.5" cy="8.8" r="2.9"/><circle cx="29.2" cy="10.4" r="2.6"/>
    <circle cx="35.8" cy="14" r="2.6"/>
    <path d="M9.6 16.6 13 29.4h19l3.4-12.8-5.6 5-4.4-7.2-2.9 7.2-4.4-7.2-4.1 7.2z"/>
    <path d="M12 31h21v3.2H12zM10 36.6h25v4h-25z"/>`,

  // Vua: chữ thập, vương miện, thân.
  K: `<path d="M20.9 4h3.2v4.2h4.2v3.2h-4.2v4.2h-3.2v-4.2h-4.2V8.2h4.2z"/>
    <path d="M22.5 16.4c6.1 0 10.1 4 10.1 9 0 4-3 6-4 8.2h-12.2c-1-2.2-4-4.2-4-8.2 0-5 4-9 10.1-9z"/>
    <path d="M12.5 34.2h20v3.2h-20zM10.5 39h24v3.6h-24z"/>`,
};

/// Một quân, ở cỡ nào cũng được.
///
/// `innerHTML` trên một chuỗi chính file này viết ra — không phải trên thứ gì ai đó gõ vào. Sáu
/// hình trên là toàn bộ những gì từng đi qua chỗ này.
function pieceArt(letter) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 45 45');
  svg.setAttribute('class', 'piece-art');
  svg.innerHTML = PIECE_ART[letter] || '';
  return svg;
}
