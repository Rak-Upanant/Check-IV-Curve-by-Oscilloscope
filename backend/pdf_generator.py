# backend/pdf_generator.py
#
# Works for BOTH analyse mode (similarity_score, status ok/warning/fault)
# and collect mode (similarity_score = None, status = "collected").
#
# Collect-mode reports include a 2-column image grid of the captured photos.
# Images are downloaded via their Supabase public URL (image_url key injected
# by main.py before calling this function).

import os, tempfile, urllib.request
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable, Image as RLImage,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

STATUS_COLOR = {
    "ok":        colors.HexColor("#00c471"),
    "warning":   colors.HexColor("#f59e0b"),
    "fault":     colors.HexColor("#ef4444"),
    "collected": colors.HexColor("#0ea5e9"),
}

def _s(val, fallback="—"):
    if val is None or str(val).strip() == "":
        return fallback
    return str(val)

def _score(val):
    if val is None:
        return "—"
    try:
        return f"{float(val):.1f}"
    except (TypeError, ValueError):
        return "—"

def _fetch_image(url: str) -> str | None:
    """Download image URL to a temp file. Returns path or None on failure."""
    if not url:
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "IV-SIG-Report/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.write(data)
        tmp.close()
        return tmp.name
    except Exception:
        return None


def generate_report_pdf(session: dict) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()

    doc = SimpleDocTemplate(
        tmp.name, pagesize=A4,
        topMargin=15*mm, bottomMargin=15*mm,
        leftMargin=15*mm, rightMargin=15*mm,
    )

    styles  = getSampleStyleSheet()
    title_s = ParagraphStyle("title", parent=styles["Title"],
                              fontSize=18, textColor=colors.HexColor("#0f172a"),
                              spaceAfter=4)
    sub_s   = ParagraphStyle("sub", parent=styles["Normal"],
                              fontSize=10, textColor=colors.HexColor("#64748b"))
    head_s  = ParagraphStyle("head", parent=styles["Heading2"],
                              fontSize=11, textColor=colors.HexColor("#1e293b"),
                              spaceBefore=8, spaceAfter=4)
    cap_s   = ParagraphStyle("cap", parent=styles["Normal"],
                              fontSize=9, textColor=colors.HexColor("#1e293b"),
                              leading=13, alignment=TA_LEFT)

    # ── Session metadata ──────────────────────────────────────
    board_name = _s(session.get("boards", {}).get("board_name"))
    technician = _s(session.get("technician"))
    test_date  = _s(session.get("test_date", ""))[:10]
    notes      = _s(session.get("notes"), "")
    results    = session.get("test_results") or []

    # ── Mode detection ────────────────────────────────────────
    collect_mode = all(
        r.get("status") in ("collected", None, "pending")
        for r in results
    ) if results else False

    # ── Counts ────────────────────────────────────────────────
    ok_count      = sum(1 for r in results if r.get("status") == "ok")
    warning_count = sum(1 for r in results if r.get("status") == "warning")
    fault_count   = sum(1 for r in results if r.get("status") == "fault")
    coll_count    = sum(1 for r in results if r.get("status") == "collected")

    if collect_mode:
        overall_text  = "COLLECTED"
        overall_color = colors.HexColor("#0ea5e9")
    elif fault_count > 0:
        overall_text  = "FAIL"
        overall_color = colors.HexColor("#ef4444")
    else:
        overall_text  = "PASS"
        overall_color = colors.HexColor("#00c471")

    story = []

    # ── Title ─────────────────────────────────────────────────
    story.append(Paragraph("I-V Signature Analysis Report", title_s))
    tag_label = "Tag NO" if collect_mode else "Technician"
    story.append(Paragraph(
        f"Board: <b>{board_name}</b> &nbsp;|&nbsp; "
        f"{tag_label}: <b>{technician}</b> &nbsp;|&nbsp; "
        f"Date: <b>{test_date}</b>"
        + (f" &nbsp;|&nbsp; Notes: {notes}" if notes else ""),
        sub_s,
    ))
    story.append(HRFlowable(
        width="100%", thickness=1,
        color=colors.HexColor("#e2e8f0"), spaceAfter=8,
    ))

    # ── Summary box ───────────────────────────────────────────
    if collect_mode:
        summary_data = [
            ["Mode",    "Board",      "Points Collected"],
            ["COLLECT", board_name,   str(coll_count)],
        ]
        col_w_sum = [40*mm, 60*mm, 45*mm]
    else:
        summary_data = [
            ["Overall", "Test Points", "OK", "Warning", "Fault"],
            [overall_text, str(len(results)), str(ok_count), str(warning_count), str(fault_count)],
        ]
        col_w_sum = [35*mm, 35*mm, 25*mm, 25*mm, 25*mm]

    sum_table = Table(summary_data, colWidths=col_w_sum)
    sum_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("ROWHEIGHT",  (0, 0), (-1, -1), 8*mm),
        ("BACKGROUND", (0, 1), (0, 1), overall_color),
        ("TEXTCOLOR",  (0, 1), (0, 1), colors.white),
        ("FONTNAME",   (0, 1), (0, 1), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 1), (0, 1), 13),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    story.append(sum_table)
    story.append(Spacer(1, 8*mm))

    # ── Results table ─────────────────────────────────────────
    story.append(Paragraph("Test Point Results", head_s))

    sorted_results = sorted(
        results,
        key=lambda x: _s(x.get("test_points", {}).get("point_name"))
    )

    if collect_mode:
        rows = [["Point", "Component", "Status"]]
        col_w = [60*mm, 60*mm, 50*mm]
        for r in sorted_results:
            pt = r.get("test_points") or {}
            rows.append([
                _s(pt.get("point_name")),
                _s(pt.get("component_type")),
                _s(r.get("status"), "pending").upper(),
            ])
    else:
        rows = [["Point", "Component", "Shape", "Score", "Status", "Diagnosis"]]
        col_w = [25*mm, 28*mm, 32*mm, 18*mm, 22*mm, 42*mm]
        for r in sorted_results:
            pt = r.get("test_points") or {}
            rows.append([
                _s(pt.get("point_name")),
                _s(pt.get("component_type")),
                _s(r.get("shape_type")),
                _score(r.get("similarity_score")),
                _s(r.get("status"), "—").upper(),
                _s(r.get("diagnosis")),
            ])

    res_table = Table(rows, colWidths=col_w)
    ts = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTSIZE",   (0, 0), (-1, -1), 8),
        ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("ROWHEIGHT",  (0, 0), (-1, -1), 7*mm),
        ("GRID",       (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.HexColor("#f8fafc"), colors.white]),
    ]
    status_col = 2 if collect_mode else 4
    for i, r in enumerate(results, start=1):
        c = STATUS_COLOR.get(r.get("status", ""), colors.gray)
        ts.append(("BACKGROUND", (status_col, i), (status_col, i), c))
        ts.append(("TEXTCOLOR",  (status_col, i), (status_col, i), colors.white))
        ts.append(("FONTNAME",   (status_col, i), (status_col, i), "Helvetica-Bold"))
    res_table.setStyle(TableStyle(ts))
    story.append(res_table)

    # ── Image grid (collect mode or analysis mode) ────────────
    # Only add the section if at least one result has an image_url
    img_paths = {}   # idx → temp file path; kept in scope for cleanup after build
    results_with_images = [r for r in sorted_results if r.get("image_url")]
    if results_with_images:
        story.append(Spacer(1, 6*mm))
        story.append(Paragraph("Collected Oscilloscope Images", head_s))
        story.append(HRFlowable(
            width="100%", thickness=0.5,
            color=colors.HexColor("#e2e8f0"), spaceAfter=4,
        ))

        # Download all images first
        for idx, r in enumerate(results_with_images):
            path = _fetch_image(r.get("image_url", ""))
            if path:
                img_paths[idx] = path

        # Layout: 2 columns, each 87mm wide (180mm content - 6mm gap)
        IMG_W  = 87 * mm
        IMG_H  = 65 * mm   # 4:3 oscilloscope aspect ratio
        COL_W  = [IMG_W, IMG_W]
        BORDER = colors.HexColor("#cbd5e1")

        def make_img_cell(r, idx):
            pt     = r.get("test_points") or {}
            name   = _s(pt.get("point_name"))
            status = _s(r.get("status"), "—").upper()
            score  = _score(r.get("similarity_score"))
            stat_c = STATUS_COLOR.get(r.get("status", ""), colors.gray)

            if idx in img_paths:
                img = RLImage(img_paths[idx], width=IMG_W - 4*mm, height=IMG_H - 4*mm)
            else:
                img = Paragraph("Image unavailable", sub_s)

            score_line = f"  Score: {score}" if score != "—" else ""
            caption = Paragraph(
                f"<b>{name}</b><br/>"
                f"<font color='#{_hex(stat_c)}'>{status}</font>{score_line}",
                cap_s,
            )
            return [img, caption]

        # Group into rows of 2
        pairs = []
        items = list(enumerate(results_with_images))
        for i in range(0, len(items), 2):
            chunk = items[i:i+2]
            row = [make_img_cell(r, idx) for idx, r in chunk]
            if len(row) == 1:
                row.append([""])   # empty second cell for odd count
            pairs.append(row)

        for row_cells in pairs:
            img_tbl = Table(row_cells, colWidths=COL_W)
            img_tbl.setStyle(TableStyle([
                ("BOX",        (0, 0), (-1, -1), 0.5, BORDER),
                ("INNERGRID",  (0, 0), (-1, -1), 0.5, BORDER),
                ("VALIGN",     (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING",  (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING",   (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ]))
            story.append(img_tbl)
            story.append(Spacer(1, 4*mm))

    # ── Footer ────────────────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} &nbsp;|&nbsp; "
        "IV-SIG Signature Analysis System v1.0",
        sub_s,
    ))

    doc.build(story)

    # Clean up downloaded image temp files
    for path in img_paths.values():
        try:
            os.unlink(path)
        except Exception:
            pass

    return tmp.name


def _hex(color) -> str:
    """Convert a ReportLab Color to 6-char hex string (no #)."""
    try:
        r = int(color.red   * 255)
        g = int(color.green * 255)
        b = int(color.blue  * 255)
        return f"{r:02x}{g:02x}{b:02x}"
    except Exception:
        return "64748b"
