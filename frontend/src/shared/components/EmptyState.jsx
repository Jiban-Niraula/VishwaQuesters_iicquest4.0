export default function EmptyState({ icon = 'fa-regular fa-folder-open', title = 'No data found', text, action }) {
  return (
    <div className="empty-state">
      <i className={icon} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
