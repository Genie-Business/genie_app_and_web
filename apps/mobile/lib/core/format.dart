/// Money and date helpers. Amounts cross the wire as integer-kobo strings.
library;

/// `"150000"` → `"₦1,500"` (or `"₦1,500.50"` when there are kobo).
String formatKobo(String kobo) {
  final n = BigInt.tryParse(kobo) ?? BigInt.zero;
  final naira = n ~/ BigInt.from(100);
  final k = (n % BigInt.from(100)).toInt();
  final grouped = _group(naira.toString());
  return k == 0 ? '₦$grouped' : '₦$grouped.${k.toString().padLeft(2, '0')}';
}

/// Naira amount (int) → kobo string for request bodies.
String toKobo(num naira) => (naira * 100).round().toString();

String _group(String digits) {
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i != 0 && (digits.length - i) % 3 == 0) buf.write(',');
    buf.write(digits[i]);
  }
  return buf.toString();
}

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/// ISO string → `"12 Aug 2026"`.
String formatDate(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return iso;
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}

/// ISO string → `"14:32"`.
String formatClock(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

/// ISO string → a compact chat timestamp: `"14:32"` today, `"Mon"` this week,
/// else `"12 Aug"`.
String chatTimestamp(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  final now = DateTime.now();
  final days = DateTime(now.year, now.month, now.day)
      .difference(DateTime(d.year, d.month, d.day))
      .inDays;
  if (days == 0) return formatClock(iso);
  if (days == 1) return 'Yesterday';
  if (days < 7) {
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return wd[d.weekday - 1];
  }
  return '${d.day} ${_months[d.month - 1]}';
}

/// ISO string → a short relative label like `"in 5 days"` / `"3 days ago"` / `"today"`.
String relativeDay(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  final now = DateTime.now();
  final days = DateTime(d.year, d.month, d.day)
      .difference(DateTime(now.year, now.month, now.day))
      .inDays;
  if (days == 0) return 'today';
  if (days == 1) return 'tomorrow';
  if (days == -1) return 'yesterday';
  return days > 0 ? 'in $days days' : '${-days} days ago';
}
