interface TopBarProps {
  name: string | null;
  width: number | null;
  height: number | null;
  notice: string | null;
  onOpen: () => void;
  onExport: () => void;
}

export function TopBar({ name, width, height, notice, onOpen, onExport }: TopBarProps): React.JSX.Element {
  return (
    <header className="topbar">
      <span className="wordmark">潜影</span>
      {name ? <span className="filename">{name}</span> : null}
      <div className="topbar__meta">
        {notice ? <span className="notice">{notice}</span> : null}
        {width && height ? (
          <span className="topbar__dims">
            {width} × {height}
          </span>
        ) : null}
        <span className="topbar__space">sRGB</span>
        {name ? (
          <button type="button" className="btn btn--ghost" onClick={onOpen}>
            打开照片
          </button>
        ) : null}
        {name ? (
          <button type="button" className="btn" onClick={onExport}>
            导出
          </button>
        ) : null}
      </div>
    </header>
  );
}
