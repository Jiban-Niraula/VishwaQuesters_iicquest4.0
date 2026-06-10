export default function Loading({ label = 'Loading' }) {
  return <div className="loading"><i className="fa-solid fa-circle-notch fa-spin" /> {label}</div>;
}
