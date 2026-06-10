export default function StatCard({ icon, label, value, note }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><i className={icon} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
    </div>
  );
}
