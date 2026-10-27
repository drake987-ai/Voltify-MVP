// The words a driver reads. The platform writes the notification text itself, in
// Vietnamese and English, and sends it in the webhook, so a partner app can show it
// as is without having to understand risk scores. Rules for this text:
//   - say what to do first, then why, in plain words;
//   - never show the Risk Score, cell voltages or resistance to a driver;
//   - never promise safety or claim certainty.
import type { DriverStatus, Localized, NotificationKind, StationRef } from './types';

const km = (m: number) => (m / 1000).toFixed(1);
const kmVi = (m: number) => km(m).replace('.', ',');

function stationPart(station: StationRef | null): Localized {
  if (!station) return { vi: 'trạm đổi pin gần nhất', en: 'the nearest swap station' };
  return {
    vi: `trạm ${station.id} (cách ${kmVi(station.distanceM)} km)`,
    en: `station ${station.id} (${km(station.distanceM)} km away)`,
  };
}

export interface MessageArgs {
  station: StationRef | null;
  socPct?: number;
  rangeKm?: number;
  newSocPct?: number;
}

export function notificationText(kind: NotificationKind, args: MessageArgs): { title: Localized; body: Localized } {
  const st = stationPart(args.station);
  switch (kind) {
    case 'check_battery':
      return {
        title: { vi: 'Pin cần được kiểm tra', en: 'Your battery needs a check' },
        body: {
          vi: `Pin đang nóng lên bất thường. Hãy đi chậm lại, không chở thêm hàng và đổi pin tại ${st.vi}.`,
          en: `The battery is heating up abnormally. Slow down, take no extra load and swap it at ${st.en}.`,
        },
      };
    case 'stop_now':
      return {
        title: { vi: 'Dừng xe ngay ở nơi an toàn', en: 'Stop now in a safe place' },
        body: {
          vi: 'Pin có dấu hiệu nguy hiểm. Tắt xe, rời xa xe và pin ít nhất 5 mét. Đội vận hành đã được báo và sẽ gọi cho bạn.',
          en: 'The battery shows signs of danger. Switch off, move at least 5 metres away from the bike. The operations team has been told and will call you.',
        },
      };
    case 'low_battery': {
      const soc = Math.round(args.socPct ?? 0);
      const range = Math.round(args.rangeKm ?? 0);
      return {
        title: { vi: `Pin còn ${soc}%`, en: `Battery at ${soc}%` },
        body: {
          vi: `Đủ đi khoảng ${range} km. Nên đổi pin tại ${st.vi} trước khi nhận đơn tiếp theo.`,
          en: `Enough for about ${range} km. Swap at ${st.en} before your next order.`,
        },
      };
    }
    case 'pack_swapped': {
      const soc = Math.round(args.newSocPct ?? 100);
      return {
        title: { vi: 'Đã đổi pin', en: 'Battery swapped' },
        body: {
          vi: `Pin mới đã sẵn sàng (${soc}%). Pin cũ được giữ lại trạm để kiểm tra. Cảm ơn bạn đã xử lý kịp thời.`,
          en: `Your new battery is ready (${soc}%). The old one stays at the station for inspection. Thanks for acting quickly.`,
        },
      };
    }
    case 'maintenance_due':
      return {
        title: { vi: 'Pin sắp đến lúc thay', en: 'Battery due for replacement' },
        body: {
          vi: 'Pin của bạn đã chai nhiều nên quãng đường mỗi lần sạc ngắn hơn. Khi tiện, hãy đổi sang pin khác tại trạm.',
          en: 'Your battery has aged, so each charge takes you less far. When convenient, swap it for another one at a station.',
        },
      };
  }
}

/** The single line under the battery status in the driver's app. */
export function statusTip(status: DriverStatus, opts: { learning: boolean; charging: boolean; lowSoc: boolean; station: StationRef | null }): Localized {
  const st = stationPart(opts.station);
  if (status === 'stop') {
    return { vi: 'Dừng xe, tắt máy và rời xa pin. Đội vận hành sẽ liên hệ bạn.', en: 'Stop, switch off and move away from the battery. Operations will contact you.' };
  }
  if (status === 'check') {
    return { vi: `Đi chậm lại và đổi pin tại ${st.vi}.`, en: `Slow down and swap at ${st.en}.` };
  }
  if (opts.learning) {
    return { vi: 'Voltify đang làm quen với pin này, vài phút nữa sẽ có đánh giá đầy đủ.', en: 'Voltify is getting to know this battery; a full check is ready in a few minutes.' };
  }
  if (opts.charging) return { vi: 'Đang sạc. Pin hoạt động bình thường.', en: 'Charging. The battery is working normally.' };
  if (opts.lowSoc) return { vi: `Pin sắp hết, nên đổi pin tại ${st.vi}.`, en: `Battery running low; swap at ${st.en}.` };
  if (status === 'attention') {
    return { vi: 'Pin hơi nóng hơn bình thường. Voltify đang theo dõi, bạn cứ chạy tiếp.', en: 'The battery is a little warmer than usual. Voltify is watching it; carry on.' };
  }
  return { vi: 'Pin hoạt động bình thường.', en: 'The battery is working normally.' };
}
