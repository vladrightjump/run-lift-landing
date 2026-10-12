/**
 * Locurile ocupate, ca inel (R8, R18): se citește dintr-o privire, iar umplerea
 * se mișcă atunci când se schimbă numărul de înscriși.
 */
export const InelOcupare = ({
  ocupate,
  total,
  marime = 64,
}: {
  ocupate: number;
  total: number;
  marime?: number;
}) => {
  const raza = (marime - 8) / 2;
  const cerc = 2 * Math.PI * raza;
  const parte = total > 0 ? Math.min(1, ocupate / total) : 0;
  const centru = marime / 2;
  return (
    <svg
      className="admin-inel"
      width={marime}
      height={marime}
      viewBox={`0 0 ${marime} ${marime}`}
      role="img"
      aria-label={`${ocupate} din ${total} locuri ocupate`}
    >
      <circle className="admin-inel-fond" cx={centru} cy={centru} r={raza} strokeWidth={7} />
      <circle
        className="admin-inel-plin"
        cx={centru}
        cy={centru}
        r={raza}
        strokeWidth={7}
        strokeDasharray={cerc.toFixed(2)}
        strokeDashoffset={(cerc * (1 - parte)).toFixed(2)}
        transform={`rotate(-90 ${centru} ${centru})`}
      />
      {marime >= 56 && (
        <text className="admin-inel-text" x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
          {ocupate}
        </text>
      )}
    </svg>
  );
};
