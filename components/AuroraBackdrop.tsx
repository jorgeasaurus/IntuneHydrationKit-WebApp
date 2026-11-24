// Decorative page backdrop. CSS in app/aurora.css draws and moves the layers.
export function AuroraBackdrop(): React.JSX.Element {
  return (
    <div aria-hidden="true" className="aurora-backdrop">
      <div className="aurora-backdrop__blob aurora-backdrop__blob--cyan" />
      <div className="aurora-backdrop__blob aurora-backdrop__blob--sky" />
      <div className="aurora-backdrop__blob aurora-backdrop__blob--teal" />
      <div className="aurora-backdrop__blob aurora-backdrop__blob--lavender" />
      <div className="aurora-backdrop__caustics" />
      <div className="aurora-backdrop__waves" />
      <div className="aurora-backdrop__grain" />
    </div>
  );
}
