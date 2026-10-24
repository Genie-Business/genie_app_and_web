/** Server-rendered column chart: one series, thin rounded-top bars, hairline grid, native tooltips. */
export function BarChart({
  data,
  unit,
  height = 180,
}: {
  data: Array<{ label: string; value: number; full?: string }>;
  unit: string;
  height?: number;
}) {
  const W = 640;
  const padL = 32;
  const padR = 8;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = height - padT - padB;

  const peak = Math.max(1, ...data.map((d) => d.value));
  // A clean top gridline: 4, 5, 10, 20, 50 … rather than an arbitrary max.
  const mag = 10 ** Math.floor(Math.log10(peak));
  const top = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= peak) ?? peak;
  const slot = plotW / data.length;
  const barW = Math.min(24, slot - 10);
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best]!.value ? i : best), 0);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={`${unit} per day`}>
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--genie-border)" strokeWidth="1" />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--genie-text-muted)">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = Math.max(d.value > 0 ? 3 : 0, (d.value / top) * plotH);
          const x = cx - barW / 2;
          const r = Math.min(4, barW / 2, h);
          // Rounded data-end, square at the baseline.
          const path = `M${x},${padT + plotH} V${padT + plotH - h + r} Q${x},${padT + plotH - h} ${x + r},${padT + plotH - h} H${x + barW - r} Q${x + barW},${padT + plotH - h} ${x + barW},${padT + plotH - h + r} V${padT + plotH} Z`;
          return (
            <g key={d.label + i}>
              {h > 0 && (
                <path d={path} fill="var(--genie-primary-solid)">
                  <title>{`${d.full ?? d.label}: ${d.value} ${unit}`}</title>
                </path>
              )}
              {/* hit target wider than the mark */}
              <rect x={cx - slot / 2} y={padT} width={slot} height={plotH} fill="transparent">
                <title>{`${d.full ?? d.label}: ${d.value} ${unit}`}</title>
              </rect>
              {i === maxIdx && d.value > 0 && (
                <text x={cx} y={padT + plotH - h - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--genie-text-primary)">
                  {d.value}
                </text>
              )}
              {(i % 2 === 0 || data.length <= 8) && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--genie-text-muted)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{unit} per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th>{d.full ?? d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
