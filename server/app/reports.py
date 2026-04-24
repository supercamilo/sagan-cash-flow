from __future__ import annotations

from html import escape

from app.models import SacsReport


def _format_currency(value: float) -> str:
    return f"${value:,.0f}"


def render_sacs_report_html(report: SacsReport) -> str:
    inflow_label = _format_currency(report.monthly_inflow)
    outflow_label = _format_currency(report.monthly_outflow)
    reserve_label = _format_currency(report.monthly_private_reserve)
    arrow_label = f"X = {outflow_label}/month*"
    reserve_arrow_label = f"{reserve_label}/mo*"
    group_date = report.group_date.isoformat() if report.group_date else ""

    client_items = "".join(
        (
            f'<li><span class="client-salary">{_format_currency(client.monthly_salary)}</span>'
            f' — {escape(client.client_name)}</li>'
        )
        for client in report.clients
    ) or '<li class="muted">No clients on file.</li>'

    subtitle = escape(report.household_name)
    if group_date:
        subtitle += f" — {escape(group_date)}"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>SACS Report — {escape(report.household_name)}</title>
<style>
  @page {{ size: Letter landscape; margin: 24px; }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: "Helvetica", "Arial", sans-serif;
    color: #202124;
    margin: 0;
  }}
  .canvas h1 {{
    text-align: center;
    font-size: 22px;
    margin: 0 0 4px 0;
  }}
  .canvas .subtitle {{
    text-align: center;
    color: #5f6368;
    font-size: 14px;
    margin-bottom: 16px;
  }}
  .canvas {{
    position: relative;
    width: 900px;
    margin: 0 auto;
    border: 1px solid #dadce0;
    border-radius: 8px;
    padding: 16px;
    background: #ffffff;
  }}
  .legend {{
    position: absolute;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #dadce0;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 11px;
  }}
  .legend.left {{ top: 80px; left: 24px; max-width: 220px; }}
  .legend.right {{ top: 80px; right: 24px; text-align: center; }}
  .legend h4 {{
    margin: 0 0 4px 0;
    font-size: 12px;
    color: #188038;
  }}
  .legend ul {{ list-style: none; margin: 0; padding: 0; }}
  .legend li {{ font-size: 11px; line-height: 1.4; }}
  .legend .client-salary {{ font-weight: 700; color: #202124; }}
  .legend .muted {{ color: #80868b; }}
  svg {{ display: block; width: 100%; height: auto; }}
</style>
</head>
<body>
  <div class="canvas">
    <h1>Simple Automated Cashflow System (SACS)</h1>
    <div class="subtitle">{subtitle}</div>
    <div class="legend left">
      <h4>Monthly income</h4>
      <ul>{client_items}</ul>
    </div>
    <div class="legend right">
      <strong>X = Monthly</strong><br />
      Expenses
    </div>
    <svg viewBox="0 0 900 620" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrow-red" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 12 6 L 0 12 z" fill="#d93025" />
        </marker>
        <marker id="arrow-blue" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 12 6 L 0 12 z" fill="#1a73e8" />
        </marker>
        <marker id="arrow-green" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
          <path d="M 0 0 L 12 6 L 0 12 z" fill="#188038" />
        </marker>
      </defs>

      <line x1="80" y1="80" x2="200" y2="130" stroke="#188038" stroke-width="6" marker-end="url(#arrow-green)" />

      <g>
        <circle cx="220" cy="240" r="130" fill="#1e8e3e" stroke="#0f5a26" stroke-width="3" />
        <text x="220" y="200" fill="white" font-size="26" font-weight="700" text-anchor="middle">INFLOW</text>
        <rect x="130" y="225" width="180" height="50" rx="4" fill="white" stroke="#0f5a26" stroke-width="2" />
        <text x="220" y="258" fill="#0f5a26" font-size="24" font-weight="700" text-anchor="middle">{escape(inflow_label)}</text>
        <text x="220" y="360" fill="white" font-size="14" text-anchor="middle">$1,000 Floor</text>
      </g>

      <g>
        <circle cx="680" cy="240" r="130" fill="#d93025" stroke="#8b1b14" stroke-width="3" />
        <text x="680" y="200" fill="white" font-size="26" font-weight="700" text-anchor="middle">OUTFLOW</text>
        <rect x="590" y="225" width="180" height="50" rx="4" fill="white" stroke="#8b1b14" stroke-width="2" />
        <text x="680" y="258" fill="#8b1b14" font-size="24" font-weight="700" text-anchor="middle">{escape(outflow_label)}</text>
        <text x="680" y="360" fill="white" font-size="14" text-anchor="middle">$1,000 Floor</text>
      </g>

      <g>
        <line x1="350" y1="240" x2="546" y2="240" stroke="#d93025" stroke-width="4" marker-end="url(#arrow-red)" />
        <rect x="340" y="180" width="220" height="36" rx="4" fill="white" stroke="#d93025" stroke-width="1.5" />
        <text x="450" y="204" fill="#d93025" font-size="18" font-weight="700" text-anchor="middle">{escape(arrow_label)}</text>
        <text x="450" y="258" fill="#d93025" font-size="13" text-anchor="middle">Automated transfer on the 28th</text>
      </g>

      <g>
        <path d="M 190 360 Q 180 400 334 500" fill="none" stroke="#1a73e8" stroke-width="4" marker-end="url(#arrow-blue)" />
        <rect x="80" y="360" width="160" height="34" rx="4" fill="white" stroke="#1a73e8" stroke-width="1.5" />
        <text x="160" y="382" fill="#1a73e8" font-size="18" font-weight="700" text-anchor="middle">{escape(reserve_arrow_label)}</text>
      </g>

      <g>
        <circle cx="450" cy="500" r="110" fill="#1a73e8" stroke="#0d47a1" stroke-width="3" />
        <text x="450" y="470" fill="white" font-size="22" font-weight="700" text-anchor="middle">PRIVATE</text>
        <text x="450" y="496" fill="white" font-size="22" font-weight="700" text-anchor="middle">RESERVE</text>
        <text x="450" y="530" fill="white" font-size="20" font-weight="700" text-anchor="middle">{escape(reserve_label)}</text>
        <g transform="translate(426 550) scale(2)">
          <path d="m19.83 7.5-2.27-2.27c.07-.42.18-.81.32-1.15.11-.26.15-.56.09-.87-.13-.72-.83-1.22-1.57-1.21-1.59.03-3 .81-3.9 2h-5C4.46 4 2 6.46 2 9.5c0 2.25 1.37 7.48 2.08 10.04.24.86 1.03 1.46 1.93 1.46H8c1.1 0 2-.9 2-2h2c0 1.1.9 2 2 2h2.01c.88 0 1.66-.58 1.92-1.43l1.25-4.16 2.14-.72c.41-.14.68-.52.68-.95V8.5c0-.55-.45-1-1-1zM12 9H9c-.55 0-1-.45-1-1s.45-1 1-1h3c.55 0 1 .45 1 1s-.45 1-1 1m4 2c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1" fill="#fa8072" />
        </g>
      </g>

      <text x="450" y="600" fill="#202124" font-size="18" font-weight="700" text-anchor="middle" letter-spacing="2">MONTHLY CASHFLOW</text>
      <line x1="450" y1="614" x2="450" y2="580" stroke="#202124" stroke-width="1" stroke-dasharray="4 4" />
    </svg>
  </div>
</body>
</html>"""


def render_sacs_report_pdf(report: SacsReport) -> bytes:
    from weasyprint import HTML

    html_string = render_sacs_report_html(report)
    return HTML(string=html_string).write_pdf()
