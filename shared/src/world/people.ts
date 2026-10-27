// Fictional drivers and number plates for the demo fleet. Any resemblance to a real
// person is accidental; nothing here comes from real data.
const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Quốc', 'Thanh', 'Ngọc', 'Hữu', 'Gia', 'Đức', 'Hoài'];
const GIVEN = [
  'An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hạnh', 'Hiếu', 'Hòa', 'Hùng', 'Khang', 'Khoa', 'Lan', 'Linh',
  'Long', 'Mai', 'Nam', 'Nhân', 'Phúc', 'Phương', 'Quân', 'Sơn', 'Tâm', 'Thảo', 'Thịnh', 'Trang', 'Trí', 'Tuấn', 'Vy',
];
// District codes of TP.HCM number plates (59-xx) used for flavour only.
const PLATE_SERIES = ['59-X1', '59-X2', '59-X3', '59-H1', '59-K1', '59-N2', '59-T1', '59-V1', '59-Y2', '59-P1'];

/** Small deterministic hash so the same index always gives the same person. */
function h(index: number, salt: number): number {
  let x = Math.imul(index + 1, 2654435761) ^ Math.imul(salt, 40503);
  x = Math.imul(x ^ (x >>> 15), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return (x ^ (x >>> 16)) >>> 0;
}

export function driverName(index: number): string {
  return `${FAMILY[h(index, 1) % FAMILY.length]} ${MIDDLE[h(index, 2) % MIDDLE.length]} ${GIVEN[h(index, 3) % GIVEN.length]}`;
}

export function plateNumber(index: number): string {
  const n = 10000 + (h(index, 4) % 89999);
  const s = String(n);
  return `${PLATE_SERIES[h(index, 5) % PLATE_SERIES.length]} ${s.slice(0, 3)}.${s.slice(3)}`;
}

/** Fictional phone number (09xx), shown in the console so the manager can call the driver. */
export function phoneNumber(index: number): string {
  const s = String(h(index, 6) % 100_000_000).padStart(8, '0');
  return `09${s.slice(0, 2)} ${s.slice(2, 5)} ${s.slice(5)}`;
}
