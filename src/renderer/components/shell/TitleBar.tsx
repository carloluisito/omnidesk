// @atlas-entrypoint: Title bar (Phase 4).
// Brand mark + "OmniDesk" wordmark on the left, window controls on the right.
// Window controls follow Windows convention (min / max / close) since they
// live on the right edge.
import markUrl from '../../assets/logo/mark.svg';

export function TitleBar() {
  const minimize = () => window.electronAPI.minimizeWindow();
  const maximize = () => window.electronAPI.maximizeWindow();
  const close = () => window.electronAPI.closeWindow();

  return (
    <div className="p4-titlebar">
      <div className="p4-crumb" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <img src={markUrl} alt="" width={22} height={22} style={{ display: 'block' }} />
        <b style={{ letterSpacing: '-0.01em' }}>OmniDesk</b>
      </div>
      <div className="lights lights-right">
        <button
          type="button"
          className="light y"
          aria-label="Minimize window"
          title="Minimize"
          onClick={minimize}
        />
        <button
          type="button"
          className="light g"
          aria-label="Maximize window"
          title="Maximize"
          onClick={maximize}
        />
        <button
          type="button"
          className="light r"
          aria-label="Close window"
          title="Close"
          onClick={close}
        />
      </div>
    </div>
  );
}
