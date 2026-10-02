// Fondo por defecto de Pope, hecho con CSS. El fondo personalizado que sube el local es la
// spec 003 (REQ-003-70); mientras tanto, este.
export function Wallpaper({ blurred = false }: { blurred?: boolean }) {
  return (
    <div className={blurred ? 'wallpaper wallpaper-blurred' : 'wallpaper'} aria-hidden="true">
      <div className="wp-shapes">
        <div className="wp-glow wp-glow-violet" />
        <div className="wp-glow wp-glow-teal" />
        <div className="wp-slash wp-slash-dark" />
        <div className="wp-slash wp-slash-violet" />
        <div className="wp-slash wp-slash-green" />
      </div>
      <div className="wp-shade" />
    </div>
  );
}
