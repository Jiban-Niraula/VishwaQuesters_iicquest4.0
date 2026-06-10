export default function Button({ children, variant = 'primary', size = 'md', loading = false, icon, className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <i className="fa-solid fa-spinner fa-spin" /> : icon ? <i className={icon} /> : null}
      <span>{children}</span>
    </button>
  );
}
