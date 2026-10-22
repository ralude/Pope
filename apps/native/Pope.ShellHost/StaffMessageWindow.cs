using System.Drawing.Drawing2D;
using System.Media;

namespace Pope.ShellHost;

// T32 · REQ-003-20: mensaje del encargado. Ventana centrada, siempre encima, que no toma el
// foco ni recibe clics ni teclas (pasan al juego o a Pope), con el sonido de aviso de Windows,
// y que se quita sola a los 5 s. El texto es texto plano: nunca se interpreta como HTML.
internal sealed class StaffMessageWindow : Form
{
    internal static readonly TimeSpan Duration = TimeSpan.FromSeconds(5);
    private const int WsExTopmost = 0x8;           // WS_EX_TOPMOST: encima de las ventanas normales.
    private const int WsExTransparent = 0x20;      // WS_EX_TRANSPARENT: los clics atraviesan la ventana.
    private const int WsExToolWindow = 0x80;       // WS_EX_TOOLWINDOW: fuera de la barra y de Alt+Tab.
    private const int WsExLayered = 0x80000;       // WS_EX_LAYERED: necesaria para la opacidad y los clics transparentes.
    private const int WsExNoActivate = 0x8000000;  // WS_EX_NOACTIVATE: nunca pasa a ser la ventana activa.
    // Colores de apps/shell-ui/src/theme.css (diseño «Shell Pope · Fase 9»).
    private static readonly Color Glass = Color.FromArgb(26, 27, 36);
    private static readonly Color Border = Color.FromArgb(0x6b, 0x3f, 0x8f);
    private static readonly Color Line = Color.FromArgb(58, 60, 68);
    private static readonly Color Accent = Color.FromArgb(0x8e, 0x24, 0xc9);
    private static readonly Color AccentText = Color.FromArgb(0xd8, 0xb4, 0xfe);
    private static readonly Color Ink = Color.FromArgb(0xf2, 0xf4, 0xf7);
    private readonly System.Windows.Forms.Timer clock = new() { Interval = 50 };
    private readonly DateTime shownAt = DateTime.UtcNow;
    private readonly Panel bar;
    private readonly int barWidth;

    internal StaffMessageWindow(string message, Rectangle screen)
    {
        FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual;
        BackColor = Glass; Opacity = 0.94; Padding = new Padding(28, 22, 28, 22);
        var width = Math.Min(640, screen.Width - 64);
        var title = new Label
        {
            Text = "Mensaje del encargado",
            ForeColor = AccentText,
            AutoSize = false,
            Dock = DockStyle.Top,
            Height = 30,
            Font = new Font("Segoe UI Semibold", 12f),
            UseMnemonic = false
        };
        var body = new Label
        {
            Text = message,
            ForeColor = Ink,
            AutoSize = false,
            Dock = DockStyle.Fill,
            UseMnemonic = false,
            Font = new Font("Segoe UI", 15f),
            AutoEllipsis = true
        };
        // Alto según el texto, hasta media pantalla; si no cabe, termina en puntos suspensivos.
        var textHeight = TextRenderer.MeasureText(message, body.Font, new Size(width - 56, int.MaxValue), TextFormatFlags.WordBreak).Height;
        var height = Math.Min(screen.Height / 2, 22 + 30 + Math.Max(textHeight, 28) + 18 + 4 + 22);
        barWidth = width - 56;
        bar = new Panel { BackColor = Accent, Height = 4, Width = barWidth, Dock = DockStyle.None };
        var track = new Panel { Dock = DockStyle.Bottom, Height = 4, BackColor = Line };
        track.Controls.Add(bar);
        var gap = new Panel { Dock = DockStyle.Bottom, Height = 18 };
        Controls.Add(body); Controls.Add(gap); Controls.Add(track); Controls.Add(title);
        Bounds = new Rectangle(screen.X + (screen.Width - width) / 2, screen.Y + (screen.Height - height) / 2, width, height);
        using (var path = Rounded(new Rectangle(0, 0, width, height), 18)) Region = new Region(path);
        clock.Tick += (_, _) =>
        {
            var left = 1 - (DateTime.UtcNow - shownAt) / Duration;
            if (left <= 0) { Close(); return; }
            bar.Width = (int)(barWidth * left);
        };
        Shown += (_, _) => { SystemSounds.Asterisk.Play(); clock.Start(); };
    }

    // Pinta ya la ventana y sus controles: Show() solo encola el pintado, y el host no debe
    // confirmar que el cliente ve el mensaje mientras parte de la tarjeta sigue en blanco.
    internal void PaintNow()
    {
        Invalidate(true);
        UpdateTree(this);
        static void UpdateTree(Control control)
        {
            control.Update();
            foreach (Control child in control.Controls) UpdateTree(child);
        }
    }

    // Que Show() no active la ventana ni le quite el foco al juego o a Pope.
    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            parameters.ExStyle |= WsExTopmost | WsExTransparent | WsExToolWindow | WsExLayered | WsExNoActivate;
            return parameters;
        }
    }

    // Borde morado suave: separa la tarjeta de fondos oscuros como el del bloqueo o un juego.
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(Border, 2);
        using var path = Rounded(new Rectangle(1, 1, Width - 3, Height - 3), 17);
        e.Graphics.DrawPath(pen, path);
    }

    private static GraphicsPath Rounded(Rectangle area, int radius)
    {
        var path = new GraphicsPath(); var d = radius * 2;
        path.AddArc(area.X, area.Y, d, d, 180, 90); path.AddArc(area.Right - d, area.Y, d, d, 270, 90);
        path.AddArc(area.Right - d, area.Bottom - d, d, d, 0, 90); path.AddArc(area.X, area.Bottom - d, d, d, 90, 90);
        path.CloseFigure(); return path;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) clock.Dispose();
        base.Dispose(disposing);
    }
}
